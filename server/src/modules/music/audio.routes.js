const express = require("express");

const auth = require("../../middleware/auth");
const { requireUser } = require("../../middleware/permissions");
const { handleAudioUpload } = require("../../middleware/upload");
const { saveBuffer } = require("../../config/storage");

const router = express.Router();

/* ============================================================
   SUBIDA DE AUDIO PROPIO

   POST /api/uploads/audio — el usuario sube su propia pista para usarla en
   el estudio. No entra al catálogo: se guarda en su almacén y vuelve la URL
   para pegarla en la receta de la publicación.

   Campo `audio`: MP3, M4A, AAC, WAV, OGG, Opus o WebM, hasta 15 MB, con
   firma de contenido verificada en el middleware (no se acepta un archivo
   por su nombre).

   Campo `destino`: "musica" (por defecto) para la música de fondo, o "voz"
   para una toma de voz en off. Cada uno va a su propia carpeta; el almacén
   no acepta una carpeta fuera de las declaradas.
   ============================================================ */

router.post("/audio", auth, requireUser, handleAudioUpload("audio"), async (req, res) => {
  try {
    if (!req.file?.buffer) {
      return res.status(400).json({ error: "No se recibió ningún archivo de audio" });
    }

    const destino = req.body?.destino === "voz" ? "voz" : "musica";
    const { url, size } = await saveBuffer({
      buffer: req.file.buffer,
      mimetype: req.file.mimetype,
      originalname: req.file.originalname,
      subdir: destino === "voz" ? "voices" : "music",
      ownerId: req.user?.id || null
    });

    return res.status(201).json({
      url,
      destino,
      tipo: "propia",
      mimeType: req.file.mimetype,
      size
    });
  } catch (error) {
    console.error("UPLOAD_AUDIO_ERROR:", error);
    return res.status(500).json({ error: "Error subiendo el audio" });
  }
});

module.exports = router;
