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

const REACTION_TYPES = ["like", "love", "laugh", "wow", "sad", "angry"];
const AUDIENCE_TYPES = ["public", "followers", "private"];

const audienceSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: AUDIENCE_TYPES,
      default: "public",
      required: true
    }
  },
  { _id: false }
);

const reactionSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },
    type: {
      type: String,
      enum: REACTION_TYPES,
      required: true
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

    // Legacy binary likes remain for backwards compatibility. New clients use
    // `reactions`; normalización y la ruta de compatibilidad los proyectan como
    // reacción `like` cuando no existe una reacción explícita.
    likes: {
      type: [
        {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User"
        }
      ],
      default: []
    },

    reactions: {
      type: [reactionSchema],
      default: []
    },

    audience: {
      type: audienceSchema,
      default: () => ({ type: "public" })
    },

    hashtags: {
      type: [
        {
          type: String,
          trim: true,
          lowercase: true,
          maxlength: 50
        }
      ],
      default: [],
      validate: {
        validator(tags) {
          return Array.isArray(tags) && tags.length <= 20;
        },
        message: "La publicación no puede superar 20 hashtags"
      }
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

          parentComment: {
            type: mongoose.Schema.Types.ObjectId,
            default: null
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

const Post = mongoose.model("Post", postSchema);
Post.REACTION_TYPES = REACTION_TYPES;
Post.AUDIENCE_TYPES = AUDIENCE_TYPES;

module.exports = Post;
