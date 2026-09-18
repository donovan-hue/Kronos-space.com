const express = require("express");
const mongoose = require("mongoose");
const auth = require("../../middleware/auth");
const { requireUser } = require("../../middleware/permissions");
const requireAdmin = require("../../middleware/requireAdmin");
const User = require("../users/User");
const Post = require("../posts/Post");
const { Report } = require("../moderation/Report");
const normalizePost = require("../posts/normalizePost");

const router = express.Router();
const PAGE_LIMIT = 25;
const USER_ROLES = ["user", "admin"];

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function pageOf(query = {}) {
  const page = Math.max(1, Number.parseInt(query.page, 10) || 1);
  const limit = Math.min(PAGE_LIMIT, Math.max(1, Number.parseInt(query.limit, 10) || PAGE_LIMIT));
  return { page, limit, skip: (page - 1) * limit };
}

router.use(auth, requireUser, requireAdmin);

router.get("/overview", async (_req, res) => {
  try {
    const [users, posts, pendingReports, hiddenPosts] = await Promise.all([
      User.countDocuments({}),
      Post.countDocuments({}),
      Report.countDocuments({ status: { $in: ["pending", "reviewing"] } }),
      Post.countDocuments({ "moderation.hidden": true })
    ]);
    return res.json({ users, posts, pendingReports, hiddenPosts });
  } catch (error) {
    console.error("ADMIN_OVERVIEW_ERROR:", error);
    return res.status(500).json({ error: "No se pudo obtener el resumen administrativo." });
  }
});

router.get("/users", async (req, res) => {
  const { page, limit, skip } = pageOf(req.query);
  const query = typeof req.query.q === "string" ? req.query.q.trim() : "";
  if (query.length > 80) return res.status(400).json({ error: "La búsqueda no puede superar 80 caracteres." });

  const filter = query ? { $or: [{ username: new RegExp(escapeRegex(query), "i") }, { displayName: new RegExp(escapeRegex(query), "i") }, { email: new RegExp(escapeRegex(query), "i") }] } : {};
  try {
    const [users, total] = await Promise.all([
      User.find(filter).select("_id username displayName email avatar role createdAt").sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      User.countDocuments(filter)
    ]);
    return res.json({ users, page, limit, total, hasMore: skip + users.length < total });
  } catch (error) {
    console.error("ADMIN_USERS_ERROR:", error);
    return res.status(500).json({ error: "No se pudieron obtener los usuarios." });
  }
});

router.patch("/users/:userId/role", async (req, res) => {
  const { userId } = req.params;
  const role = typeof req.body?.role === "string" ? req.body.role.trim() : "";
  if (!mongoose.Types.ObjectId.isValid(userId)) return res.status(400).json({ error: "ID de usuario inválido." });
  if (!USER_ROLES.includes(role)) return res.status(400).json({ error: "Rol no válido." });
  if (String(userId) === String(req.user.id)) return res.status(400).json({ error: "No puedes cambiar tu propio rol." });

  try {
    const user = await User.findByIdAndUpdate(userId, { $set: { role } }, { new: true, runValidators: true })
      .select("_id username displayName email avatar role createdAt").lean();
    if (!user) return res.status(404).json({ error: "Usuario no encontrado." });
    return res.json({ user });
  } catch (error) {
    console.error("ADMIN_ROLE_ERROR:", error);
    return res.status(500).json({ error: "No se pudo actualizar el rol." });
  }
});

router.get("/posts", async (req, res) => {
  const { page, limit, skip } = pageOf(req.query);
  try {
    const [posts, total] = await Promise.all([
      Post.find({}).populate("author", "username displayName avatar").sort({ createdAt: -1, _id: -1 }).skip(skip).limit(limit).lean(),
      Post.countDocuments({})
    ]);
    return res.json({ posts: posts.map((post) => normalizePost(post, req.user.id)), page, limit, total, hasMore: skip + posts.length < total });
  } catch (error) {
    console.error("ADMIN_POSTS_ERROR:", error);
    return res.status(500).json({ error: "No se pudieron obtener las publicaciones." });
  }
});

module.exports = router;
