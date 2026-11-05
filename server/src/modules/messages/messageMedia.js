/**
 * KRONOS-UI-019/021 — validación compartida del contenido de
 * mensajes (1-a-1 y grupos). Un solo punto de validación para que
 * ambos contratos no diverjan.
 *
 * Los adjuntos admiten ahora video y audio además de imagen (los mismos
 * formatos que el pipeline de subida ya acepta para publicaciones y música),
 * porque el chat solo dejaba mandar fotos. El límite depende del tipo, igual
 * que en `POST /api/posts/media/upload`.
 */
const MAX_IMAGE_SIZE = 10 * 1024 * 1024;
const MAX_VIDEO_SIZE = 50 * 1024 * 1024;
const MAX_AUDIO_SIZE = 15 * 1024 * 1024;

const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
const VIDEO_TYPES = ["video/mp4", "video/webm", "video/quicktime"];
const AUDIO_TYPES = [
  "audio/mpeg",
  "audio/mp4",
  "audio/x-m4a",
  "audio/aac",
  "audio/wav",
  "audio/x-wav",
  "audio/ogg",
  "audio/opus",
  "audio/webm"
];

const ALLOWED_MEDIA_TYPES = new Set([...IMAGE_TYPES, ...VIDEO_TYPES, ...AUDIO_TYPES]);

const KIND_BY_MIME = new Map([
  ...IMAGE_TYPES.map((type) => [type, "image"]),
  ...VIDEO_TYPES.map((type) => [type, "video"]),
  ...AUDIO_TYPES.map((type) => [type, "audio"])
]);

const MAX_SIZE_BY_KIND = {
  image: MAX_IMAGE_SIZE,
  video: MAX_VIDEO_SIZE,
  audio: MAX_AUDIO_SIZE
};

/** `image | video | audio` para un MIME admitido, o "" si no lo es. */
function mediaKindOf(mimeType) {
  return KIND_BY_MIME.get(String(mimeType || "").trim().toLowerCase()) || "";
}

// Solo URLs producidas por el propio pipeline de upload (bloque AUDIT-005):
// nada de URLs arbitrarias ni de otros subdirectorios.
const MEDIA_URL_PATTERN = /^\/uploads\/media\/[A-Za-z0-9._-]+$/;

/**
 * Valida el adjunto que viaja en el body del mensaje.
 * Devuelve `{ value, error }`: `value` es `null` (sin media) o el
 * objeto normalizado `{ url, mimeType, size, alt }`.
 */
function parseMessageMedia(body = {}) {
  if (body.media === undefined || body.media === null) {
    return { value: null, error: null };
  }

  if (typeof body.media !== "object" || Array.isArray(body.media)) {
    return { value: null, error: "El adjunto debe ser un objeto de media" };
  }

  const url = typeof body.media.url === "string" ? body.media.url.trim() : "";

  if (!url) {
    return { value: null, error: "El adjunto necesita una URL de upload" };
  }

  if (!MEDIA_URL_PATTERN.test(url)) {
    return {
      value: null,
      error: "La URL del adjunto no proviene de /uploads/media"
    };
  }

  const mimeType =
    typeof body.media.mimeType === "string" ? body.media.mimeType.trim() : "";

  const kind = mediaKindOf(mimeType);

  if (!ALLOWED_MEDIA_TYPES.has(mimeType) || !kind) {
    return {
      value: null,
      error: "Formato de adjunto no permitido. Usa imagen JPG/PNG/WebP, video MP4/WebM/MOV o audio MP3/M4A/WAV/OGG."
    };
  }

  const size = Number(body.media.size);
  const maxSize = MAX_SIZE_BY_KIND[kind];

  if (!Number.isFinite(size) || size <= 0 || size > maxSize) {
    return {
      value: null,
      error: `El tamaño del adjunto no es válido para un archivo de tipo ${kind}`
    };
  }

  const alt =
    typeof body.media.alt === "string" ? body.media.alt.trim().slice(0, 500) : "";

  return {
    value: { url, mimeType, kind, size: Math.floor(size), alt },
    error: null
  };
}

/** KRONOS-UI-021 — id de reenvío idempotente generado por el cliente. */
function parseClientMessageId(body = {}) {
  if (body.clientMessageId === undefined || body.clientMessageId === null) {
    return { value: undefined, error: null };
  }

  if (typeof body.clientMessageId !== "string" || !body.clientMessageId.trim()) {
    return { value: undefined, error: "clientMessageId debe ser un texto" };
  }

  return { value: body.clientMessageId.trim().slice(0, 128), error: null };
}

module.exports = {
  parseMessageMedia,
  parseClientMessageId,
  mediaKindOf,
  MEDIA_URL_PATTERN,
  ALLOWED_MEDIA_TYPES,
  MAX_IMAGE_SIZE,
  MAX_VIDEO_SIZE,
  MAX_AUDIO_SIZE
};
