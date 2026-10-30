/**
 * Nomenclatura de los archivos subidos: una sola tabla para quien escribe el
 * nombre y para quien lo valida.
 *
 * El motivo es un fallo concreto y silencioso. `config/storage.js` genera
 * `<carpeta>/<timestamp>-<hex}.{ext}` y `config/durableUploads.js` decidía qué
 * nombres eran suyos con una regex escrita a mano encima del mismo formato.
 * Cuando `storage.js` aprendió `music`/`voices` y el audio, la regex no se
 * enteró: en producción `rememberUpload` respondía 503, `saveBuffer` borraba el
 * archivo local y la subida entera fallaba —o peor, se daba por buena sin copia
 * durable si el entorno no era prod—. Mientras el formato se copie y se valide
 * desde dos listas distintas, el accidente puede volver.
 *
 * Así que el formato vive aquí: `CARPETAS` y `EXTENSION_POR_MIME` son la fuente
 * y `SAFE_NAME` se construye a partir de ellas. `storage.js` nombra con estas
 * mismas funciones y reexporta `extFromMime`, de modo que la regex no puede
 * quedar por detrás de lo que el almacenamiento genera: son el mismo dato.
 */

const crypto = require("crypto");

/** Subdirectorios de `server/uploads` que el almacenamiento conoce. */
const CARPETAS = ["media", "avatars", "covers", "music", "voices"];

/**
 * Extensión según el formato real del archivo. El nombre original se ignora a
 * propósito: lo que se escribe en disco y en GridFS es lo que el mimetype
 * declara ser.
 */
const EXTENSION_POR_MIME = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "video/mp4": "mp4",
  "video/webm": "webm",
  "video/quicktime": "mov",
  // Audio: la extensión sale del formato, no del nombre original.
  "audio/mpeg": "mp3",
  "audio/mp4": "m4a",
  "audio/x-m4a": "m4a",
  "audio/aac": "aac",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "audio/wave": "wav",
  "audio/ogg": "ogg",
  "audio/opus": "opus",
  "audio/webm": "weba"
};

/** Lo que no se reconoce se guarda igual, con una extensión neutral. */
const EXTENSION_POR_DEFECTO = "bin";

function extFromMime(mime) {
  return EXTENSION_POR_MIME[mime] || EXTENSION_POR_DEFECTO;
}

/** Cada extensión que este módulo sabe producir, sin duplicados. */
const EXTENSIONES = [...new Set(Object.values(EXTENSION_POR_MIME).concat(EXTENSION_POR_DEFECTO))];

/**
 * Nombre generado por el almacenamiento: `<timestamp>-<hex de 6 bytes>.<ext>`.
 * La firma (dígitos + hex minúsculo) es lo que permite afirmar que un nombre
 * salió de aquí y no de un usuario.
 */
function nombreDeArchivo(ext) {
  return `${Date.now()}-${crypto.randomBytes(6).toString("hex")}.${ext}`;
}

/**
 * Un nombre es del sistema si su carpeta está en `CARPETAS`, su firma es la de
 * `nombreDeArchivo` y su extensión está en `EXTENSIONES`.
 */
const SAFE_NAME = new RegExp(
  `^(?:${CARPETAS.join("|")})/\\d+-[a-f0-9]+\\.(?:${EXTENSIONES.join("|")})$`
);

module.exports = {
  CARPETAS,
  EXTENSIONES,
  EXTENSION_POR_DEFECTO,
  EXTENSION_POR_MIME,
  SAFE_NAME,
  extFromMime,
  nombreDeArchivo
};
