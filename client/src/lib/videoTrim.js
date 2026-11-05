/**
 * Recorte de un video publicado, en el reproductor del feed.
 *
 * El archivo original no se toca: lo que el usuario ajustó antes de publicar
 * es una receta (`media.edit.corte` o el legado `media.trim`), y el feed la
 * obedece al reproducir. Antes esa receta viajaba con la publicación pero el
 * reproductor la ignoraba, así que un video publicado «de 00:12 a 00:30» se
 * veía entero y el ajuste se perdía al recargar.
 *
 * Reglas deliberadas:
 * - `fin: 0` significa «hasta el final»: es lo que guarda el editor cuando no
 *   se recortó, y no se puede confundir con un corte en el segundo cero.
 * - Si `fin` no es mayor que `inicio`, el recorte es inválido y se descarta
 *   entero en vez de dejar un video que no se puede reproducir.
 * - El silencio (`silenciar`/`muted`) se delega al elemento `<video>`; esta
 *   librería solo decide qué tramo se ve.
 */

function numero(valor, porDefecto = 0) {
  const n = Number(valor);
  return Number.isFinite(n) ? n : porDefecto;
}

/**
 * Tramo a reproducir, o `null` si la publicación no está recortada.
 * Devuelve segundos ya acotados a valores no negativos.
 */
export function recorteDeVideo(media) {
  if (media?.type !== "video") return null;

  const corte = media.edit?.corte || media.trim || null;
  if (!corte || typeof corte !== "object") return null;

  // Dos formas conviven: la receta del estudio usa `inicio`/`fin` y las
  // publicaciones anteriores guardaban `start`/`end`. Se aceptan las dos.
  const inicio = Math.max(0, numero(corte.inicio ?? corte.start));
  const fin = Math.max(0, numero(corte.fin ?? corte.end));

  // Sin fin declarado no hay recorte: el video completo es lo correcto.
  if (fin <= 0) return null;
  if (fin <= inicio) return null;

  return {
    inicio,
    fin,
    silenciado: Boolean(corte.silenciar ?? corte.muted)
  };
}

/**
 * Qué hacer cuando el reloj del video sale del tramo.
 *
 * Devuelve `"parar"` al llegar al final del recorte, `"saltar"` si el usuario
 * buscó antes del inicio y `null` si está dentro. Se separa del componente para
 * poder probarlo sin DOM.
 */
export function accionDeRecorte(recorte, tiempoActual, tolerancia = 0.05) {
  if (!recorte) return null;
  const t = numero(tiempoActual);

  // `parar` sin margen hacia atrás: cortar antes del final recortaría contenido
  // que el usuario publicó («de 12 a 30» debe mostrar hasta 30, no hasta 29.75).
  // `saltar` sí lleva tolerancia para que un `timeupdate` justo en el inicio no
  // se lea como «el usuario se fue al principio».
  if (t >= recorte.fin) return "parar";
  if (t < recorte.inicio - tolerancia) return "saltar";
  return null;
}
