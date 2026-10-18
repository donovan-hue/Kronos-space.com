const multer = require("multer");

const MAX_IMAGE_SIZE = 10 * 1024 * 1024;
const MAX_VIDEO_SIZE = 50 * 1024 * 1024;
// La música del estudio: una pista completa en MP3 de 320 kbps pesa unos
// 2.4 MB por minuto, así que 15 MB dan para algo más de seis minutos sin
// abrir la puerta a archivos que nadie va a reproducir en el feed.
const MAX_AUDIO_SIZE = 15 * 1024 * 1024;

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

// Los formatos que el navegador reproduce sin conversión: MP3, M4A (AAC en
// contenedor MP4), AAC suelto, WAV, OGG y Opus dentro de OGG o WebM.
const audioMimeTypes = new Set([
  "audio/mpeg",
  "audio/mp4",
  "audio/x-m4a",
  "audio/aac",
  "audio/wav",
  "audio/x-wav",
  "audio/wave",
  "audio/ogg",
  "audio/opus",
  "audio/webm"
]);

const mediaMimeTypes = new Set([
  ...imageMimeTypes,
  ...videoMimeTypes
]);

/**
 * Imagen válida = firma del tipo declarado Y estructura completa.
 *
 * La firma sola deja pasar archivos truncados o corruptos con cabecera
 * correcta. Se exige además el final del formato:
 * - PNG: trailer IEND (chunk de fin, con su CRC conocido).
 * - JPEG: marcador EOI (FFD9) al final.
 * - WebP: el tamaño RIFF declarado coincide con el archivo.
 * Los videos siguen validándose solo por contenedor (ver nota en
 * hasValidVideoSignature).
 */
const PNG_IEND = Buffer.from([0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82]);

function hasValidImageSignature(file) {
  if (!file?.buffer || !imageMimeTypes.has(file.mimetype)) {
    return false;
  }

  const buffer = file.buffer;

  if (file.mimetype === "image/jpeg") {
    return (
      buffer.length >= 4 &&
      buffer[0] === 0xff &&
      buffer[1] === 0xd8 &&
      buffer[2] === 0xff &&
      buffer[buffer.length - 2] === 0xff &&
      buffer[buffer.length - 1] === 0xd9
    );
  }

  if (file.mimetype === "image/png") {
    return (
      buffer.length >= 8 + PNG_IEND.length &&
      buffer.subarray(0, 8).equals(
        Buffer.from([
          0x89, 0x50, 0x4e, 0x47,
          0x0d, 0x0a, 0x1a, 0x0a
        ])
      ) &&
      buffer.subarray(buffer.length - PNG_IEND.length).equals(PNG_IEND)
    );
  }

  return (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
    buffer.subarray(8, 12).toString("ascii") === "WEBP" &&
    buffer.readUInt32LE(4) === buffer.length - 8
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

/**
 * Firma real del audio: no se acepta un archivo por su nombre ni por la
 * cabecera que declare el cliente, sino por lo que empieza el contenido.
 * Cada familia tiene su marca:
 *   MP3  - ID3 (etiqueta) o sincronía de trama 0xFF Ex/Fx
 *   M4A/MP4 - caja `ftyp` en los bytes 4..8
 *   AAC  - cabecera ADTS: 0xFFF con capa 00
 *   WAV  - `RIFF` ... `WAVE`
 *   OGG/Opus - `OggS`
 *   WebM - marca EBML 1A 45 DF A3
 */
function hasValidAudioSignature(file) {
  if (!file?.buffer || !audioMimeTypes.has(file.mimetype)) {
    return false;
  }

  const buffer = file.buffer;
  const ascii = (desde, hasta) =>
    buffer.length >= hasta ? buffer.subarray(desde, hasta).toString("ascii") : "";

  if (file.mimetype === "audio/mpeg") {
    return (
      ascii(0, 3) === "ID3" ||
      (buffer.length >= 2 && buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0)
    );
  }

  if (file.mimetype === "audio/mp4" || file.mimetype === "audio/x-m4a") {
    return ascii(4, 8) === "ftyp";
  }

  if (file.mimetype === "audio/aac") {
    return buffer.length >= 2 && buffer[0] === 0xff && (buffer[1] & 0xf6) === 0xf0;
  }

  if (file.mimetype === "audio/wav" || file.mimetype === "audio/x-wav" || file.mimetype === "audio/wave") {
    return ascii(0, 4) === "RIFF" && ascii(8, 12) === "WAVE";
  }

  if (file.mimetype === "audio/ogg" || file.mimetype === "audio/opus") {
    return ascii(0, 4) === "OggS";
  }

  if (file.mimetype === "audio/webm") {
    return (
      buffer.length >= 4 &&
      buffer[0] === 0x1a &&
      buffer[1] === 0x45 &&
      buffer[2] === 0xdf &&
      buffer[3] === 0xa3
    );
  }

  return false;
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

/**
 * Subida de audio (campo `audio`): una sola pista, firma verificada y tope
 * de 15 MB. Se usa para la música del estudio: pista propia o pista que se
 * publica al catálogo.
 */
function handleAudioUpload(fieldName) {
  return runUpload({
    fieldName,
    upload: createMulter({ allowedMimeTypes: audioMimeTypes, maxFileSize: MAX_AUDIO_SIZE, unsupportedCode: "UNSUPPORTED_AUDIO_TYPE" }),
    unsupportedCode: "UNSUPPORTED_AUDIO_TYPE",
    unsupportedMessage: "Formato de audio no permitido. Usa MP3, M4A, AAC, WAV, OGG o WebM.",
    signatureCheck: hasValidAudioSignature,
    mismatchMessage: "El contenido del archivo no coincide con su formato de audio"
  });
}

module.exports = {
  handleUpload,
  handleMediaUpload,
  handleAudioUpload,
  hasValidImageSignature,
  hasValidVideoSignature,
  hasValidAudioSignature,
  imageMimeTypes,
  videoMimeTypes,
  audioMimeTypes,
  MAX_AUDIO_SIZE
};
