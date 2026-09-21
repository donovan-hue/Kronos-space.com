const express = require("express");
const mongoose = require("mongoose");

const auth = require("../../middleware/auth");
const { requireUser } = require("../../middleware/permissions");
const User = require("../users/User");
const Post = require("../posts/Post");
const normalizePost = require("../posts/normalizePost");
const { publicUser } = require("../users/profilePrivacy");
const {
  feedConstraints,
  getExcludedUserIds
} = require("../moderation/moderation.service");
const { withAudienceFilter } = require("../posts/audience.service");

const router = express.Router();
const DEFAULT_LIMIT = 15;
const MAX_LIMIT = 30;
const SCOPES = ["all", "users", "posts"];

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function parseSearchQuery(query = {}) {
  const value = typeof query.q === "string" ? query.q.trim() : "";
  const scope = typeof query.scope === "string" ? query.scope.trim() : "all";
  const page = Math.max(1, Number.parseInt(query.page, 10) || 1);
  const limit = Math.min(
    MAX_LIMIT,
    Math.max(1, Number.parseInt(query.limit, 10) || DEFAULT_LIMIT)
  );

  if (value.length < 2) {
    return { error: "Escribe al menos 2 caracteres para buscar.", code: "QUERY_TOO_SHORT" };
  }

  if (value.length > 80) {
    return { error: "La búsqueda no puede superar 80 caracteres.", code: "QUERY_TOO_LONG" };
  }

  if (!SCOPES.includes(scope)) {
    return { error: "El alcance de búsqueda no es válido.", code: "INVALID_SCOPE" };
  }

  const searchValue = value.startsWith("#") ? value.slice(1) : value;
  return {
    value,
    scope,
    page,
    limit,
    skip: (page - 1) * limit,
    regex: new RegExp(escapeRegex(searchValue), "i")
  };
}

/**
 * BLOQUE 009 — búsqueda global. Mantiene el buscador de usuarios existente,
 * pero permite consultar personas y publicaciones con el mismo contrato.
 * La visibilidad reutiliza los filtros de moderación; no filtra datos
 * privados, autores bloqueados/silenciados ni contenido oculto.
 */
router.get("/", auth, requireUser, async (req, res) => {
  const parsed = parseSearchQuery(req.query);

  if (parsed.error) {
    return res.status(400).json({ error: parsed.error, code: parsed.code });
  }

  const { scope, page, limit, skip, regex, value } = parsed;

  try {
    const wantsUsers = scope === "all" || scope === "users";
    const wantsPosts = scope === "all" || scope === "posts";
    const excluded = wantsUsers
      ? await getExcludedUserIds(req.user.id)
      : [];
    const postFilter = wantsPosts
      ? await withAudienceFilter(await feedConstraints(req.user.id), req.user.id)
      : null;

    const [users, userTotal, posts, postTotal] = await Promise.all([
      wantsUsers
        ? User.find({
            _id: { $ne: req.user.id, $nin: excluded },
            "profilePrivacy.discoverable": { $ne: false },
            $or: [{ username: regex }, { displayName: regex }]
          })
            .select("_id username displayName avatar cover bio profilePrivacy followers following createdAt")
            .sort({ followers: -1, username: 1 })
            .skip(skip)
            .limit(limit)
            .lean()
        : Promise.resolve([]),
      wantsUsers
        ? User.countDocuments({
            _id: { $ne: req.user.id, $nin: excluded },
            "profilePrivacy.discoverable": { $ne: false },
            $or: [{ username: regex }, { displayName: regex }]
          })
        : Promise.resolve(0),
      wantsPosts
        ? Post.find({ ...postFilter, $or: [{ content: regex }, { hashtags: regex }] })
            .populate("author", "username displayName avatar")
            .sort({ createdAt: -1, _id: -1 })
            .skip(skip)
            .limit(limit)
            .lean()
        : Promise.resolve([]),
      wantsPosts
        ? Post.countDocuments({ ...postFilter, $or: [{ content: regex }, { hashtags: regex }] })
        : Promise.resolve(0)
    ]);

    return res.json({
      query: value,
      scope,
      users: users.map((user) => publicUser(user, req.user.id)),
      posts: posts.map((post) => normalizePost(post, req.user.id)),
      page,
      limit,
      totals: { users: userTotal, posts: postTotal },
      hasMore: {
        users: skip + users.length < userTotal,
        posts: skip + posts.length < postTotal
      }
    });
  } catch (error) {
    console.error("GLOBAL_SEARCH_ERROR:", error);
    return res.status(500).json({ error: "No se pudo completar la búsqueda." });
  }
});

module.exports = { router, parseSearchQuery, escapeRegex, SCOPES };
