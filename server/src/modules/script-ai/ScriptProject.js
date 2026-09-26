const mongoose = require("mongoose");

const scriptProjectSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },
    sourceScript: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Script",
      default: null
    },
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200
    },
    type: {
      type: String,
      required: true,
      trim: true
    },
    genre: {
      type: String,
      required: true,
      trim: true
    },
    format: {
      type: String,
      required: true,
      trim: true
    },
    durationMinutes: {
      type: Number,
      min: 1,
      max: 180,
      required: true
    },
    tone: {
      type: String,
      trim: true,
      maxlength: 100,
      default: ""
    },
    audience: {
      type: String,
      trim: true,
      maxlength: 200,
      default: ""
    },
    structure: {
      type: mongoose.Schema.Types.Mixed,
      required: true
    },
    result: {
      type: String,
      required: true,
      maxlength: 50000
    }
  },
  {
    timestamps: true
  }
);

scriptProjectSchema.index({ user: 1, updatedAt: -1 });

module.exports = mongoose.model(
  "ScriptProject",
  scriptProjectSchema
);
