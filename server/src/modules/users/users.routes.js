const express = require("express");
const mongoose = require("mongoose");
const User = require("./User");
const auth = require("../../middleware/auth");
const { requireUser } = require("../../middleware/permissions");
const { handleUpload } = require("../../middleware/upload");
const { saveBuffer } = require("../../config/storage");
const { createNotification } = require("../notifications/notification.service");

const router = express.Router();

const { publicUser, normalizePrivacy, privacyUpdates } = require("./profilePrivacy");
const moderation = require("../moderation/moderation.service");

const PREFERENCE_KEYS = {
  onboarded: true,
  "notifications.inApp": true,
  "notifications.email": true,
  "content.showSensitive": true,
  appearance: ["system", "dark"],
  language: ["es-MX", "en"],
  aiPersonality: ["normal", "direct", "sarcastic", "grumpy"],
  "feed.mode": ["latest", "following", "interests"],
  "feed.interests": "interests"
};

function preferenceUpdates(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const updates = {};
  const entries = [
    ["onboarded", body.onboarded !== undefined ? body.onboarded : body.preferences?.onboarded],
    ["notifications.inApp", body.notifications?.inApp],
    ["notifications.email", body.notifications?.email],
    ["content.showSensitive", body.content?.showSensitive],
    ["appearance", body.appearance],
    ["language", body.language],
    ["aiPersonality", body.aiPersonality],
    ["feed.mode", body.feed?.mode],
    ["feed.interests", body.feed?.interests]
  ].filter(([, value]) => value !== undefined);

  if (!entries.length) return null;
  for (const [path, value] of entries) {
    const allowed = PREFERENCE_KEYS[path];
    if (allowed === "interests") {
      if (!Array.isArray(value)) return null;
      const raw = value.map((item) => typeof item === "string" ? item.trim().replace(/^#/, "").toLowerCase() : "");
      if (raw.some((item) => !/^[-\p{L}\p{N}_]{1,40}$/u.test(item))) return null;
      const normalized = [...new Set(raw)];
      if (normalized.length > 20) return null;
      updates[`preferences.${path}`] = normalized;
      continue;
    }
    if (allowed === true ? typeof value !== "boolean" : !allowed.includes(value)) return null;
    updates[`preferences.${path}`] = value;
  }
  return updates;
}

/**
 * Envuelve publicUser con el estado de bloqueo/silencio respecto al
 * visitante y oculta perfiles con bloqueo en cualquier dirección.
 */
async function profileWithFlags(user, viewerId) {
  const [blockedByMe, mutedByMe] = await Promise.all([
    moderation.hasBlocked(viewerId, user._id),
    (async () => {
      if (!moderation.toObjectId(user._id)) return false;
      const Mute = require("../moderation/Mute");
      const found = await Mute.exists({ muter: viewerId, muted: user._id });
      return Boolean(found);
    })()
  ]);

  return publicUser(user, viewerId, { blockedByMe, mutedByMe });
}

function parsePagination(query) {
  let page = parseInt(query.page, 10);
  let limit = parseInt(query.limit, 10);
  if (!Number.isInteger(page) || page < 1) page = 1;
  if (!Number.isInteger(limit) || limit < 1) limit = 20;
  if (limit > 50) limit = 50;
  const skip = (page - 1) * limit;
  return { page, limit, skip };
}

async function relationshipList(req, res, type) {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) return res.status(400).json({ error: "ID de usuario inválido" });

    const user = await User.findById(id)
      .select("_id username profilePrivacy followers following")
      .lean();
    if (!user) return res.status(404).json({ error: "Usuario no encontrado" });
    if (await moderation.isBlockedBetween(req.user.id, user._id)) {
      return res.status(403).json({ error: "Perfil no disponible por un bloqueo", code: "BLOCKED_RELATION" });
    }

    const owner = String(user._id) === String(req.user.id);
    const privacy = normalizePrivacy(user.profilePrivacy);
    if (!owner && !privacy.showFollowCounts) {
      return res.status(403).json({ error: "Esta lista no está disponible por la privacidad del perfil", code: "FOLLOW_LIST_PRIVATE" });
    }

    const { page, limit, skip } = parsePagination(req.query);
    const rawIds = Array.isArray(user[type]) ? user[type] : [];
    const excluded = await moderation.getExcludedUserIds(req.user.id);
    const excludedSet = new Set(excluded.map((item) => String(item)));
    const visibleIds = rawIds
      .map((item) => item?._id || item)
      .filter((item) => mongoose.isValidObjectId(item) && !excludedSet.has(String(item)));
    const total = visibleIds.length;
    const pageIds = visibleIds.slice(skip, skip + limit);
    const users = pageIds.length
      ? await User.find({ _id: { $in: pageIds } })
        .select("_id username displayName avatar bio profilePrivacy followers following createdAt")
        .lean()
      : [];
    const byId = new Map(users.map((item) => [String(item._id), item]));
    const ordered = pageIds.map((item) => byId.get(String(item))).filter(Boolean);

    return res.json({
      users: ordered.map((item) => publicUser(item, req.user.id)),
      total,
      page,
      limit,
      hasMore: skip + pageIds.length < total,
      type
    });
  } catch (error) {
    console.error("FOLLOW_LIST_ERROR:", error);
    return res.status(500).json({ error: "Error obteniendo lista de seguimiento" });
  }
}

router.patch("/me/privacy", auth, requireUser, async (req, res) => {
  const updates = privacyUpdates(req.body);
  if (!updates) return res.status(400).json({ error: "Envía únicamente opciones de privacidad booleanas válidas." });
  try {
    const user = await User.findByIdAndUpdate(req.user.id, { $set: updates }, { new: true, runValidators: true })
      .select("profilePrivacy").lean();
    if (!user) return res.status(404).json({ error: "Usuario no encontrado" });
    return res.json({ privacy: normalizePrivacy(user.profilePrivacy) });
  } catch (error) {
    console.error("UPDATE_PRIVACY_ERROR:", error.name);
    return res.status(503).json({ error: "No se pudo guardar la privacidad. Inténtalo nuevamente." });
  }
});

router.patch("/me/preferences", auth, requireUser, async (req, res) => {
  const updates = preferenceUpdates(req.body);
  if (!updates) return res.status(400).json({ error: "Envía preferencias válidas de cuenta." });

  try {
    const user = await User.findByIdAndUpdate(req.user.id, { $set: updates }, { new: true, runValidators: true })
      .select("preferences").lean();
    if (!user) return res.status(404).json({ error: "Usuario no encontrado" });
    return res.json({ preferences: user.preferences });
  } catch (error) {
    console.error("UPDATE_PREFERENCES_ERROR:", error.name);
    return res.status(503).json({ error: "No se pudieron guardar las preferencias." });
  }
});

router.get("/me", auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select("-passwordHash -password").lean();
    if (!user) return res.status(404).json({ error: "Usuario no encontrado" });
    return res.json({ ...user, profilePrivacy: normalizePrivacy(user.profilePrivacy) });
  } catch (error) {
    console.error("GET_ME_ERROR:", error);
    return res.status(500).json({ error: "Error obteniendo usuario" });
  }
});

router.get("/search", auth, async (req, res) => {
  try {
    const query = typeof req.query.q === "string" ? req.query.q.trim() : "";
    if (!query) return res.json({ users: [] });
    if (query.length > 50) return res.status(400).json({ error: "La búsqueda es demasiado larga" });
    const safeQuery = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(safeQuery, "i");
    const excluded = await moderation.getExcludedUserIds(req.user.id);
    const users = await User.find({ _id: { $ne: req.user.id, $nin: excluded }, "profilePrivacy.discoverable": { $ne: false }, $or: [{ username: regex }, { displayName: regex }] })
      .select("_id username displayName avatar bio profilePrivacy followers following")
      .limit(30)
      .lean();
    return res.json({ users: users.map((user) => publicUser(user, req.user.id)) });
  } catch (error) {
    console.error("SEARCH_USERS_ERROR:", error);
    return res.status(500).json({ error: "Error buscando usuarios" });
  }
});

router.get("/:id/followers", auth, requireUser, (req, res) => relationshipList(req, res, "followers"));
router.get("/:id/following", auth, requireUser, (req, res) => relationshipList(req, res, "following"));

router.get("/username/:username", auth, async (req, res) => {
  try {
    const username = String(req.params.username || "").trim().toLowerCase();
    if (!/^[a-z0-9_]{3,30}$/.test(username)) return res.status(400).json({ error: "Username inválido" });
    const user = await User.findOne({ username }).select("_id username displayName avatar cover bio profilePrivacy followers following createdAt").lean();
    if (!user) return res.status(404).json({ error: "Usuario no encontrado" });
    const blocked = await moderation.isBlockedBetween(req.user.id, user._id);
    if (blocked) return res.status(403).json({ error: "Perfil no disponible por un bloqueo", code: "BLOCKED_RELATION" });
    return res.json(await profileWithFlags(user, req.user.id));
  } catch (error) {
    console.error("GET_USERNAME_ERROR:", error);
    return res.status(500).json({ error: "Error obteniendo usuario" });
  }
});

router.get("/:id", auth, async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ error: "ID de usuario inválido" });
    const user = await User.findById(req.params.id).select("_id username displayName avatar cover bio profilePrivacy followers following createdAt").lean();
    if (!user) return res.status(404).json({ error: "Usuario no encontrado" });
    const blocked = await moderation.isBlockedBetween(req.user.id, user._id);
    if (blocked) return res.status(403).json({ error: "Perfil no disponible por un bloqueo", code: "BLOCKED_RELATION" });
    return res.json(await profileWithFlags(user, req.user.id));
  } catch (error) {
    console.error("GET_USER_ERROR:", error);
    return res.status(500).json({ error: "Error obteniendo usuario" });
  }
});

router.post("/:id/follow", auth, requireUser, async (req, res) => {
  try {
    const targetUserId = req.params.id;
    const currentUserId = req.user.id;
    if (!mongoose.isValidObjectId(targetUserId)) return res.status(400).json({ error: "ID de usuario inválido" });
    if (String(targetUserId) === String(currentUserId)) return res.status(400).json({ error: "No puedes seguirte a ti mismo" });
    const targetUser = await User.findById(targetUserId).select("_id").lean();
    if (!targetUser) return res.status(404).json({ error: "Usuario no encontrado" });
    if (await moderation.isBlockedBetween(req.user.id, targetUserId)) {
      return res.status(403).json({ error: "No puedes seguir a este usuario por un bloqueo", code: "BLOCKED_RELATION" });
    }
    const currentUser = await User.findById(currentUserId).select("following").lean();
    if (!currentUser) return res.status(404).json({ error: "Usuario autenticado no encontrado" });
    const isFollowing = Array.isArray(currentUser.following) && currentUser.following.some((id) => String(id) === String(targetUserId));
    if (isFollowing) {
      await Promise.all([User.updateOne({ _id: currentUserId }, { $pull: { following: targetUserId } }), User.updateOne({ _id: targetUserId }, { $pull: { followers: currentUserId } })]);
    } else {
      await Promise.all([User.updateOne({ _id: currentUserId }, { $addToSet: { following: targetUserId } }), User.updateOne({ _id: targetUserId }, { $addToSet: { followers: currentUserId } })]);
      await createNotification({ recipient: targetUserId, actor: currentUserId, type: "follow", io: req.app.get("io") });
    }
    return res.json({ userId: targetUserId, following: !isFollowing });
  } catch (error) {
    console.error("FOLLOW_USER_ERROR:", error);
    return res.status(500).json({ error: "Error actualizando seguimiento" });
  }
});

/**
 * PATCH /api/users/me
 * Actualiza displayName, bio, avatar (url) — AUDIT-005 mantiene compat pero avatar upload preferido vía /me/avatar
 */
router.patch("/me", auth, requireUser, async (req, res) => {
  try {
    const updates = {};
    for (const field of ["displayName", "bio", "avatar", "cover"]) {
      if (Object.prototype.hasOwnProperty.call(req.body, field)) updates[field] = typeof req.body[field] === "string" ? req.body[field].trim() : req.body[field];
    }
    if (typeof updates.displayName === "string" && updates.displayName.length > 100) return res.status(400).json({ error: "El nombre visible no puede superar 100 caracteres" });
    if (typeof updates.bio === "string" && updates.bio.length > 500) return res.status(400).json({ error: "La biografía no puede superar 500 caracteres" });
    if (typeof updates.avatar === "string" && updates.avatar.length > 2000) return res.status(400).json({ error: "Avatar inválido" });
    if (typeof updates.cover === "string" && updates.cover.length > 2000) return res.status(400).json({ error: "Portada inválida" });
    const user = await User.findByIdAndUpdate(req.user.id, { $set: updates }, { new: true, runValidators: true }).select("-passwordHash -password").lean();
    if (!user) return res.status(404).json({ error: "Usuario no encontrado" });
    return res.json({ ...user, profilePrivacy: normalizePrivacy(user.profilePrivacy) });
  } catch (error) {
    console.error("UPDATE_PROFILE_ERROR:", error);
    return res.status(500).json({ error: "Error actualizando perfil" });
  }
});

/**
 * POST /api/users/me/avatar
 * Upload avatar image — KRONOS-UI-016 — AUDIT-005
 * Field: avatar (image/jpeg/png/webp, max 10MB) — validado por handleUpload + signature
 */
router.post("/me/avatar", auth, requireUser, handleUpload("avatar"), async (req, res) => {
  try {
    if (!req.file || !req.file.buffer) {
      return res.status(400).json({ error: "No se recibió ninguna imagen" });
    }
    const { url } = await saveBuffer({
      buffer: req.file.buffer,
      mimetype: req.file.mimetype,
      originalname: req.file.originalname,
      subdir: "avatars"
    });
    const user = await User.findByIdAndUpdate(req.user.id, { $set: { avatar: url } }, { new: true, runValidators: true }).select("-passwordHash -password").lean();
    if (!user) return res.status(404).json({ error: "Usuario no encontrado" });
    return res.json({ ...user, profilePrivacy: normalizePrivacy(user.profilePrivacy) });
  } catch (error) {
    console.error("AVATAR_UPLOAD_ERROR:", error);
    return res.status(500).json({ error: "Error subiendo avatar" });
  }
});

/**
 * POST /api/users/me/cover
 * Upload cover image — KRONOS-UI-016 (bloque 007-016)
 * Field: cover (image/jpeg/png/webp, max 10MB) — validado por handleUpload + firma
 */
router.post("/me/cover", auth, requireUser, handleUpload("cover"), async (req, res) => {
  try {
    if (!req.file || !req.file.buffer) {
      return res.status(400).json({ error: "No se recibió ninguna imagen" });
    }
    const { url } = await saveBuffer({
      buffer: req.file.buffer,
      mimetype: req.file.mimetype,
      originalname: req.file.originalname,
      subdir: "covers"
    });
    const user = await User.findByIdAndUpdate(req.user.id, { $set: { cover: url } }, { new: true, runValidators: true }).select("-passwordHash -password").lean();
    if (!user) return res.status(404).json({ error: "Usuario no encontrado" });
    return res.json({ ...user, profilePrivacy: normalizePrivacy(user.profilePrivacy) });
  } catch (error) {
    console.error("COVER_UPLOAD_ERROR:", error);
    return res.status(500).json({ error: "Error subiendo portada" });
  }
});

module.exports = router;
