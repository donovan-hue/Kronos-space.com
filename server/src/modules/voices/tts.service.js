const { createOpenRouterClient } = require("../../config/openrouter");
const { saveBuffer } = require("../../config/storage");
const { ajustesVoz } = require("./voiceSettings");

/* ============================================================
   LOCUCIÓN — la voz generada desde el texto

   Convierte un texto en una toma de voz usando el mismo punto de conexión
   que el resto de la IA del proyecto (OpenRouter, configuración única en
   `config/openrouter.js`): el endpoint de voz es compatible con el de audio
   del estándar, así que no hace falta ningún servicio nuevo ni otra llave.

   Lo que devuelve el proveedor es un archivo MP3 que se guarda en el
   almacén propio (`/uploads/voices/`) y vuelve como URL, igual que una
   grabación del micrófono: la receta de la publicación nunca guarda una
   dirección de terceros.

   El modelo y la voz salen de `voiceSettings.js` (variables de entorno), y
   una voz del catálogo puede traer los suyos.
   ============================================================ */

const LIMITE_TEXTO = 1200;
const TIMEOUT_MS = 60000;
// El proveedor entrega MP3; el tope es el mismo que el de la subida de audio.
const MAX_BYTES = 15 * 1024 * 1024;

function comoBuffer(respuesta) {
  if (respuesta && typeof respuesta.arrayBuffer === "function") {
    return respuesta.arrayBuffer().then((datos) => Buffer.from(datos));
  }
  if (respuesta && typeof respuesta[Symbol.asyncIterator] === "function") {
    return (async () => {
      const trozos = [];
      for await (const trozo of respuesta) trozos.push(Buffer.from(trozo));
      return Buffer.concat(trozos);
    })();
  }
  return Promise.reject(new Error("VOICE_RESULT_INVALID"));
}

/* `guardar` es el guardado del almacén propio. Se puede sustituir para
   probar la ruta completa sin escribir en disco ni tocar la base. */
async function generarLocucion({ texto, modelo, voz, apiKey, ownerId = null, env = process.env, guardar = saveBuffer } = {}) {
  const limpio = typeof texto === "string" ? texto.trim() : "";
  if (!limpio) throw new Error("VOICE_TEXT_INVALID");
  if (limpio.length > LIMITE_TEXTO) throw new Error("VOICE_TEXT_TOO_LONG");

  const ajustes = ajustesVoz(env);
  const client = createOpenRouterClient({
    apiKey: typeof apiKey === "string" && apiKey.trim() ? apiKey : ajustes.apiKey,
    timeout: TIMEOUT_MS,
    maxRetries: 0
  });

  let respuesta;
  try {
    respuesta = await client.audio.speech.create({
      model: modelo || ajustes.modelo,
      voice: voz || ajustes.voz,
      input: limpio,
      response_format: "mp3"
    });
  } catch (error) {
    if (error?.message === "OPENROUTER_API_KEY_NOT_CONFIGURED") throw error;
    const tiempoAgotado =
      error?.name === "APIConnectionTimeoutError" ||
      error?.name === "TimeoutError" ||
      error?.code === "ETIMEDOUT" ||
      error?.status === 408;
    throw new Error(tiempoAgotado ? "VOICE_PROVIDER_TIMEOUT" : "VOICE_PROVIDER_UNAVAILABLE");
  }

  let buffer;
  try {
    buffer = await comoBuffer(respuesta);
  } catch {
    throw new Error("VOICE_RESULT_INVALID");
  }

  if (!buffer?.length) throw new Error("VOICE_RESULT_INVALID");
  if (buffer.length > MAX_BYTES) throw new Error("VOICE_RESULT_TOO_LARGE");

  let guardado;
  try {
    guardado = await guardar({
      buffer,
      mimetype: "audio/mpeg",
      originalname: "locucion.mp3",
      subdir: "voices",
      ownerId
    });
  } catch {
    throw new Error("VOICE_RESULT_PERSIST_FAILED");
  }

  return {
    url: guardado.url,
    size: guardado.size,
    mimeType: "audio/mpeg",
    modelo: modelo || ajustes.modelo,
    voz: voz || ajustes.voz
  };
}

module.exports = {
  generarLocucion,
  comoBuffer,
  LIMITE_TEXTO,
  TIMEOUT_MS,
  MAX_BYTES
};
