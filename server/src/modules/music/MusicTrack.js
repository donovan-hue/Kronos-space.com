const mongoose = require("mongoose");

/* ============================================================
   PISTA DE MÚSICA — el catálogo del estudio

   Una pista del catálogo: archivo de audio ya subido, con sus datos para
   mostrarla en el panel de música del estudio. Nada de pistas inventadas:
   lo que aparece aquí es lo que se subió de verdad.

   `publicada` es el interruptor entre borrador y catálogo visible: lo que
   sube un administrador sin publicar no lo ve nadie más.
   ============================================================ */

const musicTrackSchema = new mongoose.Schema(
  {
    titulo: {
      type: String,
      required: true,
      trim: true,
      maxlength: 160
    },
    autor: {
      type: String,
      default: "",
      trim: true,
      maxlength: 160
    },
    // URL pública del archivo (siempre dentro de /uploads/music/).
    url: {
      type: String,
      required: true,
      trim: true,
      maxlength: 2000
    },
    mimeType: {
      type: String,
      default: "",
      trim: true,
      maxlength: 100
    },
    size: {
      type: Number,
      default: 0,
      min: 0
    },
    // Duración en segundos. 0 significa "no declarada": el reproductor la
    // resuelve al cargar el archivo, no se inventa aquí.
    duracion: {
      type: Number,
      default: 0,
      min: 0
    },
    portadaUrl: {
      type: String,
      default: "",
      trim: true,
      maxlength: 2000
    },
    etiquetas: {
      type: [String],
      default: []
    },
    licencia: {
      type: String,
      default: "",
      trim: true,
      maxlength: 200
    },
    publicada: {
      type: Boolean,
      default: false
    },
    subidaPor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null
    }
  },
  { timestamps: true }
);

// El catálogo se lee siempre por "publicada + más recientes": el índice
// sigue ese orden exacto.
musicTrackSchema.index({ publicada: 1, createdAt: -1 });

module.exports = mongoose.model("MusicTrack", musicTrackSchema);
