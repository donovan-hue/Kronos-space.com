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
function parseDraftPayload(body = {}) {
  const content =
    typeof body.content === "string" ? body.content.trim() : "";

  if (content.length > MAX_POST_LENGTH) {
    return {
      error: `El borrador no puede superar ${MAX_POST_LENGTH} caracteres`
    };
  }

  const raw = body.media;
  const media = {
    url: "",
    type: "",
    mimeType: "",
    size: 0,
    alt: ""
  };

  if (raw && typeof raw === "object") {
    const url = typeof raw.url === "string" ? raw.url.trim() : "";

    if (url) {
      if (url.length > 2000) {
        return { error: "URL de media demasiado larga" };
      }

      if (!url.startsWith("/uploads/") && !/^https?:\/\//i.test(url)) {
        return { error: "URL de media no válida" };
      }

      media.url = url;
      media.type = "image";
      media.mimeType =
        typeof raw.mimeType === "string" ? raw.mimeType.slice(0, 100) : "";
      media.size = Number.isFinite(raw.size)
        ? Math.min(raw.size, 10 * 1024 * 1024)
        : 0;
      media.alt = typeof raw.alt === "string"
        ? raw.alt.trim().slice(0, MAX_ALT_LENGTH)
        : "";
    }
  } else if (typeof body.mediaUrl === "string" && body.mediaUrl.trim()) {
    const url = body.mediaUrl.trim();

    if (url.length > 2000) {
      return { error: "URL de media demasiado larga" };
    }

    if (!url.startsWith("/uploads/") && !/^https?:\/\//i.test(url)) {
      return { error: "URL de media no válida" };
    }

    media.url = url;
    media.type = "image";
    media.alt = typeof body.mediaAlt === "string"
      ? body.mediaAlt.trim().slice(0, MAX_ALT_LENGTH)
      : "";
  }

  if (!content && !media.url) {
    return { error: "El borrador está vacío" };
  }

  return { content, media };
}

function presentDraft(draft) {
  return {
    _id: draft._id,
    content: draft.content || "",
    media: draft.media || {
      url: "",
      type: "",
      mimeType: "",
      size: 0,
      alt: ""
    },
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
      media: parsed.media
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
      { $set: { content: parsed.content, media: parsed.media } },
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
