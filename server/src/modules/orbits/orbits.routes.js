const express = require("express");
const mongoose = require("mongoose");

const Orbit = require("./Orbit");
const User = require("../users/User");
const auth = require("../../middleware/auth");
const { requireUser } = require("../../middleware/permissions");

const { validId } = require("../../utils/queryHelpers");

const router = express.Router();
const MAX_NAME = 80;
const MAX_DESCRIPTION = 500;
const MAX_RULES = 10;
const MAX_RULE_LENGTH = 200;
const MAX_DURATION_DAYS = 365;

function slugify(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 70) || "orbit";
}

function activeFilter() {
  return { $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }] };
}

function parseRules(value, fallback = []) {
  if (value === undefined) return Array.isArray(fallback) ? fallback : [];
  if (!Array.isArray(value)) return { error: "Las reglas deben enviarse como una lista" };
  const rules = value
    .filter((rule) => typeof rule === "string")
    .map((rule) => rule.trim())
    .filter(Boolean);
  if (rules.length > MAX_RULES) return { error: "Una órbita no puede superar 10 reglas" };
  if (rules.some((rule) => rule.length > MAX_RULE_LENGTH)) return { error: "Cada regla no puede superar 200 caracteres" };
  return rules;
}

function parseExpiresAt(value, fallback = null) {
  if (value === undefined) return fallback || null;
  if (value === null || value === "") return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return { error: "La fecha de duración no es válida" };
  const now = Date.now();
  const maximum = now + MAX_DURATION_DAYS * 24 * 60 * 60 * 1000;
  if (date.getTime() <= now) return { error: "La duración debe terminar en el futuro" };
  if (date.getTime() > maximum) return { error: "La duración máxima es de 365 días" };
  return date;
}

function parsePayload(body = {}, fallback = {}) {
  const name = Object.prototype.hasOwnProperty.call(body, "name")
    ? typeof body.name === "string" ? body.name.trim() : ""
    : fallback.name || "";
  const description = Object.prototype.hasOwnProperty.call(body, "description")
    ? typeof body.description === "string" ? body.description.trim() : ""
    : fallback.description || "";
  const visibility = Object.prototype.hasOwnProperty.call(body, "visibility")
    ? body.visibility
    : fallback.visibility || "public";
  const rules = parseRules(body.rules, fallback.rules);
  const expiresAt = parseExpiresAt(body.expiresAt, fallback.expiresAt);
  const welcomeMessage = Object.prototype.hasOwnProperty.call(body, "welcomeMessage")
    ? typeof body.welcomeMessage === "string" ? body.welcomeMessage.trim() : ""
    : fallback.welcomeMessage || "";
  if (welcomeMessage.length > 1000) {
    return { error: "El paquete de bienvenida no puede superar 1000 caracteres" };
  }

  if (!name) return { error: "El nombre de la órbita es obligatorio" };
  if (name.length > MAX_NAME) return { error: "El nombre no puede superar 80 caracteres" };
  if (description.length > MAX_DESCRIPTION) return { error: "La descripción no puede superar 500 caracteres" };
  if (!["public", "private"].includes(visibility)) return { error: "Visibilidad no válida" };
  if (rules?.error) return rules;
  if (expiresAt?.error) return expiresAt;
  return { name, description, visibility, rules, expiresAt, welcomeMessage };
}

function memberEntry(orbit, userId) {
  return (orbit.members || []).find((member) => String(member.user?._id || member.user) === String(userId));
}

function presentMember(member) {
  const user = member.user || {};
  return {
    _id: user._id || user,
    username: user.username || "",
    displayName: user.displayName || "",
    avatar: user.avatar || "",
    role: member.role,
    joinedAt: member.joinedAt
  };
}

function present(orbit, viewerId) {
  const joined = memberEntry(orbit, viewerId);
  return {
    _id: orbit._id,
    owner: orbit.owner ? String(orbit.owner) : "",
    name: orbit.name,
    slug: orbit.slug,
    description: orbit.description || "",
    welcomeMessage: orbit.welcomeMessage || "",
    rules: Array.isArray(orbit.rules) ? orbit.rules : [],
    visibility: orbit.visibility,
    expiresAt: orbit.expiresAt || null,
    membersCount: Array.isArray(orbit.members) ? orbit.members.length : 0,
    joined: Boolean(joined),
    role: joined?.role || null,
    active: !orbit.expiresAt || new Date(orbit.expiresAt).getTime() > Date.now(),
    createdAt: orbit.createdAt,
    updatedAt: orbit.updatedAt
  };
}

async function findVisibleOrbit(orbitId, viewerId) {
  if (!validId(orbitId)) return null;
  const orbit = await Orbit.findOne({
    _id: orbitId,
    $and: [
      activeFilter(),
      { $or: [{ visibility: "public" }, { owner: viewerId }, { "members.user": viewerId }] }
    ]
  });
  return orbit;
}

function canManage(orbit, userId) {
  const entry = memberEntry(orbit, userId);
  return String(orbit.owner) === String(userId) || entry?.role === "moderator";
}

router.get("/", auth, requireUser, async (req, res) => {
  try {
    const orbits = await Orbit.find({
      $and: [
        activeFilter(),
        { $or: [{ visibility: "public" }, { owner: req.user.id }, { "members.user": req.user.id }] }
      ]
    })
      .select("owner name slug description rules visibility expiresAt members createdAt updatedAt")
      .sort({ updatedAt: -1 })
      .lean();
    return res.json({ orbits: orbits.map((orbit) => present(orbit, req.user.id)) });
  } catch (error) {
    console.error("LIST_ORBITS_ERROR:", error);
    return res.status(500).json({ error: "Error obteniendo órbitas" });
  }
});

router.post("/", auth, requireUser, async (req, res) => {
  try {
    const parsed = parsePayload(req.body);
    if (parsed.error) return res.status(400).json({ error: parsed.error });
    const orbit = await Orbit.create({
      owner: req.user.id,
      ...parsed,
      slug: `${slugify(parsed.name)}-${new mongoose.Types.ObjectId().toString().slice(-6)}`,
      members: [{ user: req.user.id, role: "owner" }]
    });
    return res.status(201).json({ orbit: present(orbit, req.user.id) });
  } catch (error) {
    if (error?.code === 11000) return res.status(409).json({ error: "Ya tienes una órbita con ese nombre" });
    console.error("CREATE_ORBIT_ERROR:", error);
    return res.status(500).json({ error: "Error creando órbita" });
  }
});

// FASE 4 (restos) — archivo de órbitas: las temporales vencidas donde
// participas quedan consultables en modo lectura. No se listan en las
// activas ni se pueden unir, pero su historia no desaparece.
router.get("/archived", auth, requireUser, async (req, res) => {
  try {
    const orbits = await Orbit.find({
      expiresAt: { $ne: null, $lte: new Date() },
      $or: [{ owner: req.user.id }, { "members.user": req.user.id }]
    })
      .select("owner name slug description visibility expiresAt members createdAt updatedAt")
      .sort({ expiresAt: -1 })
      .limit(50)
      .lean();
    return res.json({ orbits: orbits.map((orbit) => present(orbit, req.user.id)) });
  } catch (error) {
    console.error("ARCHIVED_ORBITS_ERROR:", error);
    return res.status(500).json({ error: "Error obteniendo el archivo de órbitas" });
  }
});

router.get("/:orbitId", auth, requireUser, async (req, res) => {
  try {
    const orbit = await findVisibleOrbit(req.params.orbitId, req.user.id);
    if (orbit) return res.json({ orbit: present(orbit, req.user.id) });

    // Archivo: una órbita vencida sigue siendo legible para quienes
    // participaron (owner o miembro), pero no aparece en las activas.
    if (validId(req.params.orbitId)) {
      const expired = await Orbit.findOne({
        _id: req.params.orbitId,
        expiresAt: { $ne: null, $lte: new Date() },
        $or: [{ owner: req.user.id }, { "members.user": req.user.id }]
      }).lean();
      if (expired) return res.json({ orbit: present(expired, req.user.id) });
    }

    return res.status(404).json({ error: "Órbita no encontrada" });
  } catch (error) {
    console.error("GET_ORBIT_ERROR:", error);
    return res.status(500).json({ error: "Error obteniendo órbita" });
  }
});

router.patch("/:orbitId", auth, requireUser, async (req, res) => {
  try {
    const orbit = await Orbit.findOne({ _id: req.params.orbitId, owner: req.user.id });
    if (!orbit) return res.status(404).json({ error: "Órbita no encontrada" });
    const parsed = parsePayload(req.body, orbit);
    if (parsed.error) return res.status(400).json({ error: parsed.error });
    Object.assign(orbit, parsed);
    await orbit.save();
    return res.json({ orbit: present(orbit, req.user.id) });
  } catch (error) {
    if (error?.code === 11000) return res.status(409).json({ error: "Ya tienes una órbita con ese nombre" });
    console.error("UPDATE_ORBIT_ERROR:", error);
    return res.status(500).json({ error: "Error actualizando órbita" });
  }
});

router.delete("/:orbitId", auth, requireUser, async (req, res) => {
  try {
    const deleted = await Orbit.findOneAndDelete({ _id: req.params.orbitId, owner: req.user.id }).lean();
    if (!deleted) return res.status(404).json({ error: "Órbita no encontrada" });
    return res.json({ ok: true, orbitId: String(deleted._id) });
  } catch (error) {
    console.error("DELETE_ORBIT_ERROR:", error);
    return res.status(500).json({ error: "Error eliminando órbita" });
  }
});

router.post("/:orbitId/join", auth, requireUser, async (req, res) => {
  try {
    const orbit = await Orbit.findOne({ _id: req.params.orbitId, ...activeFilter() });
    if (!orbit) return res.status(404).json({ error: "Órbita no encontrada" });
    if (orbit.visibility !== "public") return res.status(403).json({ error: "Esta órbita es privada y requiere una invitación" });
    if (memberEntry(orbit, req.user.id)) return res.json({ orbit: present(orbit, req.user.id), joined: true });
    orbit.members.push({ user: req.user.id, role: "member" });
    await orbit.save();
    return res.json({ orbit: present(orbit, req.user.id), joined: true });
  } catch (error) {
    console.error("JOIN_ORBIT_ERROR:", error);
    return res.status(500).json({ error: "Error uniéndote a la órbita" });
  }
});

router.post("/:orbitId/leave", auth, requireUser, async (req, res) => {
  try {
    const orbit = await Orbit.findOne({ _id: req.params.orbitId, ...activeFilter() });
    if (!orbit) return res.status(404).json({ error: "Órbita no encontrada" });
    if (String(orbit.owner) === String(req.user.id)) return res.status(400).json({ error: "El propietario no puede salir; elimina la órbita" });
    orbit.members = orbit.members.filter((member) => String(member.user) !== String(req.user.id));
    await orbit.save();
    return res.json({ ok: true, orbitId: String(orbit._id) });
  } catch (error) {
    console.error("LEAVE_ORBIT_ERROR:", error);
    return res.status(500).json({ error: "Error saliendo de la órbita" });
  }
});

router.get("/:orbitId/members", auth, requireUser, async (req, res) => {
  try {
    const orbit = await findVisibleOrbit(req.params.orbitId, req.user.id);
    if (!orbit || !canManage(orbit, req.user.id)) return res.status(403).json({ error: "No tienes permisos para ver la gestión de miembros" });
    await orbit.populate("members.user", "username displayName avatar");
    return res.json({ members: orbit.members.map(presentMember), orbit: present(orbit, req.user.id) });
  } catch (error) {
    console.error("LIST_ORBIT_MEMBERS_ERROR:", error);
    return res.status(500).json({ error: "Error obteniendo miembros" });
  }
});

router.post("/:orbitId/members", auth, requireUser, async (req, res) => {
  try {
    const orbit = await findVisibleOrbit(req.params.orbitId, req.user.id);
    if (!orbit || !canManage(orbit, req.user.id)) return res.status(403).json({ error: "No tienes permisos para gestionar miembros" });
    const userId = typeof req.body?.userId === "string" ? req.body.userId.trim() : "";
    const requestedRole = req.body?.role || "member";
    if (!validId(userId)) return res.status(400).json({ error: "Usuario inválido" });
    if (!["member", "moderator"].includes(requestedRole)) return res.status(400).json({ error: "Rol inválido" });
    if (requestedRole === "moderator" && String(orbit.owner) !== String(req.user.id)) return res.status(403).json({ error: "Solo el propietario puede asignar moderadores" });
    const user = await User.findById(userId).select("_id username displayName avatar").lean();
    if (!user) return res.status(404).json({ error: "Usuario no encontrado" });
    const existing = memberEntry(orbit, userId);
    if (existing) {
      if (requestedRole === "moderator" && String(orbit.owner) === String(req.user.id)) existing.role = requestedRole;
    } else {
      orbit.members.push({ user: user._id, role: requestedRole });
    }
    await orbit.save();
    return res.json({ orbit: present(orbit, req.user.id), added: !existing });
  } catch (error) {
    console.error("ADD_ORBIT_MEMBER_ERROR:", error);
    return res.status(500).json({ error: "Error agregando miembro" });
  }
});

router.patch("/:orbitId/members/:userId", auth, requireUser, async (req, res) => {
  try {
    const orbit = await Orbit.findOne({ _id: req.params.orbitId, owner: req.user.id });
    if (!orbit) return res.status(404).json({ error: "Órbita no encontrada" });
    const role = req.body?.role;
    if (!["moderator", "member"].includes(role)) return res.status(400).json({ error: "Rol inválido" });
    const member = memberEntry(orbit, req.params.userId);
    if (!member || member.role === "owner") return res.status(404).json({ error: "Miembro no encontrado" });
    member.role = role;
    await orbit.save();
    return res.json({ orbit: present(orbit, req.user.id), role });
  } catch (error) {
    console.error("UPDATE_ORBIT_MEMBER_ERROR:", error);
    return res.status(500).json({ error: "Error actualizando rol" });
  }
});

router.delete("/:orbitId/members/:userId", auth, requireUser, async (req, res) => {
  try {
    const orbit = await findVisibleOrbit(req.params.orbitId, req.user.id);
    if (!orbit || !canManage(orbit, req.user.id)) return res.status(403).json({ error: "No tienes permisos para gestionar miembros" });
    const member = memberEntry(orbit, req.params.userId);
    if (!member || member.role === "owner") return res.status(404).json({ error: "Miembro no encontrado" });
    if (member.role === "moderator" && String(orbit.owner) !== String(req.user.id)) return res.status(403).json({ error: "Solo el propietario puede quitar moderadores" });
    orbit.members = orbit.members.filter((item) => String(item.user) !== String(req.params.userId));
    await orbit.save();
    return res.json({ orbit: present(orbit, req.user.id), removed: true });
  } catch (error) {
    console.error("REMOVE_ORBIT_MEMBER_ERROR:", error);
    return res.status(500).json({ error: "Error quitando miembro" });
  }
});

module.exports = router;
module.exports.activeFilter = activeFilter;
