const express = require("express");
const mongoose = require("mongoose");
const auth = require("../../middleware/auth");
const { requireUser } = require("../../middleware/permissions");
const { aiLimiterFor } = require("../../middleware/aiLimiter");
const cuotaIA = require("../../middleware/cuotaIA");
const { handleUpload } = require("../../middleware/upload");
const imageService = require("./image.service");
const ImageGeneration = require("./ImageGeneration");
const {
  getAIErrorResponse
} = require("../../middleware/aiError");
const { recordUsage } = require("../ai-core/aiUsage.service");
const {
  ALLOWED_ASPECT_RATIOS,
  MAX_IMAGE_VARIATIONS,
  MAX_INPUT_REFERENCES,
  isAllowedAspectRatio
} = require("./image.capabilities");
const {
  ESTILOS,
  porCodigoEstilo,
  textoDeEstilo,
  estiloDesdePreset
} = require("../prompts/promptLibrary");
const PromptPreset = require("../prompts/PromptPreset");

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
  aiLimiterFor("image"), cuotaIA("image"),
  async (req, res) => {
    try {
      const {
        prompt,
        negativePrompt = "",
        style = "cinematic",
        estiloId = "",
        aspectRatio = "1:1",
        variations = 1,
        inputReferences = []
      } = req.body;

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

      if (typeof negativePrompt !== "string" || negativePrompt.trim().length > 2000) {
        return res.status(400).json({ error: "El negative prompt no puede superar 2000 caracteres" });
      }

      // Editar una imagen existente: las referencias tienen que ser del
      // almacén propio **y** de este usuario. Sin la segunda comprobación,
      // mandar la ruta de la imagen de otra persona la usaría como punto de
      // partida sin permiso.
      const referencias = inputReferences === undefined ? [] : inputReferences;
      if (!Array.isArray(referencias)) {
        return res.status(400).json({ error: "Las referencias deben ser una lista", code: "INVALID_INPUT_REFERENCES" });
      }
      if (referencias.length > MAX_INPUT_REFERENCES) {
        return res.status(400).json({
          error: `Puedes usar hasta ${MAX_INPUT_REFERENCES} imágenes como referencia.`,
          code: "TOO_MANY_INPUT_REFERENCES"
        });
      }
      const referenciasLimpias = [];
      for (const url of referencias) {
        const ruta = typeof url === "string" ? url.trim() : "";
        if (!ruta.startsWith("/uploads/")) {
          return res.status(400).json({
            error: "Solo puedes editar imágenes de tu propia biblioteca.",
            code: "INVALID_INPUT_REFERENCE"
          });
        }
        referenciasLimpias.push(ruta);
      }

      if (referenciasLimpias.length > 0) {
        const propias = await ImageGeneration.find({
          user: req.user.id,
          $or: [
            { imageUrl: { $in: referenciasLimpias } },
            { variants: { $in: referenciasLimpias } }
          ]
        }).select("imageUrl variants").lean();

        const permitidas = new Set();
        for (const generacion of propias) {
          if (generacion.imageUrl) permitidas.add(generacion.imageUrl);
          for (const variante of generacion.variants || []) permitidas.add(variante);
        }

        const ajenas = referenciasLimpias.filter((ruta) => !permitidas.has(ruta));
        if (ajenas.length) {
          return res.status(403).json({
            error: "Solo puedes editar imágenes de tu propia biblioteca.",
            code: "INPUT_REFERENCE_NOT_OWNED"
          });
        }
      }

      // Estilos: los del catálogo, o uno propio (`estiloId` de un preset del
      // usuario). Se resuelve aquí, en el servidor: el cliente no manda el
      // texto del estilo, solo su identificador, así no puede inyectar prosa
      // en el prompt por esa puerta.
      const estiloPedido = typeof style === "string" ? style.trim() : "";
      let styleText = textoDeEstilo(estiloPedido) || "";
      let estiloFinal = estiloPedido;

      if (estiloId) {
        if (!mongoose.Types.ObjectId.isValid(estiloId)) {
          return res.status(400).json({ error: "El estilo propio no es válido", code: "INVALID_IMAGE_STYLE" });
        }
        const preset = await PromptPreset.findOne({
          _id: estiloId,
          user: req.user.id,
          tipo: "estilo"
        }).lean();
        if (!preset) {
          return res.status(404).json({ error: "Ese estilo no existe", code: "STYLE_NOT_FOUND" });
        }
        const resuelto = estiloDesdePreset(preset);
        if (resuelto.error) {
          return res.status(400).json({ error: resuelto.error, code: resuelto.code });
        }
        estiloFinal = resuelto.estilo.codigo;
        styleText = resuelto.estilo.texto;
      }

      if (!porCodigoEstilo(estiloFinal) && !(estiloFinal.startsWith("user:") && styleText)) {
        return res.status(400).json({
          error: "El estilo de imagen no es válido",
          code: "INVALID_IMAGE_STYLE",
          estilos: ESTILOS.map((estilo) => estilo.codigo)
        });
      }

      if (!isAllowedAspectRatio(aspectRatio)) {
        return res.status(400).json({
          error: `El encuadre no es válido. Usa ${ALLOWED_ASPECT_RATIOS.join(", ")}.`,
          code: "INVALID_IMAGE_ASPECT_RATIO"
        });
      }

      const pedidas = variations === undefined ? 1 : Number(variations);
      if (
        !Number.isInteger(pedidas) ||
        pedidas < 1 ||
        pedidas > MAX_IMAGE_VARIATIONS
      ) {
        return res.status(400).json({
          error: `Las variaciones deben ser un entero entre 1 y ${MAX_IMAGE_VARIATIONS}.`,
          code: "INVALID_IMAGE_VARIATIONS"
        });
      }

      const result =
        await imageService.generateImage({
          prompt: prompt.trim(),
          negativePrompt: negativePrompt.trim(),
          style: estiloFinal,
          styleText,
          inputReferences: referenciasLimpias,
          aspectRatio,
          variations: pedidas,
          userId: req.user.id
        });

      // Las unidades son las imágenes guardadas de verdad, no las pedidas: si
      // el modelo devolvió una de tres, se imputa una.
      await recordUsage({
        userId: req.user.id,
        capability: "image",
        units: Number(result.variations) || 1
      });

      return res.status(200).json(result);
    } catch (error) {
      console.error(
        "IMAGE_GENERATION_ERROR:",
        error
      );

      const aiError =
        getAIErrorResponse(error);

      await recordUsage({
        userId: req.user?.id,
        capability: "image",
        units: 0,
        estado: "error",
        error: error?.message || "IMAGE_ERROR"
      });

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
  aiLimiterFor("image"), cuotaIA("image"),
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
