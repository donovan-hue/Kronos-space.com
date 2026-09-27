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
    }
  },
  {
    timestamps: true
  }
);

liveRoomSchema.index({ status: 1, startedAt: -1 });

module.exports =
  mongoose.models.LiveRoom ||
  mongoose.model("LiveRoom", liveRoomSchema);
