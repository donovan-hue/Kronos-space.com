const express = require("express");
const mongoose = require("mongoose");

const Capsule = require("./Capsule");
const User = require("../users/User");
const auth = require("../../middleware/auth");
const { requireUser } = require("../../middleware/permissions");
const { canInteract } = require("../moderation/moderation.service");
const { createNotification } = require("../notifications/notification.service");
const { encryptText, decryptText } = require("./capsule.crypto");

const { validId } = require("../../utils/queryHelpers");

const router = express.Router();

const { MAX_TITLE, MAX_MESSAGE, MAX_CONTRIBUTORS } = Capsule;

const AUTHOR_FIELDS = "username displayName avatar";

function validTimezone(timezone) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}

function parseCapsulePayload(body = {}, { requireFuture = true } = {}) {
  const title = typeof body.title === "string" ? body.title.trim() : "";
  if (!title || title.length > MAX_TITLE) {
    return { error: `La cápsula necesita un título de hasta ${MAX_TITLE} caracteres` };
  }

  const rawDate = typeof body.opensAt === "string" ? body.opensAt.trim() : "";
  const opensAt = rawDate ? new Date(rawDate) : null;
  if (!opensAt || Number.isNaN(opensAt.getTime())) {
    return { error: "La fecha de apertura no es válida" };
  }
  if (requireFuture && opensAt.getTime() <= Date.now()) {
    return { error: "La fecha de apertura debe estar en el futuro" };
  }

  const timezone = typeof body.timezone === "string" && body.timezone.trim() ? body.timezone.trim() : "UTC";
  if (!validTimezone(timezone)) {
    return { error: "Zona horaria no válida" };
  }

  const message = typeof body.message === "string" ? body.message.trim() : "";
  if (message.length > MAX_MESSAGE) {
    return { error: `El mensaje no puede superar ${MAX_MESSAGE} caracteres` };
  }

  return { title, opensAt, timezone, message };
}

function isOwner(capsule, userId) {
  return String(capsule?.owner?._id || capsule?.owner) === String(userId);
}

function isContributor(capsule, userId) {
  return (capsule?.contributors || []).some(
    (contributor) => String(contributor.user?._id || contributor.user) === String(userId)
  );
}

function canAccess(capsule, userId) {
  return isOwner(capsule, userId) || isContributor(capsule, userId);
}

function presentMessage(message) {
  const author = message.author?._id
    ? {
      _id: message.author._id,
      username: message.author.username || "",
      displayName: message.author.displayName || "",
      avatar: message.author.avatar || ""
    }
    : { _id: String(message.author || ""), username: "", displayName: "", avatar: "" };
  return { author, text: message.text, createdAt: message.createdAt };
}

/**
 * Descifra los mensajes de una cápsula abierta o en draft (dueña y
 * colaboradores la están escribiendo). Sellada/cancelada: sin cambios,
 * normalizeCapsule no expone los mensajes.
 */
function withDecryptedMessages(capsule) {
  if (!capsule || (capsule.state !== "draft" && capsule.state !== "opened")) return capsule;
  return {
    ...capsule,
    messages: (capsule.messages || []).map((message) => ({
      author: message.author,
      createdAt: message.createdAt,
      text: decryptText(message)
    }))
  };
}

/**
 * Proyección pública. Los mensajes cifrados solo viajan descifrados si la
 * cápsula está abierta (todos) o en draft (dueño/colaboradores, que la
 * están escribiendo). Nunca se expone cipherText/iv/authTag.
 */
function normalizeCapsule(capsule, viewerId = "") {
  const owner = capsule.owner?._id
    ? {
      _id: capsule.owner._id,
      username: capsule.owner.username || "",
      displayName: capsule.owner.displayName || "",
      avatar: capsule.owner.avatar || ""
    }
    : { _id: String(capsule.owner || ""), username: "", displayName: "", avatar: "" };

  const mine = isOwner(capsule, viewerId);
  const state = capsule.state || "draft";
  const includeMessages = state === "opened" || state === "draft";

  const messages = includeMessages
    ? (capsule.messages || [])
      .slice()
      .sort((a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0))
      .map(presentMessage)
    : [];

  const dueAt = state === "scheduled" ? new Date(capsule.opensAt).getTime() : null;

  return {
    _id: capsule._id,
    owner,
    mine,
    title: capsule.title,
    opensAt: capsule.opensAt,
    timezone: capsule.timezone || "UTC",
    state,
    contributorsCount: (capsule.contributors || []).length,
    messagesCount: (capsule.messages || []).length,
    messages,
    openedAt: capsule.openedAt || null,
    cancelledAt: capsule.cancelledAt || null,
    createdAt: capsule.createdAt,
    ...(dueAt ? { msUntilOpen: Math.max(0, dueAt - Date.now()) } : {}),
    canSeal: mine && state === "draft",
    canCancel: mine && state === "scheduled",
    canMessage: state === "draft" && (mine || isContributor(capsule, viewerId)),
    canInvite: mine && state === "draft"
  };
}

async function getCapsuleForViewer(capsuleId, viewerId) {
  if (!validId(capsuleId)) return { error: 400, message: "ID de cápsula inválido" };
  const capsule = await Capsule.findById(capsuleId)
    .populate("owner", AUTHOR_FIELDS)
    .populate("contributors.user", AUTHOR_FIELDS)
    .populate("messages.author", AUTHOR_FIELDS)
    .lean();
  if (!capsule) return { error: 404, message: "La cápsula no existe" };
  if (!canAccess(capsule, viewerId)) {
    return { error: 403, message: "Esta cápsula es privada" };
  }
  return { capsule };
}

/**
 * Apertura perezosa + idempotente: si la fecha ya pasó, la cápsula se
 * abre con una transición atómica (solo una petición la reclama) y se
 * notifica a dueño y colaboradores una única vez. El scheduler llama a
 * esta misma función.
 */
async function openIfDue(capsule, io) {
  if (!capsule || capsule.state !== "scheduled") return capsule;
  if (new Date(capsule.opensAt).getTime() > Date.now()) return capsule;

  const claimed = await Capsule.findOneAndUpdate(
    { _id: capsule._id, state: "scheduled", opensAt: { $lte: new Date() } },
    { $set: { state: "opened", openedAt: new Date() } },
    { new: true }
  );
  if (!claimed) {
    return Capsule.findById(capsule._id)
      .populate("owner", AUTHOR_FIELDS)
      .populate("contributors.user", AUTHOR_FIELDS)
      .populate("messages.author", AUTHOR_FIELDS)
      .lean();
  }

  const recipients = [
    claimed.owner,
    ...(claimed.contributors || []).map((contributor) => contributor.user)
  ].filter(Boolean);
  for (const recipient of recipients) {
    await createNotification({
      recipient,
      actor: claimed.owner,
      type: "capsule",
      io
    }).catch(() => {});
  }

  return Capsule.findById(claimed._id)
    .populate("owner", AUTHOR_FIELDS)
    .populate("contributors.user", AUTHOR_FIELDS)
    .populate("messages.author", AUTHOR_FIELDS)
    .lean();
}

/** Scheduler: abre todas las cápsulas vencidas. Idempotente por transición. */
async function openDueCapsules(io) {
  if (mongoose.connection.readyState !== 1) return [];
  const due = await Capsule.find({ state: "scheduled", opensAt: { $lte: new Date() } })
    .select("_id")
    .lean();
  const opened = [];
  for (const item of due) {
    const capsule = await Capsule.findById(item._id).lean();
    const result = await openIfDue(capsule, io);
    if (result && result.state === "opened") opened.push(result._id);
  }
  return opened;
}

// ---------- Lista (propias + colaboradas) ----------

router.get("/", auth, requireUser, async (req, res) => {
  try {
    const capsules = await Capsule.find({
      $or: [{ owner: req.user.id }, { "contributors.user": req.user.id }]
    })
      .sort({ opensAt: 1 })
      .populate("owner", AUTHOR_FIELDS)
      .lean();
    return res.json({
      capsules: capsules.map((capsule) => normalizeCapsule(capsule, req.user.id))
    });
  } catch (error) {
    console.error("LIST_CAPSULES_ERROR:", error);
    return res.status(500).json({ error: "Error obteniendo tus cápsulas" });
  }
});

// ---------- Crear (nace en draft con el primer mensaje cifrado) ----------

router.post("/", auth, requireUser, async (req, res) => {
  try {
    const parsed = parseCapsulePayload(req.body);
    if (parsed.error) return res.status(400).json({ error: parsed.error });
    if (!validId(req.user.id)) return res.status(401).json({ error: "Usuario autenticado inválido" });

    const capsule = await Capsule.create({
      owner: req.user.id,
      title: parsed.title,
      opensAt: parsed.opensAt,
      timezone: parsed.timezone,
      state: "draft",
      ...(parsed.message
        ? { messages: [{ author: req.user.id, ...encryptText(parsed.message) }] }
        : {})
    });
    await capsule.populate("owner", AUTHOR_FIELDS);
    return res.status(201).json({ capsule: normalizeCapsule(withDecryptedMessages(capsule.toObject()), req.user.id) });
  } catch (error) {
    console.error("CREATE_CAPSULE_ERROR:", error);
    return res.status(500).json({ error: "Error creando la cápsula" });
  }
});

// ---------- Una cápsula (apertura perezosa si ya venció) ----------

router.get("/:capsuleId", auth, requireUser, async (req, res) => {
  try {
    const found = await getCapsuleForViewer(req.params.capsuleId, req.user.id);
    if (found.error) return res.status(found.error).json({ error: found.message });
    const capsule = await openIfDue(found.capsule, req.app?.get?.("io"));
    return res.json({ capsule: normalizeCapsule(withDecryptedMessages(capsule), req.user.id) });
  } catch (error) {
    console.error("GET_CAPSULE_ERROR:", error);
    return res.status(500).json({ error: "Error obteniendo la cápsula" });
  }
});

// ---------- Sellar (draft → scheduled: contenido bloqueado) ----------

router.post("/:capsuleId/seal", auth, requireUser, async (req, res) => {
  try {
    const found = await getCapsuleForViewer(req.params.capsuleId, req.user.id);
    if (found.error) return res.status(found.error).json({ error: found.message });
    if (!isOwner(found.capsule, req.user.id)) {
      return res.status(403).json({ error: "Solo quien creó la cápsula puede sellarla" });
    }
    if (found.capsule.state !== "draft") {
      return res.status(409).json({ error: "La cápsula ya está sellada" });
    }
    if (!(found.capsule.messages || []).length) {
      return res.status(400).json({ error: "Añade al menos un mensaje antes de sellar la cápsula" });
    }
    if (new Date(found.capsule.opensAt).getTime() <= Date.now()) {
      return res.status(400).json({ error: "La fecha de apertura debe estar en el futuro" });
    }
    const sealed = await Capsule.findOneAndUpdate(
      { _id: found.capsule._id, state: "draft" },
      { $set: { state: "scheduled" } },
      { new: true }
    )
      .populate("owner", AUTHOR_FIELDS)
      .populate("contributors.user", AUTHOR_FIELDS)
      .populate("messages.author", AUTHOR_FIELDS)
      .lean();
    if (!sealed) return res.status(409).json({ error: "La cápsula ya está sellada" });
    return res.json({ capsule: normalizeCapsule(sealed, req.user.id) });
  } catch (error) {
    console.error("SEAL_CAPSULE_ERROR:", error);
    return res.status(500).json({ error: "Error sellando la cápsula" });
  }
});

// ---------- Cancelar (scheduled → cancelled: nunca se revela) ----------

router.post("/:capsuleId/cancel", auth, requireUser, async (req, res) => {
  try {
    const found = await getCapsuleForViewer(req.params.capsuleId, req.user.id);
    if (found.error) return res.status(found.error).json({ error: found.message });
    if (!isOwner(found.capsule, req.user.id)) {
      return res.status(403).json({ error: "Solo quien creó la cápsula puede cancelarla" });
    }
    if (found.capsule.state !== "scheduled") {
      return res.status(409).json({ error: "Solo se puede cancelar una cápsula sellada" });
    }
    const cancelled = await Capsule.findOneAndUpdate(
      { _id: found.capsule._id, state: "scheduled" },
      { $set: { state: "cancelled", cancelledAt: new Date() } },
      { new: true }
    )
      .populate("owner", AUTHOR_FIELDS)
      .populate("contributors.user", AUTHOR_FIELDS)
      .populate("messages.author", AUTHOR_FIELDS)
      .lean();
    if (!cancelled) return res.status(409).json({ error: "La cápsula ya no está sellada" });
    return res.json({ capsule: normalizeCapsule(cancelled, req.user.id) });
  } catch (error) {
    console.error("CANCEL_CAPSULE_ERROR:", error);
    return res.status(500).json({ error: "Error cancelando la cápsula" });
  }
});

// ---------- Mensajes (solo en draft: cifrados al escribir) ----------

router.post("/:capsuleId/messages", auth, requireUser, async (req, res) => {
  try {
    const found = await getCapsuleForViewer(req.params.capsuleId, req.user.id);
    if (found.error) return res.status(found.error).json({ error: found.message });
    if (found.capsule.state !== "draft") {
      return res.status(409).json({ error: "La cápsula está sellada y ya no admite mensajes" });
    }

    const text = typeof req.body?.text === "string" ? req.body.text.trim() : "";
    if (!text) return res.status(400).json({ error: "El mensaje está vacío" });
    if (text.length > MAX_MESSAGE) {
      return res.status(400).json({ error: `El mensaje no puede superar ${MAX_MESSAGE} caracteres` });
    }

    const relation = await canInteract(req.user.id, found.capsule.owner?._id || found.capsule.owner);
    if (!relation.allowed) return res.status(403).json({ error: relation.message });

    const message = { author: req.user.id, ...encryptText(text) };
    const updated = await Capsule.findOneAndUpdate(
      { _id: found.capsule._id, state: "draft" },
      { $push: { messages: message } },
      { new: true }
    )
      .populate("owner", AUTHOR_FIELDS)
      .populate("contributors.user", AUTHOR_FIELDS)
      .populate("messages.author", AUTHOR_FIELDS)
      .lean();
    if (!updated) return res.status(409).json({ error: "La cápsula está sellada y ya no admite mensajes" });
    return res.status(201).json({ capsule: normalizeCapsule(withDecryptedMessages(updated), req.user.id) });
  } catch (error) {
    console.error("CAPSULE_MESSAGE_ERROR:", error);
    return res.status(500).json({ error: "Error añadiendo el mensaje" });
  }
});

// ---------- Invitar colaborador (solo draft, por username) ----------

router.post("/:capsuleId/invite", auth, requireUser, async (req, res) => {
  try {
    const found = await getCapsuleForViewer(req.params.capsuleId, req.user.id);
    if (found.error) return res.status(found.error).json({ error: found.message });
    if (!isOwner(found.capsule, req.user.id)) {
      return res.status(403).json({ error: "Solo quien creó la cápsula puede invitar" });
    }
    if (found.capsule.state !== "draft") {
      return res.status(409).json({ error: "La cápsula está sellada y ya no admite colaboradores" });
    }

    const username = typeof req.body?.username === "string" ? req.body.username.trim().toLowerCase() : "";
    if (!username) return res.status(400).json({ error: "Escribe el usuario a invitar" });

    const invitee = await User.findOne({ username }).select("_id username displayName").lean();
    if (!invitee) return res.status(404).json({ error: "No existe ese usuario" });
    if (String(invitee._id) === String(req.user.id)) {
      return res.status(400).json({ error: "No puedes invitarte a tu propia cápsula" });
    }
    if ((found.capsule.contributors || []).some((c) => String(c.user?._id || c.user) === String(invitee._id))) {
      return res.status(409).json({ error: "Esa persona ya colabora en la cápsula" });
    }
    if ((found.capsule.contributors || []).length >= MAX_CONTRIBUTORS) {
      return res.status(409).json({ error: `La cápsula admite hasta ${MAX_CONTRIBUTORS} colaboradores` });
    }

    const relation = await canInteract(req.user.id, invitee._id);
    if (!relation.allowed) return res.status(403).json({ error: relation.message });

    const updated = await Capsule.findOneAndUpdate(
      { _id: found.capsule._id, state: "draft" },
      { $push: { contributors: { user: invitee._id } } },
      { new: true }
    )
      .populate("owner", AUTHOR_FIELDS)
      .populate("contributors.user", AUTHOR_FIELDS)
      .populate("messages.author", AUTHOR_FIELDS)
      .lean();
    if (!updated) return res.status(409).json({ error: "La cápsula está sellada y ya no admite colaboradores" });
    return res.json({ capsule: normalizeCapsule(updated, req.user.id) });
  } catch (error) {
    console.error("CAPSULE_INVITE_ERROR:", error);
    return res.status(500).json({ error: "Error invitando a la cápsula" });
  }
});

// ---------- Eliminar ----------

router.delete("/:capsuleId", auth, requireUser, async (req, res) => {
  try {
    if (!validId(req.params.capsuleId)) return res.status(400).json({ error: "ID de cápsula inválido" });
    const capsule = await Capsule.findById(req.params.capsuleId).lean();
    if (!capsule) return res.status(404).json({ error: "La cápsula no existe" });
    if (!isOwner(capsule, req.user.id)) {
      return res.status(403).json({ error: "Solo quien creó la cápsula puede eliminarla" });
    }
    await Capsule.deleteOne({ _id: capsule._id });
    return res.json({ deleted: true });
  } catch (error) {
    console.error("DELETE_CAPSULE_ERROR:", error);
    return res.status(500).json({ error: "Error eliminando la cápsula" });
  }
});

module.exports = router;
module.exports.parseCapsulePayload = parseCapsulePayload;
module.exports.normalizeCapsule = normalizeCapsule;
module.exports.openDueCapsules = openDueCapsules;
module.exports.openIfDue = openIfDue;
