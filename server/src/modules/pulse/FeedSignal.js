const mongoose = require("mongoose");

/**
 * PULSO — señales "más/menos de esto" (Fase 6 del plan maestro).
 *
 * El usuario califica temas (hashtags) por publicación; el Pulso prioriza
 * lo marcado con "more" y excluye lo marcado con "less". Un tag tiene una
 * sola señal vigente por usuario: calificar de nuevo la reemplaza.
 */
const feedSignalSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },
    tag: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      maxlength: 80
    },
    direction: {
      type: String,
      enum: ["more", "less"],
      required: true
    }
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

feedSignalSchema.index({ user: 1, tag: 1 }, { unique: true });

module.exports = mongoose.model("FeedSignal", feedSignalSchema);
module.exports.SIGNAL_DIRECTIONS = ["more", "less"];
