const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { rememberUpload } = require("./durableUploads");

const ROOT_UPLOADS = path.join(__dirname, "../../uploads");
const MEDIA_DIR = path.join(ROOT_UPLOADS, "media");
const AVATAR_DIR = path.join(ROOT_UPLOADS, "avatars");
const COVER_DIR = path.join(ROOT_UPLOADS, "covers");
// La música del estudio vive aparte del media del feed: son archivos largos
// y su catálogo se sirve distinto (pistas completas, no publicaciones).
const MUSIC_DIR = path.join(ROOT_UPLOADS, "music");
// La voz del estudio (grabada con el micrófono o generada por Kairos) también
// vive aparte: son tomas cortas con su propio catálogo de voces.
const VOICES_DIR = path.join(ROOT_UPLOADS, "voices");

const SUBDIRS = {
  media: MEDIA_DIR,
  avatars: AVATAR_DIR,
  covers: COVER_DIR,
  music: MUSIC_DIR,
  voices: VOICES_DIR
};

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

function extFromMime(mime) {
  if (mime === "image/jpeg") return "jpg";
  if (mime === "image/png") return "png";
  if (mime === "image/webp") return "webp";
  if (mime === "video/mp4") return "mp4";
  if (mime === "video/webm") return "webm";
  if (mime === "video/quicktime") return "mov";
  // Audio: la extensión sale del formato real, no del nombre original.
  if (mime === "audio/mpeg") return "mp3";
  if (mime === "audio/mp4" || mime === "audio/x-m4a") return "m4a";
  if (mime === "audio/aac") return "aac";
  if (mime === "audio/wav" || mime === "audio/x-wav" || mime === "audio/wave") return "wav";
  if (mime === "audio/ogg") return "ogg";
  if (mime === "audio/opus") return "opus";
  if (mime === "audio/webm") return "weba";
  return "bin";
}

async function saveBuffer({ buffer, mimetype, originalname, subdir = "media", ownerId = null }) {
  const baseDir = resolveSubdir(subdir);
  ensureDir(baseDir);
  const ext = extFromMime(mimetype) || path.extname(originalname || "").replace(".", "") || "jpg";
  const name = `${Date.now()}-${crypto.randomBytes(6).toString("hex")}.${ext}`;
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

module.exports = {
  saveBuffer,
  resolveSubdir,
  MEDIA_DIR,
  AVATAR_DIR,
  COVER_DIR,
  MUSIC_DIR,
  VOICES_DIR
};
