/* ============================================================
   AJUSTES DE VOZ — un solo lugar para el modelo, la voz y la llave

   La locución usa la misma llave de OpenRouter que la imagen y el guion, y
   su modelo y su voz se eligen por variables de entorno para poder cambiarlos
   sin tocar código:

   - OPENROUTER_API_KEY    (la misma de siempre)
   - OPENROUTER_TTS_MODEL  modelo de voz (por defecto x-ai/grok-voice-tts-1.0)
   - OPENROUTER_TTS_VOICE  voz del modelo (por defecto eve)

   `listo` solo mira si existe la llave: el modelo y la voz tienen valor por
   defecto, así que no hay forma de quedar a medias.
   ============================================================ */

const VARIABLE_LLAVE = "OPENROUTER_API_KEY";
const MODELO_POR_DEFECTO = "x-ai/grok-voice-tts-1.0";
const VOZ_POR_DEFECTO = "eve";

function ajustesVoz(env = process.env) {
  const modelo = String(env.OPENROUTER_TTS_MODEL || "").trim();
  const voz = String(env.OPENROUTER_TTS_VOICE || "").trim();
  const apiKey = String(env[VARIABLE_LLAVE] || "").trim();

  return {
    apiKey,
    listo: Boolean(apiKey),
    variable: VARIABLE_LLAVE,
    modelo: modelo || MODELO_POR_DEFECTO,
    voz: voz || VOZ_POR_DEFECTO,
    limites: {
      texto: 1200
    }
  };
}

module.exports = {
  ajustesVoz,
  VARIABLE_LLAVE,
  MODELO_POR_DEFECTO,
  VOZ_POR_DEFECTO
};
