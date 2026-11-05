const mongoose = require("mongoose");

/**
 * STORIES.
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
// Stickers y música (bloque 1.3).
const MAX_STICKERS = 12;
const STICKER_TYPES = ["location", "mention", "hashtag", "poll", "question", "music"];
const STICKER_POSICIONES = ["abajo", "centro", "arriba"];
const MAX_STICKER_TEXTO = 120;
const MAX_STICKER_OPCIONES = 4;
const MAX_MUSICA_TITULO = 120;

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

/**
 * Sticker de una historia (bloque 1.3).
 *
 * No se sube una imagen: se guardan **datos** (mención, etiqueta, encuesta,
 * pregunta, ubicación) y la capa visual la pinta la app con sus propios
 * estilos. Así un sticker no puede ser un vector de contenido ajeno y la
 * mención se puede convertir en enlace real.
 *
 * La posición es una de tres franjas, no coordenadas libres: así el sticker
 * no se sale del marco en ningún tamaño de pantalla.
 */
const storyStickerSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: STICKER_TYPES,
      required: true
    },
    // @usuario sin la arroba, #etiqueta sin la almohadilla, o el texto libre.
    text: {
      type: String,
      trim: true,
      maxlength: MAX_STICKER_TEXTO,
      default: ""
    },
    // Solo encuestas: las opciones sobre las que se vota.
    options: {
      type: [{
        _id: false,
        label: { type: String, trim: true, maxlength: 40 }
      }],
      default: []
    },
    position: {
      type: String,
      enum: STICKER_POSICIONES,
      default: "centro"
    },
    // Encuestas: quién votó qué. Se usa para no votar dos veces y para el
    // conteo; nunca se expone la lista de votantes.
    votes: {
      type: [{
        _id: false,
        user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
        option: { type: Number, default: 0 },
        at: { type: Date, default: Date.now }
      }],
      default: []
    }
  },
  { _id: false }
);

/**
 * Música de la historia (bloque 1.3).
 *
 * Se guarda la referencia a la pista del catálogo **y** su título y autor: si
 * la pista se retira del catálogo, la historia sigue diciendo qué sonaba en
 * lugar de mostrar un hueco. `inicio` permite arrancar en el estribillo.
 */
const storyMusicSchema = new mongoose.Schema(
  {
    trackId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "MusicTrack",
      default: null
    },
    titulo: {
      type: String,
      trim: true,
      maxlength: MAX_MUSICA_TITULO,
      default: ""
    },
    autor: {
      type: String,
      trim: true,
      maxlength: MAX_MUSICA_TITULO,
      default: ""
    },
    url: {
      type: String,
      trim: true,
      maxlength: 2000,
      default: ""
    },
    inicio: {
      type: Number,
      min: 0,
      default: 0
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
    // Capas extra de la historia (bloque 1.3). Antes solo había `caption`.
    stickers: {
      type: [storyStickerSchema],
      default: []
    },
    music: {
      type: storyMusicSchema,
      default: null
    },
    expiresAt: {
      type: Date,
      required: true,
      index: true
    },

    // --- Retención del archivo personal (bloque 1.3) ---
    // `expiresAt` apaga la historia para todo el mundo; el autor la conserva
    // en su archivo. Sin un límite, ese archivo crece para siempre con
    // archivos que nadie volverá a abrir. La retención NO se aplica con TTL
    // (destruiría el archivo sin avisar): la aplica un barrido que primero
    // marca `archivedUntil` y solo borra cuando esa fecha pasa, de modo que
    // el autor ve «se borra en N días» antes de perder nada.
    archivedUntil: {
      type: Date,
      default: null,
      index: true
    },
    // `false` cuando el barrido la seleccionó: el autor puede reactivarla
    // (ampliar la fecha) antes de que se cumpla.
    retentionFlaggedAt: {
      type: Date,
      default: null
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
// Retención del archivo: 30 días después de publicar se avisa, 60 se borra.
module.exports.ARCHIVE_RETENTION_DAYS = 60;
module.exports.ARCHIVE_WARNING_DAYS = 30;
module.exports.MAX_HIGHLIGHTS = 30;
module.exports.MAX_HIGHLIGHT_STORIES = 50;
module.exports.MAX_ACTIVE_STORIES = MAX_ACTIVE_STORIES;
module.exports.MAX_CAPTION_LENGTH = MAX_CAPTION_LENGTH;
module.exports.MAX_ALT_LENGTH = MAX_ALT_LENGTH;
module.exports.MAX_REPLY_LENGTH = MAX_REPLY_LENGTH;
module.exports.MAX_REPLIES = MAX_REPLIES;
module.exports.MAX_VIEWERS_LISTED = MAX_VIEWERS_LISTED;
module.exports.MAX_STICKERS = MAX_STICKERS;
module.exports.STICKER_TYPES = STICKER_TYPES;
module.exports.STICKER_POSICIONES = STICKER_POSICIONES;
module.exports.MAX_STICKER_TEXTO = MAX_STICKER_TEXTO;
module.exports.MAX_STICKER_OPCIONES = MAX_STICKER_OPCIONES;
module.exports.MAX_MUSICA_TITULO = MAX_MUSICA_TITULO;
module.exports.ARCHIVE_LIMIT = ARCHIVE_LIMIT;
