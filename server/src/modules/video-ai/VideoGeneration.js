const mongoose = require("mongoose");

const videoGenerationSchema = new mongoose.Schema(
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
    // URL que se sirve al usuario. Es nuestra (`/uploads/media/...`) cuando la
    // copia durable existe; mientras tanto puede ser la del proveedor.
    videoUrl: {
      type: String,
      default: ""
    },
    // URL original del proveedor, solo para diagnóstico: caduca y no debe
    // usarse para servir la pieza.
    providerVideoUrl: {
      type: String,
      default: "",
      maxlength: 2000
    },
    // `true` en cuanto el archivo vive en almacén propio (disco + GridFS).
    // El sondeo lo usa para no volver a descargar en cada consulta.
    stored: {
      type: Boolean,
      default: false
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

// El historial de trabajos de video siempre consulta por usuario y fecha.
videoGenerationSchema.index({ user: 1, createdAt: -1 });

module.exports = mongoose.model(
  "VideoGeneration",
  videoGenerationSchema
);
