import { relojVideo } from "./videoClock";

// La música acompaña al reloj del video: inicio/fin recortan la pista,
// no retrasan su entrada en la publicación. No se repite al agotar el tramo.
const numero = (value, fallback = 0) => Number.isFinite(Number(value)) && value !== null ? Number(value) : fallback;
const acotar = (value, min, max) => Math.min(max, Math.max(min, value));

export function esMusicaLocal(url) {
  if (typeof url !== "string" || !url.startsWith("/uploads/music/") || url.includes("\\")) return false;
  const parsed = new URL(url, "https://kronos.invalid");
  return parsed.pathname.startsWith("/uploads/music/");
}

export function musicaDeVideo(media) {
  if (media?.type !== "video") return null;
  const raw = media.music || media.edit?.musica;
  if (!raw || typeof raw !== "object") return null;
  const trackId = typeof raw.trackId === "string" ? raw.trackId.trim() : "";
  const url = esMusicaLocal(raw.url) ? raw.url : "";
  if (!url && !trackId) return null;
  const inicio = Math.max(0, numero(raw.inicio));
  const fin = Math.max(0, numero(raw.fin));
  return {
    trackId, url, inicio, fin,
    volumen: acotar(numero(raw.volumen, 0.8), 0, 1),
    fundidoEntrada: Math.max(0, numero(raw.fundidoEntrada)),
    fundidoSalida: Math.max(0, numero(raw.fundidoSalida))
  };
}

export function estadoMusica(musica, tiempoVideo, duracionAudio) {
  const tiempo = Math.max(0, numero(tiempoVideo));
  const duracion = Number.isFinite(duracionAudio) && duracionAudio > 0 ? duracionAudio : Infinity;
  const fin = Math.min(musica.fin > 0 ? musica.fin : Infinity, duracion);
  const largo = Math.max(0, fin - musica.inicio);
  const posicion = musica.inicio + tiempo;
  const entrada = Math.min(musica.fundidoEntrada, largo / 2);
  const salida = Math.min(musica.fundidoSalida, largo / 2);
  const ganancia = Math.min(1, entrada > 0 ? tiempo / entrada : 1, salida > 0 ? (fin - posicion) / salida : 1);
  return { posicion, activo: posicion < fin && largo > 0, volumen: musica.volumen * acotar(ganancia, 0, 1) };
}

/** Sincronización independiente de React para poder probar eventos y limpieza.
 * No altera el video: respeta pausa, silencio, volumen, búsqueda y velocidad.
 * Los rechazos de autoplay se muestran al usuario; nunca se reintentan en bucle. */
export function conectarMusica(video, audio, musica, { onBlocked = () => {}, onError = () => {}, onPlaying = () => {}, calcularEstado = estadoMusica } = {}) {
  video = relojVideo(video);
  let disposed = false;
  let pending = false;
  let blocked = false;
  let buffering = false;
  let frame = null;
  const detener = () => {
    if (frame !== null) cancelAnimationFrame(frame);
    frame = null;
    audio.pause();
  };
  const sincronizar = () => {
    if (disposed) return;
    const estado = calcularEstado(musica, video.currentTime, audio.duration);
    audio.muted = video.muted;
    audio.volume = estado.volumen * video.volume;
    audio.playbackRate = video.playbackRate;
    if (audio.readyState >= 1 && Math.abs(audio.currentTime - estado.posicion) > 0.2 && estado.activo) {
      try { audio.currentTime = estado.posicion; } catch { /* Se vuelve a alinear al cargar los metadatos. */ }
    }
    const enPausa = video.paused || video.ended || video.seeking || video.muted || buffering || document.hidden;
    if (enPausa || !estado.activo) {
      detener();
      // La voz puede entrar más adelante en la pieza. Espera con el reloj
      // visual, sin reproducirla ni depender de la frecuencia de timeupdate.
      if (!enPausa && estado.pendiente && !blocked) frame = requestAnimationFrame(() => { frame = null; sincronizar(); });
      return;
    }
    if (audio.paused && !pending && !blocked) {
      pending = true;
      try {
        Promise.resolve(audio.play()).then(() => {
          if (disposed || video.paused || video.muted || video.ended || video.seeking || document.hidden || buffering || !calcularEstado(musica, video.currentTime, audio.duration).activo) audio.pause();
          else onPlaying();
        }).catch((error) => {
          if (disposed || error?.name === "AbortError") return;
          blocked = true;
          if (error?.name === "NotAllowedError") onBlocked();
          else onError();
        }).finally(() => { pending = false; });
      } catch {
        pending = false;
        blocked = true;
        onError();
      }
    }
    if (frame === null && !blocked) frame = requestAnimationFrame(() => { frame = null; sincronizar(); });
  };
  const fallo = () => { blocked = true; detener(); onError(); };
  const esperar = () => { buffering = true; detener(); };
  const reanudar = () => { buffering = false; sincronizar(); };
  const eventos = {
    play: reanudar, playing: reanudar, pause: detener, ended: detener,
    timeupdate: sincronizar, seeking: esperar, seeked: reanudar,
    volumechange: sincronizar, ratechange: sincronizar,
    waiting: esperar, stalled: esperar, emptied: esperar, loadedmetadata: reanudar
  };
  for (const [evento, handler] of Object.entries(eventos)) video.addEventListener(evento, handler);
  audio.addEventListener("loadedmetadata", sincronizar);
  audio.addEventListener("canplay", sincronizar);
  audio.addEventListener("error", fallo);
  document.addEventListener("visibilitychange", sincronizar);
  sincronizar();
  return {
    retry() { blocked = false; sincronizar(); },
    dispose() {
      disposed = true;
      detener();
      for (const [evento, handler] of Object.entries(eventos)) video.removeEventListener(evento, handler);
      audio.removeEventListener("loadedmetadata", sincronizar);
      audio.removeEventListener("canplay", sincronizar);
      audio.removeEventListener("error", fallo);
      document.removeEventListener("visibilitychange", sincronizar);
    }
  };
}
