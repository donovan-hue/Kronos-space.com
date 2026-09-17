const express = require("express");
const mongoose = require("mongoose");

const Post = require("./Post");
const auth = require("../../middleware/auth");
const { requireUser } = require("../../middleware/permissions");
const { handleUpload } = require("../../middleware/upload");
const { saveBuffer } = require("../../config/storage");
const { createNotification } = require("../notifications/notification.service");

const router = express.Router();
const profilePostFilter = require("./profilePostFilter");

const FEED_LIMIT = 50;
const DEFAULT_PAGE_LIMIT = 20;
const MAX_POST_LENGTH = 5000;
const MAX_COMMENT_LENGTH = 1000;

const AUTHOR_FIELDS = "username displayName avatar";
const COMMENT_USER_FIELDS = "username displayName avatar";
const REPOST_FIELDS = "username displayName avatar";

function validId(id) {
  return mongoose.Types.ObjectId.isValid(id);
}

function parsePagination(query) {
  let page = parseInt(query.page, 10);
  let limit = parseInt(query.limit, 10);
  if (!Number.isInteger(page) || page < 1) page = 1;
  if (!Number.isInteger(limit) || limit < 1) limit = DEFAULT_PAGE_LIMIT;
  if (limit > FEED_LIMIT) limit = FEED_LIMIT;
  const skip = (page - 1) * limit;
  return { page, limit, skip };
}

const normalizePost = require("./normalizePost");

async function populatePost(postId, currentUserId) {
  const post = await Post.findById(postId)
    .populate("author", AUTHOR_FIELDS)
    .populate("comments.user", COMMENT_USER_FIELDS)
    .populate("repostOf")
    .lean();
  if (!post) return null;
  if (post.repostOf) {
    // populate repostOf author if exists
    const original = await Post.findById(post.repostOf).populate("author", AUTHOR_FIELDS).lean();
    if (original) post.repostOf = original;
  }
  return normalizePost(post, currentUserId);
}

// ---------- MEDIA UPLOAD ----------
/**
 * POST /api/posts/media/upload
 * Upload single image (field: media) — AUDIT-005 KRONOS-UI-009/013
 * Returns { url, mimeType, size }
 */
router.post("/media/upload", auth, requireUser, handleUpload("media"), async (req, res) => {
  try {
    if (!req.file || !req.file.buffer) {
      return res.status(400).json({ error: "No se recibió ninguna imagen" });
    }
    const { url, size } = saveBuffer({
      buffer: req.file.buffer,
      mimetype: req.file.mimetype,
      originalname: req.file.originalname,
      subdir: "media"
    });
    return res.status(201).json({ url, mimeType: req.file.mimetype, size });
  } catch (error) {
    console.error("UPLOAD_MEDIA_ERROR:", error);
    return res.status(500).json({ error: "Error subiendo imagen" });
  }
});

// ---------- SAVED ----------
/**
 * GET /api/posts/saved
 * Lista posts guardados por el usuario actual — KRONOS-UI-012
 */
router.get("/saved", auth, requireUser, async (req, res) => {
  try {
    const { page, limit, skip } = parsePagination(req.query);
    const filter = { savedBy: new mongoose.Types.ObjectId(req.user.id) };
    const [posts, total] = await Promise.all([
      Post.find(filter)
        .populate("author", AUTHOR_FIELDS)
        .populate("comments.user", COMMENT_USER_FIELDS)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Post.countDocuments(filter)
    ]);
    const normalized = posts.map((p) => normalizePost(p, req.user.id));
    return res.json({ posts: normalized, total, page, limit, hasMore: skip + posts.length < total });
  } catch (error) {
    console.error("GET_SAVED_ERROR:", error);
    return res.status(500).json({ error: "Error obteniendo guardados" });
  }
});

/**
 * POST /api/posts/:postId/save
 * Toggle save/bookmark — KRONOS-UI-012
 */
router.post("/:postId/save", auth, requireUser, async (req, res) => {
  try {
    const { postId } = req.params;
    if (!validId(postId)) return res.status(400).json({ error: "ID de publicación inválido" });
    const userId = new mongoose.Types.ObjectId(req.user.id);
    const updated = await Post.findByIdAndUpdate(
      postId,
      [
        {
          $set: {
            savedBy: {
              $cond: [
                { $in: [userId, { $ifNull: ["$savedBy", []] }] },
                { $filter: { input: { $ifNull: ["$savedBy", []] }, as: "id", cond: { $ne: ["$$id", userId] } } },
                { $concatArrays: [{ $ifNull: ["$savedBy", []] }, [userId]] }
              ]
            }
          }
        }
      ],
      { new: true }
    )
      .select("_id savedBy")
      .lean();
    if (!updated) return res.status(404).json({ error: "Publicación no encontrada" });
    const saved = Array.isArray(updated.savedBy) && updated.savedBy.some((id) => String(id) === String(userId));
    return res.json({ postId: String(updated._id), saved, savedCount: Array.isArray(updated.savedBy) ? updated.savedBy.length : 0 });
  } catch (error) {
    console.error("TOGGLE_SAVE_ERROR:", error);
    return res.status(500).json({ error: "Error actualizando guardado" });
  }
});

/**
 * POST /api/posts/:postId/repost
 * Crea repost — KRONOS-UI-012
 * Body opcional: { content }
 */
router.post("/:postId/repost", auth, requireUser, async (req, res) => {
  try {
    const { postId } = req.params;
    if (!validId(postId)) return res.status(400).json({ error: "ID de publicación inválido" });
    const original = await Post.findById(postId).select("_id author content media").lean();
    if (!original) return res.status(404).json({ error: "Publicación no encontrada" });
    const content = typeof req.body?.content === "string" ? req.body.content.trim() : "";
    if (content.length > MAX_POST_LENGTH) return res.status(400).json({ error: "La publicación no puede superar 5000 caracteres" });
    // prevent duplicate repost? allow multiple but optionally check existing repost by same user
    const existingRepost = await Post.findOne({ author: req.user.id, repostOf: postId }).lean();
    if (existingRepost) return res.status(409).json({ error: "Ya has republicado esta publicación" });

    const post = await Post.create({
      content: content || original.content,
      author: req.user.id,
      likes: [],
      comments: [],
      media: original.media || { url: "", type: "", mimeType: "", size: 0, alt: "" },
      repostOf: original._id
    });
    await post.populate("author", AUTHOR_FIELDS);
    if (post.repostOf) {
      await post.populate({ path: "repostOf", populate: { path: "author", select: AUTHOR_FIELDS } });
    }
    const normalized = normalizePost(post.toObject(), req.user.id);
    // notify original author if different
    if (String(original.author) !== String(req.user.id)) {
      await createNotification({ recipient: original.author, actor: req.user.id, type: "repost", post: post._id, io: req.app.get("io") }).catch(() => {});
    }
    return res.status(201).json({ post: normalized });
  } catch (error) {
    console.error("REPOST_ERROR:", error);
    return res.status(500).json({ error: "Error creando repost" });
  }
});

// ---------- USER POSTS ----------
/**
 * GET /api/posts/user/:userId
 * Paginado: ?page=1&limit=20
 */
router.get("/user/:userId", auth, requireUser, async (req, res) => {
  try {
    const { userId } = req.params;
    if (!validId(userId)) {
      return res.status(400).json({ error: "ID de usuario inválido" });
    }
    const filter = profilePostFilter(userId, req.query.tab);
    if (!filter) return res.status(400).json({ error: "Pestaña de perfil no válida." });
    const { page, limit, skip } = parsePagination(req.query);
    const [posts, totalPosts] = await Promise.all([
      Post.find(filter)
        .populate("author", AUTHOR_FIELDS)
        .populate("comments.user", COMMENT_USER_FIELDS)
        .populate("repostOf")
        .sort({ createdAt: -1, _id: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Post.countDocuments(filter)
    ]);
    // populate repostOf authors
    for (const p of posts) {
      if (p.repostOf && p.repostOf.author) {
        const populated = await Post.findById(p.repostOf._id || p.repostOf).populate("author", AUTHOR_FIELDS).lean();
        if (populated) p.repostOf = populated;
      }
    }
    const normalized = posts.map((post) => normalizePost(post, req.user.id));
    const hasMore = skip + posts.length < totalPosts;
    return res.status(200).json({
      posts: normalized,
      totalPosts,
      total: totalPosts,
      page,
      limit,
      hasMore
    });
  } catch (error) {
    console.error("GET_USER_POSTS_ERROR:", error);
    return res.status(500).json({ error: "Error obteniendo publicaciones del usuario" });
  }
});

/**
 * GET /api/posts/feed
 * Paginado: ?page=1&limit=20
 */
router.get("/feed", auth, requireUser, async (req, res) => {
  try {
    const { page, limit, skip } = parsePagination(req.query);
    const [posts, total] = await Promise.all([
      Post.find()
        .populate("author", AUTHOR_FIELDS)
        .populate("comments.user", COMMENT_USER_FIELDS)
        .populate("repostOf")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Post.countDocuments()
    ]);
    const normalizedPosts = posts.map((post) => normalizePost(post, req.user.id));
    return res.status(200).json({
      posts: normalizedPosts,
      total,
      page,
      limit,
      hasMore: skip + posts.length < total
    });
  } catch (error) {
    console.error("GET_FEED_ERROR:", error);
    return res.status(500).json({ error: "Error obteniendo feed" });
  }
});

/**
 * GET /api/posts
 * Feed principal paginado.
 */
router.get("/", auth, requireUser, async (req, res) => {
  try {
    const { page, limit, skip } = parsePagination(req.query);
    const [posts, total] = await Promise.all([
      Post.find()
        .populate("author", AUTHOR_FIELDS)
        .populate("comments.user", COMMENT_USER_FIELDS)
        .populate("repostOf")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Post.countDocuments()
    ]);
    const normalizedPosts = posts.map((post) => normalizePost(post, req.user.id));
    return res.status(200).json({
      posts: normalizedPosts,
      total,
      page,
      limit,
      hasMore: skip + posts.length < total
    });
  } catch (error) {
    console.error("GET_POSTS_ERROR:", error);
    return res.status(500).json({ error: "Error obteniendo publicaciones" });
  }
});

/**
 * GET /api/posts/:postId
 */
router.get("/:postId", auth, requireUser, async (req, res) => {
  try {
    const { postId } = req.params;
    if (!validId(postId)) {
      return res.status(400).json({ error: "ID de publicación inválido" });
    }
    const post = await Post.findById(postId)
      .populate("author", AUTHOR_FIELDS)
      .populate("comments.user", COMMENT_USER_FIELDS)
      .populate("repostOf")
      .lean();
    if (!post) {
      return res.status(404).json({ error: "Publicación no encontrada" });
    }
    if (post.repostOf) {
      const original = await Post.findById(post.repostOf._id || post.repostOf).populate("author", AUTHOR_FIELDS).lean();
      if (original) post.repostOf = original;
    }
    return res.status(200).json({ post: normalizePost(post, req.user.id) });
  } catch (error) {
    console.error("GET_POST_ERROR:", error);
    return res.status(500).json({ error: "Error obteniendo publicación" });
  }
});

/**
 * POST /api/posts
 * Crea una publicación. Soporta media opcional { url, alt } — AUDIT-005
 */
router.post("/", auth, requireUser, async (req, res) => {
  try {
    const content = typeof req.body?.content === "string" ? req.body.content.trim() : "";
    if (!content) {
      return res.status(400).json({ error: "La publicación está vacía" });
    }
    if (content.length > MAX_POST_LENGTH) {
      return res.status(400).json({ error: "La publicación no puede superar 5000 caracteres" });
    }
    if (!validId(req.user.id)) {
      return res.status(401).json({ error: "Usuario autenticado inválido" });
    }

    // media opcional — validado si se envía
    let media = { url: "", type: "", mimeType: "", size: 0, alt: "" };
    if (req.body?.media && typeof req.body.media === "object") {
      const raw = req.body.media;
      const url = typeof raw.url === "string" ? raw.url.trim() : "";
      const alt = typeof raw.alt === "string" ? raw.alt.trim().slice(0, 500) : "";
      if (url) {
        if (url.length > 2000) return res.status(400).json({ error: "URL de media demasiado larga" });
        // permitir /uploads/... o https://
        const isUpload = url.startsWith("/uploads/");
        const isHttp = /^https?:\/\//i.test(url);
        if (!isUpload && !isHttp) return res.status(400).json({ error: "URL de media no válida" });
        media = {
          url,
          type: "image",
          mimeType: typeof raw.mimeType === "string" ? raw.mimeType.slice(0, 100) : "",
          size: Number.isFinite(raw.size) ? Math.min(raw.size, 10 * 1024 * 1024) : 0,
          alt
        };
      }
    } else if (typeof req.body?.mediaUrl === "string" && req.body.mediaUrl.trim()) {
      // compat: mediaUrl simple
      const url = req.body.mediaUrl.trim();
      if (url.length > 2000) return res.status(400).json({ error: "URL de media demasiado larga" });
      if (!url.startsWith("/uploads/") && !/^https?:\/\//i.test(url)) return res.status(400).json({ error: "URL de media no válida" });
      media = { url, type: "image", mimeType: "", size: 0, alt: typeof req.body.mediaAlt === "string" ? req.body.mediaAlt.trim().slice(0, 500) : "" };
    }

    const doc = {
      content,
      author: req.user.id,
      likes: [],
      comments: [],
      media,
      savedBy: []
    };
    if (req.body?.repostOf && validId(req.body.repostOf)) {
      doc.repostOf = req.body.repostOf;
    }

    const post = await Post.create(doc);
    await post.populate("author", AUTHOR_FIELDS);
    const postObject = post.toObject();
    return res.status(201).json({
      post: normalizePost(postObject, req.user.id)
    });
  } catch (error) {
    console.error("CREATE_POST_ERROR:", error);
    return res.status(500).json({ error: "Error creando publicación" });
  }
});

/**
 * PATCH /api/posts/:postId
 * Edita una publicación propia. Permite actualizar content y alt de media — AUDIT-005
 */
router.patch("/:postId", auth, requireUser, async (req, res) => {
  try {
    const { postId } = req.params;
    if (!validId(postId)) {
      return res.status(400).json({ error: "ID de publicación inválido" });
    }
    const content = typeof req.body?.content === "string" ? req.body.content.trim() : "";
    if (!content) {
      return res.status(400).json({ error: "La publicación está vacía" });
    }
    if (content.length > MAX_POST_LENGTH) {
      return res.status(400).json({ error: "La publicación no puede superar 5000 caracteres" });
    }
    const existing = await Post.findById(postId).select("author").lean();
    if (!existing) {
      return res.status(404).json({ error: "Publicación no encontrada" });
    }
    if (String(existing.author) !== String(req.user.id)) {
      return res.status(403).json({ error: "No tienes permisos para editar esta publicación" });
    }

    const updates = { content };
    if (typeof req.body?.mediaAlt === "string" || (req.body?.media && typeof req.body.media.alt === "string")) {
      const alt = (req.body.mediaAlt ?? req.body.media.alt ?? "").toString().trim().slice(0, 500);
      updates["media.alt"] = alt;
    }

    const updated = await Post.findByIdAndUpdate(
      postId,
      { $set: updates },
      { new: true, runValidators: true }
    )
      .populate("author", AUTHOR_FIELDS)
      .populate("comments.user", COMMENT_USER_FIELDS)
      .populate("repostOf");
    const postObject = updated.toObject();
    return res.status(200).json({
      post: normalizePost(postObject, req.user.id)
    });
  } catch (error) {
    console.error("UPDATE_POST_ERROR:", error);
    return res.status(500).json({ error: "Error actualizando publicación" });
  }
});

/**
 * DELETE /api/posts/:postId
 * Elimina una publicación propia.
 */
router.delete("/:postId", auth, requireUser, async (req, res) => {
  try {
    const { postId } = req.params;
    if (!validId(postId)) {
      return res.status(400).json({ error: "ID de publicación inválido" });
    }
    const existing = await Post.findById(postId).select("author").lean();
    if (!existing) {
      return res.status(404).json({ error: "Publicación no encontrada" });
    }
    if (String(existing.author) !== String(req.user.id)) {
      return res.status(403).json({ error: "No tienes permisos para eliminar esta publicación" });
    }
    await Post.findByIdAndDelete(postId);
    return res.status(200).json({ ok: true, postId: String(postId) });
  } catch (error) {
    console.error("DELETE_POST_ERROR:", error);
    return res.status(500).json({ error: "Error eliminando publicación" });
  }
});

/**
 * POST /api/posts/:postId/comments
 * Crea un comentario dentro de una publicación.
 */
router.post("/:postId/comments", auth, requireUser, async (req, res) => {
  try {
    const { postId } = req.params;
    if (!validId(postId)) {
      return res.status(400).json({ error: "ID de publicación inválido" });
    }
    if (!validId(req.user.id)) {
      return res.status(401).json({ error: "Usuario autenticado inválido" });
    }
    const content = typeof req.body?.content === "string" ? req.body.content.trim() : "";
    if (!content) {
      return res.status(400).json({ error: "El comentario está vacío" });
    }
    if (content.length > MAX_COMMENT_LENGTH) {
      return res.status(400).json({ error: "El comentario no puede superar 1000 caracteres" });
    }
    const post = await Post.findByIdAndUpdate(
      postId,
      {
        $push: {
          comments: {
            user: req.user.id,
            content
          }
        }
      },
      { new: true, runValidators: true }
    )
      .populate("author", AUTHOR_FIELDS)
      .populate("comments.user", COMMENT_USER_FIELDS);

    if (!post) {
      return res.status(404).json({ error: "Publicación no encontrada" });
    }
    const postObject = post.toObject();
    await createNotification({
      recipient: post.author._id,
      actor: req.user.id,
      type: "comment",
      post: post._id,
      io: req.app.get("io")
    });
    return res.status(201).json({
      post: normalizePost(postObject, req.user.id)
    });
  } catch (error) {
    console.error("CREATE_COMMENT_ERROR:", error);
    return res.status(500).json({ error: "Error creando comentario" });
  }
});

/**
 * DELETE /api/posts/:postId/comments/:commentId
 * Elimina un comentario (autor del comentario o autor del post).
 */
router.delete("/:postId/comments/:commentId", auth, requireUser, async (req, res) => {
  try {
    const { postId, commentId } = req.params;
    if (!validId(postId) || !validId(commentId)) {
      return res.status(400).json({ error: "ID inválido" });
    }
    const post = await Post.findById(postId).select("author comments").lean();
    if (!post) {
      return res.status(404).json({ error: "Publicación no encontrada" });
    }
    const comment = Array.isArray(post.comments) ? post.comments.find((c) => String(c._id) === String(commentId)) : null;
    if (!comment) {
      return res.status(404).json({ error: "Comentario no encontrado" });
    }
    const isCommentAuthor = String(comment.user) === String(req.user.id);
    const isPostAuthor = String(post.author) === String(req.user.id);
    if (!isCommentAuthor && !isPostAuthor) {
      return res.status(403).json({ error: "No tienes permisos para eliminar este comentario" });
    }
    const updated = await Post.findByIdAndUpdate(
      postId,
      { $pull: { comments: { _id: commentId } } },
      { new: true }
    )
      .populate("author", AUTHOR_FIELDS)
      .populate("comments.user", COMMENT_USER_FIELDS);
    return res.status(200).json({ post: normalizePost(updated.toObject(), req.user.id) });
  } catch (error) {
    console.error("DELETE_COMMENT_ERROR:", error);
    return res.status(500).json({ error: "Error eliminando comentario" });
  }
});

/**
 * POST /api/posts/:postId/like
 * Toggle atómico de like.
 */
router.post("/:postId/like", auth, requireUser, async (req, res) => {
  try {
    const { postId } = req.params;
    if (!validId(postId)) {
      return res.status(400).json({ error: "ID de publicación inválido" });
    }
    if (!validId(req.user.id)) {
      return res.status(401).json({ error: "Usuario autenticado inválido" });
    }
    const userId = new mongoose.Types.ObjectId(req.user.id);
    const updatedPost = await Post.findByIdAndUpdate(
      postId,
      [
        {
          $set: {
            likes: {
              $cond: [
                { $in: [userId, { $ifNull: ["$likes", []] }] },
                {
                  $filter: {
                    input: { $ifNull: ["$likes", []] },
                    as: "likeUserId",
                    cond: { $ne: ["$$likeUserId", userId] }
                  }
                },
                { $concatArrays: [{ $ifNull: ["$likes", []] }, [userId]] }
              ]
            }
          }
        }
      ],
      { new: true }
    )
      .select("_id likes author")
      .lean();
    if (!updatedPost) {
      return res.status(404).json({ error: "Publicación no encontrada" });
    }
    const likes = Array.isArray(updatedPost.likes) ? updatedPost.likes : [];
    const liked = likes.some((likeUserId) => String(likeUserId) === String(userId));
    if (liked) {
      await createNotification({
        recipient: updatedPost.author,
        actor: req.user.id,
        type: "like",
        post: updatedPost._id,
        io: req.app.get("io")
      });
    }
    return res.status(200).json({
      postId: String(updatedPost._id),
      liked,
      likesCount: likes.length
    });
  } catch (error) {
    console.error("LIKE_POST_ERROR:", error);
    return res.status(500).json({ error: "Error actualizando like" });
  }
});

module.exports = router;
