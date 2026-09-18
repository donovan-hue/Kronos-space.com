const mongoose = require("mongoose");

const videoGenerationSchema = new mongoose.Schema(
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
    negativePrompt: {
      type: String,
      default: "",
      trim: true,
      maxlength: 2000
    },
    style: {
      type: String,
      default: "",
      trim: true,
      maxlength: 80
    },
    providerJobId: {
      type: String,
      default: "",
      trim: true,
      maxlength: 300,
      index: true
    },
    progress: {
      type: Number,
      default: 0,
      min: 0,
      max: 100
    },
    provider: {
      type: String,
      default: "openai"
    },
    model: {
      type: String,
      default: "video-generation"
    },
    status: {
      type: String,
      enum: ["queued", "processing", "completed", "failed"],
      default: "queued"
    },
    videoUrl: {
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
  "VideoGeneration",
  videoGenerationSchema
);
