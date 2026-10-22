import fixWebmDuration from "fix-webm-duration";
import { conectarSecuencia } from "./videoSequence";
import { conectarMusica } from "./videoMusic";
import { conectarVoz } from "./videoVoice";
import { normalizarClip } from "./mediaStudio";
import { pintarFuente } from "./videoTransitions";
import { medidasExportacion, pintarCuadroExportado } from "./videoExportFrame";
import { mediaUrl } from "../services/mediaUrl";

const MAX_BYTES = 50 * 1024 * 1024;
export function formatoExportacion() {
  const Recorder = globalThis.MediaRecorder;
  return ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"].find(type => Recorder?.isTypeSupported?.(type)) || "";
}
const aborted = () => new globalThis.DOMException("Exportación cancelada.", "AbortError");

function cargar(element, url, event, signal) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => done(new Error("Un archivo no terminó de cargar para la exportación.")), 20000);
    const done = error => {
      clearTimeout(timer); element.removeEventListener(event, ready); element.removeEventListener("error", fail); signal?.removeEventListener("abort", cancel);
      if (error) reject(error); else resolve(element);
    };
    const ready = () => done();
    const fail = () => done(new Error("No se pudo cargar un archivo de la exportación. Revisa la conexión y los permisos de origen."));
    const cancel = () => done(aborted());
    element.addEventListener(event, ready, { once: true }); element.addEventListener("error", fail, { once: true }); signal?.addEventListener("abort", cancel, { once: true });
    if (signal?.aborted) { cancel(); return; }
    element.crossOrigin = "use-credentials"; element.src = mediaUrl(url);
    if (element.tagName === "AUDIO") { element.preload = "auto"; element.load(); }
  });
}

/** Codificación local, en tiempo real. El original no se altera. La grabación
 * se pausa al cargar/buscar, conserva audio y se descarta ante cualquier fallo. */
export async function exportarVideo({ clips: rawClips, receta, vozUrl = "", calidad = "alta", signal, onProgress = () => {} }) {
  const mimeType = formatoExportacion();
  const Audio = globalThis.AudioContext || globalThis.webkitAudioContext;
  if (!mimeType || !Audio || !HTMLCanvasElement.prototype.captureStream) throw new Error("Este navegador no permite exportar WebM con audio. Usa un navegador compatible.");
  if (signal?.aborted) throw aborted();
  if (document.hidden) throw new Error("Mantén la pestaña visible durante la exportación.");
  const clips = rawClips.map(normalizarClip);
  if (!clips.length || clips.some(c => !c.url || (c.tipo === "image" && c.duracion <= 0))) throw new Error("Todos los clips necesitan su archivo y las imágenes una duración elegida.");
  if (receta.musica?.trackId && !receta.musica.url) throw new Error("La pista elegida no tiene un archivo de audio exportable.");
  if ((receta.voz?.voiceId || receta.voz?.url) && !vozUrl) throw new Error("Genera o graba la voz antes de exportar.");

  const host = document.createElement("div"); host.setAttribute("aria-hidden", "true");
  Object.assign(host.style, { position: "fixed", left: "-10000px", top: "0", width: "16px", height: "16px", pointerEvents: "none" });
  document.body.appendChild(host);
  const video = document.createElement("video"); video.crossOrigin = "use-credentials"; video.playsInline = true; video.preload = "auto";
  const canvas = document.createElement("canvas"); host.append(video, canvas);
  const context = canvas.getContext("2d");
  let audioContext; let destination; let stream; let recorder; let sequence; let musicController; let voiceController; let frame;
  let state; let previous = null; let size; let bytes = 0; let stopped = false; let failure; let lastTime = -1; let lastAdvance = performance.now();
  let resolveDone; let rejectDone;
  const done = new Promise((resolve, reject) => { resolveDone = resolve; rejectDone = reject; });
  done.catch(() => {});
  const elements = [video]; const nodes = []; const chunks = [];
  const images = new Map();
  const fail = error => { if (!failure) { failure = error instanceof Error ? error : new Error(String(error)); rejectDone(failure); } };
  const cancel = () => fail(aborted());
  const visibility = () => { if (document.hidden) fail(new Error("Exportación detenida: mantén la pestaña visible y vuelve a intentarlo.")); };
  signal?.addEventListener("abort", cancel, { once: true }); document.addEventListener("visibilitychange", visibility);
  const race = promise => Promise.race([promise, done]);
  const source = () => clips[state?.index || 0]?.tipo === "image" ? images.get(clips[state?.index || 0].url) : video;
  const paint = () => {
    if (!size || !context) return;
    pintarCuadroExportado(context, source(), previous, sequence.clock.transition, receta, size.width, size.height);
  };
  const syncRecorder = () => {
    if (!recorder || stopped) return;
    const clock = sequence.clock;
    const ready = !clock.paused && !clock.seeking && (clips[state.index].tipo === "image" || (!video.paused && video.readyState >= 3));
    if (ready && recorder.state === "paused") recorder.resume();
    else if (!ready && recorder.state === "recording") recorder.pause();
  };
  const finish = () => {
    if (!recorder || stopped) return;
    try { paint(); stopped = true; recorder.stop(); } catch (error) { fail(error); }
  };
  try {
    if (!context) throw new Error("El navegador no permitió preparar el lienzo de video.");
    audioContext = new Audio();
    const resumeTimer = setTimeout(() => fail(new Error("El navegador no permitió activar el audio. Permite su reproducción y vuelve a exportar.")), 20000);
    try { await race(audioContext.resume()); } finally { clearTimeout(resumeTimer); }
    destination = audioContext.createMediaStreamDestination();
    const connectAudio = (element, gain = 1) => {
      const node = audioContext.createMediaElementSource(element); const volume = audioContext.createGain(); volume.gain.value = gain;
      node.connect(volume); volume.connect(destination); nodes.push(node, volume);
    };
    connectAudio(video, receta.corte?.silenciar ? 0 : 1);
    const music = receta.musica?.url ? document.createElement("audio") : null;
    const voice = vozUrl ? document.createElement("audio") : null;
    const pending = [];
    for (const clip of clips) {
      if (clip.tipo === "image" && !images.has(clip.url)) {
        const image = document.createElement("img"); images.set(clip.url, image); pending.push(cargar(image, clip.url, "load", signal));
      }
    }
    for (const [element, url] of [[music, receta.musica?.url], [voice, vozUrl]]) {
      if (element) { elements.push(element); host.appendChild(element); connectAudio(element); pending.push(cargar(element, url, "canplay", signal)); }
    }
    await race(Promise.all(pending));
    let readyResolve;
    const ready = new Promise(resolve => { readyResolve = resolve; });
    sequence = conectarSecuencia(video, clips, {
      onTransition() {
        previous = document.createElement("canvas"); previous.width = canvas.width; previous.height = canvas.height;
        const ctx = previous.getContext("2d"); ctx.fillStyle = "#000"; ctx.fillRect(0, 0, previous.width, previous.height);
        pintarFuente(ctx, source(), previous.width, previous.height, receta.medida !== "original");
      },
      onChange(next) {
        state = next;
        if (next.error) { fail(new Error(next.error)); return; }
        if (clips[next.index].tipo === "image" && next.loading) queueMicrotask(() => sequence?.readyImage(next.generation));
        if (!next.loading) readyResolve();
        onProgress({ currentTime: next.currentTime, duration: next.duration });
        if (next.finished) finish();
      }
    });
    const timer = setTimeout(() => fail(new Error("El primer clip no terminó de cargar para exportar.")), 20000);
    try { await race(ready); } finally { clearTimeout(timer); }
    const initial = source();
    size = medidasExportacion(initial.videoWidth || initial.naturalWidth, initial.videoHeight || initial.naturalHeight, receta.medida, calidad);
    canvas.width = size.width; canvas.height = size.height;
    // Prueba CORS antes de grabar: nunca produce un archivo de imagen negra.
    paint(); context.getImageData(0, 0, 1, 1);
    const callbacks = { onBlocked: () => fail(new Error("El navegador bloqueó el audio. Vuelve a exportar tras permitir su reproducción.")), onError: () => fail(new Error("Falló una pista de audio. No se guardó un video incompleto.")) };
    if (music) musicController = conectarMusica(video, music, receta.musica, callbacks);
    if (voice) voiceController = conectarVoz(video, voice, receta.voz || { inicio: 0, fin: 0, volumen: 1, fundidoEntrada: 0, fundidoSalida: 0 }, callbacks);
    stream = canvas.captureStream(30);
    for (const track of destination.stream.getAudioTracks()) stream.addTrack(track);
    recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: calidad === "alta" ? 8000000 : calidad === "media" ? 5000000 : 2500000 });
    recorder.ondataavailable = event => {
      if (!event.data.size) return;
      bytes += event.data.size;
      if (bytes > MAX_BYTES) { fail(new Error("La exportación supera 50 MB. Reduce la duración o la calidad.")); return; }
      chunks.push(event.data);
    };
    recorder.onerror = () => fail(new Error("El navegador no pudo codificar el video."));
    recorder.onstop = async () => {
      if (failure) return;
      try {
        const duration = state.duration;
        const blob = await fixWebmDuration(new Blob(chunks, { type: "video/webm" }), duration * 1000, { logger: false });
        if (!blob.size) throw new Error("La exportación quedó vacía.");
        if (signal?.aborted) throw aborted();
        resolveDone({ file: new File([blob], `kronos-video-${Date.now()}.webm`, { type: "video/webm" }), duration, ...size });
      } catch (error) { fail(error); }
    };
    for (const event of ["play", "playing", "pause", "seeking", "seeked", "waiting", "emptied", "loadedmetadata", "ended"]) sequence.clock.addEventListener(event, syncRecorder);
    recorder.start(250); recorder.pause();
    const tick = () => {
      if (failure || stopped) return;
      try {
        if (!sequence.clock.seeking) paint();
        syncRecorder();
        const current = sequence.clock.currentTime;
        if (current !== lastTime) { lastTime = current; lastAdvance = performance.now(); }
        else if (performance.now() - lastAdvance > 20000) throw new Error("La reproducción se detuvo demasiado tiempo. Revisa la conexión y reintenta la exportación.");
        frame = requestAnimationFrame(tick);
      } catch (error) { fail(error); }
    };
    sequence.play(); tick();
    return await done;
  } catch (error) {
    if (error?.name === "SecurityError") throw new Error("Un archivo no permite exportación por sus permisos de origen (CORS). Usa archivos propios o un origen autorizado.");
    throw error;
  } finally {
    if (frame !== undefined) cancelAnimationFrame(frame);
    stopped = true; musicController?.dispose(); voiceController?.dispose(); sequence?.dispose();
    if (recorder && recorder.state !== "inactive") { recorder.onstop = null; recorder.stop(); }
    stream?.getTracks().forEach(track => track.stop()); destination?.stream.getTracks().forEach(track => track.stop()); nodes.forEach(node => node.disconnect());
    for (const element of elements) { element.pause(); element.removeAttribute("src"); element.load(); }
    images.forEach(image => { image.src = ""; });
    signal?.removeEventListener("abort", cancel); document.removeEventListener("visibilitychange", visibility);
    if (audioContext && audioContext.state !== "closed") await audioContext.close();
    host.remove();
  }
}
