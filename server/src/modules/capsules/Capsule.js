const mongoose = require("mongoose");

/**
 * CÁPSULAS DEL TIEMPO — Fase 5 del plan maestro.
 *
 * Contenido individual o colectivo que se publica (abre) en una fecha.
 * Estados: draft → scheduled (sellada) → opened | cancelled.
 *
 * - Los mensajes se guardan cifrados (AES-256-GCM, ver capsule.crypto.js)
 *   y solo se descifran con la cápsula abierta (o en draft para quien la
 *   está escribiendo).
 * - La apertura es una transición atómica (`state: "scheduled"` como
 *   condición): el scheduler y la lectura perezosa pueden competir sin
 *   abrir dos veces ni perderse ante un reinicio.
 */

const CAPSULE_STATES = ["draft", "scheduled", "opened", "cancelled"];
const MAX_TITLE = 160;
const MAX_MESSAGE = 2000;
const MAX_CONTRIBUTORS = 20;

const contributorSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },
    joinedAt: {
      type: Date,
      default: Date.now
    }
  },
  { _id: false }
);

const capsuleMessageSchema = new mongoose.Schema(
  {
    author: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },
    cipherText: {
      type: String,
      required: true
    },
    iv: {
      type: String,
      required: true
    },
    authTag: {
      type: String,
      required: true
    },
    createdAt: {
      type: Date,
      default: Date.now
    }
  },
  { _id: false }
);

const capsuleSchema = new mongoose.Schema(
  {
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true
    },
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: MAX_TITLE
    },
    opensAt: {
      type: Date,
      required: true
    },
    timezone: {
      type: String,
      default: "UTC",
      trim: true,
      maxlength: 64
    },
    state: {
      type: String,
      enum: CAPSULE_STATES,
      default: "draft"
    },
    contributors: {
      type: [contributorSchema],
      default: []
    },
    messages: {
      type: [capsuleMessageSchema],
      default: []
    },
    openedAt: {
      type: Date,
      default: null
    },
    cancelledAt: {
      type: Date,
      default: null
    }
  },
  { timestamps: true }
);

capsuleSchema.index({ state: 1, opensAt: 1 });

module.exports = mongoose.model("Capsule", capsuleSchema);
module.exports.CAPSULE_STATES = CAPSULE_STATES;
module.exports.MAX_TITLE = MAX_TITLE;
module.exports.MAX_MESSAGE = MAX_MESSAGE;
module.exports.MAX_CONTRIBUTORS = MAX_CONTRIBUTORS;
