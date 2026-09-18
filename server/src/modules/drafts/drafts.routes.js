const express = require("express");
const mongoose = require("mongoose");

const Draft = require("./Draft");
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

const EMPTY_MEDIA = { url: "", type: "", mimeType: "", size: 0, alt: "" };

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
  const rawSize = Number(raw.size);
  return {
    media: {
      url,
      type: mediaType,
      mimeType,
      size: Number.isFinite(rawSize) ? Math.min(rawSize, mediaType === "video" ? 50 * 1024 * 1024 : 10 * 1024 * 1024) : 0,
      alt: typeof raw.alt === "string" ? raw.alt.trim().slice(0, MAX_ALT_LENGTH) : ""
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

function parseDraftPayload(body = {}) {
  const content = typeof body.content === "string" ? body.content.trim() : "";

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

  if (!content && !media.url && !mediaItems.length) {
    return { error: "El borrador está vacío" };
  }

  return { content, media, mediaItems };
}

function presentDraft(draft) {
  return {
    _id: draft._id,
    content: draft.content || "",
    media: draft.media || { ...EMPTY_MEDIA },
    mediaItems: Array.isArray(draft.mediaItems) ? draft.mediaItems : [],
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
      media: parsed.media,
      mediaItems: parsed.mediaItems
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

    const draft = await Draft.findByIdAndUpdate(
      draftId,
      { $set: { content: parsed.content, media: parsed.media, mediaItems: parsed.mediaItems } },
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
