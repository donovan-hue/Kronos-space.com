const mongoose = require("mongoose");

/* ============================================================
   VOZ — el catálogo de voces del estudio

   Mismo criterio que las pistas de música: aquí solo hay voces que se
   registraron de verdad. Una voz puede ser una grabación del usuario
   (`tipo: "propia"`, con su archivo en /uploads/voices/) o una voz del
   catálogo (`tipo: "catalogo"`), que necesita un modelo de voz y una
   credencial configurada.

   `lista` es el interruptor entre borrador y catálogo visible: una voz sin
   publicar no la ve nadie más.
   ============================================================ */

const voiceSchema = new mongoose.Schema(
  {
    nombre: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120
    },
    descripcion: {
      type: String,
      default: "",
      trim: true,
      maxlength: 300
    },
    // Lista de comprobación: "es-MX", "es-ES", "en-US"...
    idioma: {
      type: String,
      default: "",
      trim: true,
      maxlength: 20
    },
    genero: {
      type: String,
      enum: ["femenina", "masculina", "neutra", ""],
      default: ""
    },
    tipo: {
      type: String,
      enum: ["propia", "catalogo"],
      default: "propia"
    },
    // URL pública del archivo de muestra o de la grabación (siempre dentro
    // de /uploads/voices/). Una voz de catálogo todavía puede no tener
    // archivo: es lo que graba el motor de voz al usarla.
    url: {
      type: String,
      default: "",
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
    duracion: {
      type: Number,
      default: 0,
      min: 0
    },
    // Solo para las voces del catálogo: el modelo con el que se genera la
    // voz. Vacío significa que la voz se registró pero todavía no se puede
    // usar para generar.
    modelo: {
      type: String,
      default: "",
      trim: true,
      maxlength: 200
    },
    configurables: {
      type: [String],
      default: []
    },
    licencia: {
      type: String,
      default: "",
      trim: true,
      maxlength: 200
    },
    lista: {
      type: Boolean,
      default: false
    },
    registradaPor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null
    }
  },
  { timestamps: true }
);

// El catálogo se lee siempre por "lista + más recientes": el índice sigue
// ese orden exacto.
voiceSchema.index({ lista: 1, createdAt: -1 });

module.exports = mongoose.model("Voice", voiceSchema);
