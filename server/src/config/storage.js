const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

/**
 * Almacenamiento de uploads.
 *
 * Modos (en orden):
 * 1. S3 compatible (R2/MinIO/AWS): si `S3_BUCKET` + credenciales están
 *    definidos, los archivos suben por streaming con PUT firmado (SigV4) y
 *    la URL pública sale de `S3_PUBLIC_BASE`. Recomendado en producción:
 *    el disco de Render es efímero y pierde los uploads en cada deploy.
 * 2. Disco local: `UPLOADS_DIR` (volumen persistente en producción) o
 *    `server/uploads/` por defecto. Servido por `GET /uploads/*`.
 */

function getUploadsRoot() {
  const configured = (process.env.UPLOADS_DIR || "").trim();
  if (configured) return path.resolve(configured);
  return path.join(__dirname, "../../uploads");
}

const ROOT_UPLOADS = getUploadsRoot();
const MEDIA_DIR = path.join(ROOT_UPLOADS, "media");
const AVATAR_DIR = path.join(ROOT_UPLOADS, "avatars");
const COVER_DIR = path.join(ROOT_UPLOADS, "covers");

const SUBDIRS = {
  media: MEDIA_DIR,
  avatars: AVATAR_DIR,
  covers: COVER_DIR
};

function isS3Configured() {
  return Boolean(
    (process.env.S3_BUCKET || "").trim() &&
    (process.env.S3_ACCESS_KEY || "").trim() &&
    (process.env.S3_SECRET_KEY || "").trim() &&
    (process.env.S3_ENDPOINT || "").trim()
  );
}

function describeStorage() {
  if (isS3Configured()) {
    return `s3 bucket=${process.env.S3_BUCKET} endpoint=${process.env.S3_ENDPOINT}`;
  }
  return `disco local dir=${ROOT_UPLOADS}`;
}

/**
 * Resuelve el directorio de destino sin permitir rutas arbitrarias:
 * solo los subdirectorios declarados existen.
 */
function resolveSubdir(subdir) {
  const key = typeof subdir === "string" ? subdir.trim() : "";

  return SUBDIRS[key] || MEDIA_DIR;
}

function subdirKeyFor(dir) {
  return Object.keys(SUBDIRS).find((key) => SUBDIRS[key] === dir) || "media";
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
  return "bin";
}

function buildFileName({ mimetype, originalname }) {
  const ext =
    extFromMime(mimetype) ||
    path.extname(originalname || "").replace(".", "") ||
    "jpg";
  return `${Date.now()}-${crypto.randomBytes(6).toString("hex")}.${ext}`;
}

function saveBuffer({ buffer, mimetype, originalname, subdir = "media" }) {
  const baseDir = resolveSubdir(subdir);
  ensureDir(baseDir);
  const name = buildFileName({ mimetype, originalname });
  const filePath = path.join(baseDir, name);
  fs.writeFileSync(filePath, buffer);
  const publicUrl = `/uploads/${subdirKeyFor(baseDir)}/${name}`;
  return { filePath, url: publicUrl, size: buffer.length };
}

// ---------- S3 compatible (PUT firmado SigV4, payload por streaming) ----------

function hmacSha256(key, data) {
  return crypto.createHmac("sha256", key).update(data).digest();
}

function sha256Hex(data) {
  return crypto.createHash("sha256").update(data).digest("hex");
}

function s3SigningKey(secret, dateStamp, region, service = "s3") {
  const kDate = hmacSha256(`AWS4${secret}`, dateStamp);
  const kRegion = hmacSha256(kDate, region);
  const kService = hmacSha256(kRegion, service);
  return hmacSha256(kService, "aws4_request");
}

/**
 * Sube un archivo local a S3 con `UNSIGNED-PAYLOAD` (el cuerpo viaja por
 * stream sin cargarse entero en memoria). Devuelve la URL pública.
 */
async function s3PutFile({ localPath, key, contentType, size }) {
  const endpoint = process.env.S3_ENDPOINT.replace(/\/+$/, "");
  const bucket = process.env.S3_BUCKET.trim();
  const region = (process.env.S3_REGION || "us-east-1").trim();
  const accessKey = process.env.S3_ACCESS_KEY.trim();
  const secretKey = process.env.S3_SECRET_KEY;
  const publicBase = (process.env.S3_PUBLIC_BASE || `${endpoint}/${bucket}`).replace(/\/+$/, "");

  const encodedKey = String(key).split("/").map(encodeURIComponent).join("/");
  const url = `${endpoint}/${bucket}/${encodedKey}`;
  const now = new Date();
  const amzDate = now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const dateStamp = amzDate.slice(0, 8);
  const host = new URL(endpoint).host;
  const payloadHash = "UNSIGNED-PAYLOAD";

  const canonicalHeaders =
    `content-length:${size}\n` +
    `content-type:${contentType}\n` +
    `host:${host}\n` +
    `x-amz-content-sha256:${payloadHash}\n` +
    `x-amz-date:${amzDate}\n`;
  const signedHeaders = "content-length;content-type;host;x-amz-content-sha256;x-amz-date";
  const canonicalRequest = [
    "PUT",
    `/${bucket}/${encodedKey}`,
    "",
    canonicalHeaders,
    signedHeaders,
    payloadHash
  ].join("\n");

  const scope = `${dateStamp}/${region}/s3/aws4_request`;
  const stringToSign = ["AWS4-HMAC-SHA256", amzDate, scope, sha256Hex(canonicalRequest)].join("\n");
  const signature = hmacSha256(s3SigningKey(secretKey, dateStamp, region), stringToSign).toString("hex");
  const authorization =
    `AWS4-HMAC-SHA256 Credential=${accessKey}/${scope}, ` +
    `SignedHeaders=${signedHeaders}, Signature=${signature}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 120_000);
  try {
    const response = await fetch(url, {
      method: "PUT",
      headers: {
        "Content-Type": contentType,
        "Content-Length": String(size),
        "X-Amz-Content-Sha256": payloadHash,
        "X-Amz-Date": amzDate,
        Authorization: authorization
      },
      body: fs.createReadStream(localPath),
      signal: controller.signal,
      duplex: "half"
    });
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(`S3_UPLOAD_FAILED http=${response.status} ${text.slice(0, 200)}`);
    }
  } finally {
    clearTimeout(timeout);
  }

  return `${publicBase}/${encodedKey}`;
}

/**
 * Persiste un archivo subido (multer diskStorage) sin cargarlo entero en RAM:
 * - S3 configurado → PUT por stream, devuelve URL pública absoluta.
 * - Disco local → `rename` al directorio final (con fallback copia+borra).
 * Siempre elimina el temporal de origen.
 */
async function saveUploadedFile({ tmpPath, mimetype, originalname, subdir = "media" }) {
  if (!tmpPath || !fs.existsSync(tmpPath)) {
    throw new Error("UPLOAD_TMP_MISSING");
  }
  const key = subdirKeyFor(resolveSubdir(subdir));
  const name = buildFileName({ mimetype, originalname });
  const size = fs.statSync(tmpPath).size;

  if (isS3Configured()) {
    try {
      const url = await s3PutFile({
        localPath: tmpPath,
        key: `${key}/${name}`,
        contentType: mimetype || "application/octet-stream",
        size
      });
      fs.rmSync(tmpPath, { force: true });
      return { filePath: "", url, size };
    } catch (error) {
      fs.rmSync(tmpPath, { force: true });
      throw error;
    }
  }

  const baseDir = resolveSubdir(subdir);
  ensureDir(baseDir);
  const filePath = path.join(baseDir, name);
  try {
    fs.renameSync(tmpPath, filePath);
  } catch (error) {
    // EXDEV (tmp y destino en distintos volúmenes): copia + borra.
    if (error.code !== "EXDEV") throw error;
    fs.copyFileSync(tmpPath, filePath);
    fs.rmSync(tmpPath, { force: true });
  }
  return { filePath, url: `/uploads/${key}/${name}`, size };
}

module.exports = {
  saveBuffer,
  saveUploadedFile,
  getUploadsRoot,
  resolveSubdir,
  describeStorage,
  isS3Configured,
  MEDIA_DIR,
  AVATAR_DIR,
  COVER_DIR
};
