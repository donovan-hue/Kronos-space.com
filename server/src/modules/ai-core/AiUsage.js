const mongoose = require("mongoose");

/**
 * Libro de consumo por usuario y capacidad.
 *
 * POR QUÉ EXISTE
 *
 * Hasta ahora el único control sobre el gasto de IA era el limitador por
 * capacidad (`middleware/aiLimiter.js`: 10 peticiones por 15 minutos). Eso
 * cuenta INTENTOS por IP, no trabajo: diez imágenes dejan el mismo rastro que
 * diez mensajes de chat, una generación que falla en el proveedor cuenta igual
 * que una que produce un video, y no hay forma de responder «¿cuánto ha usado
 * esta cuenta este mes?» sin leer logs que no existen.
 *
 * Este registro guarda una fila por operación facturable ya IMPUTADA al
 * usuario. Deliberadamente no guarda el prompt: el libro mide coste, no
 * contenido, y así no se convierte en una segunda copia de datos personales
 * que haya que exportar y borrar.
 *
 * Decisiones:
 * - Una fila por operación (no un contador agregado): permite reconstruir el
 *   mes, auditar un pico y borrar por usuario en la eliminación de cuenta.
 * - `unidades` es la magnitud propia de cada capacidad (mensajes, imágenes,
 *   videos, guiones, caracteres de locución). Comparar capacidades distintas
 *   por un número único sería inventar un tipo de cambio.
 * - Índice `{user, createdAt}` para la consulta real (resumen del mes por
 *   usuario) y `{user, capability, createdAt}` para el desglose.
 */

const CAPACITIES = ["chat", "image", "video", "script", "voice"];

const aiUsageSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },
    capability: {
      type: String,
      enum: CAPACITIES,
      required: true
    },
    // Magnitud de la operación en su propia unidad (ver `CAPACITIES`).
    units: {
      type: Number,
      default: 1,
      min: 0
    },
    // Resultado imputado: una llamada que el proveedor rechazó no consume
    // cuota de producto, pero sí queda registrada para poder ver los fallos.
    estado: {
      type: String,
      enum: ["ok", "error"],
      default: "ok"
    },
    error: {
      type: String,
      default: "",
      maxlength: 200
    }
  },
  { timestamps: true }
);

aiUsageSchema.index({ user: 1, createdAt: -1 });
aiUsageSchema.index({ user: 1, capability: 1, createdAt: -1 });

module.exports = mongoose.model("AiUsage", aiUsageSchema);
module.exports.CAPACITIES = CAPACITIES;
