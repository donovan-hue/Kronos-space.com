const mongoose = require("mongoose");
const AiUsage = require("./AiUsage");

/**
 * Registro y resumen del consumo de IA por usuario.
 *
 * El registro nunca puede tumbar la operación que lo provoca: si la base falla
 * al anotar, la imagen ya generada se devuelve igual y el fallo se registra en
 * el log. Cobrar/medir es importante; perder el trabajo del usuario porque el
 * libro no escribió, no.
 */

const UNITS_BY_CAPABILITY = Object.freeze({
  chat: "mensajes",
  image: "imágenes",
  video: "videos",
  script: "guiones",
  voice: "caracteres"
});

/**
 * Anota una operación ya imputada al usuario.
 *
 * `units` se recorta a un número finito no negativo: una respuesta rara del
 * proveedor no debe poder inflar (ni romper) el libro con NaN.
 */
async function recordUsage({ userId, capability, units = 1, estado = "ok", error = "" }) {
  if (!userId || !AiUsage.CAPACITIES.includes(capability)) return null;

  const safeUnits = Number.isFinite(Number(units)) ? Math.max(0, Number(units)) : 1;

  try {
    return await AiUsage.create({
      user: userId,
      capability,
      units: safeUnits,
      estado: estado === "error" ? "error" : "ok",
      error: typeof error === "string" ? error.slice(0, 200) : ""
    });
  } catch (recordError) {
    console.error("AI_USAGE_RECORD_ERROR:", recordError?.message || recordError);
    return null;
  }
}

/** Inicio del periodo: el día 1 del mes en curso, en UTC. */
function monthStart(now = new Date()) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

/**
 * Resumen del mes por capacidad.
 *
 * Devuelve filas con `capability`, `units`, `ok`, `errores` y la unidad legible,
 * más un total por capacidad (no un total global: sumar imágenes con
 * caracteres no significa nada).
 */
async function monthlyUsage(userId, { now = new Date() } = {}) {
  const since = monthStart(now);

  const rows = await AiUsage.aggregate([
    {
      $match: {
        user: new mongoose.Types.ObjectId(String(userId)),
        createdAt: { $gte: since }
      }
    },
    {
      $group: {
        _id: "$capability",
        units: { $sum: "$units" },
        operaciones: { $sum: 1 },
        errores: { $sum: { $cond: [{ $eq: ["$estado", "error"] }, 1, 0] } }
      }
    },
    { $sort: { _id: 1 } }
  ]);

  const byCapability = new Map(rows.map((row) => [row._id, row]));

  return AiUsage.CAPACITIES.map((capability) => {
    const row = byCapability.get(capability);
    return {
      capability,
      units: row?.units || 0,
      unit: UNITS_BY_CAPABILITY[capability],
      operaciones: row?.operaciones || 0,
      errores: row?.errores || 0
    };
  });
}

module.exports = {
  UNITS_BY_CAPABILITY,
  recordUsage,
  monthlyUsage,
  monthStart
};
