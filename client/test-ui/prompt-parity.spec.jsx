import { expect, test } from "vitest";
import { createRequire } from "node:module";

import { renderPrompt } from "../src/features/image-ai/renderPrompt";

/**
 * Paridad de la vista previa con el servidor.
 *
 * La biblioteca pinta el prompt en el navegador y el servidor lo guarda: si
 * las dos versiones se separan, el autor ve una cosa y guarda otra. Aquí se
 * comparan los 54 instrumentos con varios juegos de valores (todos llenos,
 * uno vacío, con comas y mayúsculas, larguísimos) y con los casos límite.
 *
 * Se lee el catálogo del servidor de verdad, no una copia: así la prueba
 * también detecta que un instrumento nuevo se ha añadido solo a un lado.
 */

const require = createRequire(import.meta.url);
const library = require("../../server/src/modules/prompts/promptLibrary");

const JUEGOS = [
  // Todos los campos rellenos.
  (instrumento) => Object.fromEntries(instrumento.campos.map((campo) => [campo, `texto de ${campo}`])),
  // Solo el primero.
  (instrumento) => ({ [instrumento.campos[0]]: "solo el primero" }),
  // Solo el último, con comas y mayúsculas dentro (el caso que rompía frases).
  (instrumento) => ({ [instrumento.campos[instrumento.campos.length - 1]]: "Algo, Con Mayúsculas, y comas" }),
  // Uno vacío y otro con espacios sobrantes.
  (instrumento) => ({
    [instrumento.campos[0]]: "   ",
    [instrumento.campos[instrumento.campos.length - 1]]: "  con espacios  ",
  }),
  // Larguísimo: obliga a recortar.
  (instrumento) => Object.fromEntries(
    instrumento.campos.map((campo) => [campo, "palabra ".repeat(700)])
  ),
  // Vacío del todo.
  () => ({}),
];

test("la vista previa del cliente y el servidor arman el mismo prompt en los 54 instrumentos", () => {
  expect(library.INSTRUMENTOS.length).toBe(54);

  for (const instrumento of library.INSTRUMENTOS) {
    for (const [indice, juego] of JUEGOS.entries()) {
      const valores = juego(instrumento);
      const servidor = library.renderPrompt(instrumento.codigo, valores);
      const cliente = renderPrompt(instrumento.template, instrumento.campos, valores);
      const esperado = servidor.error ? "" : servidor.texto;

      expect(cliente, `${instrumento.codigo} · juego ${indice}`).toBe(esperado);
    }
  }
});

test("casos límite sueltos coinciden", () => {
  const casos = [
    ["img_lighting", { luz: "   ", material: "cromo" }],
    ["core_system", { objetivo: "", tono: "seco" }],
    ["cre_characters", { personaje: "Ana", conflicto: "" }],
    ["img_photography", { tema: "una calle", camara: "", luz: "" }],
  ];

  for (const [codigo, valores] of casos) {
    const instrumento = library.porCodigo(codigo);
    const servidor = library.renderPrompt(codigo, valores);
    expect(renderPrompt(instrumento.template, instrumento.campos, valores)).toBe(servidor.texto);
  }
});
