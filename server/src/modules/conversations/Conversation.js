const mongoose = require("mongoose");

/**
 * KRONOS-UI-022 — conversación de grupo.
 *
 * Las conversaciones 1-a-1 siguen sin modelo (par sender/receiver sobre
 * `Message`, contrato AUDIT-004, sin cambios). `Conversation` solo existe
 * para grupos: 2-10 miembros, creado por un usuario que siempre pertenece.
 */
const conversationSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      trim: true,
      maxlength: 60,
      default: ""
    },
    members: {
      type: [mongoose.Schema.Types.ObjectId],
      ref: "User",
      required: true,
      validate: {
        validator: (value) => Array.isArray(value) && value.length >= 2 && value.length <= 10,
        message: "Un grupo debe tener entre 2 y 10 miembros"
      }
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },
    // Administradores además del creador (bloque 1.4). Antes el rol era
    // binario: creador o nada, así que si el creador se iba el grupo quedaba
    // sin nadie que pudiera añadir, quitar o renombrar. `createdBy` sigue
    // siendo el propietario; esta lista delega solo la moderación diaria.
    admins: {
      type: [mongoose.Schema.Types.ObjectId],
      ref: "User",
      default: []
    }
  },
  {
    timestamps: true
  }
);

conversationSchema.index({ createdAt: -1 });

// La lista de grupos filtra por miembro y ordena por actividad reciente:
// el compuesto sustituye al índice suelto de `members` (era su prefijo).
conversationSchema.index({ members: 1, updatedAt: -1 });

module.exports = mongoose.model("Conversation", conversationSchema);
