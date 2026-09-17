const express = require("express");
const mongoose = require("mongoose");

const Post = require("./Post");
const auth = require("../../middleware/auth");
const { requireUser } = require("../../middleware/permissions");
const { createNotification } = require("../notifications/notification.service");

const router = express.Router();

const FEED_LIMIT = 50;
const DEFAULT_PAGE_LIMIT = 20;
const MAX_POST_LENGTH = 5000;
const MAX_COMMENT_LENGTH = 1000;

const AUTHOR_FIELDS = "username displayName avatar";
const COMMENT_USER_FIELDS = "username displayName avatar";

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

function normalizePost(post, currentUserId) {
  const likes = Array.isArray(post.likes) ? post.likes : [];
  const liked = likes.some((likeUserId) => String(likeUserId) === String(currentUserId));
  return {
    ...post,
    likesCount: likes.length,
    liked
  };
}

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
    const { page, limit, skip } = parsePagination(req.query);
    const [posts, totalPosts] = await Promise.all([
      Post.find({ author: userId })
        .populate("author", AUTHOR_FIELDS)
        .populate("comments.user", COMMENT_USER_FIELDS)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Post.countDocuments({ author: userId })
    ]);
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
      .lean();
    if (!post) {
      return res.status(404).json({ error: "Publicación no encontrada" });
    }
    return res.status(200).json({ post: normalizePost(post, req.user.id) });
  } catch (error) {
    console.error("GET_POST_ERROR:", error);
    return res.status(500).json({ error: "Error obteniendo publicación" });
  }
});

/**
 * POST /api/posts
 * Crea una publicación.
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
    const post = await Post.create({
      content,
      author: req.user.id,
      likes: [],
      comments: []
    });
    await post.populate("author", AUTHOR_FIELDS);
    const postObject = post.toObject();
    return res.status(201).json({
      post: {
        ...postObject,
        likesCount: 0,
        liked: false
      }
    });
  } catch (error) {
    console.error("CREATE_POST_ERROR:", error);
    return res.status(500).json({ error: "Error creando publicación" });
  }
});

/**
 * PATCH /api/posts/:postId
 * Edita una publicación propia.
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
    const updated = await Post.findByIdAndUpdate(
      postId,
      { $set: { content } },
      { new: true, runValidators: true }
    )
      .populate("author", AUTHOR_FIELDS)
      .populate("comments.user", COMMENT_USER_FIELDS);
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
