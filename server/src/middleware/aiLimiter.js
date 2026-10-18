const rateLimit = require("express-rate-limit");

/**
 * Presupuesto de las rutas que llaman a un proveedor de IA.
 *
 * Dos defectos corregidos a la vez:
 *
 *  1. Era UN singleton montado en chat, imagen (dos rutas), guion y video.
 *     `express-rate-limit` cuenta por instancia, así que las cinco rutas
 *     compartían los mismos 10 intentos por IP: generar 10 imágenes dejaba el
 *     chat bloqueado 15 minutos sin haber recibido ni una petición. Ahora cada
 *     capacidad tiene la suya.
 *
 *  2. Usaba `standardHeaders: true`, que en la v8 equivale a draft-6 y emite
 *     `ratelimit-limit` / `ratelimit-remaining` / `ratelimit-reset`. El resto
 *     del servidor usa `"draft-8"`, que emite `RateLimit: "10-in-15min"; r=9;
 *     t=900`. Dos contratos de cabeceras en la misma API: cualquier cliente que
 *     leyera el presupuesto restante por la cabecera draft-8 no la encontraba.
 *     También usaba `max`, la opción heredada, en lugar de `limit`.
 */

const WINDOW_MS = 15 * 60 * 1000;

function createAiLimiter(limit) {
  return rateLimit({
    windowMs: WINDOW_MS,
    limit,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: {
      error: "Límite de uso de IA alcanzado. Intenta más tarde."
    }
  });
}

/**
 * Un limitador por capacidad. Las claves son las capacidades de
 * `config/aiProviders.js` más `voice`, que vive en `voices/voiceSettings.js`
 * porque usa la misma llave de OpenRouter con su propio endpoint de audio.
 */
const aiLimiters = {
  chat: createAiLimiter(10),
  image: createAiLimiter(10),
  script: createAiLimiter(10),
  video: createAiLimiter(10),
  // La locución llamaba al TTS de pago de OpenRouter sin ningún limitador de
  // IA: solo la alcanzaba el global de 300 por 15 minutos. Treinta veces más
  // presupuesto facturable que el resto de capacidades, y ninguna regla que lo
  // sujetara.
  voice: createAiLimiter(10)
};

/**
 * Devuelve el limitador de una capacidad. Una capacidad desconocida recibe el
 * de `chat`, que es el más restrictivo de los presupuestados: ante la duda se
 * limita, no se deja pasar sin control.
 */
function aiLimiterFor(capability) {
  return aiLimiters[capability] || aiLimiters.chat;
}

module.exports = aiLimiters.chat;
module.exports.aiLimiters = aiLimiters;
module.exports.aiLimiterFor = aiLimiterFor;
module.exports.createAiLimiter = createAiLimiter;
