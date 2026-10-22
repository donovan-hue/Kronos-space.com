import { conectarMusica } from "./videoMusic";

const numero = (value, fallback = 0) => value !== null && Number.isFinite(Number(value)) ? Number(value) : fallback;
const acotar = (value, min, max) => Math.min(max, Math.max(min, value));

export function esVozLocal(url) {
  if (typeof url !== "string" || !url.startsWith("/uploads/voices/") || url.includes("\\")) return false;
  return new URL(url, "https://kronos.invalid").pathname.startsWith("/uploads/voices/");
}

export function vozDeVideo(media) {
  const raw = media?.type === "video" ? media.edit?.voz : null;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const voiceId = typeof raw.voiceId === "string" ? raw.voiceId.trim() : "";
  const url = esVozLocal(raw.url) ? raw.url : "";
  // Un modelo elegido sin toma generada no es un archivo reproducible.
  // Se conserva el identificador para poder avisar, nunca se genera al ver.
  if (!url && !voiceId && !raw.url) return null;
  return {
    voiceId, url,
    inicio: Math.max(0, numero(raw.inicio)),
    fin: Math.max(0, numero(raw.fin)),
    volumen: acotar(numero(raw.volumen, 1), 0, 1),
    fundidoEntrada: Math.max(0, numero(raw.fundidoEntrada)),
    fundidoSalida: Math.max(0, numero(raw.fundidoSalida))
  };
}

// En la voz inicio/fin pertenecen al video, no recortan la fuente de audio.
// La toma empieza desde cero al entrar y termina al agotarse o al llegar a fin.
export function estadoVoz(voz, tiempoVideo, duracionAudio) {
  const tiempo = Math.max(0, numero(tiempoVideo));
  const duracion = Number.isFinite(duracionAudio) && duracionAudio > 0 ? duracionAudio : Infinity;
  const fin = Math.min(voz.fin > 0 ? voz.fin : Infinity, voz.inicio + duracion);
  const largo = Math.max(0, fin - voz.inicio);
  const posicion = Math.max(0, tiempo - voz.inicio);
  const entrada = Math.min(voz.fundidoEntrada, largo / 2);
  const salida = Math.min(voz.fundidoSalida, largo / 2);
  const ganancia = Math.min(1, entrada > 0 ? posicion / entrada : 1, salida > 0 ? (fin - tiempo) / salida : 1);
  const activo = tiempo >= voz.inicio && tiempo < fin && largo > 0;
  return {
    posicion, activo,
    pendiente: tiempo < voz.inicio && largo > 0,
    volumen: activo ? voz.volumen * acotar(ganancia, 0, 1) : 0
  };
}

// Comparte los eventos, reintentos y limpieza ya usados por la música;
// solo cambia el significado temporal de la pista.
export function conectarVoz(video, audio, voz, callbacks = {}) {
  return conectarMusica(video, audio, voz, { ...callbacks, calcularEstado: estadoVoz });
}
