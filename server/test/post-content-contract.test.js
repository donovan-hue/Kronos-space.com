const test = require("node:test");
const assert = require("node:assert/strict");

const normalizePost = require("../src/modules/posts/normalizePost");

/**
 * Regresión (Atlas, run 37854304169 intento 2): `/api/pulse` devolvía publicaciones
 * sin el campo `content` cuando el documento era legado (lean() no aplica el
 * default del esquema). El test del Pulso hacía `content.includes(...)` y lanzaba
 * TypeError. El contrato es: `content` siempre es texto.
 *
 * Sin base de datos: normalizePost es una función pura.
 */

const BASE = {
  _id: "65f000000000000000000001",
  author: { _id: "65f000000000000000000002", username: "autora", displayName: "Autora" },
  audience: { type: "public" },
  createdAt: new Date("2026-10-08T00:00:00Z")
};

test("normalizePost: un documento legado sin content devuelve cadena vacía, no undefined", () => {
  const legacy = { ...BASE };
  delete legacy.content;

  const normalized = normalizePost(legacy, "65f000000000000000000003");

  assert.equal(typeof normalized.content, "string");
  assert.equal(normalized.content, "");
});

test("normalizePost: content null o no textual también se normaliza a cadena", () => {
  for (const value of [null, undefined, 42, { texto: "x" }]) {
    const normalized = normalizePost({ ...BASE, content: value }, "65f000000000000000000003");
    assert.equal(typeof normalized.content, "string", `valor ${String(value)}`);
  }
});

test("normalizePost: un contenido textual válido se conserva sin cambios", () => {
  const normalized = normalizePost({ ...BASE, content: "Obra nueva #arte" }, "65f000000000000000000003");

  assert.equal(normalized.content, "Obra nueva #arte");
});
