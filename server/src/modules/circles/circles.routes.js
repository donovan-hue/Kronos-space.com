const express = require("express");
const mongoose = require("mongoose");

const Circle = require("./Circle");
const User = require("../users/User");
const auth = require("../../middleware/auth");
const { requireUser } = require("../../middleware/permissions");

const router = express.Router();
const MAX_NAME = 80;
const MAX_DESCRIPTION = 300;
const MAX_MEMBERS = 100;

function validId(value) {
  return mongoose.Types.ObjectId.isValid(value);
}

function parsePayload(body = {}, fallback = {}) {
  const name = Object.prototype.hasOwnProperty.call(body, "name")
    ? typeof body.name === "string" ? body.name.trim() : ""
    : fallback.name || "";
  const description = Object.prototype.hasOwnProperty.call(body, "description")
    ? typeof body.description === "string" ? body.description.trim() : ""
    : fallback.description || "";

  if (!name) return { error: "El nombre del círculo es obligatorio" };
  if (name.length > MAX_NAME) return { error: "El nombre no puede superar 80 caracteres" };
  if (description.length > MAX_DESCRIPTION) return { error: "La descripción no puede superar 300 caracteres" };
  return { name, description };
}

function present(circle, members = null) {
  const result = {
    _id: circle._id,
    owner: circle.owner ? String(circle.owner) : "",
    name: circle.name,
    description: circle.description || "",
    membersCount: Array.isArray(circle.members) ? circle.members.length : 0,
    createdAt: circle.createdAt,
    updatedAt: circle.updatedAt
  };
  if (Array.isArray(members)) result.members = members;
  return result;
}

function presentMember(user) {
  return {
    _id: user._id,
    username: user.username,
    displayName: user.displayName || "",
    avatar: user.avatar || ""
  };
}

async function ownedCircle(circleId, ownerId) {
  if (!validId(circleId)) return null;
  return Circle.findOne({ _id: circleId, owner: ownerId });
}

router.get("/", auth, requireUser, async (req, res) => {
  try {
    const circles = await Circle.find({ owner: req.user.id })
      .select("_id name description members createdAt updatedAt")
      .sort({ updatedAt: -1 })
      .lean();
    return res.json({ circles: circles.map((circle) => present(circle)) });
  } catch (error) {
    console.error("LIST_CIRCLES_ERROR:", error);
    return res.status(500).json({ error: "Error obteniendo círculos" });
  }
});

router.post("/", auth, requireUser, async (req, res) => {
  try {
    const parsed = parsePayload(req.body);
    if (parsed.error) return res.status(400).json({ error: parsed.error });
    const circle = await Circle.create({ owner: req.user.id, ...parsed, members: [] });
    return res.status(201).json({ circle: present(circle) });
  } catch (error) {
    if (error?.code === 11000) return res.status(409).json({ error: "Ya tienes un círculo con ese nombre" });
    console.error("CREATE_CIRCLE_ERROR:", error);
    return res.status(500).json({ error: "Error creando círculo" });
  }
});

router.patch("/:circleId", auth, requireUser, async (req, res) => {
  try {
    const existing = await ownedCircle(req.params.circleId, req.user.id);
    if (!existing) return res.status(404).json({ error: "Círculo no encontrado" });
    const parsed = parsePayload(req.body, existing);
    if (parsed.error) return res.status(400).json({ error: parsed.error });
    const circle = await Circle.findOneAndUpdate(
      { _id: existing._id, owner: req.user.id },
      { $set: parsed },
      { new: true, runValidators: true }
    ).lean();
    return res.json({ circle: present(circle) });
  } catch (error) {
    if (error?.code === 11000) return res.status(409).json({ error: "Ya tienes un círculo con ese nombre" });
    console.error("UPDATE_CIRCLE_ERROR:", error);
    return res.status(500).json({ error: "Error actualizando círculo" });
  }
});

router.delete("/:circleId", auth, requireUser, async (req, res) => {
  try {
    const deleted = await Circle.findOneAndDelete({ _id: req.params.circleId, owner: req.user.id }).lean();
    if (!deleted) return res.status(404).json({ error: "Círculo no encontrado" });
    return res.json({ ok: true, circleId: String(deleted._id) });
  } catch (error) {
    console.error("DELETE_CIRCLE_ERROR:", error);
    return res.status(500).json({ error: "Error eliminando círculo" });
  }
});

router.get("/:circleId/members", auth, requireUser, async (req, res) => {
  try {
    const circle = await ownedCircle(req.params.circleId, req.user.id);
    if (!circle) return res.status(404).json({ error: "Círculo no encontrado" });
    const members = await User.find({ _id: { $in: circle.members || [] } })
      .select("username displayName avatar")
      .sort({ username: 1 })
      .lean();
    return res.json({ circle: present(circle), members: members.map(presentMember) });
  } catch (error) {
    console.error("LIST_CIRCLE_MEMBERS_ERROR:", error);
    return res.status(500).json({ error: "Error obteniendo miembros del círculo" });
  }
});

router.post("/:circleId/members", auth, requireUser, async (req, res) => {
  try {
    const circle = await ownedCircle(req.params.circleId, req.user.id);
    if (!circle) return res.status(404).json({ error: "Círculo no encontrado" });
    const userId = typeof req.body?.userId === "string" ? req.body.userId.trim() : "";
    if (!validId(userId)) return res.status(400).json({ error: "Usuario inválido" });
    if (String(userId) === String(req.user.id)) return res.status(400).json({ error: "El propietario ya pertenece al círculo" });
    if (circle.members.some((member) => String(member) === userId)) {
      return res.json({ circle: present(circle), added: false });
    }
    if (circle.members.length >= MAX_MEMBERS) return res.status(400).json({ error: "El círculo alcanzó el límite de 100 miembros" });
    const user = await User.findById(userId).select("_id username displayName avatar").lean();
    if (!user) return res.status(404).json({ error: "Usuario no encontrado" });
    const updated = await Circle.findOneAndUpdate(
      { _id: circle._id, owner: req.user.id, members: { $ne: user._id } },
      { $addToSet: { members: user._id } },
      { new: true }
    ).lean();
    return res.json({ circle: present(updated || circle), added: Boolean(updated) });
  } catch (error) {
    console.error("ADD_CIRCLE_MEMBER_ERROR:", error);
    return res.status(500).json({ error: "Error agregando miembro" });
  }
});

router.delete("/:circleId/members/:userId", auth, requireUser, async (req, res) => {
  try {
    const circle = await ownedCircle(req.params.circleId, req.user.id);
    if (!circle) return res.status(404).json({ error: "Círculo no encontrado" });
    if (!validId(req.params.userId)) return res.status(400).json({ error: "Usuario inválido" });
    const updated = await Circle.findOneAndUpdate(
      { _id: circle._id, owner: req.user.id },
      { $pull: { members: req.params.userId } },
      { new: true }
    ).lean();
    return res.json({ circle: present(updated), removed: true });
  } catch (error) {
    console.error("REMOVE_CIRCLE_MEMBER_ERROR:", error);
    return res.status(500).json({ error: "Error quitando miembro" });
  }
});

module.exports = router;
