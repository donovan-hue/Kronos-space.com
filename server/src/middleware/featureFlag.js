const { isFeatureEnabled, DEFAULT_FLAGS } = require("../config/featureFlags");

/**
 * Guarda de servidor para las funciones que se liberan tras un flag.
 *
 * POR QUÉ EXISTE
 *
 * `isFeatureEnabled` estaba exportado desde el principio y **ningún módulo de
 * rutas lo llamaba**: el flag solo filtraba ítems del menú en el cliente. Eso
 * hace que apagar una función sea cosmético: el enlace desaparece y la API
 * sigue viva, de modo que un cliente antiguo, un enlace guardado o una
 * integración siguen entrando. Un flag de liberación tiene que apagar la
 * función de verdad, y «de verdad» es el servidor.
 *
 * Cómo responde:
 * - 404 y no 403: una función apagada no existe, y un 403 confirmaría que el
 *   recurso está ahí y solo falta permiso.
 * - Código `FEATURE_DISABLED` para que el cliente pueda distinguirlo de un
 *   recurso realmente inexistente y mostrar «esta función está apagada».
 * - Solo se declaran flags que existen en `DEFAULT_FLAGS`: un nombre con typo
 *   apagaría el módulo para siempre porque `isFeatureEnabled` devolvería
 *   `false`. Por eso se comprueba al construir el middleware.
 */
function requireFeatureFlag(name) {
  if (!Object.prototype.hasOwnProperty.call(DEFAULT_FLAGS, name)) {
    throw new Error(`FEATURE_FLAG_UNKNOWN: ${name} no está en DEFAULT_FLAGS`);
  }

  return function featureFlagGuard(req, res, next) {
    if (isFeatureEnabled(name)) return next();

    return res.status(404).json({
      error: "Esta función no está disponible.",
      code: "FEATURE_DISABLED",
      flag: name
    });
  };
}

module.exports = requireFeatureFlag;
module.exports.requireFeatureFlag = requireFeatureFlag;
