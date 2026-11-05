const mongoose = require("mongoose");

/**
 * Presets de prompt y estilos propios del creador (Kairos, bloque 2.2).
 *
 * Por qué existe: el generador solo tenía cuatro estilos fijos (`cinematic`,
 * `editorial`, `con-art`, `photorealistic`) y una caja de texto que se perdía
 * al cerrar la pestaña. Aquí se guarda lo que el autor encontró útil.
 *
 * Decisiones:
 * - `instrumento` guarda el **código** del catálogo (`img_lighting`), no el
 *   nombre: renombrar la etiqueta visible no puede dejar presets huérfanos.
 * - `valores` guarda los campos rellenos, con las claves que declaró el
 *   instrumento. El prompt final se arma al vuelo (`renderPrompt`), así un
 *   preset viejo hereda las mejoras del catálogo en vez de quedarse con el
 *   texto congelado que se guardó aquel día.
 * - `estiloVisual` es el estilo propio: un prompt de imagen con su nombre. Se
 *   puede usar como estilo al generar, junto a los cuatro de fábrica.
 * - `usos` cuenta cuántas veces se ha usado: lo que se usa sube en la lista, y
 *   borrar un preset que se usa mucho pide confirmación en la UI.
 */
const promptPresetSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
      // Sin índice propio: el compuesto (user, tipo, ultimoUso) ya lo cubre
      // como prefijo, y un índice suelto más se paga en cada escritura.
    },
    nombre: {
      type: String,
      required: true,
      trim: true,
      maxlength: 80
    },
    // "preset" = instrumento relleno; "estilo" = estilo visual propio.
    tipo: {
      type: String,
      enum: ["preset", "estilo"],
      default: "preset",
      index: true
    },
    instrumento: {
      type: String,
      trim: true,
      maxlength: 60,
      default: ""
    },
    valores: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    },
    // Solo para estilos: el texto que se antepone al prompt de imagen.
    estiloVisual: {
      type: String,
      trim: true,
      maxlength: 1000,
      default: ""
    },
    favorito: {
      type: Boolean,
      default: false
    },
    usos: {
      type: Number,
      default: 0,
      min: 0
    },
    ultimoUso: {
      type: Date,
      default: null
    }
  },
  { timestamps: true }
);

promptPresetSchema.index({ user: 1, tipo: 1, ultimoUso: -1 });
// Dos presets con el mismo nombre para la misma persona son un lío, no una
// función: se rechaza en la ruta con un 409, y este índice lo respalda.
promptPresetSchema.index({ user: 1, nombre: 1 }, { unique: true });

module.exports = mongoose.model("PromptPreset", promptPresetSchema);
module.exports.MAX_PRESETS = 200;
module.exports.MAX_NOMBRE = 80;
