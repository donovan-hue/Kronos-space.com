const mongoose = require("mongoose");

const imageGenerationSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true
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
      maxlength: 1000
    },
    style: {
      type: String,
      default: "cinematic",
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
      default: ""
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

module.exports = mongoose.model(
  "ImageGeneration",
  imageGenerationSchema
);
