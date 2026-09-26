const express = require("express");
const mongoose = require("mongoose");

const Story = require("./Story");
const User = require("../users/User");
const Circle = require("../circles/Circle");
const auth = require("../../middleware/auth");
const { requireUser } = require("../../middleware/permissions");
const { canInteract, feedConstraints } = require("../moderation/moderation.service");
const { withAudienceFilter, canViewPost } = require("../posts/audience.service");

const { validId } = require("../../utils/queryHelpers");

const router = express.Router();

const {
  STORY_TTL_HOURS,
  MAX_ACTIVE_STORIES,
  MAX_CAPTION_LENGTH,
  MAX_ALT_LENGTH,
  MAX_REPLY_LENGTH,
  MAX_REPLIES,
  MAX_VIEWERS_LISTED,
  ARCHIVE_LIMIT
} = Story;

const AUTHOR_FIELDS = "username displayName avatar";

function viewerObjectId(viewerId) {
  try {
    return new mongoose.Types.ObjectId(viewerId);
  } catch {
    return null;
  }
}

function normalizeStoryAudience(value) {
  const type = typeof value?.type === "string" ? value.type.trim().toLowerCase() : "public";
  if (type === "public" || type === "followers") return { type };
  if (type === "circle") {
    const circleId = typeof value.circleId === "string" ? value.circleId.trim() : "";
    if (!validId(circleId)) return null;
    return { type, circleId };
  }
  return null;
}

function parseStoryPayload(body = {}) {
  const rawMedia = body?.media && typeof body.media === "object" ? body.media : null;
  const url = typeof rawMedia?.url === "string" ? rawMedia.url.trim() : "";
  if (!url) return { error: "La historia necesita una imagen o un video" };
  if (url.length > 2000) return { error: "URL de media demasiado larga" };
  if (!url.startsWith("/uploads/")) {
    return { error: "La media de la historia debe estar en Kronos (sube el archivo primero)" };
  }

  const mimeType = typeof rawMedia.mimeType === "string" ? rawMedia.mimeType.slice(0, 100) : "";
  const type = rawMedia.type === "video" || mimeType.startsWith("video/")
    ? "video"
    : rawMedia.type === "image" || mimeType.startsWith("image/")
      ? "image"
      : "";
  if (!type) return { error: "Tipo de media no válido" };

  const alt = typeof rawMedia.alt === "string" ? rawMedia.alt.trim() : "";
  if (alt.length > MAX_ALT_LENGTH) {
    return { error: `El texto alternativo no puede superar ${MAX_ALT_LENGTH} caracteres` };
  }

  const caption = typeof body.caption === "string" ? body.caption.trim() : "";
  if (caption.length > MAX_CAPTION_LENGTH) {
    return { error: `El texto no puede superar ${MAX_CAPTION_LENGTH} caracteres` };
  }

  const audience = normalizeStoryAudience(body.audience);
  if (!audience) return { error: "Audiencia no válida" };

  return {
    media: { url, type, mimeType, size: Number(rawMedia.size) || 0, alt },
    caption,
    audience
  };
}

function isAuthor(story, viewerId) {
  const authorId = story?.author?._id || story?.author;
  return String(authorId) === String(viewerId);
}

function isExpired(story, now = Date.now()) {
  return !story?.expiresAt || new Date(story.expiresAt).getTime() <= now;
}

/**
 * Proyección pública de una historia. Nunca expone quién vio ni quién
 * respondió: solo conteos y, para el espectador, si él ya la vio. El
 * conteo de vistas usa usuarios únicos para ser tolerante a carreras de
 * escritura idempotente.
 */
function normalizeStory(story, viewerId = "") {
  const author = story?.author?._id
    ? {
      _id: story.author._id,
      username: story.author.username || "",
      displayName: story.author.displayName || "",
      avatar: story.author.avatar || ""
    }
    : {
      _id: String(story?.author || ""),
      username: "",
      displayName: "",
      avatar: ""
    };

  const views = Array.isArray(story?.views) ? story.views : [];
  const replies = Array.isArray(story?.replies) ? story.replies : [];
  const viewer = String(viewerId || "");
  const mine = String(author._id) === viewer && Boolean(viewer);
  const uniqueViewers = new Set(views.map((view) => String(view.user?._id || view.user)));

  return {
    _id: story._id,
    author,
    media: {
      url: story.media?.url || "",
      type: story.media?.type || "image",
      mimeType: story.media?.mimeType || "",
      alt: story.media?.alt || ""
    },
    caption: story.caption || "",
    audience: {
      type: story.audience?.type || "public",
      ...(mine && story.audience?.circleId ? { circleId: String(story.audience.circleId) } : {})
    },
    createdAt: story.createdAt || null,
    expiresAt: story.expiresAt || null,
    isActive: !isExpired(story),
    viewsCount: uniqueViewers.size,
    repliesCount: replies.length,
    viewed: Boolean(viewer) && uniqueViewers.has(viewer),
    mine
  };
}

function presentViewer(view) {
  return {
    _id: view.user?._id || view.user,
    username: view.user?.username || "",
    displayName: view.user?.displayName || "",
    avatar: view.user?.avatar || "",
    viewedAt: view.viewedAt
  };
}

function presentReply(reply) {
  return {
    user: {
      _id: reply.user?._id || reply.user,
      username: reply.user?.username || "",
      displayName: reply.user?.displayName || "",
      avatar: reply.user?.avatar || ""
    },
    text: reply.text,
    createdAt: reply.createdAt
  };
}

async function getVisibleStory(storyId, viewerId) {
  if (!validId(storyId)) return { error: 400, message: "ID de historia inválido" };
  const story = await Story.findById(storyId).populate("author", AUTHOR_FIELDS).lean();
  if (!story) return { error: 404, message: "La historia no existe" };
  if (isExpired(story)) return { error: 404, message: "La historia expiró" };
  if (!isAuthor(story, viewerId)) {
    const relation = await canInteract(viewerId, story.author?._id || story.author);
    if (!relation.allowed) return { error: 403, message: relation.message };
    const visible = await canViewPost(story, viewerId);
    if (!visible) return { error: 403, message: "Esta historia no está disponible para ti" };
  }
  return { story };
}

// ---------- Bandeja del feed (propias + de quienes sigo) ----------

router.get("/", auth, requireUser, async (req, res) => {
  try {
    const now = new Date();
    const viewer = viewerObjectId(req.user.id);
    if (!viewer) return res.status(401).json({ error: "Usuario autenticado inválido" });

    const viewerDoc = await User.findById(req.user.id).select("following").lean();
    const following = Array.isArray(viewerDoc?.following) ? viewerDoc.following : [];
    const authorSet = new Set([viewer.toString()]);
    for (const id of following) authorSet.add(String(id));
    const authorIds = [...authorSet];

    const constraints = await feedConstraints(req.user.id);
    let filter = { expiresAt: { $gt: now }, author: { $in: authorIds } };
    if (constraints.author) filter = { $and: [filter, { author: constraints.author }] };
    const visible = await withAudienceFilter(filter, req.user.id);

    const stories = await Story.find(visible)
      .sort({ createdAt: 1 })
      .populate("author", AUTHOR_FIELDS)
      .lean();

    const groupsMap = new Map();
    for (const story of stories) {
      const authorId = String(story.author?._id || story.author);
      const normalized = normalizeStory(story, req.user.id);
      const group = groupsMap.get(authorId) || {
        author: normalized.author,
        stories: [],
        hasUnseen: false,
        latestAt: null
      };
      group.stories.push(normalized);
      group.hasUnseen = group.hasUnseen || !normalized.viewed;
      const createdAt = story.createdAt ? new Date(story.createdAt).getTime() : 0;
      if (createdAt > (group.latestAt || 0)) group.latestAt = story.createdAt;
      groupsMap.set(authorId, group);
    }

    const groups = [...groupsMap.values()];
    groups.sort((a, b) => {
      const aMine = String(a.author._id) === String(req.user.id) ? 1 : 0;
      const bMine = String(b.author._id) === String(req.user.id) ? 1 : 0;
      if (aMine !== bMine) return bMine - aMine;
      return new Date(b.latestAt || 0) - new Date(a.latestAt || 0);
    });

    return res.json({ groups });
  } catch (error) {
    console.error("LIST_STORIES_ERROR:", error);
    return res.status(500).json({ error: "Error obteniendo historias" });
  }
});

// ---------- Crear historia ----------

router.post("/", auth, requireUser, async (req, res) => {
  try {
    const parsed = parseStoryPayload(req.body);
    if (parsed.error) return res.status(400).json({ error: parsed.error });
    if (!validId(req.user.id)) return res.status(401).json({ error: "Usuario autenticado inválido" });

    if (parsed.audience.type === "circle") {
      const ownsCircle = await Circle.exists({ _id: parsed.audience.circleId, owner: req.user.id });
      if (!ownsCircle) {
        return res.status(403).json({ error: "Solo puedes contar historias en tus propios círculos" });
      }
    }

    const activeCount = await Story.countDocuments({ author: req.user.id, expiresAt: { $gt: new Date() } });
    if (activeCount >= MAX_ACTIVE_STORIES) {
      return res.status(409).json({
        error: `Ya tienes ${MAX_ACTIVE_STORIES} historias activas. Espera a que expiren o elimina alguna.`
      });
    }

    const story = await Story.create({
      author: req.user.id,
      media: parsed.media,
      caption: parsed.caption,
      audience: parsed.audience,
      expiresAt: new Date(Date.now() + STORY_TTL_HOURS * 60 * 60 * 1000)
    });
    await story.populate("author", AUTHOR_FIELDS);
    return res.status(201).json({ story: normalizeStory(story.toObject(), req.user.id) });
  } catch (error) {
    console.error("CREATE_STORY_ERROR:", error);
    return res.status(500).json({ error: "Error creando la historia" });
  }
});

// ---------- Archivo personal (propias, activas y expiradas) ----------

router.get("/me/archive", auth, requireUser, async (req, res) => {
  try {
    const stories = await Story.find({ author: req.user.id })
      .sort({ createdAt: -1 })
      .limit(ARCHIVE_LIMIT)
      .lean();
    return res.json({ stories: stories.map((story) => normalizeStory(story, req.user.id)) });
  } catch (error) {
    console.error("STORY_ARCHIVE_ERROR:", error);
    return res.status(500).json({ error: "Error obteniendo tu archivo de historias" });
  }
});

// ---------- Una historia ----------

router.get("/:storyId", auth, requireUser, async (req, res) => {
  try {
    const found = await getVisibleStory(req.params.storyId, req.user.id);
    if (found.error) return res.status(found.error).json({ error: found.message });
    return res.json({ story: normalizeStory(found.story, req.user.id) });
  } catch (error) {
    console.error("GET_STORY_ERROR:", error);
    return res.status(500).json({ error: "Error obteniendo la historia" });
  }
});

router.delete("/:storyId", auth, requireUser, async (req, res) => {
  try {
    if (!validId(req.params.storyId)) return res.status(400).json({ error: "ID de historia inválido" });
    const story = await Story.findById(req.params.storyId).lean();
    if (!story) return res.status(404).json({ error: "La historia no existe" });
    if (!isAuthor(story, req.user.id)) {
      return res.status(403).json({ error: "Solo puedes eliminar tus propias historias" });
    }
    await Story.deleteOne({ _id: story._id });
    return res.json({ deleted: true });
  } catch (error) {
    console.error("DELETE_STORY_ERROR:", error);
    return res.status(500).json({ error: "Error eliminando la historia" });
  }
});

// ---------- Vistas ----------

router.post("/:storyId/view", auth, requireUser, async (req, res) => {
  try {
    const found = await getVisibleStory(req.params.storyId, req.user.id);
    if (found.error) return res.status(found.error).json({ error: found.message });

    if (!isAuthor(found.story, req.user.id)) {
      const viewer = viewerObjectId(req.user.id);
      // La condición forma parte de la escritura: dos pestañas abiertas al
      // mismo tiempo no pueden insertar dos vistas del mismo usuario.
      await Story.updateOne(
        { _id: found.story._id, "views.user": { $ne: viewer } },
        { $push: { views: { user: viewer, viewedAt: new Date() } } }
      );
    }

    const fresh = await Story.findById(found.story._id).select("views").lean();
    const uniqueViewers = new Set((fresh?.views || []).map((view) => String(view.user?._id || view.user)));
    return res.json({ viewed: true, viewsCount: uniqueViewers.size });
  } catch (error) {
    console.error("VIEW_STORY_ERROR:", error);
    return res.status(500).json({ error: "Error marcando la historia como vista" });
  }
});

router.get("/:storyId/views", auth, requireUser, async (req, res) => {
  try {
    if (!validId(req.params.storyId)) return res.status(400).json({ error: "ID de historia inválido" });
    const story = await Story.findById(req.params.storyId)
      .populate("author", AUTHOR_FIELDS)
      .populate("views.user", "username displayName avatar")
      .lean();
    if (!story) return res.status(404).json({ error: "La historia no existe" });
    if (!isAuthor(story, req.user.id)) {
      return res.status(403).json({ error: "Solo el autor puede ver quién vio su historia" });
    }
    const viewers = (story.views || [])
      .slice()
      .sort((a, b) => new Date(b.viewedAt || 0) - new Date(a.viewedAt || 0))
      .slice(0, MAX_VIEWERS_LISTED)
      .map(presentViewer);
    return res.json({ viewers, total: new Set((story.views || []).map((view) => String(view.user?._id || view.user))).size });
  } catch (error) {
    console.error("STORY_VIEWS_ERROR:", error);
    return res.status(500).json({ error: "Error obteniendo las vistas de la historia" });
  }
});

// ---------- Respuestas privadas ----------

router.post("/:storyId/reply", auth, requireUser, async (req, res) => {
  try {
    const found = await getVisibleStory(req.params.storyId, req.user.id);
    if (found.error) return res.status(found.error).json({ error: found.message });
    if (isAuthor(found.story, req.user.id)) {
      return res.status(400).json({ error: "No puedes responder tu propia historia" });
    }

    const text = typeof req.body?.text === "string" ? req.body.text.trim() : "";
    if (!text) return res.status(400).json({ error: "La respuesta está vacía" });
    if (text.length > MAX_REPLY_LENGTH) {
      return res.status(400).json({ error: `La respuesta no puede superar ${MAX_REPLY_LENGTH} caracteres` });
    }

    const updated = await Story.updateOne(
      {
        _id: found.story._id,
        $expr: {
          $lt: [{ $size: { $ifNull: ["$replies", []] } }, MAX_REPLIES]
        }
      },
      { $push: { replies: { user: viewerObjectId(req.user.id), text, createdAt: new Date() } } }
    );
    if (!updated.modifiedCount) {
      return res.status(409).json({ error: "La historia alcanzó el límite de respuestas" });
    }
    const fresh = await Story.findById(found.story._id).select("replies").lean();
    return res.status(201).json({ repliesCount: (fresh?.replies || []).length });
  } catch (error) {
    console.error("REPLY_STORY_ERROR:", error);
    return res.status(500).json({ error: "Error enviando la respuesta" });
  }
});

router.get("/:storyId/replies", auth, requireUser, async (req, res) => {
  try {
    if (!validId(req.params.storyId)) return res.status(400).json({ error: "ID de historia inválido" });
    const story = await Story.findById(req.params.storyId)
      .populate("author", AUTHOR_FIELDS)
      .populate("replies.user", "username displayName avatar")
      .lean();
    if (!story) return res.status(404).json({ error: "La historia no existe" });
    if (!isAuthor(story, req.user.id)) {
      return res.status(403).json({ error: "Solo el autor puede leer las respuestas" });
    }
    const replies = (story.replies || [])
      .slice()
      .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
      .map(presentReply);
    return res.json({ replies });
  } catch (error) {
    console.error("STORY_REPLIES_ERROR:", error);
    return res.status(500).json({ error: "Error obteniendo las respuestas" });
  }
});

module.exports = router;
module.exports.parseStoryPayload = parseStoryPayload;
module.exports.normalizeStory = normalizeStory;
module.exports.normalizeStoryAudience = normalizeStoryAudience;
