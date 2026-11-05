const { saveBuffer } = require("../../config/storage");
const { fetchProviderResult } = require("../../config/aiResultDownload");

/**
 * Persistencia del video que devuelve el proveedor.
 *
 * POR QUÉ EXISTE
 *
 * Hasta ahora la generación guardaba `videoUrl` con la URL del proveedor y
 * nunca tocaba los bytes (`video.routes.js`, líneas 61 y 114). Dos
 * consecuencias: si el proveedor caduca la URL, la pieza del usuario
 * desaparece, y el video no tenía copia durable en GridFS como el resto de la
 * media (`config/storage.js`). Este módulo descarga el resultado con las
 * mismas guardas que la imagen (https público, sin redirecciones, tope leído
 * en streaming) y lo escribe en `/uploads/media` con `saveBuffer`, que además
 * deja la copia en GridFS.
 *
 * Decisiones:
 * - El formato se valida por firma de archivo, no por lo que diga la URL ni el
 *   `content-type`: el proveedor no es de confianza para decidir qué se sirve
 *   desde nuestro dominio.
 * - Si la descarga o el guardado fallan, el video NO se da por completado: se
 *   devuelve un error propio y la generación queda `failed` con su motivo. Un
 *   `videoUrl` de proveedor presentado como resultado duradero es peor que un
 *   fallo visible.
 * - Si el resultado ya es una URL nuestra (`/uploads/...`), no se descarga: ya
 *   está en el almacén.
 */

const MAX_VIDEO_BYTES = 200 * 1024 * 1024;
const VIDEO_DOWNLOAD_TIMEOUT_MS = 120_000;

const VIDEO_DOWNLOAD_CODES = {
  invalid: "VIDEO_RESULT_INVALID",
  unavailable: "VIDEO_RESULT_UNAVAILABLE",
  tooLarge: "VIDEO_RESULT_TOO_LARGE",
  timeout: "VIDEO_PROVIDER_TIMEOUT"
};

const MIME_VIDEO = "video/mp4";

/**
 * Firma real del contenedor.
 *
 * MP4 y MOV comparten `ftyp` (el `brand` distingue QuickTime), WebM/Matroska
 * empiezan por el EBML. Un GIF animado se acepta porque varios proveedores
 * devuelven eso como «video corto» y el navegador lo reproduce igual; se
 * guarda como `image/gif`, que es lo que realmente es.
 */
function detectVideoMime(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 12) return "";

  const box = buffer.subarray(4, 8).toString("ascii");
  if (box === "ftyp") {
    const brand = buffer.subarray(8, 12).toString("ascii");
    if (brand.startsWith("qt")) return "video/quicktime";
    return MIME_VIDEO;
  }

  if (buffer.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]))) {
    return "video/webm";
  }

  if (buffer.subarray(0, 6).toString("ascii") === "GIF87a" || buffer.subarray(0, 6).toString("ascii") === "GIF89a") {
    return "image/gif";
  }

  return "";
}

function isStoredUrl(url) {
  return typeof url === "string" && /^\/uploads\/(media|music|voices|covers|avatars)\/[A-Za-z0-9._-]+$/.test(url);
}

/**
 * Descarga y guarda el video del proveedor.
 *
 * Devuelve `{ url, size, mimetype, stored }`. `stored: true` significa que la
 * URL devuelta es nuestra y sobrevive a la caducidad del proveedor.
 */
async function persistProviderVideo({ url, userId, fetchImpl, lookup }) {
  if (typeof url !== "string" || !url.trim()) {
    throw new Error("VIDEO_RESULT_INVALID");
  }

  const sanitized = url.trim();

  if (isStoredUrl(sanitized)) {
    return { url: sanitized, size: 0, mimetype: "", stored: true, alreadyStored: true };
  }

  const decoded = await fetchProviderResult(sanitized, {
    maxBytes: MAX_VIDEO_BYTES,
    timeoutMs: VIDEO_DOWNLOAD_TIMEOUT_MS,
    codes: VIDEO_DOWNLOAD_CODES,
    validate: ensureVideoBuffer,
    // `fetchProviderResult` usa el `fetch` global y el DNS del sistema; ambos
    // se pueden inyectar para que una prueba no abra red ni dependa del DNS
    // del entorno de CI.
    ...(fetchImpl ? { fetchImpl } : {}),
    ...(lookup ? { lookup } : {})
  });

  const saved = await saveBuffer({
    buffer: decoded.buffer,
    mimetype: decoded.mimetype,
    originalname: `kairos-video.${decoded.mimetype.split("/")[1]}`,
    subdir: "media",
    ownerId: userId
  });

  return {
    url: saved.url,
    size: saved.size,
    mimetype: decoded.mimetype,
    stored: true
  };
}

function ensureVideoBuffer(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    throw new Error("VIDEO_RESULT_INVALID");
  }

  if (buffer.length > MAX_VIDEO_BYTES) {
    throw new Error("VIDEO_RESULT_TOO_LARGE");
  }

  const mimetype = detectVideoMime(buffer);
  if (!mimetype) throw new Error("VIDEO_RESULT_INVALID");

  return { buffer, mimetype };
}

module.exports = {
  MAX_VIDEO_BYTES,
  VIDEO_DOWNLOAD_TIMEOUT_MS,
  VIDEO_DOWNLOAD_CODES,
  detectVideoMime,
  ensureVideoBuffer,
  isStoredUrl,
  persistProviderVideo
};
