const AiUsage = require("../modules/ai-core/AiUsage");
const { monthlyUsage, quotaFor } = require("../modules/ai-core/aiUsage.service");

/**
 * Corta la generación cuando la cuenta ya alcanzó su cuota del mes.
 *
 * POR QUÉ EXISTE
 *
 * El libro de consumo (`AiUsage`) medía, pero no limitaba: una cuenta podía
 * gastar sin techo y la pantalla solo lo contaba después. Sin cuota declarada
 * (`AI_QUOTA_<CAPACIDAD>` vacío o ausente) esto no hace nada a propósito: el
 * producto todavía no ha decidido precios y un límite inventado cortaría el
 * trabajo de alguien por una cifra que nadie aprobó.
 *
 * Detalles que importan:
 * - Responde **402** con `code: "CUOTA_AGOTADA"`: no es un 429 (no es «espera un
 *   momento», es «este mes no queda») ni un 403 (no es un permiso que falte).
 * - Se consulta ANTES de llamar al proveedor, que es donde cuesta dinero. La
 *   cuota cuenta operaciones imputadas, no intentos: un fallo del proveedor se
 *   anota con `units: 0` y no acerca al corte.
 * - Se calcula en la base y no en memoria: dos réplicas no comparten contador y
 *   sumar en memoria permitiría pasarse por el número de réplicas.
 * - Si la base falla, **deja pasar**: negar el servicio por no poder leer un
 *   contador interno convierte un problema de medición en una caída.
 */
function cuotaIA(capability) {
  if (!AiUsage.CAPACITIES.includes(capability)) {
    throw new Error(`CUOTA_CAPACIDAD_DESCONOCIDA: ${capability}`);
  }

  return async function cuotaGuard(req, res, next) {
    // Sin cuota declarada no se consulta la base siquiera.
    if (quotaFor(capability) === null) return next();

    try {
      const filas = await monthlyUsage(req.user.id);
      const fila = filas.find((item) => item.capability === capability);

      if (fila?.agotada) {
        return res.status(402).json({
          error: "Alcanzaste el límite de uso de esta capacidad este mes.",
          code: "CUOTA_AGOTADA",
          capability,
          cuota: fila.cuota,
          consumido: fila.units,
          unidad: fila.unit
        });
      }

      return next();
    } catch (error) {
      console.error("AI_QUOTA_CHECK_ERROR:", error?.message || error);
      return next();
    }
  };
}

module.exports = cuotaIA;
module.exports.cuotaIA = cuotaIA;
