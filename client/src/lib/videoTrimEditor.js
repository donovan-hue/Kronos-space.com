import { recorteDeVideo } from "./videoTrim.js";

/**
 * Reglas puras del recorte de un video ya publicado.
 *
 * Viven fuera del componente para poder probarlas sin DOM (node --test no
 * carga .jsx) y porque son la parte que de verdad decide: qué tramo se ofrece
 * y cuándo el guardado es inválido.
 */

function segundos(valor, porDefecto = 0) {
  const n = Number(valor);
  return Number.isFinite(n) && n >= 0 ? n : porDefecto;
}

export function recorteInicial(media) {
  const publicado = recorteDeVideo(media);
  if (publicado) return { inicio: publicado.inicio, fin: publicado.fin, silenciar: publicado.silenciado };
  return { inicio: 0, fin: segundos(media?.duration), silenciar: Boolean(media?.trim?.muted) };
}

/**
 * Devuelve el motivo del rechazo, o "" si se puede guardar.
 * - Hace falta una duración conocida: sin ella no hay tope superior.
 * - `fin` debe ser mayor que `inicio` (un tramo de longitud cero no se
 *   reproduce y dejaría el video clavado en un fotograma).
 * - Se tolera 0.05 s de redondeo, el mismo margen con el que el reproductor
 *   decide que se llegó al final.
 */
export function validarRecorte({ inicio, fin, duracion }) {
  const desde = segundos(inicio);
  const hasta = segundos(fin);
  const total = segundos(duracion);
  if (total <= 0) return "Espera a que el video termine de cargar para recortarlo.";
  if (hasta <= desde) return "El final tiene que ir después del inicio.";
  if (hasta > total + 0.05) return "El final no puede pasar de la duración del video.";
  return "";
}
