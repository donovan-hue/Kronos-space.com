const express = require("express");
const mongoose = require("mongoose");
const User = require("./User");
const auth = require("../../middleware/auth");
const { requireUser } = require("../../middleware/permissions");
const { handleUpload } = require("../../middleware/upload");
const { saveBuffer } = require("../../config/storage");
const { createNotification } = require("../notifications/notification.service");

const router = express.Router();

function publicUser(user, currentUserId) {
  const followers = Array.isArray(user.followers) ? user.followers : [];
  const following = Array.isArray(user.following) ? user.following : [];
  return {
    _id: user._id,
    username: user.username,
    displayName: user.displayName || "",
    avatar: user.avatar || "",
    bio: user.bio || "",
    createdAt: user.createdAt,
    followersCount: followers.length,
    followingCount: following.length,
    isFollowing: followers.some((id) => String(id) === String(currentUserId))
  };
}

router.get("/me", auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select("-passwordHash -password").lean();
    if (!user) return res.status(404).json({ error: "Usuario no encontrado" });
    return res.json(user);
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
    const users = await User.find({ _id: { $ne: req.user.id }, $or: [{ username: regex }, { displayName: regex }] })
      .select("_id username displayName avatar bio followers following")
      .limit(30)
      .lean();
    return res.json({ users: users.map((user) => publicUser(user, req.user.id)) });
  } catch (error) {
    console.error("SEARCH_USERS_ERROR:", error);
    return res.status(500).json({ error: "Error buscando usuarios" });
  }
});

router.get("/username/:username", auth, async (req, res) => {
  try {
    const username = String(req.params.username || "").trim().toLowerCase();
    if (!/^[a-z0-9_]{3,30}$/.test(username)) return res.status(400).json({ error: "Username inválido" });
    const user = await User.findOne({ username }).select("_id username displayName avatar bio followers following createdAt").lean();
    if (!user) return res.status(404).json({ error: "Usuario no encontrado" });
    return res.json(publicUser(user, req.user.id));
  } catch (error) {
    console.error("GET_USERNAME_ERROR:", error);
    return res.status(500).json({ error: "Error obteniendo usuario" });
  }
});

router.get("/:id", auth, async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ error: "ID de usuario inválido" });
    const user = await User.findById(req.params.id).select("_id username displayName avatar bio followers following createdAt").lean();
    if (!user) return res.status(404).json({ error: "Usuario no encontrado" });
    return res.json(publicUser(user, req.user.id));
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
    for (const field of ["displayName", "bio", "avatar"]) {
      if (Object.prototype.hasOwnProperty.call(req.body, field)) updates[field] = typeof req.body[field] === "string" ? req.body[field].trim() : req.body[field];
    }
    if (typeof updates.displayName === "string" && updates.displayName.length > 100) return res.status(400).json({ error: "El nombre visible no puede superar 100 caracteres" });
    if (typeof updates.bio === "string" && updates.bio.length > 500) return res.status(400).json({ error: "La biografía no puede superar 500 caracteres" });
    if (typeof updates.avatar === "string" && updates.avatar.length > 2000) return res.status(400).json({ error: "Avatar inválido" });
    const user = await User.findByIdAndUpdate(req.user.id, { $set: updates }, { new: true, runValidators: true }).select("-passwordHash -password").lean();
    if (!user) return res.status(404).json({ error: "Usuario no encontrado" });
    return res.json(user);
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
    const { url } = saveBuffer({
      buffer: req.file.buffer,
      mimetype: req.file.mimetype,
      originalname: req.file.originalname,
      subdir: "avatars"
    });
    const user = await User.findByIdAndUpdate(req.user.id, { $set: { avatar: url } }, { new: true, runValidators: true }).select("-passwordHash -password").lean();
    if (!user) return res.status(404).json({ error: "Usuario no encontrado" });
    return res.json(user);
  } catch (error) {
    console.error("AVATAR_UPLOAD_ERROR:", error);
    return res.status(500).json({ error: "Error subiendo avatar" });
  }
});

module.exports = router;
