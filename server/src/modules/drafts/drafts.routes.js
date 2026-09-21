const express = require("express");
const mongoose = require("mongoose");

const Draft = require("./Draft");
const Circle = require("../circles/Circle");
const Orbit = require("../orbits/Orbit");
const { normalizeAudience } = require("../posts/audience.service");
const auth = require("../../middleware/auth");
const { requireUser } = require("../../middleware/permissions");

/**
 * KRONOS-UI-014 — rutas de borradores.
 *
 * Contrato:
 * - GET    /api/drafts             lista paginada del autor autenticado
 * - POST   /api/drafts             crea borrador (texto y/o media)
 * - PATCH  /api/drafts/:draftId    actualiza borrador propio
 * - DELETE /api/drafts/:draftId    elimina borrador propio
 *
 * Nunca se listan borradores de otros usuarios: el filtro siempre es
 * `author: req.user.id`, no un id del navegador.
 */
const router = express.Router();

const MAX_POST_LENGTH = 5000;
const MAX_ALT_LENGTH = 500;
const MAX_DRAFTS_PER_USER = 50;
const DEFAULT_PAGE_LIMIT = 20;
const MAX_PAGE_LIMIT = 50;
const MAX_CAROUSEL_ITEMS = 4;
const MAX_POLL_QUESTION = 200;
const MAX_POLL_OPTION = 120;
const MAX_POLL_OPTIONS = 6;
const MAX_EVENT_TITLE = 160;
const MAX_EVENT_DESCRIPTION = 1000;
const MAX_EVENT_LOCATION = 300;

const EMPTY_MEDIA = { url: "", type: "", mimeType: "", size: 0, alt: "", posterUrl: "" };

function validId(value) {
  return mongoose.Types.ObjectId.isValid(value);
}

function parsePagination(query) {
  let page = parseInt(query.page, 10);
  let limit = parseInt(query.limit, 10);

  if (!Number.isInteger(page) || page < 1) page = 1;
  if (!Number.isInteger(limit) || limit < 1) limit = DEFAULT_PAGE_LIMIT;
  if (limit > MAX_PAGE_LIMIT) limit = MAX_PAGE_LIMIT;

  return { page, limit, skip: (page - 1) * limit };
}

/**
 * Normaliza el contenido recibido. Devuelve `{ error }` cuando el
 * borrador quedaría completamente vacío.
 */
function validMediaUrl(url) {
  return url.startsWith("/uploads/") || /^https?:\/\//i.test(url);
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
  if (posterUrl && (posterUrl.length > 2000 || !validMediaUrl(posterUrl))) return { error: "URL de portada no válida" };
  const rawSize = Number(raw.size);
  return {
    media: {
      url,
      type: mediaType,
      mimeType,
      size: Number.isFinite(rawSize) ? Math.min(rawSize, mediaType === "video" ? 50 * 1024 * 1024 : 10 * 1024 * 1024) : 0,
      alt: typeof raw.alt === "string" ? raw.alt.trim().slice(0, MAX_ALT_LENGTH) : "",
      posterUrl: mediaType === "video" ? posterUrl : ""
    }
  };
}

function parsePoll(raw) {
  if (raw === undefined || raw === null) return { poll: null };
  if (!raw || typeof raw !== "object") return { error: "La encuesta no es válida" };
  const question = typeof raw.question === "string" ? raw.question.trim() : "";
  const rawOptions = Array.isArray(raw.options) ? raw.options : [];
  const options = [...new Set(rawOptions.map((option) => {
    if (typeof option === "string") return option.trim();
    return typeof option?.text === "string" ? option.text.trim() : "";
  }).filter(Boolean))];
  if (!question || question.length > MAX_POLL_QUESTION) return { error: "La pregunta debe tener entre 1 y 200 caracteres" };
  if (options.length < 2 || options.length > MAX_POLL_OPTIONS || options.some((option) => option.length > MAX_POLL_OPTION)) {
    return { error: "La encuesta debe tener entre 2 y 6 opciones de hasta 120 caracteres" };
  }
  let closesAt = null;
  if (raw.closesAt) {
    closesAt = new Date(raw.closesAt);
    if (Number.isNaN(closesAt.getTime()) || closesAt <= new Date() || closesAt > new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)) {
      return { error: "La fecha de cierre debe ser futura y no superar 30 días" };
    }
  }
  return { poll: { question, options: options.map((text) => ({ text })), closesAt } };
}

function parseEvent(raw) {
  if (raw === undefined || raw === null) return { event: null };
  if (!raw || typeof raw !== "object") return { error: "El evento no es válido" };
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
  if (!raw.startsAt || Number.isNaN(startsAt.getTime()) || startsAt.getTime() <= Date.now()) return { error: "El evento debe comenzar en una fecha futura" };
  let endsAt = null;
  if (raw.endsAt) {
    endsAt = new Date(raw.endsAt);
    if (Number.isNaN(endsAt.getTime()) || endsAt.getTime() <= startsAt.getTime()) return { error: "El cierre del evento debe ser posterior al inicio" };
  }
  return { event: { title, description, startsAt, endsAt, timezone, locationType, location } };
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

function parseDraftPayload(body = {}) {
  const content = typeof body.content === "string" ? body.content.trim() : "";
  const audience = normalizeAudience(body.audience || "public");
  if (!audience) return { error: "Audiencia no válida" };
  const parsedPoll = parsePoll(body.poll);
  if (parsedPoll.error) return parsedPoll;
  const parsedEvent = parseEvent(body.event);
  if (parsedEvent.error) return parsedEvent;

  if (content.length > MAX_POST_LENGTH) {
    return { error: `El borrador no puede superar ${MAX_POST_LENGTH} caracteres` };
  }

  const parsedItems = parseMediaItems(body.mediaItems);
  if (parsedItems.error) return parsedItems;

  let media = { ...EMPTY_MEDIA };
  let mediaItems = parsedItems.mediaItems;

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

  if (!content && !media.url && !mediaItems.length && !parsedPoll.poll && !parsedEvent.event) {
    return { error: "El borrador está vacío" };
  }

  return { content, media, mediaItems, audience, poll: parsedPoll.poll, event: parsedEvent.event };
}

async function ownsAudienceSpace(audience, ownerId) {
  if (audience?.type === "circle") {
    return Boolean(await Circle.exists({ _id: audience.circleId, owner: ownerId }));
  }
  if (audience?.type === "orbit") {
    return Boolean(await Orbit.exists({
      _id: audience.orbitId,
      $and: [
        { $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }] },
        { $or: [{ owner: ownerId }, { "members.user": ownerId }] }
      ]
    }));
  }
  return true;
}

function presentDraft(draft) {
  return {
    _id: draft._id,
    content: draft.content || "",
    media: draft.media || { ...EMPTY_MEDIA },
    mediaItems: Array.isArray(draft.mediaItems) ? draft.mediaItems : [],
    poll: draft.poll
      ? {
        question: draft.poll.question,
        options: Array.isArray(draft.poll.options) ? draft.poll.options.map((option) => ({ text: option.text })) : [],
        closesAt: draft.poll.closesAt || null
      }
      : null,
    event: draft.event
      ? {
        title: draft.event.title,
        description: draft.event.description || "",
        startsAt: draft.event.startsAt,
        endsAt: draft.event.endsAt || null,
        timezone: draft.event.timezone || "UTC",
        locationType: draft.event.locationType || "online",
        location: draft.event.location || ""
      }
      : null,
    audience: draft.audience?.type === "circle"
      ? { type: "circle", circleId: String(draft.audience.circleId || "") }
      : draft.audience?.type === "orbit"
        ? { type: "orbit", orbitId: String(draft.audience.orbitId || "") }
        : { type: draft.audience?.type || "public" },
    createdAt: draft.createdAt,
    updatedAt: draft.updatedAt
  };
}

router.get("/", auth, requireUser, async (req, res) => {
  try {
    const { page, limit, skip } = parsePagination(req.query);
    const filter = { author: req.user.id };
    const [drafts, total] = await Promise.all([
      Draft.find(filter)
        .sort({ updatedAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Draft.countDocuments(filter)
    ]);

    return res.json({
      drafts: drafts.map(presentDraft),
      total,
      page,
      limit,
      hasMore: skip + drafts.length < total
    });
  } catch (error) {
    console.error("LIST_DRAFTS_ERROR:", error);
    return res.status(500).json({ error: "Error obteniendo borradores" });
  }
});

router.post("/", auth, requireUser, async (req, res) => {
  try {
    const parsed = parseDraftPayload(req.body);

    if (parsed.error) {
      return res.status(400).json({ error: parsed.error });
    }
    if (!(await ownsAudienceSpace(parsed.audience, req.user.id))) {
      return res.status(403).json({ error: "Solo puedes guardar borradores para espacios a los que perteneces" });
    }

    const total = await Draft.countDocuments({ author: req.user.id });

    if (total >= MAX_DRAFTS_PER_USER) {
      return res.status(400).json({
        error: `Solo puedes guardar ${MAX_DRAFTS_PER_USER} borradores. Elimina uno para continuar.`,
        code: "DRAFT_LIMIT"
      });
    }

    const draft = await Draft.create({
      author: req.user.id,
      content: parsed.content,
      audience: parsed.audience,
      media: parsed.media,
      mediaItems: parsed.mediaItems,
      poll: parsed.poll,
      event: parsed.event
    });

    return res.status(201).json({ draft: presentDraft(draft) });
  } catch (error) {
    console.error("CREATE_DRAFT_ERROR:", error);
    return res.status(500).json({ error: "Error guardando el borrador" });
  }
});

router.patch("/:draftId", auth, requireUser, async (req, res) => {
  try {
    const { draftId } = req.params;

    if (!validId(draftId)) {
      return res.status(400).json({ error: "ID de borrador inválido" });
    }

    const existing = await Draft.findById(draftId)
      .select("author")
      .lean();

    if (!existing) {
      return res.status(404).json({ error: "Borrador no encontrado" });
    }

    if (String(existing.author) !== String(req.user.id)) {
      return res.status(403).json({
        error: "No tienes permisos para editar este borrador"
      });
    }

    const parsed = parseDraftPayload(req.body);

    if (parsed.error) {
      return res.status(400).json({ error: parsed.error });
    }
    if (!(await ownsAudienceSpace(parsed.audience, req.user.id))) {
      return res.status(403).json({ error: "Solo puedes guardar borradores para espacios a los que perteneces" });
    }

    const draft = await Draft.findByIdAndUpdate(
      draftId,
      { $set: { content: parsed.content, audience: parsed.audience, media: parsed.media, mediaItems: parsed.mediaItems, poll: parsed.poll, event: parsed.event } },
      { new: true, runValidators: true }
    ).lean();

    return res.json({ draft: presentDraft(draft) });
  } catch (error) {
    console.error("UPDATE_DRAFT_ERROR:", error);
    return res.status(500).json({ error: "Error actualizando el borrador" });
  }
});

router.delete("/:draftId", auth, requireUser, async (req, res) => {
  try {
    const { draftId } = req.params;

    if (!validId(draftId)) {
      return res.status(400).json({ error: "ID de borrador inválido" });
    }

    const existing = await Draft.findById(draftId)
      .select("author")
      .lean();

    if (!existing) {
      return res.status(404).json({ error: "Borrador no encontrado" });
    }

    if (String(existing.author) !== String(req.user.id)) {
      return res.status(403).json({
        error: "No tienes permisos para eliminar este borrador"
      });
    }

    await Draft.findByIdAndDelete(draftId);

    return res.json({ ok: true, draftId: String(draftId) });
  } catch (error) {
    console.error("DELETE_DRAFT_ERROR:", error);
    return res.status(500).json({ error: "Error eliminando el borrador" });
  }
});

module.exports = router;
