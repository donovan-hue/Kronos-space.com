/**
 * KRONOS-UI-019/021 — validación compartida del contenido de
 * mensajes (1-a-1 y grupos). Un solo punto de validación para que
 * ambos contratos no diverjan.
 */
const MAX_MEDIA_SIZE = 10 * 1024 * 1024;
const ALLOWED_MEDIA_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

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

  if (!ALLOWED_MEDIA_TYPES.has(mimeType)) {
    return {
      value: null,
      error: "Formato de adjunto no permitido. Usa JPG, PNG o WebP."
    };
  }

  const size = Number(body.media.size);

  if (!Number.isFinite(size) || size <= 0 || size > MAX_MEDIA_SIZE) {
    return { value: null, error: "El tamaño del adjunto no es válido" };
  }

  const alt =
    typeof body.media.alt === "string" ? body.media.alt.trim().slice(0, 500) : "";

  return {
    value: { url, mimeType, size: Math.floor(size), alt },
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
  MEDIA_URL_PATTERN,
  ALLOWED_MEDIA_TYPES
};
