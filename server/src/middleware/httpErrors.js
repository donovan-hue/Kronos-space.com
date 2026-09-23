/**
 * KRONOS-AUDIT-004 — taxonomía de errores de infraestructura.
 *
 * Express y body-parser entregan sus fallos al manejador global con el
 * mensaje del runtime en inglés. Reenviarlo tal cual rompía dos cosas a la
 * vez: el idioma de la API (todo lo demás responde en español) y la regla de
 * no exponer detalles internos. Comprobado sobre HTTP real antes de este
 * módulo:
 *
 *   POST /api/auth/login  '{"email":'
 *     -> 400 {"error":"Unexpected end of JSON input"}
 *   POST /api/auth/login  cuerpo de 2 MB
 *     -> 413 {"error":"request entity too large"}
 *
 * `describeClientError` reconoce esos errores por su `type` (el que asigna
 * body-parser) o por su forma, y devuelve un contrato estable en español.
 *
 * Los errores de aplicación NO pasan por aquí: siguen llevando su propio
 * `statusCode` y su mensaje en español, y el manejador global los conserva
 * como hasta ahora.
 */

/**
 * Tipos que asigna body-parser/raw-body y que son responsabilidad del
 * cliente (4xx). Un tipo desconocido no se traduce aquí: cae al manejador
 * global y termina como 500 genérico, que es lo correcto para un fallo del
 * que el cliente no puede responder.
 */
const BODY_PARSER_ERRORS = {
  "entity.too.large": {
    status: 413,
    code: "PAYLOAD_TOO_LARGE",
    message: "El contenido de la petición supera el tamaño permitido."
  },
  "entity.parse.failed": {
    status: 400,
    code: "INVALID_JSON",
    message: "El cuerpo de la petición no es JSON válido."
  },
  "charset.unsupported": {
    status: 415,
    code: "UNSUPPORTED_CHARSET",
    message: "El juego de caracteres de la petición no está soportado."
  },
  "encoding.unsupported": {
    status: 415,
    code: "UNSUPPORTED_ENCODING",
    message: "La codificación de la petición no está soportada."
  },
  "request.aborted": {
    status: 400,
    code: "REQUEST_ABORTED",
    message: "La petición se interrumpió antes de completarse."
  },
  "request.size.invalid": {
    status: 400,
    code: "INVALID_REQUEST_SIZE",
    message: "El tamaño declarado de la petición no es válido."
  },
  "parameters.too.many": {
    status: 413,
    code: "TOO_MANY_PARAMETERS",
    message: "La petición incluye demasiados parámetros."
  }
};

/**
 * Nombres con los que el driver de MongoDB y Mongoose reportan que no hay
 * almacenamiento disponible. Se detectan por nombre para no acoplar la capa
 * HTTP al driver.
 */
const STORAGE_ERROR_NAMES = new Set([
  "MongooseError",
  "MongooseServerSelectionError",
  "MongoServerSelectionError",
  "MongoNetworkError",
  "MongoNetworkTimeoutError",
  "MongoNotConnectedError",
  "MongoTopologyClosedError",
  "MongoPoolClosedError",
  "MongoExpiredSessionError",
  "PoolClearedError"
]);

const STORAGE_ERROR_CODES = new Set([
  "ECONNREFUSED",
  "ENOTFOUND",
  "EAI_AGAIN",
  "ETIMEDOUT",
  "ECONNRESET"
]);

/**
 * ¿El error significa que el almacenamiento (MongoDB) no está disponible?
 *
 * Sirve para responder 503 —"el servicio no puede atender la petición ahora
 * mismo"— en lugar de 500, y sobre todo en lugar de un 401 que cerraría la
 * sesión del usuario por un corte temporal de la base de datos.
 *
 * @param {unknown} error
 * @returns {boolean}
 */
function isStorageUnavailable(error) {
  if (!error || typeof error !== "object") return false;

  const name = typeof error.name === "string" ? error.name : "";

  if (STORAGE_ERROR_NAMES.has(name)) return true;

  const code = typeof error.code === "string" ? error.code : "";

  return STORAGE_ERROR_CODES.has(code);
}

/**
 * Traduce un error de infraestructura reconocido al contrato de la API.
 *
 * @param {unknown} error
 * @returns {{ status: number, code: string, message: string } | null}
 *   `null` cuando el error no es de infraestructura y debe seguir el camino
 *   habitual del manejador global.
 */
function describeClientError(error) {
  if (!error || typeof error !== "object") return null;

  const type = typeof error.type === "string" ? error.type : "";

  if (BODY_PARSER_ERRORS[type]) return { ...BODY_PARSER_ERRORS[type] };

  // body-parser antiguo marcaba el fallo de parseo solo con la forma del
  // error: SyntaxError + status 400 + cuerpo ya leído.
  if (
    error instanceof SyntaxError &&
    error.status === 400 &&
    Object.prototype.hasOwnProperty.call(error, "body")
  ) {
    return { ...BODY_PARSER_ERRORS["entity.parse.failed"] };
  }

  return null;
}

module.exports = {
  BODY_PARSER_ERRORS,
  STORAGE_ERROR_NAMES,
  STORAGE_ERROR_CODES,
  describeClientError,
  isStorageUnavailable
};
