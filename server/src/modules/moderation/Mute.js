const mongoose = require("mongoose");

/**
 * KRONOS-UI-011 — silenciar (mute).
 *
 * A diferencia del bloqueo, el silencio solo afecta al feed del usuario
 * que lo aplica: el usuario silenciado no se enteró (no hay
 * notificación), su perfil sigue accesible y la mensajería no cambia.
 */
const muteSchema = new mongoose.Schema(
  {
    muter: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true
    },

    muted: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true
    }
  },
  {
    timestamps: true,
    versionKey: false,
    strict: true
  }
);

muteSchema.index({ muter: 1, muted: 1 }, { unique: true });

module.exports =
  mongoose.models.Mute ||
  mongoose.model("Mute", muteSchema);
