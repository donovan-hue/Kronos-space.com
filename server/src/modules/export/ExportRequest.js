const mongoose = require("mongoose");

/**
 * Última solicitud de exportación de datos por usuario (A-12).
 *
 * Antes vivía en un `Map` en memoria: se perdía al reiniciar, no funcionaba
 * con más de una instancia y crecía sin cota. Persistida, el límite de
 * "1 exportación por semana" se cumple de verdad en cualquier despliegue.
 */
const exportRequestSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
      index: true
    },
    lastRequestAt: {
      type: Date,
      required: true,
      default: Date.now
    }
  },
  {
    timestamps: true,
    versionKey: false,
    strict: true
  }
);

module.exports =
  mongoose.models.ExportRequest ||
  mongoose.model("ExportRequest", exportRequestSchema);
