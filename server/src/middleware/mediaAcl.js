const mongoose = require("mongoose");
const { readMediaAuth } = require("./mediaAuth");
const { canViewPost } = require("../modules/posts/audience.service");

/**
 * Control de acceso de `/uploads`.
 *
 * `storage.js` declara cinco carpetas y las cinco se sirven por aquí. Cada una
 * tiene su propia política:
 *
 *   avatars, covers  públicos sin condición (la identidad visual del perfil lo
 *                    es por diseño: aparece en el feed, en los comentarios y
 *                    en la federación).
 *   media            privado por defecto. Se sirve al propietario de la
 *                    subida, a quien pueda ver la publicación/historia/
 *                    mensaje/borrador que la referencia, y al propietario de
 *                    la generación de IA que la produjo.
 *   music            al propietario de la subida, a cualquiera si la pista
 *                    está publicada en el catálogo (`MusicTrack.publicada`), o
 *                    a quien pueda ver una publicación que la lleva en su
 *                    receta (`media.music.url`).
 *   voices           ídem con `Voice.lista` y `media.edit.voz.url`.
 *
 * Fail-closed cuando falta la base o hay un error inesperado: en ese caso
 * se responde 503 reintentable, nunca se sirven bytes sin autorización.
 */

const AVATARS_AND_COVERS = /^\/uploads\/(?:avatars|covers)\//;
const MEDIA_PATH = /^\/uploads\/media\//;
const MUSIC_PATH = /^\/uploads\/music\//;
const VOICES_PATH = /^\/uploads\/voices\//;

function cache(res, isPublic) {
  res.locals.mediaCacheControl = isPublic
    ? "public, max-age=604800"
    : "private, no-store";
  res.setHeader("Vary", "Cookie");
}

/**
 * Respuesta de denegación.
 *
 * Mismo contrato JSON que server.js usa para el resto de rutas desconocidas:
 * sin cuerpo ni content-type, un 404 a secas rompe el contrato del servicio
 * (KRONOS-AUDIT-004) y el cliente recibe null al leer el error.
 *
 * El estado distingue dos verdades distintas, y no es un detalle cosmético:
 * un 404 dice "este archivo no existe" y el navegador y las cachés lo
 * retienen; un 503 dice "ahora no puedo comprobarlo" y se puede reintentar.
 * Responder 404 con la base caída envenenaría la caché del cliente contra
 * archivos que siguen ahí.
 */
function deny(req, res, { status = 404, code = "NOT_FOUND", error = "Recurso no encontrado" } = {}) {
  cache(res, false);
  return res.status(status).json({
    error,
    code,
    path: (req.originalUrl || req.url || mediaPath(req) || "").split("?")[0]
  });
}

/** No se puede decidir ahora mismo: la base no responde. Reintentable. */
function unavailable(req, res) {
  return deny(req, res, {
    status: 503,
    code: "MEDIA_UNAVAILABLE",
    error: "No se pudo comprobar el acceso al archivo en este momento"
  });
}

/**
 * Decodifica la URL ANTES de clasificarla como pública o privada. Un escape
 * ilegible, un segmento de traversal, una barra invertida o un byte nulo no
 * pueden pasar de /uploads/avatars a /uploads/media al llegar a express.static.
 */
function mediaPath(req) {
  const raw = `${req.baseUrl || ""}${req.path || ""}`.split("?")[0];
  let decoded;

  try {
    decoded = decodeURIComponent(raw);
  } catch {
    return null;
  }

  if (decoded.includes("\0") || decoded.includes("\\") ||
      decoded.split("/").some((segment) => segment === "." || segment === "..")) {
    return null;
  }

  return decoded;
}

/** ¿Se puede consultar la base ahora mismo? */
function connected() {
  return mongoose.connection.readyState === 1 && Boolean(mongoose.connection.db);
}

async function uploadOwner(url) {
  try {
    if (!connected()) {
      return null;
    }

    const filename = url.replace(/^\/uploads\//, "");

    const file = await mongoose.connection.db
      .collection("kronosUploads.files")
      .findOne({ filename });

    return file?.metadata?.ownerId
      ? String(file.metadata.ownerId)
      : null;
  } catch (error) {
    // No es un error de autorización: es que no se pudo saber. Se registra y
    // se sigue — las referencias (post, catálogo) todavía pueden autorizar.
    console.error("MEDIA_ACL_OWNER_LOOKUP_ERROR", {
      name: error?.name || "Error",
      message: error?.message || ""
    });
    return null;
  }
}

/** Todas las referencias cuentan: la primera puede ser privada y otra pública. */
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

async function catalogMusicFor(url) {
  const MusicTrack = require("../modules/music/MusicTrack");

  return MusicTrack.findOne({ url, publicada: true }).select("_id").lean();
}

async function catalogVoiceFor(url) {
  const Voice = require("../modules/voices/Voice");

  return Voice.findOne({ url, lista: true }).select("_id").lean();
}

async function audioPostsFor(url, field) {
  const Post = require("../modules/posts/Post");

  return Post.find({ [field]: url }).lean();
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

/**
 * Visibilidad de una publicación para el espectador, traducida a política de
 * caché. Una publicación pública se sirve con caché pública incluso al
 * anónimo; cualquier otra audiencia exige espectador y se sirve sin caché
 * compartida. Devuelve `null` cuando el documento no autoriza a este
 * espectador, para que el llamador siga probando otras referencias.
 */
async function postCachePolicy(post, viewerId) {
  if (!post) return null;

  const isPublic = (post?.audience?.type || "public") === "public";

  if (isPublic && !viewerId) return { isPublic: true };

  if (viewerId && await canViewPost(post, viewerId)) {
    return { isPublic };
  }

  return null;
}

async function firstAuthorizedPost(posts, viewerId) {
  for (const post of posts) {
    const policy = await postCachePolicy(post, viewerId);
    if (policy) return policy;
  }
  return null;
}

async function mediaAcl(req, res, next) {
  const url = mediaPath(req);

  if (url === null) {
    return deny(req, res);
  }

  // Avatares y portadas: públicos por diseño, sin consultar la base.
  if (AVATARS_AND_COVERS.test(url)) {
    cache(res, true);
    return next();
  }

  const isMedia = MEDIA_PATH.test(url);
  const isMusic = MUSIC_PATH.test(url);
  const isVoices = VOICES_PATH.test(url);

  // Nada fuera de las cinco carpetas declaradas en storage.js.
  if (!isMedia && !isMusic && !isVoices) {
    return deny(req, res);
  }

  // Sin base de datos no se puede comprobar ninguna referencia: se responde de
  // inmediato en lugar de dejar las consultas en el buffer de Mongoose (10 s
  // por operación) y retener la conexión. Es el mismo criterio que server.js
  // aplica al evento `live:join`. Fail-closed: sin poder comprobar, no se sirve.
  if (!connected()) {
    return unavailable(req, res);
  }

  try {
    const auth = await readMediaAuth(req);
    const viewerId = auth?.user?.id || null;

    // Propietario de la subida (metadata de GridFS). Vale igual para media,
    // música y voces: las tres se guardan con `ownerId` en `saveBuffer`.
    const ownerId = await uploadOwner(url);

    if (viewerId && ownerId && String(ownerId) === String(viewerId)) {
      cache(res, false);
      return next();
    }

    if (isMedia) {
      const policy = await firstAuthorizedPost(await postsFor(url), viewerId);
      if (policy) {
        cache(res, policy.isPublic);
        return next();
      }

      for (const story of await storiesFor(url)) {
        const expired = story.expiresAt && new Date(story.expiresAt).getTime() <= Date.now();
        if (expired) continue;
        if (await postCachePolicy(story, viewerId)) {
          // Las historias caducan: incluso las públicas no se guardan una semana.
          cache(res, false);
          return next();
        }
      }

      if (viewerId) {
        for (const message of await messagesFor(url)) {
          if (await canViewMessage(message, viewerId)) {
            cache(res, false);
            return next();
          }
        }

        if ((await draftsFor(url)).some((draft) => String(draft.author) === String(viewerId))) {
          cache(res, false);
          return next();
        }

        // Generaciones de IA: solo su propietario.
        if ((await generationsFor(url)).some((generation) => String(generation.user) === String(viewerId))) {
          cache(res, false);
          return next();
        }
      }

      return deny(req, res);
    }

    // Música y voces: catálogo publicado, o una publicación visible que la
    // lleve en su receta. El propietario ya quedó resuelto arriba.
    const isCatalog = isMusic
      ? await catalogMusicFor(url)
      : await catalogVoiceFor(url);

    if (isCatalog) {
      cache(res, true);
      return next();
    }

    const audioPolicy = await firstAuthorizedPost(
      await audioPostsFor(url, isMusic ? "media.music.url" : "media.edit.voz.url"),
      viewerId
    );

    if (audioPolicy) {
      cache(res, audioPolicy.isPublic);
      return next();
    }

    return deny(req, res);
  } catch (error) {
    // Un fallo al decidir no es un permiso. Se registra con la ruta (sin
    // query) y se responde 503 reintentable, sin exponer el archivo.
    console.error("MEDIA_ACL_ERROR", {
      path: (req.originalUrl || req.url || "").split("?")[0],
      name: error?.name || "Error",
      message: error?.message || ""
    });
    return unavailable(req, res);
  }
}

module.exports = { mediaAcl };
module.exports.mediaPath = mediaPath;
