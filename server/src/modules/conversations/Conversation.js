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
    }
  },
  {
    timestamps: true
  }
);

conversationSchema.index({ members: 1 });
conversationSchema.index({ createdAt: -1 });

module.exports = mongoose.model("Conversation", conversationSchema);
