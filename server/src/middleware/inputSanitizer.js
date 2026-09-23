/**
 * Saneado de entrada de la API.
 *
 * Reglas:
 *  1. Las cadenas se recortan (trim).
 *  2. Las claves que empiezan por `$` o contienen `.` se eliminan: son
 *     operadores de MongoDB (`$ne`, `$gt`, `$where`…) y rutas de campo, es
 *     decir, el vector de inyección NoSQL cuando un valor del cliente llega
 *     a una consulta.
 *  3. Si un objeto solo contenía claves peligrosas, la clave entera se
 *     elimina en lugar de quedar como `{}`. Un `{}` sobreviviente pasaba las
 *     validaciones de "campo obligatorio" (es truthy) y llegaba a Mongoose,
 *     donde se casteaba a String y producía un 500 en lugar de un 400/401.
 *
 * Aplicación real (Express 5): `req.query` es un `getter` heredado del
 * prototipo de la petición, por lo que `req.query = saneado` NO tiene efecto
 * (asignación silenciosa a un accesor sin setter). Aquí se define la
 * propiedad propia con `Object.defineProperty`, que sí la reemplaza. Sin
 * esto, el saneado de query era código muerto y solo se saneaba el cuerpo de
 * la petición.
 *
 * Nota sobre `req.params`: montado a nivel de aplicación (como en
 * `src/server.js`) se ejecuta antes de que el router asigne los parámetros
 * de la ruta, así que los `params` que ve este middleware todavía están
 * vacíos; para que el saneado aplique a los parámetros hay que usarlo como
 * middleware de la propia ruta (`router.get("/x/:id", inputSanitizer, …)`).
 * No es un agujero: `req.params` son siempre cadenas planas de la URL y
 * ningún módulo construye un filtro de Mongo con el objeto `params`.
 */

/**
 * Marca interna para distinguir "el objeto quedó vacío tras eliminar claves
 * peligrosas" de "el objeto ya venía vacío" (este último es un dato legítimo
 * y se conserva tal cual).
 */
const EMPTY_AFTER_SANITIZE = Symbol("EMPTY_AFTER_SANITIZE");
const DANGEROUS_KEYS = new Set(["__proto__", "constructor", "prototype"]);

function isDangerousKey(key) {
  return key.startsWith("$") || key.includes(".") || DANGEROUS_KEYS.has(key);
}

function sanitizeValue(value) {
  if (typeof value === "string") {
    return value.trim();
  }

  if (Array.isArray(value)) {
    // Los elementos que quedan vacíos tras eliminar claves peligrosas se
    // descartan (nunca se convierten en `null` dentro del array).
    return value
      .map(sanitizeValue)
      .filter((item) => item !== EMPTY_AFTER_SANITIZE);
  }

  if (value && typeof value === "object") {
    const sanitized = {};
    let strippedKeys = 0;

    for (const [key, nestedValue] of Object.entries(value)) {
      if (isDangerousKey(key)) {
        strippedKeys += 1;
        continue;
      }

      sanitized[key] = sanitizeValue(nestedValue);
    }

    // Objeto que solo tenía claves peligrosas: se descarta por completo.
    if (strippedKeys > 0 && Object.keys(sanitized).length === 0) {
      return EMPTY_AFTER_SANITIZE;
    }

    return sanitized;
  }

  return value;
}

function sanitizeContainer(container) {
  const sanitized = {};

  for (const [key, value] of Object.entries(container)) {
    const result = sanitizeValue(value);

    if (result === EMPTY_AFTER_SANITIZE) continue;

    sanitized[key] = result;
  }

  return sanitized;
}

/**
 * Reemplaza una propiedad de la petición incluso cuando en el prototipo
 * exista un `getter` (caso de `req.query` en Express 5).
 */
function replaceProperty(target, key, value) {
  if (!target || typeof target !== "object") return;

  try {
    Object.defineProperty(target, key, {
      value,
      writable: true,
      configurable: true,
      enumerable: true
    });
    return;
  } catch {
    /* Si no se puede redefinir, se intenta la asignación directa. */
  }

  try {
    target[key] = value;
  } catch {
    /* Último recurso: se deja el valor original sin romper la petición. */
  }
}

function inputSanitizer(req, res, next) {
  try {
    if (req.body && typeof req.body === "object") {
      replaceProperty(req, "body", sanitizeContainer(req.body));
    }

    if (req.query && typeof req.query === "object") {
      replaceProperty(req, "query", sanitizeContainer(req.query));
    }

    if (req.params && typeof req.params === "object") {
      replaceProperty(req, "params", sanitizeContainer(req.params));
    }

    next();
  } catch (error) {
    error.statusCode = 400;
    error.message = "Datos de entrada inválidos.";
    next(error);
  }
}

module.exports = inputSanitizer;
module.exports.sanitizeValue = sanitizeValue;
module.exports.sanitizeContainer = sanitizeContainer;
module.exports.isDangerousKey = isDangerousKey;
