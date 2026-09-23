const express = require("express");
const auth = require("../../middleware/auth");
const { requireUser } = require("../../middleware/permissions");
const aiLimiter = require("../../middleware/aiLimiter");
const { handleUpload } = require("../../middleware/upload");
const imageService = require("./image.service");
const ImageGeneration = require("./ImageGeneration");
const {
  getAIErrorResponse
} = require("../../middleware/aiError");

const router = express.Router();

router.get(
  "/history",
  auth,
  requireUser,
  async (req, res) => {
    try {
      const generations = await ImageGeneration.find({
        user: req.user.id
      })
        .sort({ createdAt: -1 })
        .limit(100)
        .lean();

      return res.json({
        generations
      });
    } catch (error) {
      console.error(
        "IMAGE_HISTORY_ERROR:",
        error
      );

      return res.status(500).json({
        error:
          "No se pudo cargar el historial de imágenes"
      });
    }
  }
);

router.post(
  "/generate",
  auth,
  requireUser,
  aiLimiter,
  async (req, res) => {
    try {
      const { prompt, negativePrompt = "", style = "cinematic" } = req.body;

      if (
        typeof prompt !== "string" ||
        !prompt.trim()
      ) {
        return res.status(400).json({
          error: "El prompt es obligatorio"
        });
      }

      if (prompt.length > 4000) {
        return res.status(400).json({
          error:
            "El prompt no puede superar 4000 caracteres"
        });
      }

      const allowedStyles = ["cinematic", "editorial", "concept-art", "photorealistic"];
      if (typeof negativePrompt !== "string" || negativePrompt.trim().length > 2000) {
        return res.status(400).json({ error: "El negative prompt no puede superar 2000 caracteres" });
      }
      if (typeof style !== "string" || !allowedStyles.includes(style.trim())) {
        return res.status(400).json({ error: "El estilo de imagen no es válido" });
      }

      const result =
        await imageService.generateImage({
          prompt: prompt.trim(),
          negativePrompt: negativePrompt.trim(),
          style: style.trim(),
          userId: req.user.id
        });

      return res.status(200).json(result);
    } catch (error) {
      console.error(
        "IMAGE_GENERATION_ERROR:",
        error
      );

      const aiError =
        getAIErrorResponse(error);

      return res.status(aiError.status).json({
        error: aiError.message,
        code: aiError.code
      });
    }
  }
);

router.post(
    "/upload",
  auth,
  requireUser,
  aiLimiter,
  handleUpload("image"),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({
          error: "La imagen es obligatoria"
        });
      }

      const result =
        await imageService.uploadImage({
          file: req.file,
          userId: req.user.id
        });

      return res.status(201).json(result);
    } catch (error) {
      console.error(
        "IMAGE_UPLOAD_ERROR:",
        error
      );

      const aiError =
        getAIErrorResponse(error);

      return res.status(aiError.status).json({
        error: aiError.message,
        code: aiError.code
      });
    }
  }
);

router.delete(
  "/:id",
  auth,
  requireUser,
  async (req, res) => {
    try {
      const generation =
        await ImageGeneration.findOneAndDelete({
          _id: req.params.id,
          user: req.user.id
        });

      if (!generation) {
        return res.status(404).json({
          error: "Imagen no encontrada"
        });
      }

      return res.json({
        deleted: true
      });
    } catch (error) {
      console.error(
        "IMAGE_DELETE_ERROR:",
        error
      );

      return res.status(500).json({
        error:
          "No se pudo eliminar la imagen"
      });
    }
  }
);

module.exports = router;
