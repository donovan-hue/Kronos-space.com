const multer = require("multer");

const MAX_IMAGE_SIZE = 10 * 1024 * 1024;
const MAX_VIDEO_SIZE = 50 * 1024 * 1024;

const imageMimeTypes = new Set([
  "image/jpeg",
  "image/png",
  "image/webp"
]);

const videoMimeTypes = new Set([
  "video/mp4",
  "video/webm",
  "video/quicktime"
]);

const mediaMimeTypes = new Set([
  ...imageMimeTypes,
  ...videoMimeTypes
]);

function hasValidImageSignature(file) {
  if (!file?.buffer || !imageMimeTypes.has(file.mimetype)) {
    return false;
  }

  const buffer = file.buffer;

  if (file.mimetype === "image/jpeg") {
    return (
      buffer.length >= 3 &&
      buffer[0] === 0xff &&
      buffer[1] === 0xd8 &&
      buffer[2] === 0xff
    );
  }

  if (file.mimetype === "image/png") {
    return (
      buffer.length >= 8 &&
      buffer.subarray(0, 8).equals(
        Buffer.from([
          0x89, 0x50, 0x4e, 0x47,
          0x0d, 0x0a, 0x1a, 0x0a
        ])
      )
    );
  }

  return (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
    buffer.subarray(8, 12).toString("ascii") === "WEBP"
  );
}

function hasValidVideoSignature(file) {
  if (!file?.buffer || !videoMimeTypes.has(file.mimetype)) {
    return false;
  }

  const buffer = file.buffer;

  if (file.mimetype === "video/webm") {
    return (
      buffer.length >= 4 &&
      buffer[0] === 0x1a &&
      buffer[1] === 0x45 &&
      buffer[2] === 0xdf &&
      buffer[3] === 0xa3
    );
  }

  // MP4/MOV usan contenedor ISO BMFF: bytes 4..8 contienen `ftyp`.
  return buffer.length >= 12 && buffer.subarray(4, 8).toString("ascii") === "ftyp";
}

function createMulter({ allowedMimeTypes, maxFileSize, unsupportedCode }) {
  return multer({
    storage: multer.memoryStorage(),

    limits: {
      fileSize: maxFileSize,
      files: 1
    },

    fileFilter(req, file, callback) {
      if (!allowedMimeTypes.has(file.mimetype)) {
        return callback(new Error(unsupportedCode));
      }

      callback(null, true);
    }
  });
}

function runUpload({ fieldName, upload, unsupportedCode, unsupportedMessage, signatureCheck, mismatchMessage, sizeGuard }) {
  return (req, res, next) => {
    upload.single(fieldName)(req, res, (error) => {
      if (error instanceof multer.MulterError) {
        if (error.code === "LIMIT_FILE_SIZE") {
          return res.status(413).json({ error: "El archivo supera el límite permitido" });
        }

        return res.status(400).json({ error: "Error procesando el archivo" });
      }

      if (error) {
        if (error.message === unsupportedCode) {
          return res.status(400).json({ error: unsupportedMessage });
        }

        return next(error);
      }

      if (!req.file) return next();

      if (typeof sizeGuard === "function") {
        const guarded = sizeGuard(req.file);
        if (guarded) return res.status(guarded.status).json({ error: guarded.error });
      }

      if (!signatureCheck(req.file)) {
        return res.status(400).json({ error: mismatchMessage });
      }

      next();
    });
  };
}

function handleUpload(fieldName) {
  return runUpload({
    fieldName,
    upload: createMulter({ allowedMimeTypes: imageMimeTypes, maxFileSize: MAX_IMAGE_SIZE, unsupportedCode: "UNSUPPORTED_IMAGE_TYPE" }),
    unsupportedCode: "UNSUPPORTED_IMAGE_TYPE",
    unsupportedMessage: "Formato de imagen no permitido. Usa JPG, PNG o WebP.",
    signatureCheck: hasValidImageSignature,
    mismatchMessage: "El contenido del archivo no coincide con su formato"
  });
}

function handleMediaUpload(fieldName) {
  return runUpload({
    fieldName,
    upload: createMulter({ allowedMimeTypes: mediaMimeTypes, maxFileSize: MAX_VIDEO_SIZE, unsupportedCode: "UNSUPPORTED_MEDIA_TYPE" }),
    unsupportedCode: "UNSUPPORTED_MEDIA_TYPE",
    unsupportedMessage: "Formato no permitido. Usa imagen JPG/PNG/WebP o video MP4/WebM/MOV.",
    signatureCheck: (file) => imageMimeTypes.has(file.mimetype) ? hasValidImageSignature(file) : hasValidVideoSignature(file),
    mismatchMessage: "El contenido del archivo no coincide con su formato",
    sizeGuard: (file) => {
      if (imageMimeTypes.has(file.mimetype) && file.size > MAX_IMAGE_SIZE) {
        return { status: 413, error: "La imagen no puede superar 10 MB" };
      }
      if (videoMimeTypes.has(file.mimetype) && file.size > MAX_VIDEO_SIZE) {
        return { status: 413, error: "El video no puede superar 50 MB" };
      }
      return null;
    }
  });
}

module.exports = {
  handleUpload,
  handleMediaUpload,
  hasValidImageSignature,
  hasValidVideoSignature,
  imageMimeTypes,
  videoMimeTypes
};
