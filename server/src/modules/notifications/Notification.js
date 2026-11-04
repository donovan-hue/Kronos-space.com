const mongoose = require("mongoose");

/**
 * Catálogo de tipos de notificación (KRONOS-UI-023).
 * Único punto donde se define el catálogo: el modelo lo usa como
 * `enum` y las rutas lo usan para validar filtros (KRONOS-UI-024).
 */
const NOTIFICATION_TYPES = [
  "follow",
  "like",
  "comment",
  "repost",
  "save",
  "moderation",
  "capsule",
  // `event` — alguien confirmó o cambió su respuesta a un evento del autor.
  "event",
  // `story` — respondieron a una historia tuya (antes solo se guardaba en
  // `story.replies` y el autor no recibía ningún aviso).
  "story",
  // `live` — te invitaron a una sala en vivo (antes solo existía el evento de
  // socket, que se perdía si no estabas conectado en ese instante).
  "live",
  // `report` — el denunciante se entera de que su reporte se resolvió.
  // `moderation` sigue siendo el aviso al AUTOR del contenido oculto;
  // `report` es el aviso al DENUNCIANTE. Son dos audiencias distintas y
  // mezclarlas mandaba al autor a mirar un reporte que no era suyo.
  "report"
];

const notificationSchema = new mongoose.Schema(
  {
    recipient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },
    actor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },
    type: {
      type: String,
      required: true,
      enum: NOTIFICATION_TYPES
    },
    post: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Post",
      default: null
    },
    // Destino del aviso cuando NO es una publicación: la historia respondida,
    // la cápsula a la que te invitaron, la sala a la que te invitan o el
    // reporte que resolviste. Sin esto, la UI solo podía mandar a la persona a
    // su perfil y el aviso se quedaba sin puerta de entrada.
    ref: {
      kind: {
        type: String,
        enum: ["", "story", "capsule", "live", "report"],
        default: ""
      },
      id: {
        type: mongoose.Schema.Types.ObjectId,
        default: null
      }
    },
    read: {
      type: Boolean,
      default: false
    }
  },
  {
    timestamps: true,
    strict: true
  }
);

notificationSchema.index({
  recipient: 1,
  createdAt: -1
});

notificationSchema.index({
  recipient: 1,
  read: 1,
  createdAt: -1
});

module.exports = mongoose.model("Notification", notificationSchema);
module.exports.NOTIFICATION_TYPES = NOTIFICATION_TYPES;
