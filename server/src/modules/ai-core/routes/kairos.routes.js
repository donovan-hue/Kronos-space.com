const express = require("express");

const auth = require("../../../middleware/auth");
const { requireUser } = require("../../../middleware/permissions");
const { getAIProviderConfig } = require("../../../config/aiProviders");
const { ajustesVoz } = require("../../voices/voiceSettings");
const MusicTrack = require("../../music/MusicTrack");

const router = express.Router();

/* ============================================================
   KAIROS — capacidades del estudio

   GET /api/kairos/capacidades — qué puede producir el estudio ahora mismo.

   Es la respuesta que el tablero de Kairos pinta en cada tarjeta, y por eso
   no se puede inventar nada:

   - cada capacidad que depende de un proveedor dice `listo` mirando de
     verdad si están sus variables, y cuando falta alguna la nombra;
   - las capacidades que viven en el servidor (trabajos, biblioteca,
     historial) van listas porque su dato está en la base, no en un proveedor;
   - los filtros viven en el estudio, en el navegador: se declaran listos y se
     dice de dónde son, sin prometer nada que dependa de terceros;
   - la música dice cuántas pistas hay publicadas de verdad.

   La respuesta va plana (`{ imagen, video, texto, voz, ... }`) porque el
   tablero lee cada capacidad por su nombre.
   ============================================================ */

/* Una capacidad de proveedor: listo si están todas sus variables. `falta`
   nombra exactamente lo que no está, para que la pantalla lo pueda decir. */
function capacidadDeProveedor(capacidad) {
  const config = getAIProviderConfig(capacidad);

  // El catálogo de proveedores ya resuelve qué variable exige cada capacidad;
  // aquí solo se comprueba el entorno, sin adivinar.
  const proveedor = config.provider;
  const variableLlave =
    proveedor === "openrouter" ? "OPENROUTER_API_KEY"
      : proveedor === "gemini" ? "GEMINI_API_KEY"
        : proveedor === "video-api" ? "VIDEO_API_KEY"
          : "";
  const variableEndpoint = proveedor === "video-api" ? "VIDEO_API_URL" : "";

  const falta = [];
  if (variableLlave && !String(process.env[variableLlave] || "").trim()) falta.push(variableLlave);
  if (variableEndpoint && !String(process.env[variableEndpoint] || "").trim()) falta.push(variableEndpoint);
  if (!variableLlave) falta.push("proveedor");

  return {
    listo: falta.length === 0,
    proveedor,
    modelo: config.model,
    variable: variableLlave,
    falta
  };
}

router.get("/capacidades", auth, requireUser, async (req, res) => {
  try {
    const voz = ajustesVoz();

    // El catálogo de música: si la base no responde, se dice; no se finge.
    let pistas = 0;
    let musicaLista = true;
    let motivoMusica = "";
    try {
      pistas = await MusicTrack.countDocuments({ publicada: true });
    } catch {
      musicaLista = false;
      motivoMusica = "No se pudo leer el catálogo de música del servidor.";
    }

    return res.json({
      imagen: capacidadDeProveedor("image"),
      video: capacidadDeProveedor("video"),
      texto: capacidadDeProveedor("script"),
      chat: capacidadDeProveedor("chat"),
      voz: {
        listo: voz.listo,
        proveedor: "openrouter",
        modelo: voz.modelo,
        voz: voz.voz,
        variable: voz.variable,
        falta: voz.listo ? [] : [voz.variable]
      },
      musica: {
        listo: musicaLista,
        pistas,
        motivo: motivoMusica
      },
      filtros: {
        listo: true,
        nota: "Del estudio de la publicación: filtros y tono se aplican en el navegador."
      },
      trabajos: { listo: true, nota: "Cola e historial de videos guardados en el servidor." },
      biblioteca: { listo: true, nota: "Todo lo generado y publicado, con su receta." },
      historial: { listo: true, nota: "Generaciones por usuario y fecha." }
    });
  } catch (error) {
    console.error("KAIROS_CAPACITIES_ERROR:", error);
    return res.status(500).json({ error: "No se pudieron leer las capacidades del estudio" });
  }
});

module.exports = router;
module.exports.capacidadDeProveedor = capacidadDeProveedor;
