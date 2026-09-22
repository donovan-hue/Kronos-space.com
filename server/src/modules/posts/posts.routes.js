const express = require("express");
const mongoose = require("mongoose");

const Post = require("./Post");
const User = require("../users/User");
const Circle = require("../circles/Circle");
const Orbit = require("../orbits/Orbit");
const auth = require("../../middleware/auth");
const { requireUser } = require("../../middleware/permissions");
const { handleMediaUpload } = require("../../middleware/upload");
const { saveBuffer } = require("../../config/storage");
const { createNotification } = require("../notifications/notification.service");
const {
  canInteract,
  feedConstraints,
  isGloballyHidden,
  isModerator
} = require("../moderation/moderation.service");
const {
  AUDIENCE_TYPES,
  normalizeAudience,
  withAudienceFilter,
  canViewPost
} = require("./audience.service");
const { extractHashtags, normalizeHashtagQuery } = require("./hashtag.service");

const router = express.Router();
const profilePostFilter = require("./profilePostFilter");

const FEED_LIMIT = 50;
const DEFAULT_PAGE_LIMIT = 20;
const MAX_POST_LENGTH = 5000;
const MAX_COMMENT_LENGTH = 1000;
const MAX_ALT_LENGTH = 500;
const MAX_CAROUSEL_ITEMS = 4;
const MAX_POLL_OPTIONS = 6;
const MAX_POLL_DURATION_DAYS = 30;
const MAX_EVENT_TITLE = 160;
const MAX_EVENT_DESCRIPTION = 1000;
const MAX_EVENT_LOCATION = 300;
// Fase 7 — linaje creativo. "remix" solo puede fijarlo el endpoint de
// remix (atribución verificada); los flujos de Kairos declaran su tool.
const LINEAGE_TOOLS = ["remix", "kairos-image", "kairos-video", "kairos-script"];
const EMPTY_MEDIA = { url: "", type: "", mimeType: "", size: 0, alt: "", posterUrl: "", width: 0, height: 0, orientation: "", focalPoint: { x: 0.5, y: 0.5 } };

// FASE 2 (restos) — punto focal persistente: coordenadas relativas 0..1
// que dicen qué parte de la imagen debe verse al recortar por CSS.
function parseFocalPoint(raw) {
  if (!raw || typeof raw !== "object") return { x: 0.5, y: 0.5 };
  const clamp = (value) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return 0.5;
    return Math.min(1, Math.max(0, parsed));
  };
  return { x: clamp(raw.x), y: clamp(raw.y) };
}

const AUTHOR_FIELDS = "username displayName avatar";
const COMMENT_USER_FIELDS = "username displayName avatar";
const REPOST_FIELDS = "username displayName avatar";

function validId(id) {
  return mongoose.Types.ObjectId.isValid(id);
}

function filterByOrbit(query, filter) {
  const orbitId = typeof query.orbitId === "string" ? query.orbitId.trim() : "";
  if (!orbitId) return filter;
  if (!validId(orbitId)) return { error: "ID de órbita inválido" };
  return { ...filter, "audience.type": "orbit", "audience.orbitId": orbitId };
}

async function getFeedPreferences(viewerId) {
  const fallback = { mode: "latest", interests: [], following: [] };
  if (mongoose.connection.readyState !== 1) return fallback;
  const user = await User.findById(viewerId).select("following preferences.feed").lean();
  const feed = user?.preferences?.feed || {};
  return {
    mode: ["latest", "following", "interests"].includes(feed.mode) ? feed.mode : "latest",
    interests: Array.isArray(feed.interests) ? feed.interests : [],
    following: Array.isArray(user?.following) ? user.following : []
  };
}

function applyFeedPreferences(filter, viewerId, preferences) {
  if (preferences.mode === "following") {
    return { ...filter, author: { $in: [viewerId, ...preferences.following] } };
  }
  if (preferences.mode === "interests" && preferences.interests.length) {
    return { ...filter, hashtags: { $in: preferences.interests } };
  }
  return filter;
}

function recommendationReason(post, viewerId, preferences, orbitId = "") {
  if (orbitId) return "Publicado en esta órbita";
  const authorId = String(post.author?._id || post.author || "");
  if (authorId === String(viewerId)) return "Tu publicación";
  const tags = Array.isArray(post.hashtags) ? post.hashtags : [];
  const matchingInterest = preferences.interests.find((interest) => tags.includes(interest));
  if (matchingInterest) return `Relacionado con #${matchingInterest}`;
  if (preferences.mode === "following") return "De las personas que sigues";
  return "Reciente en tu red";
}

function normalizeFeedPosts(posts, viewerId, preferences, orbitId = "") {
  return posts.map((post) => ({
    ...normalizePost(post, viewerId),
    recommendationReason: recommendationReason(post, viewerId, preferences, orbitId)
  }));
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

function validMediaUrl(url) {
  return url.startsWith("/uploads/") || /^https?:\/\//i.test(url);
}

function parseVideoVariants(rawVariants) {
  if (!Array.isArray(rawVariants)) return [];
  const validResolutions = ["1080p", "720p", "480p", "original"];
  return rawVariants
    .filter((v) => v && typeof v === "object" && v.url && validResolutions.includes(v.resolution))
    .map((v) => ({
      resolution: v.resolution,
      url: String(v.url).trim(),
      mimeType: String(v.mimeType || "video/mp4").trim(),
      size: Number(v.size) || 0,
      bitrate: Number(v.bitrate) || 0
    }));
}

function parseSubtitles(rawSubtitles) {
  if (!Array.isArray(rawSubtitles)) return [];
  return rawSubtitles
    .filter((s) => s && typeof s === "object" && (s.url || s.vttContent))
    .map((s) => ({
      lang: String(s.lang || "es-MX").trim().slice(0, 10),
      label: String(s.label || "Español (México)").trim().slice(0, 60),
      url: String(s.url || "").trim(),
      autoGenerated: Boolean(s.autoGenerated !== false),
      approved: Boolean(s.approved),
      vttContent: String(s.vttContent || "").trim()
    }));
}

function parseTrim(rawTrim) {
  if (!rawTrim || typeof rawTrim !== "object") return { start: 0, end: 0, muted: false };
  const start = Math.max(0, Number(rawTrim.start) || 0);
  const end = Math.max(0, Number(rawTrim.end) || 0);
  const muted = Boolean(rawTrim.muted);
  return { start, end, muted };
}

function parseMedia(raw, { allowVideo = true } = {}) {
  if (!raw || typeof raw !== "object") return { media: { ...EMPTY_MEDIA } };
  const url = typeof raw.url === "string" ? raw.url.trim() : "";
  if (!url) return { media: { ...EMPTY_MEDIA } };
  if (url.length > 2000) return { error: "URL de media demasiado larga" };
  if (!validMediaUrl(url)) return { error: "URL de media no válida" };

  const mimeType = typeof raw.mimeType === "string" ? raw.mimeType.slice(0, 100) : "";
  const isVideo = raw.type === "video" || mimeType.startsWith("video/");
  if (!allowVideo && isVideo) return { error: "El carrusel solo acepta imágenes" };
  const mediaType = allowVideo && isVideo ? "video" : "image";
  const posterUrl = typeof raw.posterUrl === "string" ? raw.posterUrl.trim() : "";
  if (posterUrl && mediaType !== "video") return { error: "Solo los videos pueden tener portada" };
  if (posterUrl && (posterUrl.length > 2000 || !validMediaUrl(posterUrl))) {
    return { error: "URL de portada no válida" };
  }
  const rawSize = Number(raw.size);
  const maxSize = mediaType === "video" ? 50 * 1024 * 1024 : 10 * 1024 * 1024;
  const rawWidth = Math.trunc(Number(raw.width));
  const rawHeight = Math.trunc(Number(raw.height));
  const width = Number.isFinite(rawWidth) && rawWidth > 0 && rawWidth <= 100000 ? rawWidth : 0;
  const height = Number.isFinite(rawHeight) && rawHeight > 0 && rawHeight <= 100000 ? rawHeight : 0;
  const orientation = width && height
    ? width > height ? "horizontal" : height > width ? "vertical" : "square"
    : "";

  let variants = mediaType === "video" ? parseVideoVariants(raw.variants) : [];
  if (mediaType === "video" && !variants.length && url) {
    variants = [
      { resolution: "original", url, mimeType: mimeType || "video/mp4", size: rawSize || 0, bitrate: 0 },
      { resolution: "720p", url, mimeType: "video/mp4", size: Math.round((rawSize || 1000000) * 0.7), bitrate: 1500 },
      { resolution: "480p", url, mimeType: "video/mp4", size: Math.round((rawSize || 1000000) * 0.4), bitrate: 800 }
    ];
  }

  const subtitles = mediaType === "video" ? parseSubtitles(raw.subtitles) : [];
  const trim = mediaType === "video" ? parseTrim(raw.trim) : { start: 0, end: 0, muted: false };
  const duration = mediaType === "video" ? Math.max(0, Number(raw.duration) || 0) : 0;
  const processingStatus = mediaType === "video" ? (raw.processingStatus || "completed") : "ready";

  return {
    media: {
      url,
      type: mediaType,
      mimeType,
      size: Number.isFinite(rawSize) ? Math.min(rawSize, maxSize) : 0,
      alt: typeof raw.alt === "string" ? raw.alt.trim().slice(0, MAX_ALT_LENGTH) : "",
      posterUrl: mediaType === "video" ? posterUrl : "",
      width,
      height,
      orientation,
      focalPoint: parseFocalPoint(raw.focalPoint),
      variants,
      subtitles,
      trim,
      duration,
      processingStatus
    }
  };
}

function parseMediaItems(rawItems) {
  if (rawItems === undefined) return { mediaItems: [] };
  if (!Array.isArray(rawItems)) return { error: "El carrusel debe enviarse como lista" };
  const items = rawItems.filter(Boolean);
  if (items.length > MAX_CAROUSEL_ITEMS) return { error: `El carrusel no puede superar ${MAX_CAROUSEL_ITEMS} imágenes` };

  const mediaItems = [];
  for (const raw of items) {
    const parsed = parseMedia(raw, { allowVideo: false });
    if (parsed.error) return parsed;
    if (parsed.media.url) mediaItems.push({ ...parsed.media, type: "image" });
  }
  return { mediaItems };
}

function parsePoll(raw) {
  if (raw === undefined || raw === null) return { poll: null };
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { error: "La encuesta no es válida" };
  const question = typeof raw.question === "string" ? raw.question.trim() : "";
  const options = Array.isArray(raw.options)
    ? [...new Set(raw.options.map((item) => {
      if (typeof item === "string") return item.trim();
      return typeof item?.text === "string" ? item.text.trim() : "";
    }).filter(Boolean))]
    : [];
  if (!question) return { error: "La pregunta de la encuesta es obligatoria" };
  if (question.length > 200) return { error: "La pregunta no puede superar 200 caracteres" };
  if (options.length < 2 || options.length > MAX_POLL_OPTIONS) return { error: "La encuesta debe tener entre 2 y 6 opciones" };
  if (options.some((option) => option.length > 120)) return { error: "Cada opción no puede superar 120 caracteres" };
  let closesAt = null;
  if (raw.closesAt) {
    closesAt = new Date(raw.closesAt);
    if (Number.isNaN(closesAt.getTime())) return { error: "La fecha de cierre de la encuesta no es válida" };
    if (closesAt.getTime() <= Date.now()) return { error: "La encuesta debe cerrar en el futuro" };
    if (closesAt.getTime() > Date.now() + MAX_POLL_DURATION_DAYS * 24 * 60 * 60 * 1000) return { error: "La encuesta puede durar como máximo 30 días" };
  }
  return { poll: { question, options: options.map((text) => ({ text })), closesAt } };
}

function parseEvent(raw) {
  if (raw === undefined || raw === null) return { event: null };
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { error: "El evento no es válido" };
  const title = typeof raw.title === "string" ? raw.title.trim() : "";
  const description = typeof raw.description === "string" ? raw.description.trim() : "";
  const timezone = typeof raw.timezone === "string" && raw.timezone.trim() ? raw.timezone.trim().slice(0, 64) : "UTC";
  const locationType = raw.locationType === "in_person" ? "in_person" : raw.locationType === "online" ? "online" : "";
  const location = typeof raw.location === "string" ? raw.location.trim() : "";
  if (!title || title.length > MAX_EVENT_TITLE) return { error: "El evento necesita un título de hasta 160 caracteres" };
  if (description.length > MAX_EVENT_DESCRIPTION) return { error: "La descripción del evento no puede superar 1000 caracteres" };
  if (!locationType) return { error: "El tipo de ubicación del evento no es válido" };
  if (location.length > MAX_EVENT_LOCATION) return { error: "La ubicación no puede superar 300 caracteres" };
  if (locationType === "in_person" && !location) return { error: "Indica la ubicación del evento presencial" };

  const startsAt = new Date(raw.startsAt);
  if (!raw.startsAt || Number.isNaN(startsAt.getTime()) || startsAt.getTime() <= Date.now()) {
    return { error: "El evento debe comenzar en una fecha futura" };
  }
  let endsAt = null;
  if (raw.endsAt) {
    endsAt = new Date(raw.endsAt);
    if (Number.isNaN(endsAt.getTime()) || endsAt.getTime() <= startsAt.getTime()) {
      return { error: "El cierre del evento debe ser posterior al inicio" };
    }
  }
  return { event: { title, description, startsAt, endsAt, timezone, locationType, location } };
}

function parsePostPayload(body = {}) {
  const content = typeof body.content === "string" ? body.content.trim() : "";
  if (content.length > MAX_POST_LENGTH) {
    return { error: "La publicación no puede superar 5000 caracteres" };
  }
  const audience = normalizeAudience(body.audience || "public");
  if (!audience) {
    return { error: `Audiencia no válida. Usa: ${AUDIENCE_TYPES.join(", ")}` };
  }
  const hashtags = extractHashtags(content);
  const parsedPoll = parsePoll(body.poll);
  if (parsedPoll.error) return parsedPoll;
  const parsedEvent = parseEvent(body.event);
  if (parsedEvent.error) return parsedEvent;

  const parsedItems = parseMediaItems(body.mediaItems);
  if (parsedItems.error) return parsedItems;
  let media = { ...EMPTY_MEDIA };
  const mediaItems = parsedItems.mediaItems;

  if (mediaItems.length) {
    media = mediaItems[0];
  } else if (body.media && typeof body.media === "object") {
    const parsed = parseMedia(body.media);
    if (parsed.error) return parsed;
    media = parsed.media;
  } else if (typeof body.mediaUrl === "string" && body.mediaUrl.trim()) {
    const parsed = parseMedia({ url: body.mediaUrl, alt: body.mediaAlt, type: "image" }, { allowVideo: false });
    if (parsed.error) return parsed;
    media = parsed.media;
  }

  const lineage = parseLineage(body.lineage);
  if (lineage.error) return lineage;

  return { content, media, mediaItems, audience, hashtags, poll: parsedPoll.poll, event: parsedEvent.event, lineage: lineage.value };
}

/**
 * Fase 7 — linaje creativo. La creación genérica solo acepta la
 * herramienta de procedencia y el etiquetado IA; `derivedFrom` se
 * reserva al endpoint de remix para que la atribución sea verificada.
 */
function parseLineage(raw) {
  if (!raw || typeof raw !== "object") return { value: { derivedFrom: null, tool: "", aiGenerated: false } };
  const tool = typeof raw.tool === "string" ? raw.tool.trim() : "";
  if (tool && !LINEAGE_TOOLS.includes(tool)) {
    return { error: "Herramienta de linaje no válida" };
  }
  if (tool === "remix") {
    return { error: "El linaje de remix se crea con el endpoint de remix" };
  }
  const aiGenerated = raw.aiGenerated === true;
  if (tool === "" && !aiGenerated) return { value: { derivedFrom: null, tool: "", aiGenerated: false } };
  return { value: { derivedFrom: null, tool, aiGenerated } };
}


const normalizePost = require("./normalizePost");

async function populatePost(postId, currentUserId) {
  const post = await Post.findById(postId)
    .populate("author", AUTHOR_FIELDS)
    .populate("comments.user", COMMENT_USER_FIELDS)
    .populate("repostOf")
    .populate({ path: "lineage.derivedFrom", select: "author", populate: { path: "author", select: "username displayName" } })
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
 * Upload single image/video (field: media) — AUDIT-005 KRONOS-UI-009/013
 * Returns { url, type, mimeType, size }
 */
router.post("/media/upload", auth, requireUser, handleMediaUpload("media"), async (req, res) => {
  try {
    if (!req.file || !req.file.buffer) {
      return res.status(400).json({ error: "No se recibió ningún archivo" });
    }
    const { url, size } = saveBuffer({
      buffer: req.file.buffer,
      mimetype: req.file.mimetype,
      originalname: req.file.originalname,
      subdir: "media"
    });
    return res.status(201).json({
      url,
      type: req.file.mimetype.startsWith("video/") ? "video" : "image",
      mimeType: req.file.mimetype,
      size
    });
  } catch (error) {
    console.error("UPLOAD_MEDIA_ERROR:", error);
    return res.status(500).json({ error: "Error subiendo media" });
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
    const constraints = await feedConstraints(req.user.id);
    const filter = await withAudienceFilter(
      {
        ...constraints,
        savedBy: new mongoose.Types.ObjectId(req.user.id)
      },
      req.user.id
    );
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
    const existing = await Post.findById(postId).select("author audience").lean();
    if (!existing) return res.status(404).json({ error: "Publicación no encontrada" });
    if (!(await canViewPost(existing, req.user.id))) return res.status(404).json({ error: "Publicación no encontrada" });
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
    const original = await Post.findById(postId).select("_id author content media mediaItems audience").lean();
    if (!original) return res.status(404).json({ error: "Publicación no encontrada" });
    if (!(await canViewPost(original, req.user.id))) return res.status(404).json({ error: "Publicación no encontrada" });
    const content = typeof req.body?.content === "string" ? req.body.content.trim() : "";
    if (content.length > MAX_POST_LENGTH) return res.status(400).json({ error: "La publicación no puede superar 5000 caracteres" });
    const repostRelation = await canInteract(req.user.id, original.author);
    if (!repostRelation.allowed) {
      return res.status(403).json({ error: repostRelation.message, code: repostRelation.code });
    }
    // prevent duplicate repost? allow multiple but optionally check existing repost by same user
    const existingRepost = await Post.findOne({ author: req.user.id, repostOf: postId }).lean();
    if (existingRepost) return res.status(409).json({ error: "Ya has republicado esta publicación" });

    const post = await Post.create({
      content: content || original.content,
      author: req.user.id,
      likes: [],
      comments: [],
      media: original.media || { ...EMPTY_MEDIA },
      mediaItems: Array.isArray(original.mediaItems) ? original.mediaItems : [],
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

// ---------- POLLS ----------
/**
 * POST /api/posts/:postId/poll/vote
 * Registra o cambia el voto del usuario autenticado.
 */
router.post("/:postId/poll/vote", auth, requireUser, async (req, res) => {
  try {
    const { postId } = req.params;
    const optionId = typeof req.body?.optionId === "string" ? req.body.optionId.trim() : "";
    if (!validId(postId) || !validId(optionId)) return res.status(400).json({ error: "Publicación u opción inválida" });
    const post = await Post.findById(postId);
    if (!post || !post.poll) return res.status(404).json({ error: "Encuesta no encontrada" });
    if (!(await canViewPost(post, req.user.id))) return res.status(404).json({ error: "Publicación no encontrada" });
    const relation = await canInteract(req.user.id, post.author);
    if (!relation.allowed) return res.status(403).json({ error: relation.message, code: relation.code });
    if (post.poll.closesAt && new Date(post.poll.closesAt).getTime() <= Date.now()) return res.status(400).json({ error: "La encuesta ya está cerrada" });
    if (!post.poll.options.some((option) => String(option._id) === optionId)) return res.status(400).json({ error: "Opción de encuesta inválida" });
    const existingVote = post.poll.votes.find((vote) => String(vote.user) === String(req.user.id));
    if (existingVote) existingVote.optionId = optionId;
    else post.poll.votes.push({ user: req.user.id, optionId });
    await post.save();
    const normalized = await populatePost(postId, req.user.id);
    return res.json({ post: normalized, selectedOptionId: optionId });
  } catch (error) {
    console.error("VOTE_POLL_ERROR:", error);
    return res.status(500).json({ error: "Error registrando el voto" });
  }
});

// ---------- EVENTS ----------
/**
 * POST /api/posts/:postId/event/rsvp
 * Registra, cambia o elimina la respuesta del usuario a un evento.
 */
router.post("/:postId/event/rsvp", auth, requireUser, async (req, res) => {
  try {
    const { postId } = req.params;
    const status = typeof req.body?.status === "string" ? req.body.status.trim() : "";
    if (!validId(postId)) return res.status(400).json({ error: "ID de publicación inválido" });
    if (!["interested", "going", "none"].includes(status)) return res.status(400).json({ error: "Respuesta de evento no válida" });

    const post = await Post.findById(postId);
    if (!post || !post.event) return res.status(404).json({ error: "Evento no encontrado" });
    if (!(await canViewPost(post, req.user.id))) return res.status(404).json({ error: "Publicación no encontrada" });
    const relation = await canInteract(req.user.id, post.author);
    if (!relation.allowed) return res.status(403).json({ error: relation.message, code: relation.code });
    if (post.event.endsAt && new Date(post.event.endsAt).getTime() <= Date.now()) {
      return res.status(400).json({ error: "El evento ya terminó" });
    }

    const existing = post.event.rsvps.find((rsvp) => String(rsvp.user) === String(req.user.id));
    if (status === "none") {
      post.event.rsvps = post.event.rsvps.filter((rsvp) => String(rsvp.user) !== String(req.user.id));
    } else if (existing) {
      existing.status = status;
    } else {
      post.event.rsvps.push({ user: req.user.id, status });
    }
    await post.save();
    const normalized = await populatePost(postId, req.user.id);
    return res.json({ post: normalized, response: status === "none" ? null : status });
  } catch (error) {
    console.error("RSVP_EVENT_ERROR:", error);
    return res.status(500).json({ error: "Error actualizando la respuesta al evento" });
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
    const relation = await canInteract(req.user.id, userId);
    if (!relation.allowed) {
      return res.status(403).json({ error: relation.message, code: relation.code });
    }
    const tabFilter = profilePostFilter(userId, req.query.tab);
    if (!tabFilter) return res.status(400).json({ error: "Pestaña de perfil no válida." });
    const filter = await withAudienceFilter(
      { ...tabFilter, ...(await feedConstraints(req.user.id)) },
      req.user.id
    );
    const { page, limit, skip } = parsePagination(req.query);
    const [posts, totalPosts] = await Promise.all([
      Post.find(filter)
        .populate("author", AUTHOR_FIELDS)
        .populate("comments.user", COMMENT_USER_FIELDS)
        .populate("repostOf")
        .populate({ path: "lineage.derivedFrom", select: "author", populate: { path: "author", select: "username displayName" } })
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
    const preferences = await getFeedPreferences(req.user.id);
    const configured = applyFeedPreferences(await feedConstraints(req.user.id), req.user.id, preferences);
    const constrained = filterByOrbit(req.query, configured);
    if (constrained.error) return res.status(400).json({ error: constrained.error });
    const filter = await withAudienceFilter(constrained, req.user.id);
    const [posts, total] = await Promise.all([
      Post.find(filter)
        .populate("author", AUTHOR_FIELDS)
        .populate("comments.user", COMMENT_USER_FIELDS)
        .populate("repostOf")
        .populate({ path: "lineage.derivedFrom", select: "author", populate: { path: "author", select: "username displayName" } })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Post.countDocuments(filter)
    ]);
    const normalizedPosts = normalizeFeedPosts(posts, req.user.id, preferences, req.query.orbitId);
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

// VERTICAL — video vertical como feed opcional (Fase 3 del plan). Nunca
// sustituye a Inicio: es otra superficie de consumo. Solo videos; los
// marcadamente horizontales quedan fuera y los de orientación desconocida
// (posts anteriores a las dimensiones) siguen entrando para que el feed
// no nazca vacío.
function verticalFeedFilter(constraints) {
  return {
    ...constraints,
    "media.type": "video",
    "media.orientation": { $ne: "horizontal" }
  };
}

router.get("/vertical", auth, requireUser, async (req, res) => {
  try {
    const { page, limit, skip } = parsePagination(req.query);
    const preferences = await getFeedPreferences(req.user.id);
    const base = verticalFeedFilter(await feedConstraints(req.user.id));
    const filter = await withAudienceFilter(base, req.user.id);
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
    return res.status(200).json({
      posts: normalizeFeedPosts(posts, req.user.id, preferences),
      total,
      page,
      limit,
      hasMore: skip + posts.length < total
    });
  } catch (error) {
    console.error("GET_VERTICAL_FEED_ERROR:", error);
    return res.status(500).json({ error: "Error obteniendo el feed vertical" });
  }
});

/**
 * GET /api/posts
 * Feed principal paginado.
 */
router.get("/", auth, requireUser, async (req, res) => {
  try {
    const { page, limit, skip } = parsePagination(req.query);
    const preferences = await getFeedPreferences(req.user.id);
    const configured = applyFeedPreferences(await feedConstraints(req.user.id), req.user.id, preferences);
    const constrained = filterByOrbit(req.query, configured);
    if (constrained.error) return res.status(400).json({ error: constrained.error });
    const filter = await withAudienceFilter(constrained, req.user.id);
    const [posts, total] = await Promise.all([
      Post.find(filter)
        .populate("author", AUTHOR_FIELDS)
        .populate("comments.user", COMMENT_USER_FIELDS)
        .populate("repostOf")
        .populate({ path: "lineage.derivedFrom", select: "author", populate: { path: "author", select: "username displayName" } })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Post.countDocuments(filter)
    ]);
    const normalizedPosts = normalizeFeedPosts(posts, req.user.id, preferences, req.query.orbitId);
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
 * GET /api/posts/topic/:tag
 * Feed público de un hashtag normalizado. Respeta moderación y audiencia.
 */
router.get("/topic/:tag", auth, requireUser, async (req, res) => {
  try {
    const tag = normalizeHashtagQuery(req.params.tag);
    if (!tag) return res.status(400).json({ error: "Hashtag no válido" });
    const { page, limit, skip } = parsePagination(req.query);
    const filter = await withAudienceFilter(
      { ...(await feedConstraints(req.user.id)), hashtags: tag },
      req.user.id
    );
    const [posts, total] = await Promise.all([
      Post.find(filter)
        .populate("author", AUTHOR_FIELDS)
        .populate("comments.user", COMMENT_USER_FIELDS)
        .sort({ createdAt: -1, _id: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Post.countDocuments(filter)
    ]);
    return res.status(200).json({
      tag,
      posts: posts.map((post) => normalizePost(post, req.user.id)),
      total,
      page,
      limit,
      hasMore: skip + posts.length < total
    });
  } catch (error) {
    console.error("GET_TOPIC_POSTS_ERROR:", error);
    return res.status(500).json({ error: "Error obteniendo publicaciones del tema" });
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
      .populate({ path: "lineage.derivedFrom", select: "author", populate: { path: "author", select: "username displayName" } })
      .lean();
    if (!post) {
      return res.status(404).json({ error: "Publicación no encontrada" });
    }
    if (isGloballyHidden(post)) {
      const viewer = await User.findById(req.user.id).select("role").lean();
      const isAuthor = String(post.author?._id || post.author) === String(req.user.id);
      if (!isAuthor && !isModerator(viewer)) {
        return res.status(404).json({ error: "Publicación no encontrada" });
      }
    }
    if (!(await canViewPost(post, req.user.id))) {
      return res.status(404).json({ error: "Publicación no encontrada" });
    }
    const relation = await canInteract(req.user.id, post.author?._id || post.author);
    if (!relation.allowed) {
      return res.status(403).json({ error: relation.message, code: relation.code });
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
 * Crea una publicación. Soporta texto, video único o carrusel de hasta 4 imágenes.
 */
router.post("/", auth, requireUser, async (req, res) => {
  try {
    const parsed = parsePostPayload(req.body);
    if (parsed.error) {
      return res.status(400).json({ error: parsed.error });
    }
    if (!validId(req.user.id)) {
      return res.status(401).json({ error: "Usuario autenticado inválido" });
    }
    if (parsed.audience.type === "circle") {
      const ownsCircle = await Circle.exists({ _id: parsed.audience.circleId, owner: req.user.id });
      if (!ownsCircle) {
        return res.status(403).json({ error: "Solo puedes publicar en tus propios círculos" });
      }
    }
    if (parsed.audience.type === "orbit") {
      const canPublish = await Orbit.exists({
        _id: parsed.audience.orbitId,
        $and: [
          { $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }] },
          { $or: [{ owner: req.user.id }, { "members.user": req.user.id }] }
        ]
      });
      if (!canPublish) {
        return res.status(403).json({ error: "Debes pertenecer a la órbita para publicar en ella" });
      }
    }

    if (!parsed.content && !parsed.media.url && !parsed.mediaItems.length && !parsed.poll && !parsed.event) {
      return res.status(400).json({ error: "La publicación está vacía" });
    }

    const doc = {
      content: parsed.content,
      author: req.user.id,
      likes: [],
      comments: [],
      media: parsed.media,
      mediaItems: parsed.mediaItems,
      audience: parsed.audience,
      poll: parsed.poll,
      event: parsed.event,
      hashtags: parsed.hashtags,
      lineage: parsed.lineage,
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
    const hasContentField = typeof req.body?.content === "string";
    const content = hasContentField ? req.body.content.trim() : "";
    if (content.length > MAX_POST_LENGTH) {
      return res.status(400).json({ error: "La publicación no puede superar 5000 caracteres" });
    }
    const existing = await Post.findById(postId).select("author content media mediaItems").lean();
    if (!existing) {
      return res.status(404).json({ error: "Publicación no encontrada" });
    }
    if (String(existing.author) !== String(req.user.id)) {
      return res.status(403).json({ error: "No tienes permisos para editar esta publicación" });
    }
    const resultingContent = hasContentField ? content : existing.content;
    const keepsMedia = Boolean(existing.media?.url) || (Array.isArray(existing.mediaItems) && existing.mediaItems.length > 0);
    if (!resultingContent && !keepsMedia) {
      return res.status(400).json({ error: "La publicación está vacía" });
    }

    const updates = {};
    if (hasContentField) {
      updates.content = content;
      updates.hashtags = extractHashtags(content);
    }
    if (req.body?.audience !== undefined) {
      const audience = normalizeAudience(req.body.audience);
      if (!audience) {
        return res.status(400).json({ error: `Audiencia no válida. Usa: ${AUDIENCE_TYPES.join(", ")}` });
      }
      if (audience.type === "circle") {
        const ownsCircle = await Circle.exists({ _id: audience.circleId, owner: req.user.id });
        if (!ownsCircle) return res.status(403).json({ error: "Solo puedes publicar en tus propios círculos" });
      }
      if (audience.type === "orbit") {
        const canPublish = await Orbit.exists({
          _id: audience.orbitId,
          $and: [
            { $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }] },
            { $or: [{ owner: req.user.id }, { "members.user": req.user.id }] }
          ]
        });
        if (!canPublish) return res.status(403).json({ error: "Debes pertenecer a la órbita para publicar en ella" });
      }
      updates.audience = audience;
    }
    if (typeof req.body?.mediaAlt === "string" || (req.body?.media && typeof req.body.media.alt === "string")) {
      const alt = (req.body.mediaAlt ?? req.body.media.alt ?? "").toString().trim().slice(0, MAX_ALT_LENGTH);
      updates["media.alt"] = alt;
    }
    if (typeof req.body?.mediaPosterUrl === "string" || (req.body?.media && typeof req.body.media.posterUrl === "string")) {
      const posterUrl = (req.body.mediaPosterUrl ?? req.body.media.posterUrl ?? "").toString().trim();
      if (posterUrl && existing.media?.type !== "video") return res.status(400).json({ error: "Solo los videos pueden tener portada" });
      if (posterUrl && (posterUrl.length > 2000 || !validMediaUrl(posterUrl))) return res.status(400).json({ error: "URL de portada no válida" });
      updates["media.posterUrl"] = posterUrl;
    }
    if (Array.isArray(req.body?.mediaItems)) {
      const parsedItems = parseMediaItems(req.body.mediaItems);
      if (parsedItems.error) return res.status(400).json({ error: parsedItems.error });
      if (!resultingContent && !parsedItems.mediaItems.length) {
        return res.status(400).json({ error: "La publicación está vacía" });
      }
      updates.mediaItems = parsedItems.mediaItems;
      updates.media = parsedItems.mediaItems[0] || { ...EMPTY_MEDIA };
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
 * PATCH /api/posts/:postId/subtitles
 * Actualiza o aprueba subtítulos de un video propio.
 */
router.patch("/:postId/subtitles", auth, requireUser, async (req, res) => {
  try {
    const { postId } = req.params;
    if (!validId(postId)) return res.status(400).json({ error: "ID de publicación inválido" });
    const existing = await Post.findById(postId).select("author media").lean();
    if (!existing) return res.status(404).json({ error: "Publicación no encontrada" });
    if (String(existing.author) !== String(req.user.id)) {
      return res.status(403).json({ error: "No tienes permisos para editar esta publicación" });
    }
    if (existing.media?.type !== "video") {
      return res.status(400).json({ error: "La publicación no contiene video" });
    }

    const subtitles = parseSubtitles(req.body?.subtitles);
    const updated = await Post.findByIdAndUpdate(
      postId,
      { $set: { "media.subtitles": subtitles } },
      { new: true }
    )
      .populate("author", AUTHOR_FIELDS)
      .populate("comments.user", COMMENT_USER_FIELDS);

    return res.status(200).json({ post: normalizePost(updated.toObject(), req.user.id) });
  } catch (error) {
    console.error("UPDATE_SUBTITLES_ERROR:", error);
    return res.status(500).json({ error: "Error actualizando subtítulos" });
  }
});

/**
 * PATCH /api/posts/:postId/video-trim
 * Actualiza recorte temporal y mute de un video propio.
 */
router.patch("/:postId/video-trim", auth, requireUser, async (req, res) => {
  try {
    const { postId } = req.params;
    if (!validId(postId)) return res.status(400).json({ error: "ID de publicación inválido" });
    const existing = await Post.findById(postId).select("author media").lean();
    if (!existing) return res.status(404).json({ error: "Publicación no encontrada" });
    if (String(existing.author) !== String(req.user.id)) {
      return res.status(403).json({ error: "No tienes permisos para editar esta publicación" });
    }
    if (existing.media?.type !== "video") {
      return res.status(400).json({ error: "La publicación no contiene video" });
    }

    const trim = parseTrim(req.body?.trim);
    const updated = await Post.findByIdAndUpdate(
      postId,
      { $set: { "media.trim": trim } },
      { new: true }
    )
      .populate("author", AUTHOR_FIELDS)
      .populate("comments.user", COMMENT_USER_FIELDS);

    return res.status(200).json({ post: normalizePost(updated.toObject(), req.user.id) });
  } catch (error) {
    console.error("UPDATE_VIDEO_TRIM_ERROR:", error);
    return res.status(500).json({ error: "Error actualizando recorte de video" });
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
    const postOwner = await Post.findById(postId).select("author audience comments").lean();
    if (!postOwner) {
      return res.status(404).json({ error: "Publicación no encontrada" });
    }
    if (!(await canViewPost(postOwner, req.user.id))) {
      return res.status(404).json({ error: "Publicación no encontrada" });
    }
    const rawParentId = req.body?.parentCommentId;
    let parentComment = null;
    if (rawParentId !== undefined && rawParentId !== null && rawParentId !== "") {
      if (!validId(rawParentId)) {
        return res.status(400).json({ error: "Comentario padre inválido" });
      }
      parentComment = Array.isArray(postOwner.comments)
        ? postOwner.comments.find((comment) => String(comment._id) === String(rawParentId))
        : null;
      if (!parentComment) {
        return res.status(404).json({ error: "Comentario padre no encontrado" });
      }
    }
    const commentRelation = await canInteract(req.user.id, postOwner.author);
    if (!commentRelation.allowed) {
      return res.status(403).json({ error: commentRelation.message, code: commentRelation.code });
    }
    const post = await Post.findByIdAndUpdate(
      postId,
      {
        $push: {
          comments: {
            user: req.user.id,
            content,
            parentComment: parentComment ? parentComment._id : null
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
    const post = await Post.findById(postId).select("author audience comments").lean();
    if (!post) {
      return res.status(404).json({ error: "Publicación no encontrada" });
    }
    if (!(await canViewPost(post, req.user.id))) {
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
 * POST /api/posts/:postId/reaction
 * Selecciona o quita una reacción persistente. Cada usuario mantiene como
 * máximo una reacción por publicación; `like` conserva la semántica histórica.
 */
router.post("/:postId/reaction", auth, requireUser, async (req, res) => {
  try {
    const { postId } = req.params;
    const type = typeof req.body?.type === "string" ? req.body.type.trim().toLowerCase() : "";
    const reactionTypes = Post.REACTION_TYPES || ["like", "love", "laugh", "wow", "sad", "angry"];
    if (!validId(postId)) {
      return res.status(400).json({ error: "ID de publicación inválido" });
    }
    if (!reactionTypes.includes(type)) {
      return res.status(400).json({ error: "Tipo de reacción no válido", allowedTypes: reactionTypes });
    }
    if (!validId(req.user.id)) {
      return res.status(401).json({ error: "Usuario autenticado inválido" });
    }

    const postOwner = await Post.findById(postId).select("author audience").lean();
    if (!postOwner) {
      return res.status(404).json({ error: "Publicación no encontrada" });
    }
    if (!(await canViewPost(postOwner, req.user.id))) {
      return res.status(404).json({ error: "Publicación no encontrada" });
    }
    const relation = await canInteract(req.user.id, postOwner.author);
    if (!relation.allowed) {
      return res.status(403).json({ error: relation.message, code: relation.code });
    }

    const post = await Post.findById(postId).select("_id author likes reactions");
    if (!post) {
      return res.status(404).json({ error: "Publicación no encontrada" });
    }

    const userId = String(req.user.id);
    const explicitReactions = Array.isArray(post.reactions) ? post.reactions : [];
    const existing = explicitReactions.find((item) => String(item.user) === userId);
    const legacyLiked = Array.isArray(post.likes) && post.likes.some((id) => String(id) === userId);
    const currentType = existing?.type || (legacyLiked ? "like" : null);
    const nextType = currentType === type ? null : type;

    // Rebuild the small array to enforce the one-reaction-per-user invariant,
    // and synchronize legacy likes so old clients and new clients agree.
    const reactions = explicitReactions.filter((item) => String(item.user) !== userId);
    if (nextType) reactions.push({ user: req.user.id, type: nextType });
    const likes = (Array.isArray(post.likes) ? post.likes : []).filter((id) => String(id) !== userId);
    if (nextType === "like") likes.push(req.user.id);

    const updatedPost = await Post.findByIdAndUpdate(
      postId,
      { $set: { reactions, likes } },
      { new: true, runValidators: true }
    )
      .select("_id author likes reactions")
      .lean();
    if (!updatedPost) {
      return res.status(404).json({ error: "Publicación no encontrada" });
    }

    const summary = normalizePost(updatedPost, req.user.id);
    if (nextType) {
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
      reaction: summary.reaction,
      reactionCounts: summary.reactionCounts,
      reactionsCount: summary.reactionsCount,
      liked: summary.liked,
      likesCount: summary.likesCount
    });
  } catch (error) {
    console.error("REACTION_POST_ERROR:", error);
    return res.status(500).json({ error: "Error actualizando reacción" });
  }
});

/**
 * POST /api/posts/:postId/like
 * Toggle atómico de like. Se conserva para clientes anteriores al catálogo
 * de reacciones múltiples.
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
    const postOwner = await Post.findById(postId).select("author audience").lean();
    if (!postOwner) {
      return res.status(404).json({ error: "Publicación no encontrada" });
    }
    if (!(await canViewPost(postOwner, req.user.id))) {
      return res.status(404).json({ error: "Publicación no encontrada" });
    }
    const likeRelation = await canInteract(req.user.id, postOwner.author);
    if (!likeRelation.allowed) {
      return res.status(403).json({ error: likeRelation.message, code: likeRelation.code });
    }
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
            },
            reactions: {
              $cond: [
                { $in: [userId, { $ifNull: ["$likes", []] }] },
                {
                  $filter: {
                    input: { $ifNull: ["$reactions", []] },
                    as: "reaction",
                    cond: { $ne: ["$$reaction.user", userId] }
                  }
                },
                {
                  $concatArrays: [
                    {
                      $filter: {
                        input: { $ifNull: ["$reactions", []] },
                        as: "reaction",
                        cond: { $ne: ["$$reaction.user", userId] }
                      }
                    },
                    [{ user: userId, type: "like" }]
                  ]
                }
              ]
            }
          }
        }
      ],
      { new: true }
    )
      .select("_id likes author reactions")
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

// REMIX — Fase 7: derivación con atribución. La publicación nueva nace
// con linaje derivFrom verificado por el servidor (nunca declarado por el
// cliente) y la media de la original.
router.post("/:postId/remix", auth, requireUser, async (req, res) => {
  try {
    if (!validId(req.params.postId)) return res.status(400).json({ error: "ID de publicación inválido" });
    const original = await Post.findById(req.params.postId)
      .populate("author", AUTHOR_FIELDS)
      .lean();
    if (!original) return res.status(404).json({ error: "La publicación original no existe" });

    const relation = await canInteract(req.user.id, original.author?._id || original.author);
    if (!relation.allowed) return res.status(403).json({ error: relation.message });
    const visible = await canViewPost(original, req.user.id);
    if (!visible) return res.status(403).json({ error: "No puedes remezclar una publicación que no ves" });
    if (!original.media?.url) {
      return res.status(409).json({ error: "Solo se puede remezclar una publicación con media" });
    }

    const content = typeof req.body?.content === "string" ? req.body.content.trim() : "";
    if (content.length > MAX_POST_LENGTH) {
      return res.status(400).json({ error: "La publicación no puede superar 5000 caracteres" });
    }

    const post = await Post.create({
      content,
      author: req.user.id,
      likes: [],
      comments: [],
      media: {
        url: original.media.url,
        type: original.media.type,
        mimeType: original.media.mimeType || "",
        size: original.media.size || 0,
        alt: original.media.alt || ""
      },
      mediaItems: [],
      audience: { type: "public" },
      hashtags: extractHashtags(content),
      lineage: {
        derivedFrom: original._id,
        tool: "remix",
        aiGenerated: Boolean(original.lineage?.aiGenerated)
      },
      savedBy: []
    });
    await post.populate("author", AUTHOR_FIELDS);
    await post.populate({ path: "lineage.derivedFrom", select: "author", populate: { path: "author", select: "username displayName" } });
    return res.status(201).json({ post: normalizePost(post.toObject(), req.user.id) });
  } catch (error) {
    console.error("REMIX_POST_ERROR:", error);
    return res.status(500).json({ error: "Error creando el remix" });
  }
});

module.exports = router;
module.exports.parseMedia = parseMedia;
module.exports.parseMediaItems = parseMediaItems;
module.exports.verticalFeedFilter = verticalFeedFilter;
module.exports.getFeedPreferences = getFeedPreferences;
module.exports.applyFeedPreferences = applyFeedPreferences;
module.exports.recommendationReason = recommendationReason;
module.exports.normalizeFeedPosts = normalizeFeedPosts;
module.exports.parseLineage = parseLineage;
module.exports.parseFocalPoint = parseFocalPoint;
module.exports.parseSubtitles = parseSubtitles;
module.exports.parseTrim = parseTrim;
module.exports.parseVideoVariants = parseVideoVariants;
module.exports.LINEAGE_TOOLS = LINEAGE_TOOLS;
