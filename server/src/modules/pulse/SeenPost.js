const mongoose = require("mongoose");

/**
 * PULSO — registro de visto (Fase 6 del plan maestro).
 *
 * Cada usuario marca las publicaciones que ya consumió para que el Pulso
 * y las próximas sesiones no repitan contenido. Índice único user+post:
 * marcar dos veces es idempotente por diseño.
 */
const seenPostSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },
    post: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Post",
      required: true
    },
    seenAt: {
      type: Date,
      default: Date.now
    }
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

seenPostSchema.index({ user: 1, post: 1 }, { unique: true });

module.exports = mongoose.model("SeenPost", seenPostSchema);
