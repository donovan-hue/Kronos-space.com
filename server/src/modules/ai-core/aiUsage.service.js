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

/**
 * Cuota mensual por capacidad, en la unidad propia de cada una.
 *
 * `null` significa «sin límite declarado»: es el default porque el producto no
 * ha decidido precios todavía, y un límite inventado cortaría el trabajo de
 * alguien por una cifra que nadie aprobó. Se activa por entorno
 * (`AI_QUOTA_<CAPACIDAD>=<número>`), no por código: cambiar una cuota es un acto
 * del despliegue.
 */
const QUOTA_ENV_PREFIX = "AI_QUOTA_";
const DEFAULT_QUOTA = null;

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

/**
 * Cuota vigente de una capacidad: número o `null` si no hay límite.
 *
 * Un valor no numérico, negativo o vacío deja la capacidad sin límite. Preferir
 * «sin límite» a «límite 0» evita apagar una función entera por una variable mal
 * escrita.
 */
function quotaFor(capability, env = process.env) {
  const raw = env[`${QUOTA_ENV_PREFIX}${String(capability).toUpperCase()}`];
  if (raw === undefined || raw === null || raw === "") return DEFAULT_QUOTA;
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) return DEFAULT_QUOTA;
  return Math.floor(value);
}

/** Si el consumo ya alcanzó la cuota. Sin cuota, nunca está agotada. */
function quotaReached(capability, consumed, env = process.env) {
  const limite = quotaFor(capability, env);
  if (limite === null) return { limite: null, consumido: consumed, restante: null, agotada: false };
  const restante = Math.max(0, limite - consumed);
  return { limite, consumido: consumed, restante, agotada: restante === 0 };
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
    const consumido = row?.units || 0;
    // La cuota va junto al consumo: la pantalla puede decir «12 de 100» sin
    // pedir otra ruta ni adivinar el límite.
    const cuota = quotaReached(capability, consumido);
    return {
      capability,
      units: consumido,
      unit: UNITS_BY_CAPABILITY[capability],
      operaciones: row?.operaciones || 0,
      errores: row?.errores || 0,
      cuota: cuota.limite,
      restante: cuota.restante,
      agotada: cuota.agotada
    };
  });
}

module.exports = {
  UNITS_BY_CAPABILITY,
  QUOTA_ENV_PREFIX,
  quotaFor,
  quotaReached,
  recordUsage,
  monthlyUsage,
  monthStart
};
