import { transicionDeClip } from "./videoTransitions";
import { velocidadValida } from "./mediaStudio";
import { mediaUrl } from "../services/mediaUrl";
import { registrarRelojVideo } from "./videoClock";

const positivo = value => Number.isFinite(Number(value)) ? Math.max(0, Number(value)) : 0;
export function urlClipValida(value) {
  if (typeof value !== "string" || value.length > 2000 || value.includes("\\")) return false;
  try {
    const url = new URL(value, "https://kronos.invalid");
    return value.startsWith("/uploads/") ? url.pathname.startsWith("/uploads/") : /^https?:\/\//i.test(value) && Boolean(url.hostname);
  } catch { return false; }
}

export function secuenciaDeVideo(media) {
  if (media?.type !== "video") return null;
  let raw = media.edit?.clips;
  if (!Array.isArray(raw) || raw.length === 0 || (raw.length === 1 && velocidadValida(raw[0]?.velocidad ?? 1) === 1)) {
    // Una toma utiliza el corte de la receta; trim conserva publicaciones
    // anteriores al estudio. Nunca se aplica ese corte a toda la secuencia.
    const guardado = media.edit?.corte;
    const corte = guardado && (positivo(guardado.inicio) || positivo(guardado.fin)) ? guardado
      : media.trim ? { inicio: media.trim.start, fin: media.trim.end } : null;
    if (!corte || !(positivo(corte.inicio) > 0 || (positivo(corte.fin) > 0 && (!positivo(media.duration) || corte.fin < media.duration)))) return null;
    raw = [{ tipo: "video", url: media.url, duracion: media.duration, inicio: corte.inicio, fin: corte.fin }];
  }
  if (raw.length > 12) return { clips: [], error: "La secuencia supera el límite de 12 clips." };
  const clips = [];
  for (const [index, clip] of raw.entries()) {
    if (!clip || !urlClipValida(clip.url) || !["video", "image"].includes(clip.tipo)) {
      return { clips: [], error: `El clip ${index + 1} no tiene un archivo válido.` };
    }
    const duracion = positivo(clip.duracion);
    if (clip.tipo === "image" && !duracion) {
      return { clips: [], error: `La imagen del clip ${index + 1} no tiene duración. Defínela en el estudio.` };
    }
    const inicio = clip.tipo === "video" ? positivo(clip.inicio) : 0;
    const fin = clip.tipo === "video" ? positivo(clip.fin) : duracion;
    if (clip.tipo === "video" && fin > 0 && fin <= inicio) {
      return { clips: [], error: `El corte del clip ${index + 1} no tiene duración válida.` };
    }
    clips.push({ url: clip.url, tipo: clip.tipo, duracion, inicio, fin, velocidad: velocidadDeClip(clip),
      ...(index > 0 && clip.transicion ? { transicion: clip.transicion } : {}) });
  }
  return { clips, error: "" };
}

// La velocidad solo transforma tomas de video, no el tiempo de una imagen.
export const velocidadDeClip = clip => clip.tipo === "image" ? 1 : velocidadValida(clip.velocidad ?? 1);

// Los límites se vuelven a acotar al leer la duración del archivo real.
// Fin 0 significa hasta el final, no un tramo vacío.
export function limitesClip(clip, duracionFuente = clip.duracion) {
  if (clip.tipo === "image") return { inicio: 0, fin: clip.duracion, duracion: clip.duracion };
  const fuente = positivo(duracionFuente) || Infinity;
  const inicio = positivo(clip.inicio);
  const fin = Math.min(positivo(clip.fin) || fuente, fuente);
  return { inicio, fin, duracion: Number.isFinite(fin) ? Math.max(0, fin - inicio) / velocidadDeClip(clip) : 0 };
}

export function conectarSecuencia(video, clips, { loop = false, onChange = () => {}, onTransition = () => {} } = {}) {
  let index = 0;
  let local = 0;
  let playing = !video.paused;
  let loading = true;
  let finished = false;
  let disposed = false;
  let changing = false;
  let error = "";
  let frame = null;
  let stamp = 0;
  let lastNotify = 0;
  let generation = 0;
  let transitionFrom = -1;
  const limits = clips.map(c => limitesClip(c));
  const lengths = limits.map(c => c.duracion);
  let metadataReady = false;
  const originalSrc = video.getAttribute?.("src") ?? null;
  const nativeLoop = video.loop;
  const originalRate = video.playbackRate;
  const originalDefaultRate = video.defaultPlaybackRate ?? originalRate;
  let playbackFactor = originalRate;
  const display = video.style.display;
  const visibilityStyle = video.style.visibility;
  video.loop = false;
  const clock = new globalThis.EventTarget();
  const image = () => clips[index].tipo === "image";
  const speed = () => velocidadDeClip(clips[index]);
  const position = () => image() || loading || finished ? local : Math.min(lengths[index] || Infinity, positivo(video.currentTime - limits[index].inicio) / speed());
  const elapsed = () => lengths.slice(0, index).reduce((a, b) => a + b, 0) + position();
  const emit = type => clock.dispatchEvent(new Event(type));
  const notify = () => {
    onChange({ index, image: image() ? mediaUrl(clips[index].url) : "", paused: !playing, loading, error,
      generation, currentTime: elapsed(), duration: lengths.reduce((a, b) => a + b, 0), finished });
  };
  const cancel = () => { if (frame !== null) cancelAnimationFrame(frame); frame = null; };
  const pause = () => {
    playing = false; cancel(); video.pause(); emit("pause"); notify();
  };
  const fail = message => {
    local = position(); error = message; loading = true; pause(); emit("error");
  };
  const applyRate = () => {
    const rate = speed() * playbackFactor;
    try {
      if (video.defaultPlaybackRate !== rate) video.defaultPlaybackRate = rate;
      if (video.playbackRate !== rate) video.playbackRate = rate;
      return true;
    } catch {
      fail(`El navegador no admite la velocidad del clip ${index + 1}.`);
      return false;
    }
  };
  const runImage = () => {
    if (disposed || !image() || !playing || loading || error || document.hidden) return;
    if (frame !== null) return;
    stamp = performance.now();
    const tick = now => {
      frame = null;
      if (disposed || !playing || loading || !image() || document.hidden) return;
      local = Math.min(lengths[index], local + Math.max(0, now - stamp) / 1000 * playbackFactor);
      stamp = now;
      emit("timeupdate");
      if (now - lastNotify > 200) { lastNotify = now; notify(); }
      if (local >= lengths[index]) next();
      else frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
  };
  const playNative = () => {
    const token = generation;
    try {
      Promise.resolve(video.play()).then(() => {
        if (disposed || !playing || image()) video.pause();
      }).catch(e => {
        if (disposed || token !== generation || e?.name === "AbortError") return;
        fail(e?.name === "NotAllowedError" ? "El navegador bloqueó la reproducción. Pulsa continuar." : `No se pudo reproducir el clip ${index + 1}.`);
      });
    } catch { fail(`No se pudo reproducir el clip ${index + 1}.`); }
  };
  const play = () => {
    if (disposed || error) return;
    if (finished) { select(0, true); return; }
    playing = true; emit("play"); notify();
    if (!loading) { if (image()) runImage(); else playNative(); }
  };
  const select = (target, resume = playing, enlace = false) => {
    if (disposed || target < 0 || target >= clips.length) return;
    const from = index;
    transitionFrom = enlace && target > 0 ? from : -1;
    if (transitionFrom >= 0 && transicionDeClip(clips[target], lengths[from], lengths[target]).duracion > 0) onTransition({ index: from });
    generation++; changing = true; cancel();
    video.pause();
    index = target; local = 0; playing = resume; loading = true; metadataReady = false; finished = false; error = "";
    video.style.display = image() ? "none" : display;
    video.style.visibility = !image() && limits[index].inicio > 0 ? "hidden" : visibilityStyle;
    emit("emptied"); notify();
    video.dispatchEvent(new Event("kronos:sequencechange"));
    if (!applyRate()) { changing = false; return; }
    if (!image()) {
      video.src = mediaUrl(clips[index].url);
      video.load();
    }
    changing = false;
  };
  const next = () => {
    if (index + 1 < clips.length) select(index + 1, playing, true);
    else if (loop) select(0);
    else {
      local = lengths[index]; finished = true; playing = false; cancel();
      video.pause(); emit("ended"); notify();
    }
  };
  const readyImage = (expected = generation) => {
    if (disposed || !image() || expected !== generation) return;
    if (!applyRate()) return;
    loading = false; emit("loadedmetadata"); notify(); runImage();
  };
  const atEnd = () => Number.isFinite(limits[index].fin) && video.currentTime >= limits[index].fin;
  const runVideo = () => {
    if (disposed || image() || !playing || loading || error || finished || document.hidden || frame !== null) return;
    const token = generation;
    const tick = () => {
      frame = null;
      if (disposed || token !== generation || image() || !playing || loading || video.paused || document.hidden) return;
      if (atEnd()) next();
      else frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
  };
  const aligned = () => {
    if (!applyRate()) return;
    loading = false; local = 0;
    video.style.visibility = visibilityStyle;
    emit("loadedmetadata"); notify();
    if (playing) playNative();
  };
  const constrainSeek = () => {
    const { inicio, fin } = limits[index];
    const target = Math.max(inicio, Math.min(fin, video.currentTime));
    if (Math.abs(target - video.currentTime) > 0.0001) {
      try { video.currentTime = target; } catch { fail(`No se pudo aplicar el corte del clip ${index + 1}.`); }
      return false;
    }
    return true;
  };
  const nativeEvents = {
    loadedmetadata() {
      if (image() || changing || disposed) return;
      limits[index] = limitesClip(clips[index], video.duration);
      lengths[index] = limits[index].duracion;
      if (limits[index].fin <= limits[index].inicio) {
        fail(`El corte del clip ${index + 1} queda fuera del archivo o no tiene duración.`); return;
      }
      metadataReady = true;
      try { video.currentTime = limits[index].inicio; }
      catch { fail(`No se pudo aplicar el corte del clip ${index + 1}.`); return; }
      if (!video.seeking) aligned();
    },
    play() {
      if (changing || image() || error) return;
      if (finished) { select(0, true); return; }
      playing = true;
      if (loading) { changing = true; video.pause(); changing = false; return; }
      if (!constrainSeek()) return;
      emit("play"); notify(); runVideo();
    },
    playing() { if (changing || image() || loading || error) return; emit("playing"); runVideo(); },
    pause() { if (changing || image() || loading || finished || video.ended) return; playing = false; cancel(); emit("pause"); notify(); },
    ended() {
      if (changing || image() || loading || finished || error) return;
      const realEnd = positivo(video.duration) || positivo(video.currentTime);
      if (realEnd && realEnd < limits[index].fin) {
        limits[index].fin = realEnd;
        lengths[index] = Math.max(0, realEnd - limits[index].inicio) / speed();
      }
      next();
    },
    timeupdate() {
      if (image() || loading || finished || error) return;
      if (playing && !video.paused && !video.seeking && atEnd()) { next(); return; }
      emit("timeupdate"); notify();
    },
    seeking() {
      if (image() || changing || error) return;
      cancel(); emit("seeking");
      if (!loading) constrainSeek();
    },
    seeked() {
      if (image() || changing || error) return;
      if (loading) { if (metadataReady) aligned(); return; }
      if (!constrainSeek()) return;
      if (playing && atEnd()) { next(); return; }
      emit("seeked"); notify(); runVideo();
    },
    waiting() { if (!image() && !changing) { cancel(); emit("waiting"); } },
    stalled() { if (!image() && !changing) { cancel(); emit("stalled"); } },
    volumechange() { emit("volumechange"); },
    ratechange() {
      if (changing || disposed) return;
      const factor = video.playbackRate / speed();
      // Límites de reproducción de medios del navegador, independientes de
      // los límites de edición. No se altera silenciosamente una velocidad.
      if (!Number.isFinite(factor) || factor < 0.0625 || factor > 16) {
        fail("El navegador no admite esa velocidad de reproducción."); return;
      }
      playbackFactor = factor;
      emit("ratechange"); notify();
    },
    error() { if (!changing && !image()) fail(`No se pudo cargar el clip ${index + 1}.`); }
  };
  for (const [type, handler] of Object.entries(nativeEvents)) video.addEventListener(type, handler);
  const visibility = () => {
    if (document.hidden) cancel();
    else if (image()) runImage();
    else if (playing && !loading && atEnd()) next();
    else runVideo();
    emit("timeupdate");
  };
  document.addEventListener("visibilitychange", visibility);
  Object.defineProperties(clock, {
    transition: { get: () => {
      if (transitionFrom < 0) return null;
      const transition = transicionDeClip(clips[index], lengths[transitionFrom], lengths[index]);
      if (!transition.duracion || position() >= transition.duracion) return null;
      return { ...transition, progreso: position() / transition.duracion };
    } },
    duration: { get: () => lengths.reduce((sum, value) => sum + value, 0) },
    currentTime: { get: elapsed },
    paused: { get: () => !playing },
    ended: { get: () => finished },
    seeking: { get: () => loading || (!image() && (video.seeking || video.readyState < 3)) },
    muted: { get: () => video.muted },
    volume: { get: () => video.volume },
    playbackRate: { get: () => playbackFactor }
  });
  clock.play = play; clock.pause = pause;
  const unregister = registrarRelojVideo(video, clock);
  select(0, playing);
  return {
    clock, play, pause, select,
    previous() { select(index - 1); }, next() { if (index + 1 < clips.length) select(index + 1); },
    retry() { const resume = playing; select(index, resume); },
    readyImage,
    imageError(expected = generation) { if (!disposed && image() && expected === generation) fail(`No se pudo cargar la imagen del clip ${index + 1}.`); },
    dispose() {
      disposed = true; generation++; cancel(); playing = false; emit("pause");
      for (const [type, handler] of Object.entries(nativeEvents)) video.removeEventListener(type, handler);
      document.removeEventListener("visibilitychange", visibility);
      unregister(); video.pause();
      video.defaultPlaybackRate = originalDefaultRate; video.playbackRate = originalRate;
      video.loop = nativeLoop; video.style.display = display; video.style.visibility = visibilityStyle;
      if (video.removeAttribute) {
        if (originalSrc === null) video.removeAttribute("src");
        else video.setAttribute("src", originalSrc);
        video.load();
      }
    }
  };
}
