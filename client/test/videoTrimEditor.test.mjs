import test from "node:test";
import assert from "node:assert/strict";

import { recorteInicial, validarRecorte } from "../src/lib/videoTrimEditor.js";

test("sin recorte previo arranca en 0 y en la duración guardada", () => {
  assert.deepEqual(recorteInicial({ type: "video", duration: 30 }), { inicio: 0, fin: 30, silenciar: false });
});

test("respeta el recorte que ya estaba publicado", () => {
  const media = { type: "video", duration: 40, trim: { start: 5, end: 25, muted: true } };
  assert.deepEqual(recorteInicial(media), { inicio: 5, fin: 25, silenciar: true });
});

test("lee también la receta nueva (inicio/fin)", () => {
  const media = { type: "video", duration: 40, edit: { corte: { inicio: 2, fin: 12 } } };
  assert.deepEqual(recorteInicial(media), { inicio: 2, fin: 12, silenciar: false });
});

test("un recorte sin duración devuelve fin 0, no una duración inventada", () => {
  assert.equal(recorteInicial({ type: "video", duration: 0 }).fin, 0);
});

test("valida el tramo", () => {
  assert.equal(validarRecorte({ inicio: 0, fin: 10, duracion: 30 }), "");
  assert.match(validarRecorte({ inicio: 10, fin: 10, duracion: 30 }), /después del inicio/);
  assert.match(validarRecorte({ inicio: 5, fin: 40, duracion: 30 }), /duración del video/);
  assert.match(validarRecorte({ inicio: 0, fin: 10, duracion: 0 }), /termine de cargar/);
});

test("acepta el borde exacto del final con la tolerancia del reproductor", () => {
  assert.equal(validarRecorte({ inicio: 0, fin: 30.04, duracion: 30 }), "");
});
