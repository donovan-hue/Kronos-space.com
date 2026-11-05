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
 * - Un mensaje puede llevar adjuntos (imágenes y documentos de texto). El
 *   archivo vive en el almacén propio; aquí solo queda la referencia, para que
 *   el hilo se pueda borrar sin arrastrar binarios y al revés.
 */

const MAX_MESSAGES = 200;
const MAX_MESSAGE_LENGTH = 4000;
// Un mensaje puede adjuntar hasta tres archivos: más que eso ya no es una
// conversación, es un envío de carpeta. Las imágenes se aceptan porque es lo
// que de verdad se pega en un chat; el texto (txt, md, csv, json) porque se
// puede leer sin transcribirlo.
const MAX_ADJUNTOS = 3;

const adjuntoSchema = new mongoose.Schema(
  {
    // Siempre dentro de /uploads/: el chat no reenvía a servidores de terceros.
    url: { type: String, trim: true, maxlength: 2000, required: true },
    nombre: { type: String, trim: true, maxlength: 200, default: "" },
    mimeType: { type: String, trim: true, maxlength: 100, default: "" },
    size: { type: Number, default: 0, min: 0 },
    kind: { type: String, enum: ["image", "text"], default: "image" }
  },
  { _id: false }
);

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
    adjuntos: {
      type: [adjuntoSchema],
      default: []
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
module.exports.MAX_ADJUNTOS = MAX_ADJUNTOS;
