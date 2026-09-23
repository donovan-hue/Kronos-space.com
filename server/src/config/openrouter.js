const OpenAI = require("openai");

/**
 * Punto único de conexión con OpenRouter.
 *
 * Antes cada servicio construía su propio cliente OpenAI con la misma
 * `baseURL` copiada a mano (guion e imagen). Copiar la cadena de conexión
 * significa que un cambio de proveedor, de cabecera o de timeout puede
 * quedar aplicado en un servicio y no en otro. Aquí solo hay una versión.
 */

const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";
const OPENROUTER_APP_TITLE = "Kronos Space";

/**
 * Base URL efectiva. Solo se cambia con OPENROUTER_BASE_URL, pensado para
 * gateways compatibles (proxy propio, despliegue espejo). Vacío o ausente
 * significa el proveedor oficial, que es el camino de producción.
 */
function openRouterBaseUrl(env = process.env) {
  const configured = String(env.OPENROUTER_BASE_URL || "").trim().replace(/\/+$/, "");

  return configured || OPENROUTER_BASE_URL;
}

function isOfficialOpenRouterBaseUrl(env = process.env) {
  return openRouterBaseUrl(env) === OPENROUTER_BASE_URL;
}

/**
 * Origen declarado ante OpenRouter para rankings y para el panel de la app.
 * Se usa el PRIMERO de CLIENT_URL porque es el canónico (ver server/.env.example).
 */
function openRouterReferer(env = process.env) {
  const origin = String(env.CLIENT_URL || "http://localhost:3000")
    .split(",")[0]
    .trim();

  return origin || "http://localhost:3000";
}

function openRouterHeaders(env = process.env) {
  return {
    "HTTP-Referer": openRouterReferer(env),
    "X-Title": OPENROUTER_APP_TITLE
  };
}

/**
 * Cliente OpenAI apuntando a OpenRouter. Todo el tráfico de IA de texto e
 * imagen sale por aquí, de modo que las pruebas de humo puedan ejercitar la
 * misma conexión que usa la aplicación en producción.
 */
function createOpenRouterClient({
  apiKey,
  timeout,
  maxRetries,
  env = process.env
}) {
  if (typeof apiKey !== "string" || !apiKey.trim()) {
    throw new Error("OPENROUTER_API_KEY_NOT_CONFIGURED");
  }

  return new OpenAI({
    apiKey: apiKey.trim(),
    baseURL: openRouterBaseUrl(env),
    timeout,
    maxRetries,
    defaultHeaders: openRouterHeaders(env)
  });
}

module.exports = {
  OPENROUTER_BASE_URL,
  OPENROUTER_APP_TITLE,
  openRouterBaseUrl,
  isOfficialOpenRouterBaseUrl,
  openRouterReferer,
  openRouterHeaders,
  createOpenRouterClient
};
