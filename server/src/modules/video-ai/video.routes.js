const express = require("express");
const mongoose = require("mongoose");
const VideoGeneration = require("./VideoGeneration");
const auth = require("../../middleware/auth");
const { requireUser } = require("../../middleware/permissions");
const aiLimiter = require("../../middleware/aiLimiter");
const { createVideoJob, pollVideoJob } = require("./video.service");
const { getAIErrorResponse } = require("../../middleware/aiError");
const { getAIProviderConfig } = require("../../config/aiProviders");

const router = express.Router();

function isValidId(value) {
  return mongoose.Types.ObjectId.isValid(value);
}

function controlsFromBody(body = {}) {
  return {
    prompt: body.prompt,
    negativePrompt: body.negativePrompt,
    style: body.style
  };
}

function publicGeneration(generation) {
  const value = generation.toObject ? generation.toObject() : generation;
  return {
    ...value,
    id: String(value._id || value.id),
    generationId: String(value._id || value.id)
  };
}

router.post("/generate", auth, requireUser, aiLimiter, async (req, res) => {
  let generation;

  try {
    const { prompt, negativePrompt = "", style = "" } = controlsFromBody(req.body);

    if (typeof prompt !== "string" || !prompt.trim()) {
      return res.status(400).json({ error: "El prompt es obligatorio", code: "INVALID_VIDEO_PROMPT" });
    }
    if (prompt.trim().length > 4000 || typeof negativePrompt !== "string" || negativePrompt.length > 2000 || typeof style !== "string" || style.length > 80) {
      return res.status(400).json({ error: "Los controles de video no tienen un formato válido", code: "INVALID_VIDEO_CONTROLS" });
    }

    const provider = getAIProviderConfig("video");
    generation = await VideoGeneration.create({
      user: req.user.id,
      prompt: prompt.trim(),
      negativePrompt: negativePrompt.trim(),
      style: style.trim(),
      provider: provider.provider,
      model: provider.model,
      status: "queued",
      progress: 0
    });

    const result = await createVideoJob({ prompt, negativePrompt, style });
    generation.status = result.status;
    generation.videoUrl = result.videoUrl || "";
    generation.providerJobId = result.providerJobId || "";
    generation.progress = result.progress || (result.status === "completed" ? 100 : 0);
    generation.error = "";
    await generation.save();

    return res.status(result.status === "completed" ? 201 : 202).json({
      generation: publicGeneration(generation),
      development: result.development || false,
      message: result.message || null
    });
  } catch (error) {
    console.error("VIDEO_GENERATION_ERROR:", error);

    if (generation) {
      generation.status = "failed";
      generation.error = error.message || "VIDEO_GENERATION_ERROR";
      await generation.save().catch((saveError) => console.error("VIDEO_GENERATION_SAVE_ERROR:", saveError));
    }

    const aiError = getAIErrorResponse(error);
    return res.status(aiError.status).json({ error: aiError.message, code: aiError.code });
  }
});

router.get("/history", auth, requireUser, async (req, res) => {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit) || 30, 1), 100);
    const generations = await VideoGeneration.find({ user: req.user.id })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    return res.json({ generations: generations.map(publicGeneration) });
  } catch (error) {
    console.error("VIDEO_HISTORY_ERROR:", error);
    return res.status(500).json({ error: "No se pudo cargar el historial de videos" });
  }
});

router.get("/:id/status", auth, requireUser, async (req, res) => {
  if (!isValidId(req.params.id)) return res.status(400).json({ error: "ID de generación inválido" });

  try {
    const generation = await VideoGeneration.findOne({ _id: req.params.id, user: req.user.id });
    if (!generation) return res.status(404).json({ error: "Generación no encontrada" });

    if (["queued", "processing"].includes(generation.status) && generation.providerJobId) {
      try {
        const providerResult = await pollVideoJob({ providerJobId: generation.providerJobId });
        if (providerResult) {
          generation.status = providerResult.status;
          generation.progress = providerResult.progress;
          if (providerResult.videoUrl) generation.videoUrl = providerResult.videoUrl;
          if (providerResult.status === "failed") generation.error = "VIDEO_PROVIDER_ERROR";
          await generation.save();
        }
      } catch (error) {
        const aiError = getAIErrorResponse(error);
        return res.status(aiError.status).json({ error: aiError.message, code: aiError.code });
      }
    }

    return res.json({ generation: publicGeneration(generation) });
  } catch (error) {
    console.error("VIDEO_STATUS_ERROR:", error);
    return res.status(500).json({ error: "No se pudo consultar el estado del video" });
  }
});

router.get("/:id", auth, requireUser, async (req, res) => {
  if (!isValidId(req.params.id)) return res.status(400).json({ error: "ID de generación inválido" });

  try {
    const generation = await VideoGeneration.findOne({ _id: req.params.id, user: req.user.id });
    if (!generation) return res.status(404).json({ error: "Generación no encontrada" });
    return res.json({ generation: publicGeneration(generation) });
  } catch (error) {
    console.error("VIDEO_GET_ERROR:", error);
    return res.status(500).json({ error: "No se pudo cargar la generación" });
  }
});

router.delete("/:id", auth, requireUser, async (req, res) => {
  if (!isValidId(req.params.id)) return res.status(400).json({ error: "ID de generación inválido" });

  try {
    const generation = await VideoGeneration.findOneAndDelete({ _id: req.params.id, user: req.user.id });
    if (!generation) return res.status(404).json({ error: "Generación no encontrada" });
    return res.json({ deleted: true, generationId: req.params.id });
  } catch (error) {
    console.error("VIDEO_DELETE_ERROR:", error);
    return res.status(500).json({ error: "No se pudo eliminar la generación" });
  }
});

module.exports = router;
