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
    // Código del catálogo (`noir`, `chrome-liquid`…) o `user:<id>` cuando es
    // un estilo propio. Ya no es un enum: el catálogo manda y un enum aquí
    // obligaría a migrar la base cada vez que se añade un estilo. La
    // validación de verdad está en `image.service` contra `promptLibrary`.
    style: {
      type: String,
      default: "cinematic",
      maxlength: 80
    },
    // Encuadre pedido al proveedor. Sin esto el cliente no podía repetir una
    // generación tal cual la hizo y el historial mentía sobre el formato.
    aspectRatio: {
      type: String,
      enum: ["1:1", "4:5", "3:4", "9:16", "4:3", "3:2", "16:9"],
      default: "1:1"
    },
    // Variaciones pedidas (1-4) y las que el proveedor devolvió de verdad:
    // `imageUrl` sigue siendo la principal para no romper a los consumidores.
    variations: {
      type: Number,
      default: 1,
      min: 1,
      max: 4
    },
    variants: {
      type: [String],
      default: []
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
