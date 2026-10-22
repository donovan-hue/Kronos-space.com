const mongoose = require("mongoose");

/**
 * PROYECTOS — tablero por pieza.
 *
 * Una pieza (reel, campaña, portada) reúne lo que hoy vive disperso:
 * guion por escenas, tomas, música y versiones. Cada «guardar versión»
 * congela una copia del contenido para poder comparar dos corridas y
 * quedarse con una.
 *
 * Solo la persona dueña puede leer y escribir su proyecto.
 */

const FORMATOS = ["reel", "cuadrado", "portada", "libre"];
const MAX_TITLE = 120;
const MAX_BRIEF = 2000;
const MAX_SCENES = 60;
const MAX_SCENE_TITLE = 120;
const MAX_SCRIPT = 4000;
const MAX_VERSIONS = 30;

const sceneSchema = new mongoose.Schema(
  {
    order: { type: Number, default: 0 },
    title: { type: String, default: "", maxlength: MAX_SCENE_TITLE },
    script: { type: String, default: "", maxlength: MAX_SCRIPT },
    mediaUrl: { type: String, default: "" },
    mediaType: { type: String, enum: ["", "image", "video", "audio"], default: "" }
  },
  { _id: true }
);

const snapshotSchema = new mongoose.Schema(
  {
    label: { type: String, default: "", maxlength: 80 },
    title: { type: String, default: "" },
    brief: { type: String, default: "" },
    format: { type: String, enum: FORMATOS, default: "libre" },
    musicTitle: { type: String, default: "" },
    musicUrl: { type: String, default: "" },
    scenes: { type: [sceneSchema], default: [] }
  },
  { _id: false }
);

const versionSchema = new mongoose.Schema(
  {
    label: { type: String, default: "", maxlength: 80 },
    snapshot: { type: snapshotSchema, required: true },
    createdAt: { type: Date, default: Date.now }
  },
  { _id: true }
);

const projectSchema = new mongoose.Schema(
  {
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },
    title: { type: String, required: true, trim: true, maxlength: MAX_TITLE },
    brief: { type: String, default: "", maxlength: MAX_BRIEF },
    format: { type: String, enum: FORMATOS, default: "libre" },
    scenes: { type: [sceneSchema], default: [] },
    musicTitle: { type: String, default: "", maxlength: 160 },
    musicUrl: { type: String, default: "" },
    versions: { type: [versionSchema], default: [] },
    archived: { type: Boolean, default: false }
  },
  { timestamps: true }
);

projectSchema.index({ owner: 1, updatedAt: -1 });

projectSchema.statics.FORMATOS = FORMATOS;
projectSchema.statics.MAX_TITLE = MAX_TITLE;
projectSchema.statics.MAX_BRIEF = MAX_BRIEF;
projectSchema.statics.MAX_SCENES = MAX_SCENES;
projectSchema.statics.MAX_SCENE_TITLE = MAX_SCENE_TITLE;
projectSchema.statics.MAX_SCRIPT = MAX_SCRIPT;
projectSchema.statics.MAX_VERSIONS = MAX_VERSIONS;

module.exports = mongoose.models.Project || mongoose.model("Project", projectSchema);
