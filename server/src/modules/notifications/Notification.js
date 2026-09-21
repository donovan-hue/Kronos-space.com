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
  "capsule"
];

const notificationSchema = new mongoose.Schema(
  {
    recipient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true
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
