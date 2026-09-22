/**
 * Sanitización defensiva de entrada (trim + anti NoSQL-injection).
 *
 * NOTA Express 5: `req.query` es un getter sin setter efectivo — reasignar
 * `req.query = {...}` se ignora en silencio. Por eso aquí se MUTA en sitio
 * (borrado + asignación por clave) en lugar de reemplazar el objeto.
 *
 * Además:
 * - Nunca se tocan campos de contraseña (`password*`, `*password*`): el trim
 *   reduciría el espacio de claves y `current/newPassword` deben viajar
 *   intactos para que registro y login comparen lo mismo que el usuario escribió.
 * - Las claves eliminadas (`$` o con `.`) se registran una vez por request
 *   para no romper payloads en silencio (ver `req.sanitizedDropped`).
 */

const PASSWORD_KEY_PATTERN = /password|passwd|pwd/i;

function shouldSkipKey(key) {
  return (
    typeof key === "string" &&
    (key.startsWith("$") || key.includes("."))
  );
}

function sanitizeValue(value) {
  if (typeof value === "string") {
    return value.trim();
  }

  if (Array.isArray(value)) {
    return value.map(sanitizeValue);
  }

  if (value && typeof value === "object") {
    const sanitized = {};

    for (const [key, nestedValue] of Object.entries(value)) {
      if (shouldSkipKey(key)) {
        continue;
      }

      // Las contraseñas viajan intactas (sin trim) para no alterar la clave.
      if (PASSWORD_KEY_PATTERN.test(key)) {
        sanitized[key] = nestedValue;
        continue;
      }

      sanitized[key] = sanitizeValue(nestedValue);
    }

    return sanitized;
  }

  return value;
}

/**
 * Aplica `sanitizeValue` MUTANDO el objeto original en sitio.
 * Devuelve la lista de claves eliminadas (para diagnóstico).
 */
function sanitizeInPlace(target) {
  const dropped = [];

  if (!target || typeof target !== "object" || Array.isArray(target)) {
    return dropped;
  }

  for (const key of Object.keys(target)) {
    if (shouldSkipKey(key)) {
      dropped.push(key);
      delete target[key];
      continue;
    }

    if (PASSWORD_KEY_PATTERN.test(key)) {
      continue;
    }

    target[key] = sanitizeValue(target[key]);
  }

  return dropped;
}

function inputSanitizer(req, res, next) {
  try {
    const dropped = [];

    if (req.body && typeof req.body === "object") {
      // `req.body` sí admite reasignación, pero mutar en sitio mantiene la
      // misma referencia para cualquier middleware que ya la capturó.
      dropped.push(...sanitizeInPlace(req.body));
    }

    if (req.query && typeof req.query === "object") {
      dropped.push(...sanitizeInPlace(req.query));
    }

    if (req.params && typeof req.params === "object") {
      dropped.push(...sanitizeInPlace(req.params));
    }

    if (dropped.length > 0) {
      req.sanitizedDropped = dropped;
      console.warn("INPUT_SANITIZER_DROPPED_KEYS", {
        requestId: req.requestId || "",
        method: req.method,
        path: req.originalUrl?.split("?")[0] || "",
        keys: dropped.slice(0, 10)
      });
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
module.exports.sanitizeInPlace = sanitizeInPlace;
