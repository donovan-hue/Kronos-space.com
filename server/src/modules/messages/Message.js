const mongoose = require("mongoose");

/**
 * Mensaje de Kronos.
 *
 * Contrato original (bloque AUDIT-004): conversación 1-a-1 de texto
 * (sender/receiver/text/read). Este bloque (008) lo extiende SIN romperlo:
 *
 * - `media` (KRONOS-UI-019): adjunto de imagen reutilizando el pipeline
 *   de `/uploads/media` (misma validación que posts, AUDIT-005).
 * - `conversation` (KRONOS-UI-022): mensaje de grupo; cuando existe,
 *   `receiver` queda en null y el destino es la conversación.
 * - `clientMessageId` (KRONOS-UI-021): id generado por el cliente para
 *   reintentos idempotentes (el mismo reenvío no duplica el mensaje).
 * - `delivered` (KRONOS-UI-021): entregado; `read` (original) sigue
 *   significando leído. En grupos se complementa con `readBy`.
 * - `readBy` (KRONOS-UI-022): lectores del mensaje (grupos).
 */
const messageSchema = new mongoose.Schema(
  {
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },
    receiver: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null
    },
    conversation: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Conversation",
      default: null
    },
    text: {
      type: String,
      default: "",
      maxlength: 5000,
      trim: true
    },
    media: {
      url: { type: String, default: "" },
      mimeType: { type: String, default: "" },
      size: { type: Number, default: 0 },
      alt: { type: String, default: "", maxlength: 500 }
    },
    clientMessageId: {
      type: String,
      trim: true,
      maxlength: 128
    },
    read: {
      type: Boolean,
      default: false
    },
    delivered: {
      type: Boolean,
      default: false
    },
    readBy: {
      type: [mongoose.Schema.Types.ObjectId],
      ref: "User",
      default: []
    }
  },
  {
    timestamps: true
  }
);

messageSchema.index({ sender: 1, receiver: 1, createdAt: -1 });
messageSchema.index({ conversation: 1, createdAt: 1 });

// La rama `receiver` del $or de la bandeja y los contadores de no leídos no
// podían usar el índice que empieza por `sender`.
messageSchema.index({ receiver: 1, createdAt: -1 });
// Idempotencia vive en el ámbito de destino. Un mismo cliente puede
// reutilizar su contador local en dos chats distintos; hacer único solo
// `sender + clientMessageId` mezclaba DMs y grupos y convertía el segundo
// envío en un E11000.
messageSchema.index(
  { sender: 1, receiver: 1, clientMessageId: 1 },
  {
    name: "message_sender_receiver_clientMessageId_unique",
    unique: true,
    partialFilterExpression: {
      receiver: { $type: "objectId" },
      clientMessageId: { $type: "string" }
    }
  }
);
messageSchema.index(
  { sender: 1, conversation: 1, clientMessageId: 1 },
  {
    name: "message_sender_conversation_clientMessageId_unique",
    unique: true,
    partialFilterExpression: {
      conversation: { $type: "objectId" },
      clientMessageId: { $type: "string" }
    }
  }
);

module.exports = mongoose.model("Message", messageSchema);
