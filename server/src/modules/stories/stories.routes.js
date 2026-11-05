const express = require("express");
const mongoose = require("mongoose");

const Story = require("./Story");
const User = require("../users/User");
const Circle = require("../circles/Circle");
const auth = require("../../middleware/auth");
const requireFeatureFlag = require("../../middleware/featureFlag");
const { parsePagination } = require("../../utils/queryHelpers");
const { requireUser } = require("../../middleware/permissions");
const { canInteract, feedConstraints } = require("../moderation/moderation.service");
const { notifySafely } = require("../notifications/notification.service");
const { withAudienceFilter, canViewPost } = require("../posts/audience.service");
const { mediaUrlsOf, purgeUnreferencedMedia } = require("../../config/mediaLifecycle");

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
  ARCHIVE_LIMIT,
  ARCHIVE_RETENTION_DAYS,
  MAX_HIGHLIGHTS,
  MAX_HIGHLIGHT_STORIES,
  MAX_STICKERS,
  STICKER_TYPES,
  STICKER_POSICIONES,
  MAX_STICKER_TEXTO,
  MAX_STICKER_OPCIONES,
  MAX_MUSICA_TITULO
} = Story;

const MusicTrack = require("../music/MusicTrack");

const AUTHOR_FIELDS = "username displayName avatar";

const DIA_MS = 24 * 60 * 60 * 1000;

/**
 * Fecha en la que el barrido borrará esta historia, o `null` si no está
 * programada. Se calcula desde `createdAt` y no desde `archivedUntil` para que
 * el aviso sea el mismo en todas las pantallas.
 */
function fechaDeBorrado(story) {
  if (!story?.createdAt) return null;
  return new Date(new Date(story.createdAt).getTime() + ARCHIVE_RETENTION_DAYS * DIA_MS);
}

function diasHasta(fecha, ahora = Date.now()) {
  if (!fecha) return null;
  return Math.max(0, Math.ceil((new Date(fecha).getTime() - ahora) / DIA_MS));
}

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

/**
 * Stickers de la historia (bloque 1.3).
 *
 * Se aceptan solo los tipos conocidos y una de tres posiciones: no hay
 * coordenadas libres, así que un sticker no puede quedar fuera del marco en
 * una pantalla pequeña. Los datos de una pista de música **no** se aceptan del
 * cliente: se resuelven contra el catálogo en `resolveStoryMusic`, porque si el
 * cliente manda el título y la URL podría atribuir a cualquiera una canción que
 * no es, o enlazar audio de fuera.
 */
function parseStoryStickers(value) {
  if (value === undefined || value === null) return { stickers: [] };
  if (!Array.isArray(value)) return { error: "Los stickers deben ser una lista" };
  if (value.length > MAX_STICKERS) {
    return { error: `No puedes poner más de ${MAX_STICKERS} stickers` };
  }

  const stickers = [];

  for (const raw of value) {
    if (!raw || typeof raw !== "object") return { error: "Sticker no válido" };
    const type = typeof raw.type === "string" ? raw.type.trim().toLowerCase() : "";
    if (!STICKER_TYPES.includes(type)) return { error: "Tipo de sticker no válido" };

    const position = STICKER_POSICIONES.includes(raw.position) ? raw.position : "centro";
    const text = typeof raw.text === "string" ? raw.text.trim().slice(0, MAX_STICKER_TEXTO) : "";

    if (type === "poll") {
      const opciones = Array.isArray(raw.options) ? raw.options : [];
      const labels = opciones
        .map((opcion) => (typeof opcion === "string" ? opcion : opcion?.label))
        .map((label) => (typeof label === "string" ? label.trim().slice(0, 40) : ""))
        .filter(Boolean);

      if (labels.length < 2) return { error: "Una encuesta necesita al menos dos opciones" };
      if (labels.length > MAX_STICKER_OPCIONES) {
        return { error: `Una encuesta no puede tener más de ${MAX_STICKER_OPCIONES} opciones` };
      }

      stickers.push({ type, text, position, options: labels.map((label) => ({ label })) });
      continue;
    }

    if (!text) return { error: "El sticker necesita un texto" };

    // Mención y etiqueta se guardan sin el símbolo: el enlace se arma al
    // pintarlas, para que un cambio de ruta no deje enlaces muertos.
    const limpio = type === "mention" || type === "hashtag" ? text.replace(/^[@#]+/, "") : text;
    if ((type === "mention" || type === "hashtag") && !limpio) {
      return { error: "El sticker necesita un nombre" };
    }
    if (type === "mention" && /\s/.test(limpio)) {
      return { error: "Una mención no puede llevar espacios" };
    }

    stickers.push({ type, text: limpio, position });
  }

  return { stickers };
}

/**
 * Música de la historia: el cliente manda `trackId` y, si acaso, el segundo de
 * inicio. Título, autor y URL salen del catálogo; una pista retirada o
 * inexistente se rechaza en lugar de guardar una referencia que no suena.
 */
async function resolveStoryMusic(value) {
  if (value === undefined || value === null || value === "") return { music: null };
  if (typeof value !== "object") return { error: "Música no válida" };

  const trackId = typeof value.trackId === "string" ? value.trackId.trim() : "";
  if (!validId(trackId)) return { error: "Pista de música no válida" };

  const pista = await MusicTrack.findById(trackId).select("titulo autor url publicada").lean();
  if (!pista || !pista.publicada) return { error: "Esa pista no está en el catálogo" };

  const inicioBruto = Number(value.inicio);
  const inicio = Number.isFinite(inicioBruto) && inicioBruto > 0 ? Math.min(inicioBruto, 600) : 0;

  return {
    music: {
      trackId: pista._id,
      titulo: String(pista.titulo || "").slice(0, MAX_MUSICA_TITULO),
      autor: String(pista.autor || "").slice(0, MAX_MUSICA_TITULO),
      url: String(pista.url || ""),
      inicio
    }
  };
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

  const stickers = parseStoryStickers(body.stickers);
  if (stickers.error) return { error: stickers.error };

  return {
    media: { url, type, mimeType, size: Number(rawMedia.size) || 0, alt },
    caption,
    audience,
    stickers: stickers.stickers
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
    // Stickers y música (bloque 1.3). De una encuesta se devuelve el conteo y
    // qué opción votó quien mira, nunca quiénes votaron.
    stickers: (Array.isArray(story.stickers) ? story.stickers : []).map((sticker) => ({
      type: sticker.type,
      text: sticker.text || "",
      position: sticker.position || "centro",
      ...(sticker.type === "poll" ? {
        options: (sticker.options || []).map((opcion) => ({
          label: opcion.label,
          votesCount: (sticker.votes || []).filter((voto) => Number(voto.option) === (sticker.options || []).indexOf(opcion)).length
        })),
        totalVotes: (sticker.votes || []).length,
        myVote: viewer
          ? (() => {
            const voto = (sticker.votes || []).find((item) => String(item.user?._id || item.user) === viewer);
            return voto ? Number(voto.option) : null;
          })()
          : null
      } : {})
    })),
    music: story.music && story.music.url
      ? {
        titulo: story.music.titulo || "",
        autor: story.music.autor || "",
        url: story.music.url,
        inicio: Number(story.music.inicio) || 0
      }
      : null,
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
    mine,
    // Retención visible para el autor: la fecha y cuántos días quedan. Al
    // resto no le importa cuándo se borra el archivo de otra persona.
    ...(mine ? {
      deleteAt: fechaDeBorrado(story),
      daysUntilDelete: diasHasta(fechaDeBorrado(story))
    } : {})
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

    const musica = await resolveStoryMusic(req.body?.music);
    if (musica.error) return res.status(400).json({ error: musica.error });

    const story = await Story.create({
      author: req.user.id,
      media: parsed.media,
      caption: parsed.caption,
      audience: parsed.audience,
      stickers: parsed.stickers,
      music: musica.music,
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

/**
 * GET /api/stories/me/archive — archivo personal de historias, paginado.
 *
 * Antes devolvía las últimas `ARCHIVE_LIMIT` y ahí se acababa: quien publica
 * historias a diario no podía llegar a las de hace un mes, y no había forma de
 * saber si faltaban o simplemente no existían. Ahora hay `page`/`limit` y un
 * `total` explícito, así la pantalla puede decir «N de M» y pedir la siguiente.
 */
router.get("/me/archive", auth, requireUser, requireFeatureFlag("archive"), async (req, res) => {
  try {
    const { page, limit, skip } = parsePagination(req.query, {
      defaultLimit: ARCHIVE_LIMIT,
      maxLimit: ARCHIVE_LIMIT
    });

    const filtro = { author: req.user.id };
    // `total` solo en la primera página: pedirlo en cada desplazamiento es un
    // recorrido completo que no cambia mientras se pagina.
    const [stories, total] = await Promise.all([
      Story.find(filtro).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      page === 1 ? Story.countDocuments(filtro) : Promise.resolve(null)
    ]);

    return res.json({
      stories: stories.map((story) => normalizeStory(story, req.user.id)),
      page,
      limit,
      total,
      // Si no hay total (página > 1), basta con saber si esta página vino llena.
      hayMas: stories.length === limit
    });
  } catch (error) {
    console.error("STORY_ARCHIVE_ERROR:", error);
    return res.status(500).json({ error: "Error obteniendo tu archivo de historias" });
  }
});

/* ---------- Destacados ----------
   Un destacado es una colección permanente de historias del autor. Se guarda
   en el propio autor (no en `Story`) porque la historia caduca a las 24 h y
   el destacado debe sobrevivirla: lo que se conserva es la referencia y la
   portada, no el documento efímero. */

function normalizeHighlight(highlight = {}) {
  return {
    id: String(highlight.id || highlight._id || ""),
    title: highlight.title || "",
    coverUrl: highlight.coverUrl || "",
    storyIds: (highlight.storyIds || []).map(String),
    count: (highlight.storyIds || []).length,
    createdAt: highlight.createdAt || null
  };
}

/**
 * GET /api/stories/highlights — destacados del usuario autenticado.
 *
 * Se sirven desde `User` y no desde `Story`: así siguen ahí aunque todas sus
 * historias hayan caducado.
 */
router.get("/highlights", auth, requireUser, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select("storyHighlights").lean();
    if (!user) return res.status(404).json({ error: "Usuario no encontrado" });
    return res.json({ highlights: (user.storyHighlights || []).map(normalizeHighlight) });
  } catch (error) {
    console.error("LIST_HIGHLIGHTS_ERROR:", error);
    return res.status(500).json({ error: "Error obteniendo los destacados" });
  }
});

/**
 * POST /api/stories/highlights — crea un destacado con historias propias.
 *
 * Solo historias del autor: destacar contenido ajeno lo convertiría en una
 * copia permanente de algo efímero sin permiso de quien lo publicó.
 */
router.post("/highlights", auth, requireUser, async (req, res) => {
  try {
    const title = typeof req.body?.title === "string" ? req.body.title.trim().slice(0, 60) : "";
    const ids = Array.isArray(req.body?.storyIds) ? [...new Set(req.body.storyIds.map(String))] : [];
    if (!ids.length) return res.status(400).json({ error: "Elige al menos una historia" });
    if (ids.length > MAX_HIGHLIGHT_STORIES) {
      return res.status(400).json({ error: `Un destacado no puede tener más de ${MAX_HIGHLIGHT_STORIES} historias` });
    }
    if (ids.some((id) => !validId(id))) return res.status(400).json({ error: "ID de historia inválido" });

    const propias = await Story.countDocuments({ _id: { $in: ids }, author: req.user.id });
    if (propias !== ids.length) {
      return res.status(403).json({ error: "Solo puedes destacar tus propias historias", code: "NOT_STORY_AUTHOR" });
    }

    const user = await User.findById(req.user.id).select("storyHighlights").lean();
    if ((user?.storyHighlights || []).length >= MAX_HIGHLIGHTS) {
      return res.status(400).json({ error: `Ya tienes ${MAX_HIGHLIGHTS} destacados; elimina uno para crear otro` });
    }

    const primera = await Story.findById(ids[0]).select("media").lean();
    const destacado = {
      id: new mongoose.Types.ObjectId(),
      title,
      coverUrl: primera?.media?.url || "",
      storyIds: ids,
      createdAt: new Date()
    };

    await User.updateOne({ _id: req.user.id }, { $push: { storyHighlights: destacado } });
    return res.status(201).json({ highlight: normalizeHighlight(destacado) });
  } catch (error) {
    console.error("CREATE_HIGHLIGHT_ERROR:", error);
    return res.status(500).json({ error: "Error creando el destacado" });
  }
});

/** DELETE /api/stories/highlights/:highlightId — borra un destacado propio. */
router.delete("/highlights/:highlightId", auth, requireUser, async (req, res) => {
  try {
    const { highlightId } = req.params;
    if (!validId(highlightId)) return res.status(400).json({ error: "ID de destacado inválido" });
    const result = await User.updateOne(
      { _id: req.user.id },
      { $pull: { storyHighlights: { id: new mongoose.Types.ObjectId(highlightId) } } }
    );
    if (!result.modifiedCount) return res.status(404).json({ error: "Destacado no encontrado" });
    return res.json({ ok: true });
  } catch (error) {
    console.error("DELETE_HIGHLIGHT_ERROR:", error);
    return res.status(500).json({ error: "Error eliminando el destacado" });
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
    // Igual que al borrar una publicación: la media deja de servirse. El
    // archivo personal desaparece con la historia, así que conservar el
    // archivo en disco solo dejaría basura accesible por URL directa.
    // Se purga DESPUÉS del borrado para que la propia historia no cuente
    // como referencia, y un fallo de limpieza no tumba el borrado.
    try {
      await purgeUnreferencedMedia(mediaUrlsOf(story));
    } catch (purgeError) {
      console.error("STORY_MEDIA_PURGE_ERROR", {
        storyId: String(story._id),
        message: purgeError?.message || "error"
      });
    }
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

/**
 * POST /api/stories/:storyId/stickers/:index/vote — votar en la encuesta.
 *
 * Un voto por persona y encuesta; volver a votar cambia el voto en vez de
 * sumar otro. El autor no vota en su propia encuesta: inflaría el resultado
 * que está preguntando. El cuerpo solo lleva `{ option }`, un índice; el
 * conteo se devuelve ya calculado para que la UI lo pinte sin adivinar.
 */
router.post("/:storyId/stickers/:index/vote", auth, requireUser, async (req, res) => {
  try {
    const { storyId, index } = req.params;
    if (!validId(storyId)) return res.status(400).json({ error: "ID de historia inválido" });

    const posicion = Number.parseInt(String(index), 10);
    if (!Number.isFinite(posicion) || posicion < 0) {
      return res.status(400).json({ error: "Sticker no válido" });
    }

    const story = await Story.findById(storyId)
      .select("author stickers expiresAt audience")
      .lean();

    if (!story) return res.status(404).json({ error: "Historia no encontrada" });
    if (isExpired(story)) return res.status(410).json({ error: "Esta historia ya caducó" });
    if (String(story.author) === String(req.user.id)) {
      return res.status(403).json({ error: "No puedes votar en tu propia encuesta", code: "OWN_POLL" });
    }

    const sticker = (story.stickers || [])[posicion];
    if (!sticker || sticker.type !== "poll") {
      return res.status(404).json({ error: "Esa historia no tiene una encuesta en esa posición" });
    }

    const opcion = Number(req.body?.option);
    if (!Number.isInteger(opcion) || opcion < 0 || opcion >= (sticker.options || []).length) {
      return res.status(400).json({ error: "Opción no válida" });
    }

    // Se quita el voto previo (si lo había) y se añade el nuevo: votar dos
    // veces no cuenta doble, cambia el voto.
    await Story.updateOne(
      { _id: storyId },
      { $pull: { [`stickers.${posicion}.votes`]: { user: req.user?.id ? new mongoose.Types.ObjectId(req.user.id) : null } } }
    );
    await Story.updateOne(
      { _id: storyId },
      { $push: { [`stickers.${posicion}.votes`]: { user: req.user.id, option: opcion, at: new Date() } } }
    );

    const actualizada = await Story.findById(storyId).select("stickers").lean();
    const actualizado = (actualizada?.stickers || [])[posicion] || { options: [], votes: [] };
    const votos = actualizado.votes || [];

    return res.json({
      sticker: {
        options: (actualizado.options || []).map((item, indice) => ({
          label: item.label,
          votesCount: votos.filter((voto) => Number(voto.option) === indice).length
        })),
        totalVotes: votos.length,
        myVote: opcion
      }
    });
  } catch (error) {
    console.error("STORY_POLL_VOTE_ERROR:", error);
    return res.status(500).json({ error: "No se pudo registrar el voto" });
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
    // El autor tiene las respuestas en su bandeja (GET /stories/:id/replies),
    // pero no se enteraba de que llegaban: el aviso entra en la campana y su
    // `ref` apunta a la historia, que es lo único que puede abrir el panel.
    await notifySafely({
      recipient: found.story.author?._id || found.story.author,
      actor: req.user.id,
      type: "story",
      ref: { kind: "story", id: found.story._id },
      io: req.app.get("io")
    });
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
