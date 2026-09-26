const mongoose = require("mongoose");

/**
 * KRONOS-UI-014 — borradores de publicación.
 *
 * Un borrador pertenece a un solo autor y guarda el mismo contenido que
 * el composer (texto + media ya subida). No es una publicación: no
 * aparece en feeds, perfiles ni búsquedas.
 */
const mediaSchema = new mongoose.Schema(
  {
    url: {
      type: String,
      default: "",
      trim: true,
      maxlength: 2000
    },
    type: {
      type: String,
      enum: ["image", "video", ""],
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
    },
    posterUrl: {
      type: String,
      default: "",
      trim: true,
      maxlength: 2000
    }
  },
  { _id: false }
);

const carouselItemSchema = new mongoose.Schema(
  {
    url: {
      type: String,
      required: true,
      trim: true,
      maxlength: 2000
    },
    type: {
      type: String,
      enum: ["image"],
      default: "image"
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
  },
  { _id: false }
);

const pollOptionSchema = new mongoose.Schema(
  {
    text: { type: String, required: true, trim: true, maxlength: 120 }
  },
  { _id: true }
);

const draftPollSchema = new mongoose.Schema(
  {
    question: { type: String, required: true, trim: true, maxlength: 200 },
    options: { type: [pollOptionSchema], required: true },
    closesAt: { type: Date, default: null }
  },
  { _id: false }
);

const draftEventSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 160 },
    description: { type: String, default: "", trim: true, maxlength: 1000 },
    startsAt: { type: Date, required: true },
    endsAt: { type: Date, default: null },
    timezone: { type: String, default: "UTC", trim: true, maxlength: 64 },
    locationType: { type: String, enum: ["online", "in_person"], default: "online" },
    location: { type: String, default: "", trim: true, maxlength: 300 }
  },
  { _id: false }
);

const draftSchema = new mongoose.Schema(
  {
    author: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },

    content: {
      type: String,
      default: "",
      trim: true,
      maxlength: 5000
    },

    audience: {
      type: {
        type: String,
        enum: ["public", "followers", "private", "circle", "orbit"],
        default: "public"
      },
      circleId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Circle",
        default: null
      },
      orbitId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Orbit",
        default: null
      }
    },

    poll: {
      type: draftPollSchema,
      default: null
    },

    event: {
      type: draftEventSchema,
      default: null
    },

    media: {
      type: mediaSchema,
      default: () => ({ url: "", type: "", mimeType: "", size: 0, alt: "", posterUrl: "" })
    },

    mediaItems: {
      type: [carouselItemSchema],
      default: [],
      validate: {
        validator(items) {
          return Array.isArray(items) && items.length <= 4;
        },
        message: "El carrusel no puede superar 4 imágenes"
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
