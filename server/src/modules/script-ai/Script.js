const mongoose = require("mongoose");

const scriptSchema = new mongoose.Schema(
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
    type: {
      type: String,
      enum: [
        "video",
        "reel",
        "youtube",
        "advertisement",
        "story",
        "presentation",
        "custom"
      ],
      default: "custom"
    },
    genre: {
      type: String,
      enum: [
        "general",
        "drama",
        "comedy",
        "thriller",
        "horror",
        "romance",
        "action",
        "documentary",
        "educational"
      ],
      default: "general"
    },
    format: {
      type: String,
      enum: [
        "standard",
        "cinematic",
        "vertical",
        "documentary",
        "podcast",
        "presentation"
      ],
      default: "standard"
    },
    durationMinutes: {
      type: Number,
      min: 1,
      max: 180,
      default: 5
    },
    tone: {
      type: String,
      trim: true,
      maxlength: 100,
      default: ""
    },
    audience: {
      type: String,
      trim: true,
      maxlength: 200,
      default: ""
    },
    provider: {
      type: String,
      default: "openrouter"
    },
    model: {
      type: String,
      default: "openrouter/free"
    },
    status: {
      type: String,
      enum: ["queued", "processing", "completed", "failed"],
      default: "queued",
      index: true
    },
    result: {
      type: String,
      default: ""
    },
    structure: {
      type: mongoose.Schema.Types.Mixed,
      default: null
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

// El historial de guiones siempre consulta por usuario y fecha.
scriptSchema.index({ user: 1, createdAt: -1 });

module.exports = mongoose.model("Script", scriptSchema);
