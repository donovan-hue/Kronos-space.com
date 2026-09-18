const mongoose = require("mongoose");

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
      trim: true
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
      trim: true
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

const postSchema = new mongoose.Schema(
  {
    content: {
      type: String,
      default: "",
      trim: true,
      maxlength: 5000
    },

    author: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true
    },

    likes: {
      type: [
        {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User"
        }
      ],
      default: []
    },

    comments: {
      type: [
        {
          user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true
          },

          content: {
            type: String,
            required: true,
            trim: true,
            maxlength: 1000
          },

          createdAt: {
            type: Date,
            default: Date.now
          }
        }
      ],
      default: []
    },

    media: {
      type: mediaSchema,
      default: () => ({ url: "", type: "", mimeType: "", size: 0, alt: "" })
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
    },

    savedBy: {
      type: [
        {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User"
        }
      ],
      default: []
    },

    repostOf: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Post",
      default: null
    },

    // KRONOS-UI-011 — moderación global (solo moderadores). Los posts
    // antiguos no tienen el subdocumento: se leen como no ocultos.
    moderation: {
      hidden: { type: Boolean, default: false, index: true },
      reason: { type: String, default: "", trim: true, maxlength: 500 },
      hiddenBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        default: null
      },
      hiddenAt: { type: Date, default: null }
    }
  },
  {
    timestamps: true,
    strict: true
  }
);

postSchema.index({
  author: 1,
  createdAt: -1
});

postSchema.index({
  createdAt: -1
});

module.exports =
  mongoose.model("Post", postSchema);
