const mongoose = require("mongoose");

/**
 * Copia durable de los archivos subidos.
 *
 * El disco del proceso (Render y cualquier contenedor) se pierde en cada
 * despliegue. La URL pública sigue siendo `/uploads/...`; si el archivo ya
 * no está en disco, se sirve desde GridFS en el mismo MongoDB de la app.
 * Sin una segunda credencial y sin cambiar el contrato del cliente.
 */

const BUCKET = "kronosUploads";
const SAFE_NAME = /^(media|avatars|covers)\/\d+-[a-f0-9]+\.(jpg|png|webp|mp4|webm|mov|bin)$/;

function filenameOf(url) {
  return String(url || "").replace(/^\/uploads\//, "").replace(/^\/+/, "");
}

function bucket() {
  if (mongoose.connection.readyState !== 1 || !mongoose.connection.db) return null;

  return new mongoose.mongo.GridFSBucket(mongoose.connection.db, { bucketName: BUCKET });
}

/**
 * Guarda una copia y no resuelve hasta que GridFS confirma el `finish`.
 *
 * En los tests aislados y en herramientas locales puede no existir una
 * conexión Mongo; en ese caso el archivo local sigue siendo la fuente
 * disponible. El servidor de producción conecta Mongo antes de aceptar
 * tráfico, por lo que una subida real espera aquí la copia durable y propaga
 * cualquier error al endpoint.
 */
function rememberUpload({ url, buffer, mimetype }) {
  const filename = filenameOf(url);
  const store = bucket();

  if (!store || !Buffer.isBuffer(buffer) || !SAFE_NAME.test(filename)) {
    if (process.env.NODE_ENV === "production") {
      const error = new Error("UPLOAD_STORAGE_UNAVAILABLE");
      error.code = "UPLOAD_STORAGE_UNAVAILABLE";
      error.statusCode = 503;
      return Promise.reject(error);
    }
    return Promise.resolve({ durable: false });
  }

  return new Promise((resolve, reject) => {
    const stream = store.openUploadStream(filename, {
      contentType: mimetype || "application/octet-stream"
    });

    stream.once("error", (error) => {
      console.error("UPLOAD_PERSIST_ERROR", { filename, message: error?.message || "error" });
      reject(error);
    });
    stream.once("finish", () => resolve({ durable: true, filename }));
    stream.end(buffer);
  });
}

function serveDurableUpload(req, res, next) {
  const filename = filenameOf(req.path);

  if (req.method !== "GET" && req.method !== "HEAD") return next();
  if (!SAFE_NAME.test(filename)) return next();

  const store = bucket();

  if (!store) return next();

  store.find({ filename }).sort({ uploadDate: -1 }).limit(1).toArray()
    .then((files) => {
      const file = files[0];

      if (!file) return next();
      if (res.headersSent) return undefined;

      const size = file.length;
      const type = file.contentType || "application/octet-stream";

      res.setHeader("Content-Type", type);
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.setHeader("Cache-Control", "public, max-age=604800");
      res.setHeader("Accept-Ranges", "bytes");

      if (req.method === "HEAD") {
        res.setHeader("Content-Length", size);
        return res.end();
      }

      const range = typeof req.headers.range === "string" ? req.headers.range : "";
      const match = /^bytes=(\d*)-(\d*)$/.exec(range);

      if (range && !match) {
        res.setHeader("Content-Range", `bytes */${size}`);
        return res.status(416).end();
      }

      if (match) {
        const start = match[1] ? Number.parseInt(match[1], 10) : 0;
        const end = match[2] ? Number.parseInt(match[2], 10) : size - 1;

        if (!Number.isInteger(start) || !Number.isInteger(end) || start > end || start >= size || end >= size) {
          res.setHeader("Content-Range", `bytes */${size}`);
          return res.status(416).end();
        }

        res.status(206);
        res.setHeader("Content-Range", `bytes ${start}-${end}/${size}`);
        res.setHeader("Content-Length", end - start + 1);
        store.openDownloadStream(file._id, { start, end: end + 1 }).on("error", () => {
          if (!res.headersSent) res.status(404).end();
        }).pipe(res);
        return undefined;
      }

      res.setHeader("Content-Length", size);
      store.openDownloadStream(file._id).on("error", () => {
        if (!res.headersSent) res.status(404).end();
      }).pipe(res);
      return undefined;
    })
    .catch((error) => {
      console.error("UPLOAD_READ_ERROR", { filename, message: error?.message || "error" });
      next();
    });
}

module.exports = {
  SAFE_NAME,
  filenameOf,
  rememberUpload,
  serveDurableUpload
};
