/**
 * Subtítulos de un video: texto a WebVTT válido.
 *
 * El modelo y la ruta ya existían (`media.subtitles`, `PATCH
 * /posts/:id/subtitles`) pero **nadie los producía**: el compositor mandaba
 * `subtitles: []` y el `<track>` del reproductor solo aparecía si alguien
 * editaba la base a mano. Aquí se convierte lo que el autor escribe en un VTT
 * que el navegador puede parsear de verdad.
 *
 * Reglas:
 * - Una línea por estrofa; el tiempo se reparte a un ritmo legible, no al
 *   azar, y nunca se pasa de la duración del video.
 * - Si el autor da tiempos explícitos (`mm:ss` o `hh:mm:ss.mmm`), se respetan
 *   siempre que estén dentro del video.
 * - El texto se escapa: un `<` suelto rompería el archivo y el navegador
 *   descartaría TODA la pista, no solo esa línea.
 */

const VELOCIDAD_LECTURA = 14; // caracteres por segundo: lectura cómoda en móvil

function numero(valor, porDefecto = 0) {
  const n = Number(valor);
  return Number.isFinite(n) ? n : porDefecto;
}

/** Segundos → `HH:MM:SS.mmm`, el formato que exige WebVTT. */
export function marcaDeTiempo(segundos) {
  // Se trabaja en milisegundos enteros: redondear por partes producía
  // «00:00:00.1000», que ningún navegador parsea.
  const totalMs = Math.round(Math.max(0, numero(segundos)) * 1000);
  const horas = Math.floor(totalMs / 3600000);
  const minutos = Math.floor((totalMs % 3600000) / 60000);
  const seg = Math.floor((totalMs % 60000) / 1000);
  const ms = totalMs % 1000;
  const dos = (n) => String(n).padStart(2, "0");
  return `${dos(horas)}:${dos(minutos)}:${dos(seg)}.${String(ms).padStart(3, "0")}`;
}

/** Acepta `12`, `1:05`, `01:02:03`, `00:12.500`. Devuelve segundos o `null`. */
export function segundosDeMarca(valor) {
  if (typeof valor === "number" && Number.isFinite(valor) && valor >= 0) return valor;
  const texto = String(valor ?? "").trim();
  if (!texto) return null;
  const partes = texto.split(":");
  if (partes.length > 3) return null;
  if (partes.some((parte) => !/^\d+(\.\d+)?$/.test(parte))) return null;
  return partes.reduce((total, parte) => total * 60 + Number(parte), 0);
}

export function escaparVtt(texto) {
  return String(texto || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * Divide el texto en líneas de subtítulo.
 *
 * Una línea del autor = un subtítulo, salvo que sea tan larga que no quepa en
 * pantalla: entonces se parte por frases y, si aun así no cabe, por palabras.
 * El tope de 90 caracteres es el que un móvil muestra sin cortar.
 */
export function lineasDeSubtitulo(texto, maximo = 90) {
  const lineas = String(texto || "")
    .split(/\r?\n+/)
    .map((linea) => linea.trim())
    .filter(Boolean);

  const salida = [];
  for (const linea of lineas) {
    if (linea.length <= maximo) {
      salida.push(linea);
      continue;
    }
    let actual = "";
    for (const palabra of linea.split(/\s+/)) {
      if (!actual) { actual = palabra; continue; }
      if (`${actual} ${palabra}`.length <= maximo) { actual = `${actual} ${palabra}`; continue; }
      salida.push(actual);
      actual = palabra;
    }
    if (actual) salida.push(actual);
  }
  return salida;
}

/**
 * Construye la pista.
 *
 * `cues` puede venir ya con tiempos (`{ texto, inicio, fin }`) o solo texto:
 * en ese caso se reparte la duración del video en proporción al largo de cada
 * línea. Si no hay duración, cada línea toma 3 s.
 */
export function construirVtt(cues, duracion = 0) {
  const lista = (Array.isArray(cues) ? cues : [])
    .map((cue) => (typeof cue === "string" ? { texto: cue } : cue))
    .filter((cue) => cue && String(cue.texto || "").trim());

  if (!lista.length) return "";

  const total = numero(duracion) > 0 ? numero(duracion) : lista.length * 3;
  const conTiempos = lista.map((cue) => ({
    texto: String(cue.texto).trim(),
    inicio: segundosDeMarca(cue.inicio),
    fin: segundosDeMarca(cue.fin)
  }));

  // Sin tiempos explícitos: reparto proporcional al largo del texto, con un
  // mínimo legible por línea.
  const todosConTiempo = conTiempos.every((cue) => cue.inicio !== null && cue.fin !== null);
  if (!todosConTiempo) {
    const largoTotal = conTiempos.reduce((suma, cue) => suma + Math.max(10, cue.texto.length), 0);
    let cursor = 0;
    conTiempos.forEach((cue, indice) => {
      const peso = Math.max(10, cue.texto.length) / largoTotal;
      const bruto = Math.max(1.2, Math.min(total, total * peso));
      const inicio = cursor;
      const fin = indice === conTiempos.length - 1 ? total : Math.min(total, inicio + bruto);
      cue.inicio = inicio;
      cue.fin = Math.max(inicio + 0.5, fin);
      cursor = cue.fin;
    });
  }

  const bloques = conTiempos
    .map((cue, indice) => {
      const inicio = Math.max(0, Math.min(cue.inicio, total));
      // `fin` se acota primero a la duración y luego se separa del inicio: al
      // revés, una pista que empezaba al final del video generaba un tramo
      // invertido (el navegador descarta la línea sin avisar).
      const fin = Math.min(total, Math.max(cue.fin, inicio + 0.5)) || inicio + 0.5;
      return `${indice + 1}\n${marcaDeTiempo(inicio)} --> ${marcaDeTiempo(fin)}\n${escaparVtt(cue.texto)}`;
    })
    .join("\n\n");

  return `WEBVTT\n\n${bloques}\n`;
}

/**
 * Estimación de duración si el autor no la conoce: se usa el ritmo de lectura.
 * Permite avisar «tu texto dura más que el video» antes de publicar.
 */
export function duracionEstimada(texto) {
  const largo = String(texto || "").trim().length;
  if (!largo) return 0;
  return Math.max(1.2, largo / VELOCIDAD_LECTURA);
}

/** Entrada para `media.subtitles` del servidor, ya aprobada por el autor. */
export function pistaDeSubtitulos({ texto, duracion = 0, lang = "es-MX", label = "Español (México)" } = {}) {
  const vtt = construirVtt(lineasDeSubtitulo(texto), duracion);
  if (!vtt) return null;
  return {
    lang,
    label,
    url: "",
    vttContent: vtt,
    // Escrito por el autor y revisado en pantalla: no es «autogenerado» y no
    // necesita aprobación aparte (el campo es de las pistas automáticas).
    autoGenerated: false,
    approved: true
  };
}

/**
 * Vuelta atrás: WebVTT guardado → una línea de texto por subtítulo.
 *
 * Sirve para reabrir el editor sin perder lo que el autor ya había escrito.
 * Se descartan cabecera, numeración y marcas de tiempo; solo queda el texto,
 * que es justo lo que el formulario edita.
 */
export function textoDeVtt(vtt) {
  return String(vtt || "")
    .replace(/^WEBVTT[^\n]*\n/, "")
    .split(/\n{2,}/)
    .map((bloque) => bloque.split("\n").filter((linea) => !linea.includes("-->") && !/^\d+$/.test(linea.trim()) && linea.trim()).join(" "))
    .filter(Boolean)
    .join("\n")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}
