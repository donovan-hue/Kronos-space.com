const mongoose = require("mongoose");

const REPORT_REASONS = [
  "spam",
  "harassment",
  "hate",
  "sexual",
  "violence",
  "self_harm",
  "misinformation",
  "other"
];

const REPORT_STATUSES = [
  "pending",
  "reviewing",
  "resolved",
  "dismissed"
];

const REPORT_TARGET_TYPES = ["user", "post", "comment"];

/**
 * KRONOS-UI-011 — reportes de moderación.
 *
 * `targetOwner` se guarda desnormalizado para que la cola de revisión
 * pueda mostrar a quién pertenece el contenido reportado sin depender
 * de que el contenido siga existiendo.
 */
const reportSchema = new mongoose.Schema(
  {
    reporter: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true
    },

    targetType: {
      type: String,
      required: true,
      enum: REPORT_TARGET_TYPES
    },

    targetId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true
    },

    targetOwner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null
    },

    reason: {
      type: String,
      required: true,
      enum: REPORT_REASONS
    },

    details: {
      type: String,
      default: "",
      trim: true,
      maxlength: 1000
    },

    status: {
      type: String,
      default: "pending",
      enum: REPORT_STATUSES,
      index: true
    },

    resolvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null
    },

    resolutionNote: {
      type: String,
      default: "",
      trim: true,
      maxlength: 500
    },

    resolvedAt: {
      type: Date,
      default: null
    }
  },
  {
    timestamps: true,
    versionKey: false,
    strict: true
  }
);

reportSchema.index({ status: 1, createdAt: -1 });
reportSchema.index({ targetType: 1, targetId: 1 });
reportSchema.index({ reporter: 1, createdAt: -1 });

module.exports = {
  Report:
    mongoose.models.Report ||
    mongoose.model("Report", reportSchema),
  REPORT_REASONS,
  REPORT_STATUSES,
  REPORT_TARGET_TYPES
};
