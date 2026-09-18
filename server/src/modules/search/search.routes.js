const express = require("express");
const mongoose = require("mongoose");
const User = require("../users/User");
const Post = require("../posts/Post");
const auth = require("../../middleware/auth");
const { requireUser } = require("../../middleware/permissions");
const { publicUser } = require("../users/profilePrivacy");
const { feedConstraints, getExcludedUserIds } = require("../moderation/moderation.service");
const normalizePost = require("../posts/normalizePost");

const router = express.Router();
const MAX_LIMIT = 30;
const MAX_QUERY_LENGTH = 80;
const AUTHOR_FIELDS = "username displayName avatar";

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function parsePagination(query) {
  const page = Number.isInteger(Number(query.page)) && Number(query.page) > 0
    ? Number(query.page)
    : 1;
  const requestedLimit = Number.isInteger(Number(query.limit)) && Number(query.limit) > 0
    ? Number(query.limit)
    : 20;

  return {
    page,
    limit: Math.min(requestedLimit, MAX_LIMIT),
    skip: (page - 1) * Math.min(requestedLimit, MAX_LIMIT)
  };
}

function normalizeType(value) {
  const type = typeof value === "string" ? value.trim().toLowerCase() : "all";
  return ["all", "users", "posts"].includes(type) ? type : null;
}

/**
 * GET /api/search?q=&type=all|users|posts&page=&limit=
 * KRONOS-UI-025/026 — búsqueda global y entrada común de Explorar.
 * Los resultados pasan por las exclusiones de moderación del feed; nunca
 * se devuelve passwordHash ni savedBy.
 */
router.get("/", auth, requireUser, async (req, res) => {
  try {
    const query = typeof req.query.q === "string" ? req.query.q.trim() : "";
    const type = normalizeType(req.query.type);

    if (!type) {
      return res.status(400).json({ error: "Tipo de búsqueda no válido", code: "INVALID_SEARCH_TYPE" });
    }

    if (!query) {
      return res.json({ query: "", type, users: [], posts: [], total: 0, page: 1, limit: 20, hasMore: false });
    }

    if (query.length > MAX_QUERY_LENGTH) {
      return res.status(400).json({ error: "La búsqueda es demasiado larga", code: "SEARCH_TOO_LONG" });
    }

    const regex = new RegExp(escapeRegex(query), "i");
    const { page, limit, skip } = parsePagination(req.query);
    const usersPromise = type === "posts"
      ? Promise.resolve({ rows: [], total: 0 })
      : (async () => {
        const excluded = await getExcludedUserIds(req.user.id);
        const filter = {
          _id: { $ne: new mongoose.Types.ObjectId(req.user.id), $nin: excluded },
          "profilePrivacy.discoverable": { $ne: false },
          $or: [{ username: regex }, { displayName: regex }]
        };
        const [rows, total] = await Promise.all([
          User.find(filter)
            .select("_id username displayName avatar bio profilePrivacy followers following createdAt")
            .sort({ displayName: 1, username: 1 })
            .limit(type === "users" ? limit : 8)
            .skip(type === "users" ? skip : 0)
            .lean(),
          User.countDocuments(filter)
        ]);
        return { rows, total };
      })();

    const postsPromise = type === "users"
      ? Promise.resolve({ rows: [], total: 0 })
      : (async () => {
        const constraints = await feedConstraints(req.user.id);
        const filter = { ...constraints, content: regex };
        const [rows, total] = await Promise.all([
          Post.find(filter)
            .populate("author", AUTHOR_FIELDS)
            .sort({ createdAt: -1, _id: -1 })
            .skip(skip)
            .limit(limit)
            .lean(),
          Post.countDocuments(filter)
        ]);
        return { rows: rows.map((post) => normalizePost(post, req.user.id)), total };
      })();

    const [{ rows: userRows, total: userTotal }, { rows: postRows, total: postTotal }] = await Promise.all([usersPromise, postsPromise]);
    const total = type === "users" ? userTotal : type === "posts" ? postTotal : userTotal + postTotal;
    const hasMore = type === "users"
      ? skip + userRows.length < userTotal
      : type === "posts"
        ? skip + postRows.length < postTotal
        : postRows.length === limit && skip + postRows.length < postTotal;

    return res.json({
      query,
      type,
      users: userRows.map((user) => publicUser(user, req.user.id)),
      posts: postRows,
      total,
      page,
      limit,
      hasMore
    });
  } catch (error) {
    console.error("GLOBAL_SEARCH_ERROR:", error);
    return res.status(500).json({ error: "No se pudo completar la búsqueda" });
  }
});

module.exports = router;
