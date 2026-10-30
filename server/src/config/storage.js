const fs = require("fs");
const path = require("path");
const { rememberUpload } = require("./durableUploads");

const { CARPETAS, SAFE_NAME, extFromMime, nombreDeArchivo } = require("./uploadNaming");

const ROOT_UPLOADS = path.join(__dirname, "../../uploads");

// Las cinco carpetas y su orden salen de `uploadNaming`: son exactamente las
// que la copia durable en GridFS sabe reconocer. La música del estudio y la voz
// viven aparte del media del feed porque su catálogo se sirve distinto (pistas
// y tomas completas, no publicaciones).
const SUBDIRS = Object.fromEntries(CARPETAS.map((carpeta) => [carpeta, path.join(ROOT_UPLOADS, carpeta)]));

const MEDIA_DIR = SUBDIRS.media;
const AVATAR_DIR = SUBDIRS.avatars;
const COVER_DIR = SUBDIRS.covers;
const MUSIC_DIR = SUBDIRS.music;
const VOICES_DIR = SUBDIRS.voices;

/**
 * Resuelve el directorio de destino sin permitir rutas arbitrarias:
 * solo los subdirectorios declarados existen.
 */
function resolveSubdir(subdir) {
  const key = typeof subdir === "string" ? subdir.trim() : "";

  return SUBDIRS[key] || MEDIA_DIR;
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

async function saveBuffer({ buffer, mimetype, originalname, subdir = "media", ownerId = null }) {
  const baseDir = resolveSubdir(subdir);
  ensureDir(baseDir);
  const ext = extFromMime(mimetype) || path.extname(originalname || "").replace(".", "") || "jpg";
  const name = nombreDeArchivo(ext);
  const filePath = path.join(baseDir, name);
  fs.writeFileSync(filePath, buffer);
  const publicUrl = `/uploads/${Object.keys(SUBDIRS).find((key) => SUBDIRS[key] === baseDir) || "media"}/${name}`;
  // Copia en GridFS: el disco del proceso no sobrevive a un redespliegue.
  // La ruta espera hasta que la copia termina para no anunciar un upload
  // durable antes de que exista realmente.
  try {
    await rememberUpload({ url: publicUrl, buffer, mimetype, ownerId });
  } catch (error) {
    try {
      fs.unlinkSync(filePath);
    } catch (cleanupError) {
      console.error("UPLOAD_LOCAL_CLEANUP_ERROR", cleanupError.message);
    }
    throw error;
  }
  return { filePath, url: publicUrl, size: buffer.length };
}

function respondUploadError(res, error, fallbackMessage) {
  if (error?.code === "UPLOAD_STORAGE_UNAVAILABLE" || error?.statusCode === 503) {
    return res.status(503).json({
      error: "El almacenamiento de archivos no está disponible",
      code: "UPLOAD_STORAGE_UNAVAILABLE"
    });
  }
  return res.status(500).json({ error: fallbackMessage });
}

module.exports = {
  saveBuffer,
  respondUploadError,
  resolveSubdir,
  // Exportados para que `media-acl.contract.test.js` pueda enumerar todas las
  // combinaciones reales (carpeta × mimetype) y comprobar que
  // `durableUploads.SAFE_NAME` las acepta a todas. `extFromMime` y `SUBDIRS` no
  // se definen aquí: vienen de `uploadNaming`, la misma tabla de la que sale la
  // regex, así que las pruebas comparan identidades y no dos listas copiadas.
  extFromMime,
  SAFE_NAME,
  SUBDIRS,
  MEDIA_DIR,
  AVATAR_DIR,
  COVER_DIR,
  MUSIC_DIR,
  VOICES_DIR
};
