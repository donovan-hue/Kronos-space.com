const mongoose = require("mongoose");

/**
 * KRONOS-UI-014 — borradores de publicación.
 *
 * Un borrador pertenece a un solo autor y guarda el mismo contenido que
 * el composer (texto + media ya subida). No es una publicación: no
 * aparece en feeds, perfiles ni búsquedas.
 */
const draftSchema = new mongoose.Schema(
  {
    author: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true
    },

    content: {
      type: String,
      default: "",
      trim: true,
      maxlength: 5000
    },

    media: {
      url: {
        type: String,
        default: "",
        trim: true,
        maxlength: 2000
      },
      type: {
        type: String,
        enum: ["image", ""],
        default: ""
      },
      mimeType: {
        type: String,
        default: "",
        trim: true,
        maxlength: 100
      },
      size: {
        type: Number,
        default: 0
      },
      alt: {
        type: String,
        default: "",
        trim: true,
        maxlength: 500
      }
    }
  },
  {
    timestamps: true,
    versionKey: false,
    strict: true
  }
);

draftSchema.index({ author: 1, updatedAt: -1 });

module.exports =
  mongoose.models.Draft ||
  mongoose.model("Draft", draftSchema);
