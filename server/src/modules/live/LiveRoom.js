const mongoose = require("mongoose");

const liveParticipantSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },
    role: {
      type: String,
      enum: ["host", "speaker", "listener"],
      default: "listener"
    },
    joinedAt: {
      type: Date,
      default: Date.now
    }
  },
  { _id: false }
);

const liveRoomSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120
    },
    description: {
      type: String,
      trim: true,
      maxlength: 500,
      default: ""
    },
    type: {
      type: String,
      enum: ["audio", "video", "screen"],
      default: "audio"
    },
    status: {
      type: String,
      enum: ["active", "ended"],
      default: "active"
    },
    host: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true
    },
    participants: {
      type: [liveParticipantSchema],
      default: []
    },
    viewersCount: {
      type: Number,
      default: 0,
      min: 0
    },
    maxParticipants: {
      type: Number,
      default: 100
    },
    isPublic: {
      type: Boolean,
      default: true
    },
    startedAt: {
      type: Date,
      default: Date.now
    },
    endedAt: {
      type: Date,
      default: null
    },

    // Latido del anfitrión (bloque 1.5). El cliente lo manda cada 30 s; si
    // pasan 3 minutos sin latido, el barrido cierra la sala. Antes, cerrar la
    // pestaña dejaba una sala «activa» para siempre y nadie podía entrar a
    // otra porque el anfitrión ya tenía una abierta.
    hostHeartbeatAt: {
      type: Date,
      default: Date.now,
      index: true
    },

    // Chat de la sala. Efímero como la sala: se guarda para quien entra tarde
    // y se borra con ella. `system` marca avisos (entró, salió, fue expulsado)
    // para poder pintarlos distinto sin inventar texto en el cliente.
    chat: {
      type: [{
        _id: false,
        user: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
        text: { type: String, trim: true, maxlength: 500, default: "" },
        system: { type: Boolean, default: false },
        at: { type: Date, default: Date.now }
      }],
      default: []
    },

    // Expulsiones (bloque 1.5). Con fecha, para poder levantarlas: una
    // expulsión sin fecha es un destierro permanente que nadie puede revisar.
    bans: {
      type: [{
        _id: false,
        user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
        by: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
        reason: { type: String, trim: true, maxlength: 300, default: "" },
        at: { type: Date, default: Date.now }
      }],
      default: []
    }
  },
  {
    timestamps: true
  }
);

liveRoomSchema.index({ status: 1, startedAt: -1 });

const LiveRoom =
  mongoose.models.LiveRoom ||
  mongoose.model("LiveRoom", liveRoomSchema);

module.exports = LiveRoom;
// Sin latido durante este tiempo, la sala se considera abandonada.
module.exports.LIVE_STALE_MS = 3 * 60 * 1000;
module.exports.MAX_CHAT_ITEM = 500;
module.exports.MAX_CHAT_ITEMS = 300;
