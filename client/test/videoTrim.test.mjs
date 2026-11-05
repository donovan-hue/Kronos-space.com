import test from "node:test";
import assert from "node:assert/strict";
import { recorteDeVideo, accionDeRecorte } from "../src/lib/videoTrim.js";

const video = (extra = {}) => ({ url: "/uploads/media/a.mp4", type: "video", ...extra });

test("sin fin declarado no hay recorte: el video se ve entero", () => {
  assert.equal(recorteDeVideo(video()), null);
  assert.equal(recorteDeVideo(video({ trim: { start: 0, end: 0, muted: false } })), null);
  assert.equal(recorteDeVideo(video({ edit: { corte: { inicio: 5, fin: 0 } } })), null);
});

test("un fin anterior o igual al inicio se descarta en vez de romper el reproductor", () => {
  assert.equal(recorteDeVideo(video({ edit: { corte: { inicio: 10, fin: 10 } } })), null);
  assert.equal(recorteDeVideo(video({ edit: { corte: { inicio: 20, fin: 5 } } })), null);
});

test("la receta nueva manda sobre el legado y respeta el silencio", () => {
  const r = recorteDeVideo(video({
    edit: { corte: { inicio: 12, fin: 30, silenciar: true } },
    trim: { start: 0, end: 60, muted: false }
  }));
  assert.deepEqual(r, { inicio: 12, fin: 30, silenciado: true });
});

test("el legado se sigue leyendo para las publicaciones anteriores", () => {
  const r = recorteDeVideo(video({ trim: { start: 3, end: 9, muted: true } }));
  assert.deepEqual(r, { inicio: 3, fin: 9, silenciado: true });
});

test("un video no recortado no paga ningún coste", () => {
  assert.equal(recorteDeVideo({ ...video(), type: "image" }), null);
  assert.equal(accionDeRecorte(null, 99), null);
});

test("dentro del tramo no se toca nada; fuera, se para o se salta", () => {
  const recorte = { inicio: 10, fin: 20, silenciado: false };

  assert.equal(accionDeRecorte(recorte, 15), null);
  assert.equal(accionDeRecorte(recorte, 0), "saltar", "empezar en 0 mostraría lo que se cortó");
  assert.equal(accionDeRecorte(recorte, 20), "parar");
  assert.equal(accionDeRecorte(recorte, 25), "parar");
  // La tolerancia evita que un `timeupdate` a 19.9 s pare antes de tiempo.
  assert.equal(accionDeRecorte(recorte, 19.9), null);
});
