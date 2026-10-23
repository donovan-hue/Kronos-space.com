import React from "react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { conectarMusica, esMusicaLocal, estadoMusica, musicaDeVideo } from "../src/lib/videoMusic";
import PostMedia from "../src/features/social/components/PostMedia";
import * as musicService from "../src/services/musicService";

vi.mock("../src/services/musicService", () => ({ obtenerPistaMusica: vi.fn() }));
const music = { url: "/uploads/music/pista.wav", inicio: 5, fin: 15, volumen: 0.8, fundidoEntrada: 2, fundidoSalida: 2 };
const media = { type: "video", url: "/uploads/video.mp4", music };
let frames;
let controllers;

beforeEach(() => {
  frames = new Map();
  controllers = [];
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
  const c = conectarMusica(video, audio, music, callbacks);
  controllers.push(c);
  return c;
}
const flush = () => new Promise(resolve => setTimeout(resolve, 0));

test("solo admite audio del almacén propio y reconoce recetas antiguas", () => {
  expect(musicaDeVideo(media)).toEqual({ ...music, trackId: "" });
  expect(musicaDeVideo({ type: "video", edit: { musica: { trackId: "id" } } }).trackId).toBe("id");
  expect(musicaDeVideo({ ...media, type: "image" })).toBeNull();
  expect(musicaDeVideo({ type: "video" })).toBeNull();
  for (const url of ["https://example.com/song.mp3", "//example.com/a", "/uploads/music/../private/a", "/uploads/music/%2e%2e/private/a", "/uploads/music/\\evil"]) expect(esMusicaLocal(url)).toBe(false);
  expect(esMusicaLocal(music.url)).toBe(true);
});

test("el corte y los fundidos siguen el tiempo del video, sin repetir la música", () => {
  expect(estadoMusica(music, 0, 30)).toEqual({ posicion: 5, activo: true, volumen: 0 });
  expect(estadoMusica(music, 1, 30).volumen).toBeCloseTo(0.4);
  expect(estadoMusica(music, 5, 30).volumen).toBeCloseTo(0.8);
  expect(estadoMusica(music, 9, 30).volumen).toBeCloseTo(0.4);
  expect(estadoMusica(music, 10, 30)).toEqual({ posicion: 15, activo: false, volumen: 0 });
  expect(estadoMusica(music, 8, 12).activo).toBe(false);
  expect(estadoMusica({ ...music, fin: 0 }, 30, 30).activo).toBe(false);
  expect(estadoMusica({ ...music, inicio: 20 }, 0, 10).activo).toBe(false);
});

test("sincroniza play, volumen, silencio, velocidad y pausa", async () => {
  const video = player(); const audio = player();
  connect(video, audio);
  expect(audio.play).not.toHaveBeenCalled();
  video.paused = false; video.currentTime = 3; video.volume = 0.5; video.playbackRate = 1.5;
  video.dispatchEvent(new Event("playing")); await flush();
  expect(audio.currentTime).toBe(8);
  expect(audio.volume).toBeCloseTo(0.4);
  expect(audio.playbackRate).toBe(1.5);
  expect(audio.play).toHaveBeenCalledTimes(1);
  video.muted = true; video.dispatchEvent(new Event("volumechange"));
  expect(audio.muted).toBe(true); expect(audio.paused).toBe(true);
  video.muted = false; video.dispatchEvent(new Event("volumechange")); await flush();
  expect(audio.play).toHaveBeenCalledTimes(2);
  video.paused = true; video.dispatchEvent(new Event("pause"));
  expect(audio.paused).toBe(true); expect(frames.size).toBe(0);
});

test("búsqueda, buffering, final y reinicio mantienen la pista alineada", async () => {
  const video = player({ paused: false, currentTime: 3 }); const audio = player();
  connect(video, audio); await flush();
  video.seeking = true; video.dispatchEvent(new Event("seeking"));
  expect(audio.paused).toBe(true);
  video.seeking = false; video.currentTime = 7; video.dispatchEvent(new Event("seeked")); await flush();
  expect(audio.currentTime).toBe(12);
  video.dispatchEvent(new Event("waiting")); expect(audio.paused).toBe(true);
  video.dispatchEvent(new Event("playing")); await flush(); expect(audio.paused).toBe(false);
  video.currentTime = 11; video.dispatchEvent(new Event("timeupdate")); expect(audio.paused).toBe(true);
  video.currentTime = 0; video.dispatchEvent(new Event("timeupdate")); await flush();
  expect(audio.currentTime).toBe(5); expect(audio.paused).toBe(false);
});

test("espera metadatos, corrige desfase y pausa al ocultar la pestaña", async () => {
  const video = player({ paused: false, currentTime: 3 }); const audio = player({ readyState: 0 });
  connect(video, audio); await flush();
  expect(audio.currentTime).toBe(0);
  audio.readyState = 1; audio.dispatchEvent(new Event("loadedmetadata"));
  expect(audio.currentTime).toBe(8);
  audio.currentTime = 2; video.dispatchEvent(new Event("timeupdate")); expect(audio.currentTime).toBe(8);
  vi.spyOn(document, "hidden", "get").mockReturnValue(true);
  document.dispatchEvent(new Event("visibilitychange")); expect(audio.paused).toBe(true);
  vi.spyOn(document, "hidden", "get").mockReturnValue(false);
  document.dispatchEvent(new Event("visibilitychange")); await flush(); expect(audio.paused).toBe(false);
});

test("un bloqueo de autoplay requiere reintento explícito y la limpieza detiene todo", async () => {
  const video = player({ paused: false }); const audio = player();
  audio.play.mockRejectedValueOnce(Object.assign(new Error("blocked"), { name: "NotAllowedError" }));
  const onBlocked = vi.fn(); const c = connect(video, audio, { onBlocked });
  await flush(); expect(onBlocked).toHaveBeenCalledOnce();
  video.dispatchEvent(new Event("timeupdate")); expect(audio.play).toHaveBeenCalledTimes(1);
  c.retry(); await flush(); expect(audio.play).toHaveBeenCalledTimes(2);
  c.dispose(); expect(audio.paused).toBe(true);
  video.dispatchEvent(new Event("playing")); expect(audio.play).toHaveBeenCalledTimes(2);
  expect(frames.size).toBe(0);
});

test("una promesa tardía no deja audio sonando después de desmontar", async () => {
  const video = player({ paused: false }); const audio = player(); let resolve;
  audio.play.mockImplementation(() => new Promise(done => { resolve = done; }));
  const c = connect(video, audio); c.dispose(); audio.paused = false; resolve(); await flush();
  expect(audio.paused).toBe(true);
});

test("el feed carga la pista, la pausa al ampliar y retira el audio al cambiar a foto", () => {
  const pause = vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
  const { container, rerender } = render(<PostMedia media={media} />);
  expect(container.querySelector("audio").src).toContain(music.url);
  expect(container.querySelector("audio").hasAttribute("autoplay")).toBe(false);
  fireEvent.click(screen.getByRole("button", { name: "Ver video en pantalla completa" }));
  expect(pause).toHaveBeenCalled(); expect(screen.getByRole("dialog").querySelector("audio")).toBeTruthy();
  fireEvent.keyDown(document, { key: "Escape" });
  rerender(<PostMedia media={{ ...media, type: "image" }} />);
  expect(container.querySelector("audio")).toBeNull();
});

test("resuelve trackId antiguo y muestra un error recuperable si la pista no existe", async () => {
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
  musicService.obtenerPistaMusica.mockRejectedValueOnce(new Error("404")).mockResolvedValueOnce({ url: music.url });
  const { container } = render(<PostMedia media={{ ...media, music: { trackId: "old-track" } }} />);
  fireEvent.click(await screen.findByRole("button", { name: "Reintentar música" }));
  await waitFor(() => expect(container.querySelector("audio")).toBeTruthy());
  expect(musicService.obtenerPistaMusica).toHaveBeenCalledWith("old-track");
});
