const mongoose = require("mongoose");

/**
 * Conversación con Kairos (chat).
 *
 * Hasta ahora `POST /api/ai/chat` era sin memoria: el cliente mandaba el
 * historial en cada petición y el servidor no guardaba nada, así que cerrar
 * la pestaña borraba la conversación. Este modelo la hace persistente y, de
 * paso, deja de obligar al cliente a reenviar todo el historial cada vez.
 *
 * Decisiones:
 * - Una conversación por hilo; los mensajes viven embebidos porque una
 *   conversación de chat se lee entera y el tope es explícito.
 * - Se guarda `estado` por mensaje: una respuesta que el proveedor no llegó a
 *   dar queda como `error` con su motivo, en vez de desaparecer.
 * - `personality` y `language` se congelan al crear el hilo: cambiar la
 *   preferencia en Ajustes no reescribe el tono de lo ya hablado.
 */

const MAX_MESSAGES = 200;
const MAX_MESSAGE_LENGTH = 4000;

const chatMessageSchema = new mongoose.Schema(
  {
    role: {
      type: String,
      enum: ["user", "assistant"],
      required: true
    },
    content: {
      type: String,
      trim: true,
      maxlength: MAX_MESSAGE_LENGTH,
      default: ""
    },
    estado: {
      type: String,
      enum: ["ok", "error"],
      default: "ok"
    },
    error: {
      type: String,
      default: "",
      maxlength: 500
    },
    model: {
      type: String,
      default: ""
    },
    createdAt: {
      type: Date,
      default: Date.now
    }
  },
  { _id: true }
);

const chatConversationSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },
    title: {
      type: String,
      trim: true,
      maxlength: 120,
      default: ""
    },
    personality: {
      type: String,
      enum: ["normal", "direct", "sarcastic", "grumpy"],
      default: "normal"
    },
    language: {
      type: String,
      default: "es-MX"
    },
    messages: {
      type: [chatMessageSchema],
      default: []
    },
    lastMessageAt: {
      type: Date,
      default: Date.now
    }
  },
  { timestamps: true }
);

// La bandeja pide las conversaciones de un usuario por actividad reciente.
chatConversationSchema.index({ user: 1, lastMessageAt: -1 });

module.exports = mongoose.model("ChatConversation", chatConversationSchema);
module.exports.MAX_MESSAGES = MAX_MESSAGES;
module.exports.MAX_MESSAGE_LENGTH = MAX_MESSAGE_LENGTH;
