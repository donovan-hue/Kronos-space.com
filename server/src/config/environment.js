/**
 * KRONOS — clasificación del entorno de ejecución.
 *
 * Existe porque la misma pregunta se respondía de forma distinta en cuatro
 * sitios, y en tres de ellos la respuesta equivocada abría la puerta en vez
 * de cerrarla. Todas comparaban `NODE_ENV` contra la cadena exacta
 * `"production"`, así que `Production`, `PROD`, `prod`, `live`, un valor
 * vacío o —el caso más frecuente en un despliegue real— ninguno en absoluto,
 * caían del lado permisivo:
 *
 *   - `migrations/runner.js` dejaba de exigir `--confirm` para migrar la base
 *     de producción;
 *   - `server.js` arrancaba sin `CLIENT_URL` y con los orígenes CORS
 *     implícitos;
 *   - `config/durableUploads.js` degradaba en silencio la copia durable en
 *     lugar de responder 503;
 *   - `config/db.js` construía los 61 índices al arrancar.
 *
 * La pregunta correcta no es «¿puedo demostrar que esto es producción?» sino
 * «¿consta que este entorno NO tiene datos reales?». Solo `development` y
 * `test` —los dos que el proyecto documenta y usa— la responden que sí.
 * Cualquier otro valor, incluida su ausencia, cuenta como producción.
 *
 * Deliberadamente NO se usa para elegir comportamiento funcional, como qué
 * origen anuncia la federación: ahí tratar lo desconocido como producción
 * haría que un entorno de desarrollo publicara enlaces a la API real, que es
 * lo contrario de lo que se busca. Esto clasifica riesgo, no configuración.
 */

/** Los únicos entornos donde consta que las bases son desechables. */
const ENTORNOS_SIN_DATOS_REALES = Object.freeze(["development", "test"]);

const CONOCIDOS = new Set(ENTORNOS_SIN_DATOS_REALES);

/**
 * Ninguna de estas funciones lleva parámetro por defecto, y es a propósito:
 * un default no distingue «no me pasaron nada» de «me pasaron undefined»,
 * así que `isProductionEnvironment(entornoSinDefinir)` habría ido a leer el
 * `NODE_ENV` del proceso y habría contestado por un valor que no era el que
 * le dieron. En una guarda eso vuelve a abrir la puerta. Quien llama dice de
 * dónde sale el valor; para el del proceso está `isProductionProcessEnv()`.
 */

/** `" Production \n"` y `production` deben decidir lo mismo. */
function normalizeEnvironment(value) {
  return String(value ?? "").trim().toLowerCase();
}

/** Verdadero solo para un entorno explícitamente reconocido como sin datos reales. */
function isKnownNonProductionEnvironment(value) {
  return CONOCIDOS.has(normalizeEnvironment(value));
}

/**
 * Fail-closed: todo lo que no conste como entorno sin datos reales se trata
 * como producción. Es la función que deben usar las guardas de seguridad.
 */
function isProductionEnvironment(value) {
  return !isKnownNonProductionEnvironment(value);
}

/** El entorno del proceso actual, clasificado con el mismo criterio. */
function isProductionProcessEnv() {
  return isProductionEnvironment(process.env.NODE_ENV);
}

module.exports = {
  ENTORNOS_SIN_DATOS_REALES,
  normalizeEnvironment,
  isKnownNonProductionEnvironment,
  isProductionEnvironment,
  isProductionProcessEnv
};
