const mongoose = require("mongoose");

/**
 * KRONOS-UI-011 — bloqueo entre usuarios.
 *
 * `blocker` deja de ver el contenido de `blocked` y viceversa, y se
 * impide la interacción directa (seguir, mensajear, comentar). Es una
 * relación explícita del usuario que la crea, no un contador.
 */
const blockSchema = new mongoose.Schema(
  {
    blocker: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },

    blocked: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    }
  },
  {
    timestamps: true,
    versionKey: false,
    strict: true
  }
);

blockSchema.index(
  { blocker: 1, blocked: 1 },
  { unique: true }
);

blockSchema.index({ blocked: 1, blocker: 1 });

module.exports =
  mongoose.models.Block ||
  mongoose.model("Block", blockSchema);
