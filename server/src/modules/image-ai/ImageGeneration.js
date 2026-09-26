const mongoose = require("mongoose");

const imageGenerationSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },
    prompt: {
      type: String,
      required: true,
      maxlength: 10000
    },
    // BLOQUE 010 — controles de dirección creativa persistidos junto al prompt.
    negativePrompt: {
      type: String,
      default: "",
      trim: true,
      maxlength: 2000
    },
    style: {
      type: String,
      default: "cinematic",
      maxlength: 80,
      enum: ["cinematic", "editorial", "concept-art", "photorealistic"]
    },
    model: {
      type: String,
      default: "gpt-image-1"
    },
    provider: {
      type: String,
      default: "openrouter"
    },
    status: {
      type: String,
      enum: ["queued", "processing", "completed", "failed"],
      default: "queued"
    },
    imageUrl: {
      type: String,
      default: "",
      maxlength: 2000
    },
    error: {
      type: String,
      default: ""
    }
  },
  {
    timestamps: true
  }
);

// El historial de Kairos siempre consulta por usuario y fecha.
imageGenerationSchema.index({ user: 1, createdAt: -1 });

module.exports = mongoose.model(
  "ImageGeneration",
  imageGenerationSchema
);
