const mongoose = require("mongoose");

/**
 * STORIES — Fase 3 del plan maestro (docs/KRONOS-SOCIAL-BENCHMARK-Y-PLAN-2026-09-19.md).
 *
 * Historias efímeras con audiencia, vistas y respuestas privadas.
 *
 * Decisiones de este modelo:
 * - La expiración es por consulta (`expiresAt > now`), no por índice TTL de
 *   MongoDB: el TTL borraría el documento y destruiría el archivo personal
 *   del autor ("archivo personal" del plan). Tras 24 h la historia desaparece
 *   de todas las superficies de consumo; solo el autor la conserva en
 *   `/api/stories/me/archive` y puede eliminarla.
 * - `views` y `replies` viven embebidos (la historia muere a las 24 h, no
 *   crece sin límite). Nunca se exponen los usuarios que la vieron ni los
 *   que respondieron fuera de los endpoints exclusivos del autor.
 * - La media solo puede venir de `/uploads/` (subida propia o generación de
 *   Kairos), nunca URLs externas: la historia ocupa toda la pantalla y la
 *   moderación no puede inspeccionar contenido de terceros efímero.
 */

const STORY_MEDIA_TYPES = ["image", "video"];
const STORY_AUDIENCE_TYPES = ["public", "followers", "circle"];
const STORY_TTL_HOURS = 24;
const MAX_ACTIVE_STORIES = 20;
const MAX_CAPTION_LENGTH = 500;
const MAX_ALT_LENGTH = 500;
const MAX_REPLY_LENGTH = 1000;
const MAX_REPLIES = 500;
const MAX_VIEWERS_LISTED = 200;
const ARCHIVE_LIMIT = 50;

const storyMediaSchema = new mongoose.Schema(
  {
    url: {
      type: String,
      required: true,
      trim: true,
      maxlength: 2000
    },
    type: {
      type: String,
      enum: STORY_MEDIA_TYPES,
      required: true
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
      maxlength: MAX_ALT_LENGTH
    }
  },
  { _id: false }
);

const storyAudienceSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: STORY_AUDIENCE_TYPES,
      default: "public"
    },
    circleId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Circle",
      default: null
    }
  },
  { _id: false }
);

const storyViewSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },
    viewedAt: {
      type: Date,
      default: Date.now
    }
  },
  { _id: false }
);

const storyReplySchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },
    text: {
      type: String,
      required: true,
      trim: true,
      maxlength: MAX_REPLY_LENGTH
    },
    createdAt: {
      type: Date,
      default: Date.now
    }
  },
  { _id: false }
);

const storySchema = new mongoose.Schema(
  {
    author: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },
    media: {
      type: storyMediaSchema,
      required: true
    },
    caption: {
      type: String,
      default: "",
      trim: true,
      maxlength: MAX_CAPTION_LENGTH
    },
    audience: {
      type: storyAudienceSchema,
      default: () => ({})
    },
    expiresAt: {
      type: Date,
      required: true,
      index: true
    },
    views: {
      type: [storyViewSchema],
      default: []
    },
    replies: {
      type: [storyReplySchema],
      default: []
    }
  },
  { timestamps: true }
);

storySchema.index({ author: 1, createdAt: -1 });

module.exports = mongoose.model("Story", storySchema);
module.exports.STORY_MEDIA_TYPES = STORY_MEDIA_TYPES;
module.exports.STORY_AUDIENCE_TYPES = STORY_AUDIENCE_TYPES;
module.exports.STORY_TTL_HOURS = STORY_TTL_HOURS;
module.exports.MAX_ACTIVE_STORIES = MAX_ACTIVE_STORIES;
module.exports.MAX_CAPTION_LENGTH = MAX_CAPTION_LENGTH;
module.exports.MAX_ALT_LENGTH = MAX_ALT_LENGTH;
module.exports.MAX_REPLY_LENGTH = MAX_REPLY_LENGTH;
module.exports.MAX_REPLIES = MAX_REPLIES;
module.exports.MAX_VIEWERS_LISTED = MAX_VIEWERS_LISTED;
module.exports.ARCHIVE_LIMIT = ARCHIVE_LIMIT;
