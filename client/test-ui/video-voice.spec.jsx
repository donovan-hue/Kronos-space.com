import React from "react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { conectarVoz, esVozLocal, estadoVoz, vozDeVideo } from "../src/lib/videoVoice";
import PostMedia from "../src/features/social/components/PostMedia";
import VideoVoice from "../src/components/media/VideoVoice";

const voz = { url: "/uploads/voices/toma.wav", inicio: 3, fin: 13, volumen: 0.8, fundidoEntrada: 2, fundidoSalida: 2 };
const media = { type: "video", url: "/uploads/video.webm", edit: { voz } };
let controllers;
let frames;

beforeEach(() => {
  controllers = [];
  frames = new Map();
  vi.stubGlobal("requestAnimationFrame", vi.fn(callback => { const id = Math.random(); frames.set(id, callback); return id; }));
  vi.stubGlobal("cancelAnimationFrame", vi.fn(id => frames.delete(id)));
  vi.spyOn(document, "hidden", "get").mockReturnValue(false);
});
afterEach(() => { cleanup(); controllers.forEach(c => c.dispose()); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

function player(values = {}) {
  const node = new EventTarget();
  Object.assign(node, { paused: true, ended: false, seeking: false, muted: false, volume: 1, playbackRate: 1, currentTime: 0, duration: 30, readyState: 1 }, values);
  node.play = vi.fn(() => { node.paused = false; return Promise.resolve(); });
  node.pause = vi.fn(() => { node.paused = true; });
  return node;
}
function connect(video, audio, callbacks) {
  const c = conectarVoz(video, audio, voz, callbacks); controllers.push(c); return c;
}
const flush = () => new Promise(resolve => setTimeout(resolve, 0));

function siguienteFrame() {
  const [id, callback] = frames.entries().next().value;
  frames.delete(id); callback();
}

test("reconoce la voz de la receta y admite solo archivos locales de voces", () => {
  expect(vozDeVideo(media)).toEqual({ ...voz, voiceId: "" });
  expect(vozDeVideo({ ...media, type: "image" })).toBeNull();
  expect(vozDeVideo({ type: "video" })).toBeNull();
  expect(vozDeVideo({ type: "video", edit: { voz: {} } })).toBeNull();
  for (const url of ["https://example.com/toma.mp3", "//example.com/toma", "/uploads/music/a.mp3", "/uploads/voices/../private/a", "/uploads/voices/%2e%2e/private/a", "/uploads/voices/\\evil"]) expect(esVozLocal(url)).toBe(false);
  expect(esVozLocal(voz.url)).toBe(true);
  expect(vozDeVideo({ ...media, edit: { voz: { voiceId: "modelo" } } }).url).toBe("");
  const normal = vozDeVideo({ ...media, edit: { voz: { ...voz, inicio: -5, volumen: 2, fundidoSalida: -1 } } });
  expect(normal.inicio).toBe(0); expect(normal.volumen).toBe(1); expect(normal.fundidoSalida).toBe(0);
});

test("inicio y fin son tiempos de la pieza, no cortes de la fuente", () => {
  expect(estadoVoz(voz, 2, 30)).toEqual({ posicion: 0, activo: false, pendiente: true, volumen: 0 });
  expect(estadoVoz(voz, 3, 30)).toEqual({ posicion: 0, activo: true, pendiente: false, volumen: 0 });
  expect(estadoVoz(voz, 4, 30).volumen).toBeCloseTo(0.4);
  expect(estadoVoz(voz, 8, 30)).toEqual({ posicion: 5, activo: true, pendiente: false, volumen: 0.8 });
  expect(estadoVoz(voz, 12, 30).volumen).toBeCloseTo(0.4);
  expect(estadoVoz(voz, 13, 30).activo).toBe(false);
  expect(estadoVoz(voz, 7, 4).activo).toBe(false);
  expect(estadoVoz({ ...voz, fin: 0 }, 33, 30).activo).toBe(false);
  expect(estadoVoz({ ...voz, fin: 2 }, 3, 30).activo).toBe(false);
  expect(estadoVoz({ ...voz, fin: 4, fundidoEntrada: 30, fundidoSalida: 30 }, 3.25, 30).volumen).toBeCloseTo(0.4);
});

test("espera la entrada sin sonar, sigue el reloj y respeta final y reinicio", async () => {
  const video = player({ paused: false }); const audio = player();
  connect(video, audio); await flush();
  expect(audio.play).not.toHaveBeenCalled(); expect(frames.size).toBe(1);
  video.currentTime = 3; siguienteFrame(); await flush();
  expect(audio.play).toHaveBeenCalledOnce(); expect(audio.currentTime).toBe(0);
  video.currentTime = 8; siguienteFrame();
  expect(audio.currentTime).toBe(5);
  video.currentTime = 13; siguienteFrame();
  expect(audio.paused).toBe(true); expect(frames.size).toBe(0);
  video.currentTime = 0; video.dispatchEvent(new Event("timeupdate"));
  expect(audio.paused).toBe(true); expect(frames.size).toBe(1);
  video.currentTime = 4; siguienteFrame(); await flush();
  expect(audio.currentTime).toBe(1); expect(audio.paused).toBe(false);
});

test("pausa, silencio, volumen, velocidad, saltos y buffering no dejan voz independiente", async () => {
  const video = player({ paused: false, currentTime: 7, volume: 0.5, playbackRate: 1.5 }); const audio = player();
  connect(video, audio); await flush();
  expect(audio.currentTime).toBe(4); expect(audio.volume).toBeCloseTo(0.4); expect(audio.playbackRate).toBe(1.5);
  video.seeking = true; video.dispatchEvent(new Event("seeking")); expect(audio.paused).toBe(true);
  video.seeking = false; video.currentTime = 9; video.dispatchEvent(new Event("seeked")); await flush();
  expect(audio.currentTime).toBe(6); expect(audio.paused).toBe(false);
  video.dispatchEvent(new Event("waiting")); expect(audio.paused).toBe(true);
  video.dispatchEvent(new Event("playing")); await flush(); expect(audio.paused).toBe(false);
  video.muted = true; video.dispatchEvent(new Event("volumechange")); expect(audio.muted && audio.paused).toBe(true);
  video.muted = false; video.dispatchEvent(new Event("volumechange")); await flush(); expect(audio.paused).toBe(false);
  video.paused = true; video.dispatchEvent(new Event("pause")); expect(audio.paused).toBe(true);
  expect(frames.size).toBe(0);
});

test("corrige desfase al recibir metadatos y se detiene con la pestaña oculta", async () => {
  const video = player({ paused: false, currentTime: 8 }); const audio = player({ readyState: 0 });
  connect(video, audio); await flush(); expect(audio.currentTime).toBe(0);
  audio.readyState = 1; audio.dispatchEvent(new Event("loadedmetadata")); expect(audio.currentTime).toBe(5);
  vi.spyOn(document, "hidden", "get").mockReturnValue(true);
  document.dispatchEvent(new Event("visibilitychange")); expect(audio.paused).toBe(true);
  vi.spyOn(document, "hidden", "get").mockReturnValue(false);
  document.dispatchEvent(new Event("visibilitychange")); await flush(); expect(audio.paused).toBe(false);
});

test("bloqueo o fallo requieren reintento explícito, sin reproducir en bucle", async () => {
  const video = player({ paused: false, currentTime: 5 }); const audio = player();
  audio.play.mockRejectedValueOnce(Object.assign(new Error("blocked"), { name: "NotAllowedError" }));
  const onBlocked = vi.fn(); const onError = vi.fn(); const c = connect(video, audio, { onBlocked, onError });
  await flush(); expect(onBlocked).toHaveBeenCalledOnce();
  video.dispatchEvent(new Event("timeupdate")); expect(audio.play).toHaveBeenCalledOnce();
  c.retry(); await flush(); expect(audio.paused).toBe(false);
  audio.dispatchEvent(new Event("error")); expect(onError).toHaveBeenCalledOnce(); expect(audio.paused).toBe(true);
  video.dispatchEvent(new Event("timeupdate")); expect(audio.play).toHaveBeenCalledTimes(2);
  c.retry(); await flush(); expect(audio.play).toHaveBeenCalledTimes(3);
  c.dispose(); expect(audio.paused).toBe(true); expect(frames.size).toBe(0);
});

test("una reproducción tardía se apaga al volver antes de la entrada o desmontar", async () => {
  const video = player({ paused: false, currentTime: 6 }); const audio = player(); let resolve;
  audio.play.mockImplementation(() => new Promise(done => { resolve = done; }));
  const c = connect(video, audio);
  video.currentTime = 1; audio.paused = false; resolve(); await flush(); expect(audio.paused).toBe(true);
  c.dispose(); video.dispatchEvent(new Event("playing")); expect(audio.play).toHaveBeenCalledOnce();
});

test("en Inicio y el visor monta la toma, pausa al ampliar y limpia al cerrar o cambiar de foto", () => {
  const pause = vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
  const { container, rerender } = render(<PostMedia media={media} />);
  expect(container.querySelector(".k-video-voice audio").src).toContain(voz.url);
  fireEvent.click(screen.getByRole("button", { name: "Ver video en pantalla completa" }));
  expect(pause).toHaveBeenCalled(); expect(screen.getByRole("dialog").querySelector(".k-video-voice audio")).toBeTruthy();
  fireEvent.keyDown(document, { key: "Escape" }); expect(screen.queryByRole("dialog")).toBeNull();
  rerender(<PostMedia media={{ ...media, type: "image" }} />);
  expect(container.querySelector("audio")).toBeNull();
});

test("avisa si solo hay un modelo o una URL ajena, sin generar ni solicitar audio", () => {
  const { container, rerender } = render(<VideoVoice media={{ ...media, edit: { voz: { voiceId: "modelo" } } }} />);
  expect(screen.getByRole("status").textContent).toContain("no tiene una grabación reproducible");
  expect(container.querySelector("audio")).toBeNull(); expect(screen.queryByRole("button")).toBeNull();
  rerender(<VideoVoice media={{ ...media, edit: { voz: { url: "https://example.com/toma.mp3" } } }} />);
  expect(container.querySelector("audio")).toBeNull();
});

test("el aviso de autoplay permite activar la voz y el error de archivo permite recargarla", async () => {
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
  const play = vi.spyOn(HTMLMediaElement.prototype, "play").mockRejectedValueOnce(Object.assign(new Error(), { name: "NotAllowedError" })).mockResolvedValue(undefined);
  const load = vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => {});
  const { container } = render(<div><video /><VideoVoice media={media} /></div>);
  const video = container.querySelector("video");
  Object.defineProperties(video, { paused: { configurable: true, value: false }, currentTime: { configurable: true, value: 5 } });
  fireEvent.playing(video);
  fireEvent.click(await screen.findByRole("button", { name: "Activar voz" }));
  await waitFor(() => expect(screen.queryByRole("button", { name: "Activar voz" })).toBeNull());
  expect(play).toHaveBeenCalledTimes(2);
  fireEvent.error(container.querySelector("audio"));
  fireEvent.click(await screen.findByRole("button", { name: "Reintentar voz" }));
  expect(load).toHaveBeenCalledOnce();
});
