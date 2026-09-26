const mongoose = require("mongoose");

/**
 * Utilidades de consulta compartidas por los módulos de la API.
 * Antes cada archivo de rutas mantenía su propia copia local de estos
 * helpers (hasta 10 copias idénticas de `validId`), con el riesgo de que
 * divergieran entre módulos. La paginación acepta límites por módulo para
 * conservar el comportamiento histórico de cada endpoint.
 */

/** Valida un id de MongoDB proveniente de ruta o query string. */
function validId(value) {
  return mongoose.Types.ObjectId.isValid(value);
}

/** Escapa metacaracteres de expresiones regulares para búsquedas literales. */
function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Normaliza paginación: `page` >= 1, `limit` acotado a [1, maxLimit] y
 * `skip` listo para consultas de Mongo.
 */
function parsePagination(query = {}, { defaultLimit = 20, maxLimit = 50 } = {}) {
  let page = parseInt(query.page, 10);
  let limit = parseInt(query.limit, 10);

  if (!Number.isInteger(page) || page < 1) page = 1;
  if (!Number.isInteger(limit) || limit < 1) limit = defaultLimit;
  if (limit > maxLimit) limit = maxLimit;

  return { page, limit, skip: (page - 1) * limit };
}

module.exports = { validId, escapeRegex, parsePagination };
