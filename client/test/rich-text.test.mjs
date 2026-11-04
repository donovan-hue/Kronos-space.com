import test from "node:test";
import assert from "node:assert";
import { parseRichText, mentionsOf } from "../src/lib/richText.js";

/**
 * El texto de una publicación se pinta trozo a trozo (React escapa cada uno),
 * así que este intérprete es la única puerta por la que algo se vuelve enlace.
 * Si se equivoca, o no hay enlaces o hay un enlace donde no toca.
 */

test("sin etiquetas ni enlaces el texto es un solo trozo", () => {
  assert.deepStrictEqual(parseRichText("Hola, sin nada especial."), [
    { type: "text", value: "Hola, sin nada especial." }
  ]);
});

test("un hashtag se vuelve enlace interno normalizado", () => {
  const parts = parseRichText("Hoy escribo sobre #Diseño y #arte_2");
  assert.deepStrictEqual(parts[1], {
    type: "hashtag",
    value: "#Diseño",
    tag: "diseño",
    href: "/hashtag/dise%C3%B1o"
  });
  assert.strictEqual(parts[3].href, "/hashtag/arte_2");
});

test("una mención lleva al perfil y respeta el patrón de usuario", () => {
  const parts = parseRichText("gracias @ana_2 por todo");
  assert.deepStrictEqual(parts[1], {
    type: "mention",
    value: "@ana_2",
    username: "ana_2",
    href: "/profile/ana_2"
  });
});

test("una URL abre fuera, sin punto final y con el href intacto", () => {
  const parts = parseRichText("mira https://kronos-space.com/docs.");
  const link = parts.find((part) => part.type === "link");
  assert.strictEqual(link.href, "https://kronos-space.com/docs");
  assert.strictEqual(link.value, "https://kronos-space.com/docs");
  assert.strictEqual(parts[parts.length - 1].value, ".");
});

test("no inventa enlaces: `www.` y correos se quedan como texto", () => {
  const parts = parseRichText("escribe a hola@kronos-space.com o visita www.kronos-space.com");
  assert.ok(parts.every((part) => part.type === "text"));
});

test("`a#b` no es etiqueta: el patrón exige inicio de palabra", () => {
  const parts = parseRichText("C#sharp no es un tema");
  assert.ok(parts.every((part) => part.type === "text"));
});

test("un enlace que contiene `#` no se parte en dos", () => {
  const parts = parseRichText("https://kronos-space.com/#/home");
  assert.strictEqual(parts.length, 1);
  assert.strictEqual(parts[0].type, "link");
});

test("el texto se reconstruye exactamente igual", () => {
  const source = "hola @ana y #arte: https://x.dev/a?b=1 fin";
  assert.strictEqual(parseRichText(source).map((p) => p.value).join(""), source);
});

test("mentionsOf devuelve los usuarios mencionados", () => {
  assert.deepStrictEqual(mentionsOf("@uno y @dos, otra vez @uno"), ["uno", "dos", "uno"]);
});

test("contenido vacío o no textual no produce trozos", () => {
  assert.deepStrictEqual(parseRichText(""), []);
  assert.deepStrictEqual(parseRichText(null), []);
  assert.deepStrictEqual(parseRichText({}), []);
});

test("un texto enorme se corta al límite del servidor (5000)", () => {
  const parts = parseRichText("a".repeat(6000));
  assert.strictEqual(parts[0].value.length, 5000);
});
