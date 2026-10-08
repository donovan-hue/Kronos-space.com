const mongoose = require("mongoose");
const { readMediaAuth } = require("./mediaAuth");
const { canViewPost } = require("../modules/posts/audience.service");

/**
 * ACL de `/uploads`. Se monta ANTES de `express.static` y de la copia durable,
 * así que cada decisión aquí es la única barrera para un archivo de media.
 *
 * Reglas de seguridad (AUDIT-005 y auditoría de media):
 * - La ruta se normaliza antes de clasificarla: un segmento `.` o `..`, una
 *   barra invertida o un byte nulo se deniegan. Sin esto, `/uploads/avatars/../media/x`
 *   pasaba como avatar público y `express.static` servía `media/x` sin ACL.
 * - Una URL mal codificada se deniega con el mismo 404 JSON; no es un 500 ni HTML.
 * - Cada referencia (post, historia, mensaje, borrador, generación) se evalúa
 *   con TODAS sus coincidencias: basta una que conceda acceso. Antes solo se
 *   miraba la primera coincidencia, así que el resultado dependía del orden.
 */

function cache(res, isPublic) {
  res.locals.mediaCacheControl = isPublic
    ? "public, max-age=604800"
    : "private, no-store";
}

function deny(req, res) {
  cache(res, false);
  // Mismo contrato JSON que el 404 global de server.js.
  return res.status(404).json({
    error: "Recurso no encontrado",
    code: "NOT_FOUND",
    path: req.originalUrl.split("?")[0]
  });
}

/**
 * Ruta decodificada y normalizada, o `null` si la petición no es una ruta
 * segura (codificación inválida, traversal, barra invertida o byte nulo).
 */
function mediaPath(req) {
  let decoded;

  try {
    decoded = decodeURIComponent(
      `${req.baseUrl || ""}${req.path || ""}`.split("?")[0]
    );
  } catch {
    return null;
  }

  if (decoded.includes("\0") || decoded.includes("\\")) return null;
  if (decoded.split("/").some((segment) => segment === "." || segment === "..")) {
    return null;
  }

  return decoded;
}

async function uploadOwner(url) {
  try {
    if (mongoose.connection.readyState !== 1 || !mongoose.connection.db) {
      return null;
    }

    const filename = url.replace(/^\/uploads\//, "");

    const file = await mongoose.connection.db
      .collection("kronosUploads.files")
      .findOne({ filename });

    return file?.metadata?.ownerId
      ? String(file.metadata.ownerId)
      : null;
  } catch {
    return null;
  }
}

/** Todas las publicaciones que contienen la URL (no solo la primera). */
async function postsFor(url) {
  const Post = require("../modules/posts/Post");

  return Post.find({
    $or: [
      { "media.url": url },
      { "media.posterUrl": url },
      { "mediaItems.url": url },
      { "mediaItems.posterUrl": url }
    ]
  }).lean();
}

async function storiesFor(url) {
  const Story = require("../modules/stories/Story");

  return Story.find({ "media.url": url }).lean();
}

async function messagesFor(url) {
  const Message = require("../modules/messages/Message");

  return Message.find({ "media.url": url }).lean();
}

async function draftsFor(url) {
  const Draft = require("../modules/drafts/Draft");

  return Draft.find({
    $or: [
      { "media.url": url },
      { "media.posterUrl": url },
      { "mediaItems.url": url },
      { "mediaItems.posterUrl": url }
    ]
  }).lean();
}

async function generationsFor(url) {
  const ImageGeneration = require("../modules/image-ai/ImageGeneration");

  return ImageGeneration.find({ imageUrl: url }).lean();
}

async function canViewMessage(message, viewerId) {
  if (!message || !viewerId) return false;

  if (
    String(message.sender) === String(viewerId) ||
    String(message.receiver) === String(viewerId)
  ) {
    return true;
  }

  if (!message.conversation) return false;

  const Conversation =
    require("../modules/conversations/Conversation");

  return Boolean(
    await Conversation.findOne({
      _id: message.conversation,
      members: viewerId
    }).select("_id").lean()
  );
}

async function anyPostGrants(url, viewerId) {
  for (const post of await postsFor(url)) {
    const isPublic = (post?.audience?.type || "public") === "public";

    if (isPublic && !viewerId) return true;
    if (viewerId && await canViewPost(post, viewerId)) return true;
  }

  return false;
}

async function anyStoryGrants(url, viewerId) {
  for (const story of await storiesFor(url)) {
    const expired =
      story.expiresAt &&
      new Date(story.expiresAt).getTime() <= Date.now();

    if (expired) continue;

    if (viewerId && await canViewPost(story, viewerId)) return true;

    if (!viewerId && (story?.audience?.type || "public") === "public") {
      return true;
    }
  }

  return false;
}

async function anyMessageGrants(url, viewerId) {
  for (const message of await messagesFor(url)) {
    if (await canViewMessage(message, viewerId)) return true;
  }

  return false;
}

async function anyDraftGrants(url, viewerId) {
  if (!viewerId) return false;

  return (await draftsFor(url)).some(
    (draft) => String(draft.author) === String(viewerId)
  );
}

async function anyGenerationGrants(url, viewerId) {
  if (!viewerId) return false;

  return (await generationsFor(url)).some(
    (generation) => String(generation.user) === String(viewerId)
  );
}

async function mediaAcl(req, res, next) {
  const url = mediaPath(req);

  if (url === null) return deny(req, res);

  if (/^\/uploads\/(?:avatars|covers)\//.test(url)) {
    cache(res, true);
    return next();
  }

  if (!/^\/uploads\/media\//.test(url)) {
    return deny(req, res);
  }

  const auth = await readMediaAuth(req);
  const viewerId = auth?.user?.id || null;

  // Subida: el propietario siempre puede ver su archivo (también antes de publicarlo).
  const ownerId = await uploadOwner(url);

  if (viewerId && ownerId && String(ownerId) === String(viewerId)) {
    cache(res, false);
    return next();
  }

  if (await anyPostGrants(url, viewerId)) {
    cache(res, !viewerId);
    return next();
  }

  if (await anyStoryGrants(url, viewerId)) {
    cache(res, false);
    return next();
  }

  if (await anyMessageGrants(url, viewerId)) {
    cache(res, false);
    return next();
  }

  if (await anyDraftGrants(url, viewerId)) {
    cache(res, false);
    return next();
  }

  if (await anyGenerationGrants(url, viewerId)) {
    cache(res, false);
    return next();
  }

  return deny(req, res);
}

module.exports = { mediaAcl, mediaPath };
