const fs = require("fs");

/**
 * La única salida humana del portón CRITICAL.
 *
 * `index.js` falla el job cuando el riesgo general es CRITICAL. Sin esta
 * salida, la única forma de satisfacer el portón es no tocar nunca esos
 * archivos, y eso no es una revisión: es una congelación. Un portón útil
 * necesita un cerrojo que abra una persona, con nombre y rastro.
 *
 * El cerrojo es una etiqueta en la propia pull request
 * (`riesgo-crítico-revisado`). No la aplica el guardián ni ningún script del
 * repositorio: la aplica quien tiene permiso de escritura en la PR, y queda
 * en el historial de GitHub — que es justo el registro que se necesita poder
 * leer después: quién decidió, sobre qué PR y con qué fecha.
 *
 * La etiqueta se lee del payload del evento (`GITHUB_EVENT_PATH`), no de la
 * API: el payload ya la trae, no gasta llamadas y no depende de que el token
 * tenga permiso de lectura sobre las etiquetas. El módulo es puro salvo ese
 * `readFileSync`, así que las reglas se pueden probar sin `GITHUB_TOKEN` y sin
 * red — la misma razón por la que `classify.js` vive aparte.
 *
 * Qué NO hace este módulo: no decide si el cambio es bueno, ni perdona una
 * ruta crítica que el PR no tocó, y no baja ningún nivel que no sea CRITICAL.
 */
const ETIQUETA_APROBACION = "riesgo-crítico-revisado";

/**
 * Nombres de las etiquetas puestas en la PR, leídos del payload del evento.
 *
 * Devuelve `[]` cuando no hay contexto de PR o el payload no se puede leer:
 * la ausencia de etiqueta significa «no hay aprobación», nunca «da igual».
 */
function etiquetasDelEvento(eventPath = process.env.GITHUB_EVENT_PATH) {
  if (!eventPath) return [];

  let evento;
  try {
    evento = JSON.parse(fs.readFileSync(eventPath, "utf8"));
  } catch {
    return [];
  }

  const etiquetas = evento?.pull_request?.labels ?? evento?.issue?.labels;
  if (!Array.isArray(etiquetas)) return [];

  return etiquetas
    .map((entrada) => String(entrada?.name ?? "").trim())
    .filter(Boolean);
}

/** ¿La lista de etiquetas declara la revisión humana del riesgo crítico? */
function hayAprobacion(etiquetas) {
  return Array.isArray(etiquetas) && etiquetas.includes(ETIQUETA_APROBACION);
}

module.exports = {
  ETIQUETA_APROBACION,
  etiquetasDelEvento,
  hayAprobacion
};
