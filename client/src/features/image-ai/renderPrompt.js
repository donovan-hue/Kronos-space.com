/**
 * Arma el prompt de un instrumento en el navegador, para la vista previa.
 *
 * Tiene que dar **exactamente** lo mismo que `renderPrompt` del servidor
 * (`server/src/modules/prompts/promptLibrary.js`): si la vista previa dijera
 * una cosa y el preset guardado otra, la biblioteca mentiría. La prueba
 * `client/test-ui/prompt-parity.spec.jsx` compara ambos con los 54
 * instrumentos, así que un cambio en uno sin el otro rompe en vez de pasar.
 *
 * Se duplica en vez de pedirlo al servidor porque la vista previa se pinta en
 * cada pulsación de tecla: un viaje por letra no tiene sentido.
 */

const MAX_PROMPT_LENGTH = 4000;
const MAX_CAMPO_LENGTH = 3000;

export function renderPrompt(template, campos, valores = {}) {
  const limpios = {};
  for (const campo of campos) {
    const valor = valores?.[campo];
    const texto = typeof valor === "string" ? valor.trim().slice(0, MAX_CAMPO_LENGTH) : "";
    if (texto) limpios[campo] = texto;
  }

  if (Object.keys(limpios).length === 0) return "";

  const partes = [];
  let seCayoUna = false;
  for (const coincidencia of template.matchAll(/([^.;,]+)([.;,]?)/g)) {
    const clausula = coincidencia[1];
    const separador = coincidencia[2] || "";
    const huecos = [...clausula.matchAll(/\{\{(\w+)\}\}/g)].map((hueco) => hueco[1]);

    if (huecos.length === 0) {
      if (clausula.trim()) partes.push(`${clausula.trim()}${separador}`);
      continue;
    }

    if (huecos.every((hueco) => !limpios[hueco])) {
      seCayoUna = true;
      continue;
    }

    if (seCayoUna) {
      const ultima = partes[partes.length - 1];
      if (ultima && ultima.endsWith(":") && ultima.length <= 40) partes.pop();
      seCayoUna = false;
    }

    const rellena = clausula
      .replace(/\{\{(\w+)\}\}/g, (_, hueco) => limpios[hueco] || "")
      .replace(/\s{2,}/g, " ")
      .trim()
      .replace(/\s+([.;:,])$/, "$1");
    if (rellena && rellena !== separador) partes.push(`${rellena}${separador}`);
  }

  const texto = partes.join(" ")
    .replace(/,\s+(?=[A-ZÁÉÍÓÚÜÑ])/g, ". ")
    .replace(/\s+/g, " ")
    .replace(/^[\s.,;:]+/, "")
    .replace(/\s+([.;:,])/g, "$1")
    .replace(/[,;:]+$/, ".")
    .trim();

  if (texto.length > MAX_PROMPT_LENGTH) {
    const recortado = texto.slice(0, MAX_PROMPT_LENGTH);
    const corte = recortado.lastIndexOf(" ");
    return `${(corte > 0 ? recortado.slice(0, corte) : recortado).trim()}…`;
  }

  return texto;
}
