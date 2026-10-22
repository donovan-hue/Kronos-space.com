import React from "react";
import { beforeEach, afterEach, expect, test, vi } from "vitest";
import { render, cleanup, fireEvent, screen } from "@testing-library/react";
import { conectarSecuencia, limitesClip, secuenciaDeVideo, urlClipValida, velocidadDeClip } from "../src/lib/videoSequence";
import { relojVideo } from "../src/lib/videoClock";
import { conectarMusica } from "../src/lib/videoMusic";
import PostMedia from "../src/features/social/components/PostMedia";

const clips = [
  { tipo: "video", url: "/uploads/media/uno.webm", duracion: 2 },
  { tipo: "image", url: "/uploads/media/dos.png", duracion: 1.5 },
  { tipo: "video", url: "/uploads/media/tres.webm", duracion: 3 }
];
const media = { type: "video", url: "/uploads/base.webm", edit: { clips } };
let frames; let controllers; let time;
beforeEach(() => {
  frames = new Map(); controllers = []; time = 100;
  vi.stubGlobal("requestAnimationFrame", vi.fn(callback => { const id = Math.random(); frames.set(id, callback); return id; }));
  vi.stubGlobal("cancelAnimationFrame", vi.fn(id => frames.delete(id)));
  vi.spyOn(performance, "now").mockImplementation(() => time);
  vi.spyOn(document, "hidden", "get").mockReturnValue(false);
});
afterEach(() => { cleanup(); controllers.forEach(c => c.dispose()); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
const flush = () => new Promise(resolve => setTimeout(resolve, 0));
function video(values = {}) {
  const node = new EventTarget();
  Object.assign(node, { paused: true, ended: false, seeking: false, readyState: 4, duration: 2, currentTime: 0, muted: false, volume: 1, playbackRate: 1, loop: false, style: { display: "" }, ...values });
  node.pause = vi.fn(() => { node.paused = true; });
  node.play = vi.fn(() => { node.paused = false; return Promise.resolve(); });
  node.load = vi.fn(() => { node.currentTime = 0; });
  return node;
}
function connect(node, options) { const c = conectarSecuencia(node, clips, options); controllers.push(c); return c; }
function frame(ms) { time += ms; const pending = [...frames.values()]; frames.clear(); for (const cb of pending) cb(time); }
const event = (node, name) => node.dispatchEvent(new Event(name));

test("la secuencia conserva orden, repeticiones, cortes y velocidad", () => {
  const raw = { ...media, edit: { clips: [{ ...clips[2], inicio: 2, fin: 2.5, velocidad: 4 }, clips[0], clips[0]] } };
  expect(secuenciaDeVideo(raw).clips.map(c => c.url)).toEqual([clips[2].url, clips[0].url, clips[0].url]);
  expect(secuenciaDeVideo(raw).clips[0]).toEqual({ ...clips[2], inicio: 2, fin: 2.5, velocidad: 4 });
  expect(secuenciaDeVideo({ ...media, type: "image" })).toBeNull();
  expect(secuenciaDeVideo({ ...media, edit: { clips: [clips[0]] } })).toBeNull();
  expect(secuenciaDeVideo({ ...media, edit: { clips: [clips[0], { ...clips[1], duracion: 0 }] } }).error).toMatch(/no tiene duración/);
  expect(secuenciaDeVideo({ ...media, edit: { clips: Array(13).fill(clips[0]) } }).error).toMatch(/12/);
  for (const url of ["javascript:alert(1)", "//example.com/a", "blob:temporal", "/uploads/../private/a", "/uploads/%2e%2e/private/a", "/uploads/\\evil"]) expect(urlClipValida(url)).toBe(false);
  expect(urlClipValida(clips[0].url)).toBe(true); expect(urlClipValida("https://cdn.example.com/video.mp4")).toBe(true);
});

test("cambia video → imagen con duración elegida → video y termina sin repetir", async () => {
  const node = video(); const onChange = vi.fn(); const c = connect(node, { onChange });
  expect(node.src).toContain(clips[0].url); expect(node.loop).toBe(false);
  event(node, "loadedmetadata"); c.play(); event(node, "playing");
  node.currentTime = 2; node.ended = true; node.paused = true; event(node, "pause"); event(node, "ended");
  expect(onChange.mock.lastCall[0].index).toBe(1); expect(c.clock.paused).toBe(false);
  expect(node.style.display).toBe("none"); expect(c.clock.currentTime).toBe(2);
  c.readyImage(); frame(1000); expect(c.clock.currentTime).toBe(3);
  frame(500); expect(node.src).toContain(clips[2].url); expect(node.style.display).toBe("");
  expect(c.clock.currentTime).toBe(3.5);
  node.ended = false; node.duration = 3; event(node, "loadedmetadata"); await flush();
  expect(node.play).toHaveBeenCalled();
  node.currentTime = 3; node.ended = true; node.paused = true; event(node, "ended");
  expect(c.clock.ended).toBe(true); expect(c.clock.paused).toBe(true); expect(c.clock.currentTime).toBe(6.5);
  event(node, "play"); expect(node.src).toContain(clips[0].url); expect(c.clock.currentTime).toBe(0);
});

test("respeta pausa manual durante carga y las imágenes no consumen tiempo ocultas", () => {
  const node = video(); const c = connect(node);
  c.select(1, true); c.pause(); c.readyImage(); frame(2000); expect(c.clock.currentTime).toBe(2);
  c.play(); frame(500); expect(c.clock.currentTime).toBe(2.5);
  vi.spyOn(document, "hidden", "get").mockReturnValue(true); event(document, "visibilitychange");
  frame(2000); expect(c.clock.currentTime).toBe(2.5);
  vi.spyOn(document, "hidden", "get").mockReturnValue(false); event(document, "visibilitychange");
  frame(500); expect(c.clock.currentTime).toBe(3);
  c.pause(); frame(1000); expect(c.clock.currentTime).toBe(3);
  c.select(2, true); c.pause(); node.duration = 3; event(node, "loadedmetadata");
  expect(c.clock.paused).toBe(true);
});

test("la repetición de Vertical vuelve al primer clip, nunca repite solo el último", () => {
  const node = video({ loop: true }); const c = connect(node, { loop: true });
  c.select(2, true); node.duration = 3; event(node, "loadedmetadata"); node.ended = true; event(node, "ended");
  expect(node.src).toContain(clips[0].url); expect(c.clock.currentTime).toBe(0); expect(c.clock.ended).toBe(false);
  c.dispose(); expect(node.loop).toBe(true); expect(relojVideo(node)).toBe(node);
});

test("un fallo no omite clips y el reintento vuelve a la fuente fallida", async () => {
  const node = video(); const onChange = vi.fn(); const c = connect(node, { onChange });
  c.select(2, true); event(node, "error");
  expect(onChange.mock.lastCall[0].error).toMatch(/clip 3/); expect(c.clock.paused).toBe(true);
  c.retry(); expect(node.src).toContain(clips[2].url); expect(onChange.mock.lastCall[0].error).toBe("");
  node.play.mockRejectedValueOnce(Object.assign(new Error(), { name: "NotAllowedError" }));
  c.play(); node.duration = 3; event(node, "loadedmetadata"); await flush();
  expect(onChange.mock.lastCall[0].error).toMatch(/navegador bloqueó/);
  c.select(1, false); c.imageError(); expect(onChange.mock.lastCall[0].error).toMatch(/imagen del clip 2/);
  c.dispose(); expect(frames.size).toBe(0);
});

test("música usa el tiempo acumulado incluso en las imágenes y al pasar de archivo", async () => {
  const node = video(); const c = connect(node); const audio = video({ duration: 30 });
  const music = conectarMusica(node, audio, { inicio: 1, fin: 30, volumen: 0.8, fundidoEntrada: 0, fundidoSalida: 0 }); controllers.push(music);
  event(node, "loadedmetadata"); c.play(); event(node, "playing"); await flush();
  node.currentTime = 1; event(node, "timeupdate"); expect(audio.currentTime).toBe(2);
  c.select(1, true); expect(audio.paused).toBe(true); c.readyImage(); frame(500); await flush();
  expect(audio.currentTime).toBeCloseTo(3.5); expect(audio.paused).toBe(false);
  c.select(2, true); node.duration = 3; event(node, "loadedmetadata"); event(node, "playing"); await flush();
  node.currentTime = 1; event(node, "timeupdate"); expect(audio.currentTime).toBeCloseTo(5.5);
  c.pause(); expect(audio.paused).toBe(true);
});

test("Inicio muestra controles y la imagen elegida, pausa al ampliar y limpia al desmontar", () => {
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
  const { container, unmount } = render(<PostMedia media={media} />);
  const native = container.querySelector("video"); const clock = relojVideo(native);
  expect(clock).not.toBe(native);
  fireEvent.click(screen.getByRole("button", { name: "Clip siguiente" }));
  const img = screen.getByAltText("Imagen del clip 2"); fireEvent.load(img);
  fireEvent.click(screen.getByRole("button", { name: "Continuar secuencia" })); expect(clock.paused).toBe(false);
  fireEvent.click(screen.getByRole("button", { name: "Ver video en pantalla completa" }));
  expect(clock.paused).toBe(true); expect(screen.getByRole("dialog")).toBeTruthy();
  unmount(); expect(relojVideo(native)).toBe(native); expect(frames.size).toBe(0);
});

test("una imagen antigua sin duración muestra el aviso y no arranca ni omite la secuencia", () => {
  const pause = vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
  render(<PostMedia media={{ ...media, edit: { clips: [clips[0], { ...clips[1], duracion: 0 }] } }} />);
  expect(screen.getByRole("status").textContent).toMatch(/no tiene duración/);
  expect(screen.queryByRole("button", { name: "Clip siguiente" })).toBeNull();
  expect(pause).toHaveBeenCalled();
});

test("el reintento de imagen crea una carga nueva y al quitar la receta restaura el video original", () => {
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
  const { container, rerender } = render(<PostMedia media={media} />);
  fireEvent.click(screen.getByRole("button", { name: "Clip siguiente" }));
  const old = screen.getByAltText("Imagen del clip 2"); fireEvent.error(old);
  fireEvent.click(screen.getByRole("button", { name: "Reintentar clip" }));
  const image = screen.getByAltText("Imagen del clip 2"); expect(image).not.toBe(old);
  fireEvent.load(image); expect(screen.getByRole("button", { name: "Pausar secuencia" })).toBeTruthy();
  const native = container.querySelector("video");
  rerender(<PostMedia media={{ type: "video", url: media.url }} />);
  expect(native.hasAttribute("src")).toBe(false);
  expect(native.querySelector("source").src).toContain(media.url);
  expect(native.style.display).toBe(""); expect(relojVideo(native)).toBe(native);
  expect(container.querySelector(".k-video-sequence-image")).toBeNull();
});

function trimmed(node, recipe, options) {
  const c = conectarSecuencia(node, recipe, options); controllers.push(c); return c;
}
const cutClips = [
  { tipo: "video", url: "/uploads/media/uno.webm", duracion: 10, inicio: 4, fin: 7 },
  { tipo: "video", url: "/uploads/media/uno.webm", duracion: 10, inicio: 8, fin: 9 }
];

test("el recorte se mide desde el inicio y se acota con la duración real", () => {
  expect(limitesClip(cutClips[0], 6)).toEqual({ inicio: 4, fin: 6, duracion: 2 });
  expect(limitesClip({ ...cutClips[0], fin: 0 }, 10)).toEqual({ inicio: 4, fin: 10, duracion: 6 });
  expect(limitesClip({ ...cutClips[0], inicio: 12 }, 10).duracion).toBe(0);
  expect(limitesClip({ tipo: "image", duracion: 2.5, inicio: 10, fin: 20 })).toEqual({ inicio: 0, fin: 2.5, duracion: 2.5 });
  expect(secuenciaDeVideo({ ...media, edit: { clips: [{ ...cutClips[0], fin: 4 }, cutClips[1]] } }).error).toMatch(/no tiene duración válida/);
});

test("una toma recortada usa la receta y conserva trim antiguo, sin recortar globalmente una secuencia", () => {
  const one = { type: "video", url: media.url, duration: 10, trim: { start: 2, end: 8 } };
  expect(secuenciaDeVideo(one).clips[0]).toMatchObject({ inicio: 2, fin: 8 });
  expect(secuenciaDeVideo({ ...one, edit: { corte: { inicio: 4, fin: 6 } } }).clips[0]).toMatchObject({ inicio: 4, fin: 6 });
  expect(secuenciaDeVideo({ ...one, edit: { corte: { inicio: 0, fin: 0 } } }).clips[0].inicio).toBe(2);
  expect(secuenciaDeVideo({ ...one, trim: { start: 0, end: 10 } })).toBeNull();
  expect(secuenciaDeVideo({ ...media, edit: { clips: cutClips, corte: { inicio: 1, fin: 2 } } }).clips[0].inicio).toBe(4);
});

test("espera el seek al inicio antes de reproducir y no cuenta el prefijo excluido", () => {
  const node = video({ duration: 10, seeking: true });
  const c = trimmed(node, cutClips);
  c.play(); event(node, "loadedmetadata");
  expect(node.currentTime).toBe(4); expect(node.play).not.toHaveBeenCalled();
  expect(node.style.visibility).toBe("hidden"); expect(c.clock.currentTime).toBe(0);
  node.seeking = false; event(node, "seeked");
  expect(node.play).toHaveBeenCalledOnce(); expect(node.style.visibility).not.toBe("hidden");
  node.currentTime = 5; event(node, "timeupdate"); expect(c.clock.currentTime).toBe(1);
});

test("el límite de salida avanza a la siguiente toma aunque aún no haya ended", () => {
  const node = video({ duration: 10 }); const state = vi.fn(); const c = trimmed(node, cutClips, { onChange: state });
  event(node, "loadedmetadata"); c.play(); event(node, "playing");
  node.currentTime = 7.01; frame(16);
  expect(state.mock.lastCall[0].index).toBe(1); expect(c.clock.currentTime).toBe(3);
  expect(node.load).toHaveBeenCalledTimes(2);
  event(node, "loadedmetadata"); expect(node.currentTime).toBe(8);
  event(node, "playing"); node.currentTime = 9.01; event(node, "timeupdate");
  expect(c.clock.ended).toBe(true); expect(c.clock.currentTime).toBe(4); expect(node.paused).toBe(true);
});

test("un seek nativo no sale del tramo y conserva la pausa del usuario", () => {
  const node = video({ duration: 10 }); const c = trimmed(node, cutClips);
  event(node, "loadedmetadata");
  node.currentTime = 1; event(node, "seeking"); expect(node.currentTime).toBe(4);
  event(node, "seeked"); expect(c.clock.currentTime).toBe(0); expect(c.clock.paused).toBe(true);
  node.currentTime = 9; event(node, "seeking"); expect(node.currentTime).toBe(7);
  event(node, "seeked"); expect(c.clock.currentTime).toBe(3); expect(c.clock.paused).toBe(true);
  c.select(1, true); c.pause(); event(node, "loadedmetadata"); event(node, "seeked"); expect(c.clock.paused).toBe(true);
});

test("el recorte fuera del archivo se detiene con aviso, sin saltar a otro clip", () => {
  const node = video({ duration: 3 }); const state = vi.fn(); const c = trimmed(node, cutClips, { onChange: state });
  c.play(); event(node, "loadedmetadata");
  expect(state.mock.lastCall[0].error).toMatch(/fuera del archivo/); expect(state.mock.lastCall[0].index).toBe(0);
  expect(node.play).not.toHaveBeenCalled(); expect(c.clock.paused).toBe(true);
  c.retry(); node.duration = 10; event(node, "loadedmetadata"); expect(node.currentTime).toBe(4);
});

test("música sigue el tiempo montado y no la posición original del archivo recortado", async () => {
  const node = video({ duration: 10 }); const c = trimmed(node, cutClips); const audio = video({ duration: 30 });
  controllers.push(conectarMusica(node, audio, { inicio: 1, fin: 30, volumen: 0.8, fundidoEntrada: 0, fundidoSalida: 0 }));
  event(node, "loadedmetadata"); c.play(); event(node, "playing"); await flush();
  node.currentTime = 5; event(node, "timeupdate"); expect(audio.currentTime).toBe(2);
  node.currentTime = 7; event(node, "timeupdate");
  event(node, "loadedmetadata"); event(node, "playing"); await flush();
  node.currentTime = 8.5; event(node, "timeupdate"); expect(audio.currentTime).toBeCloseTo(4.5);
  c.pause(); expect(audio.paused).toBe(true);
});

const speedClips = [
  { tipo: "video", url: "/uploads/media/uno.webm", duracion: 10, inicio: 4, fin: 8, velocidad: 2 },
  { tipo: "image", url: "/uploads/media/dos.png", duracion: 1.5, velocidad: 4 },
  { tipo: "video", url: "/uploads/media/uno.webm", duracion: 10, inicio: 1, fin: 3, velocidad: 0.5 }
];

for (const rate of [0.25, 0.5, 1, 1.5, 2, 4]) {
  test(`aplica ${rate}x al video y reparte su tramo entre esa velocidad`, () => {
    const piece = { ...speedClips[0], velocidad: rate };
    const node = video({ duration: 10 }); const c = trimmed(node, [piece]);
    event(node, "loadedmetadata");
    expect(node.playbackRate).toBe(rate); expect(node.defaultPlaybackRate).toBe(rate);
    expect(limitesClip(piece).duracion).toBeCloseTo(4 / rate);
    node.currentTime = 6; expect(c.clock.currentTime).toBeCloseTo(2 / rate);
    expect(c.clock.playbackRate).toBe(1);
  });
}

test("normaliza velocidades y conserva una toma única editada sin inventar velocidad de imagen", () => {
  expect(velocidadDeClip({ tipo: "video", velocidad: 100 })).toBe(4);
  expect(velocidadDeClip({ tipo: "video", velocidad: 0 })).toBe(0.25);
  expect(velocidadDeClip({ tipo: "video", velocidad: NaN })).toBe(1);
  expect(velocidadDeClip({ tipo: "image", velocidad: 4 })).toBe(1);
  const sequence = secuenciaDeVideo({ ...media, edit: { clips: [speedClips[0]] } });
  expect(sequence.clips).toHaveLength(1); expect(sequence.clips[0].velocidad).toBe(2);
});

test("al pasar rápido → imagen → lento no acelera música ni voz ni arrastra velocidad a la imagen", async () => {
  const node = video({ duration: 10 }); const c = trimmed(node, speedClips); const audio = video({ duration: 30 });
  controllers.push(conectarMusica(node, audio, { inicio: 1, fin: 30, volumen: 0.8, fundidoEntrada: 0, fundidoSalida: 0 }));
  event(node, "loadedmetadata"); c.play(); event(node, "playing"); await flush();
  node.currentTime = 6; event(node, "timeupdate");
  expect(c.clock.currentTime).toBe(1); expect(audio.currentTime).toBe(2); expect(audio.playbackRate).toBe(1);
  node.currentTime = 8; event(node, "timeupdate"); c.readyImage(); frame(500); await flush();
  expect(node.playbackRate).toBe(1); expect(c.clock.currentTime).toBe(2.5); expect(audio.currentTime).toBeCloseTo(3.5);
  frame(1000); event(node, "loadedmetadata"); event(node, "playing"); await flush();
  expect(node.playbackRate).toBe(0.5); node.currentTime = 2; event(node, "timeupdate");
  expect(c.clock.currentTime).toBe(5.5); expect(audio.currentTime).toBeCloseTo(6.5); expect(audio.playbackRate).toBe(1);
  node.currentTime = 3; event(node, "timeupdate"); expect(c.clock.currentTime).toBe(7.5); expect(c.clock.ended).toBe(true);
});

test("la velocidad de consumo del espectador se combina con cada toma y se restaura al salir", () => {
  const node = video({ duration: 10, playbackRate: 1.5, defaultPlaybackRate: 1.5 });
  const c = trimmed(node, speedClips);
  event(node, "loadedmetadata"); expect(node.playbackRate).toBe(3); expect(c.clock.playbackRate).toBe(1.5);
  node.playbackRate = 4; event(node, "ratechange"); expect(c.clock.playbackRate).toBe(2);
  c.select(1, true); c.readyImage(); expect(node.playbackRate).toBe(2); frame(250);
  expect(c.clock.currentTime).toBe(2.5);
  c.select(2, false); event(node, "loadedmetadata"); expect(node.playbackRate).toBe(1); expect(c.clock.playbackRate).toBe(2);
  c.dispose(); expect(node.playbackRate).toBe(1.5); expect(node.defaultPlaybackRate).toBe(1.5);
});

test("si el navegador rechaza una velocidad se detiene con aviso y permite reintentar", () => {
  const node = video({ duration: 10 }); let rate = 1;
  Object.defineProperty(node, "playbackRate", { get: () => rate, set: value => { if (value === 2) throw new Error("unsupported"); rate = value; }, configurable: true });
  const change = vi.fn(); const c = trimmed(node, speedClips, { onChange: change });
  expect(change.mock.lastCall[0].error).toMatch(/no admite la velocidad/); expect(c.clock.paused).toBe(true);
  Object.defineProperty(node, "playbackRate", { value: 1, writable: true, configurable: true });
  c.retry(); event(node, "loadedmetadata"); expect(node.playbackRate).toBe(2);
});

test("conserva la transición entrante y la limita al montaje real sin restar duración", async () => {
  const parts = [clips[0], { ...clips[1], transicion: { tipo: "fundido", duracion: 2 } }, clips[2]];
  const normalized = secuenciaDeVideo({ ...media, edit: { clips: parts } });
  expect(normalized.clips[1].transicion).toEqual(parts[1].transicion);
  const node = video(); const capture = vi.fn(); const c = trimmed(node, parts, { onTransition: capture });
  event(node, "loadedmetadata"); c.play(); event(node, "playing");
  node.currentTime = 2; event(node, "timeupdate");
  expect(capture).toHaveBeenCalledOnce(); expect(c.clock.transition).toEqual({ tipo: "fundido", duracion: 0.75, progreso: 0 });
  c.readyImage(); frame(300);
  expect(c.clock.transition.progreso).toBeCloseTo(0.4); expect(c.clock.currentTime).toBeCloseTo(2.3);
  c.pause(); frame(200); expect(c.clock.transition.progreso).toBeCloseTo(0.4);
  c.play(); frame(500); expect(c.clock.transition).toBeNull(); expect(c.clock.duration).toBe(6.5);
  c.select(1, false); expect(c.clock.transition).toBeNull(); expect(capture).toHaveBeenCalledOnce();
  await flush();
});

test("una transición hacia video ajusta su duración con metadatos y velocidad, y no reaparece al buscar", () => {
  const parts = [clips[0], { ...clips[2], velocidad: 2, transicion: { tipo: "barrido", duracion: 2 } }];
  const node = video(); const c = trimmed(node, parts);
  event(node, "loadedmetadata"); c.play(); event(node, "playing"); node.currentTime = 2; event(node, "timeupdate");
  node.duration = 1; event(node, "loadedmetadata");
  expect(c.clock.transition.duracion).toBe(0.25);
  node.currentTime = 0.25; event(node, "timeupdate"); expect(c.clock.transition.progreso).toBeCloseTo(0.5);
  node.currentTime = 0.8; event(node, "timeupdate"); expect(c.clock.transition).toBeNull();
  c.select(1, false); event(node, "loadedmetadata"); expect(c.clock.transition).toBeNull();
});
