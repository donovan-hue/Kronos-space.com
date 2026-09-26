const express = require("express");

const SavedCollection = require("./SavedCollection");
const Post = require("../posts/Post");
const auth = require("../../middleware/auth");
const { requireUser } = require("../../middleware/permissions");
const { loadViewerScope, canViewPost, canViewPostWithScope } = require("../posts/audience.service");
const normalizePost = require("../posts/normalizePost");

const { validId } = require("../../utils/queryHelpers");

const router = express.Router();
const MAX_NAME = 80;
const MAX_DESCRIPTION = 300;
const MAX_POSTS = 500;

function pagination(query = {}) {
  const page = Math.max(1, Number.parseInt(query.page, 10) || 1);
  const limit = Math.min(50, Math.max(1, Number.parseInt(query.limit, 10) || 20));
  return { page, limit, skip: (page - 1) * limit };
}

function parsePayload(body = {}) {
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const description = typeof body.description === "string" ? body.description.trim() : "";
  if (!name) return { error: "El nombre de la colección es obligatorio" };
  if (name.length > MAX_NAME) return { error: "El nombre no puede superar 80 caracteres" };
  if (description.length > MAX_DESCRIPTION) return { error: "La descripción no puede superar 300 caracteres" };
  return { name, description };
}

function present(collection) {
  return {
    _id: collection._id,
    name: collection.name,
    description: collection.description || "",
    postsCount: Array.isArray(collection.posts) ? collection.posts.length : Number(collection.postsCount || 0),
    createdAt: collection.createdAt,
    updatedAt: collection.updatedAt
  };
}

router.get("/", auth, requireUser, async (req, res) => {
  try {
    const collections = await SavedCollection.find({ owner: req.user.id })
      .select("_id name description posts createdAt updatedAt")
      .sort({ updatedAt: -1 })
      .lean();
    return res.json({ collections: collections.map(present) });
  } catch (error) {
    console.error("LIST_COLLECTIONS_ERROR:", error);
    return res.status(500).json({ error: "Error obteniendo colecciones" });
  }
});

router.post("/", auth, requireUser, async (req, res) => {
  try {
    const parsed = parsePayload(req.body);
    if (parsed.error) return res.status(400).json({ error: parsed.error });
    const collection = await SavedCollection.create({ owner: req.user.id, ...parsed, posts: [] });
    return res.status(201).json({ collection: present(collection) });
  } catch (error) {
    if (error?.code === 11000) return res.status(409).json({ error: "Ya tienes una colección con ese nombre" });
    console.error("CREATE_COLLECTION_ERROR:", error);
    return res.status(500).json({ error: "Error creando colección" });
  }
});

router.patch("/:collectionId", auth, requireUser, async (req, res) => {
  try {
    const { collectionId } = req.params;
    if (!validId(collectionId)) return res.status(400).json({ error: "ID de colección inválido" });
    const existing = await SavedCollection.findOne({ _id: collectionId, owner: req.user.id }).lean();
    if (!existing) return res.status(404).json({ error: "Colección no encontrada" });
    const parsed = parsePayload({
      name: Object.prototype.hasOwnProperty.call(req.body || {}, "name") ? req.body.name : existing.name,
      description: Object.prototype.hasOwnProperty.call(req.body || {}, "description") ? req.body.description : existing.description
    });
    if (parsed.error) return res.status(400).json({ error: parsed.error });
    const collection = await SavedCollection.findOneAndUpdate(
      { _id: collectionId, owner: req.user.id },
      { $set: parsed },
      { new: true, runValidators: true }
    ).lean();
    return res.json({ collection: present(collection) });
  } catch (error) {
    if (error?.code === 11000) return res.status(409).json({ error: "Ya tienes una colección con ese nombre" });
    console.error("UPDATE_COLLECTION_ERROR:", error);
    return res.status(500).json({ error: "Error actualizando colección" });
  }
});

router.delete("/:collectionId", auth, requireUser, async (req, res) => {
  try {
    const { collectionId } = req.params;
    if (!validId(collectionId)) return res.status(400).json({ error: "ID de colección inválido" });
    const deleted = await SavedCollection.findOneAndDelete({ _id: collectionId, owner: req.user.id }).lean();
    if (!deleted) return res.status(404).json({ error: "Colección no encontrada" });
    return res.json({ ok: true, collectionId: String(collectionId) });
  } catch (error) {
    console.error("DELETE_COLLECTION_ERROR:", error);
    return res.status(500).json({ error: "Error eliminando colección" });
  }
});

router.get("/:collectionId/posts", auth, requireUser, async (req, res) => {
  try {
    const { collectionId } = req.params;
    if (!validId(collectionId)) return res.status(400).json({ error: "ID de colección inválido" });
    const collection = await SavedCollection.findOne({ _id: collectionId, owner: req.user.id }).lean();
    if (!collection) return res.status(404).json({ error: "Colección no encontrada" });
    const { page, limit, skip } = pagination(req.query);
    // A collection can outlive a follow relationship or a moderation change.
    // Filter the complete bounded collection before slicing so invisible posts
    // neither leak through pagination nor create empty pages.
    const candidates = await Post.find({ _id: { $in: collection.posts || [] }, "moderation.hidden": { $ne: true } })
      .populate("author", "username displayName avatar")
      .populate("comments.user", "username displayName avatar")
      .sort({ createdAt: -1, _id: -1 })
      .lean();
    // FASE 7 — la comprobación de audiencia se hacía consulta a consulta
    // dentro del bucle (hasta 500 publicaciones = ~1500 consultas). El
    // ámbito del espectador se carga una vez y el filtrado es en memoria,
    // con exactamente las mismas reglas.
    const scope = await loadViewerScope(req.user.id);
    const visible = [];
    for (const post of candidates) {
      if (canViewPostWithScope(post, scope)) visible.push(normalizePost(post, req.user.id));
    }
    const posts = visible.slice(skip, skip + limit);
    return res.json({ collection: present(collection), posts, total: visible.length, page, limit, hasMore: skip + posts.length < visible.length });
  } catch (error) {
    console.error("LIST_COLLECTION_POSTS_ERROR:", error);
    return res.status(500).json({ error: "Error obteniendo publicaciones de la colección" });
  }
});

router.post("/:collectionId/posts/:postId", auth, requireUser, async (req, res) => {
  try {
    const { collectionId, postId } = req.params;
    if (!validId(collectionId) || !validId(postId)) return res.status(400).json({ error: "ID inválido" });
    const collection = await SavedCollection.findOne({ _id: collectionId, owner: req.user.id }).lean();
    if (!collection) return res.status(404).json({ error: "Colección no encontrada" });
    if (Array.isArray(collection.posts) && collection.posts.some((id) => String(id) === String(postId))) {
      return res.json({ collection: present(collection), added: false });
    }
    if ((collection.posts || []).length >= MAX_POSTS) return res.status(400).json({ error: "La colección alcanzó el límite de 500 publicaciones" });
    const post = await Post.findById(postId).select("author audience moderation").lean();
    if (!post || post.moderation?.hidden || !(await canViewPost(post, req.user.id))) {
      return res.status(404).json({ error: "Publicación no encontrada" });
    }
    const updated = await SavedCollection.findOneAndUpdate(
      {
        _id: collectionId,
        owner: req.user.id,
        $expr: { $lt: [{ $size: { $ifNull: ["$posts", []] } }, MAX_POSTS] }
      },
      { $addToSet: { posts: postId } },
      { new: true, runValidators: true }
    ).lean();
    if (!updated) return res.status(400).json({ error: "La colección alcanzó el límite de 500 publicaciones" });
    return res.json({ collection: present(updated), added: true });
  } catch (error) {
    console.error("ADD_COLLECTION_POST_ERROR:", error);
    return res.status(500).json({ error: "Error agregando a la colección" });
  }
});

router.delete("/:collectionId/posts/:postId", auth, requireUser, async (req, res) => {
  try {
    const { collectionId, postId } = req.params;
    if (!validId(collectionId) || !validId(postId)) return res.status(400).json({ error: "ID inválido" });
    const updated = await SavedCollection.findOneAndUpdate(
      { _id: collectionId, owner: req.user.id },
      { $pull: { posts: postId } },
      { new: true }
    ).lean();
    if (!updated) return res.status(404).json({ error: "Colección no encontrada" });
    return res.json({ collection: present(updated), removed: true });
  } catch (error) {
    console.error("REMOVE_COLLECTION_POST_ERROR:", error);
    return res.status(500).json({ error: "Error quitando de la colección" });
  }
});

module.exports = router;
