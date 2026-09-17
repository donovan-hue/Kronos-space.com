const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const ROOT_UPLOADS = path.join(__dirname, "../../uploads");
const MEDIA_DIR = path.join(ROOT_UPLOADS, "media");
const AVATAR_DIR = path.join(ROOT_UPLOADS, "avatars");
const COVER_DIR = path.join(ROOT_UPLOADS, "covers");

const SUBDIRS = {
  media: MEDIA_DIR,
  avatars: AVATAR_DIR,
  covers: COVER_DIR
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
  return "bin";
}

function saveBuffer({ buffer, mimetype, originalname, subdir = "media" }) {
  const baseDir = resolveSubdir(subdir);
  ensureDir(baseDir);
  const ext = extFromMime(mimetype) || path.extname(originalname || "").replace(".", "") || "jpg";
  const name = `${Date.now()}-${crypto.randomBytes(6).toString("hex")}.${ext}`;
  const filePath = path.join(baseDir, name);
  fs.writeFileSync(filePath, buffer);
  const publicUrl = `/uploads/${Object.keys(SUBDIRS).find((key) => SUBDIRS[key] === baseDir) || "media"}/${name}`;
  return { filePath, url: publicUrl, size: buffer.length };
}

function getUploadsRoot() {
  return ROOT_UPLOADS;
}

module.exports = {
  saveBuffer,
  getUploadsRoot,
  resolveSubdir,
  MEDIA_DIR,
  AVATAR_DIR,
  COVER_DIR
};
