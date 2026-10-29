const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

/**
 * El cerrojo que abre el portón CRITICAL: la etiqueta de la PR, leída del
 * payload del evento. Se prueba el contrato completo —incluido lo que NO debe
 * pasar cuando el payload falta o está roto— porque un `catch` demasiado
 * generoso convertiría "no hay aprobación" en "da igual".
 */

const {
  ETIQUETA_APROBACION,
  etiquetasDelEvento,
  hayAprobacion
} = require("../src/aprobaciones");

function payload(objeto) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "kronos-guardian-evento-"));
  const archivo = path.join(dir, "event.json");
  fs.writeFileSync(archivo, JSON.stringify(objeto), "utf8");
  return archivo;
}

test("la etiqueta se lee del payload de la pull request", () => {
  const archivo = payload({
    pull_request: { number: 74, labels: [{ name: ETIQUETA_APROBACION }, { name: "docs" }] }
  });

  assert.deepEqual(etiquetasDelEvento(archivo), [ETIQUETA_APROBACION, "docs"]);
  assert.equal(hayAprobacion(etiquetasDelEvento(archivo)), true);
});

test("en un `labeled` trivial el payload trae `issue`, no `pull_request`: también cuenta", () => {
  const archivo = payload({ issue: { number: 74, labels: [{ name: ETIQUETA_APROBACION }] } });

  assert.equal(hayAprobacion(etiquetasDelEvento(archivo)), true);
});

test("sin etiqueta no hay aprobación, y sin payload tampoco", () => {
  assert.deepEqual(etiquetasDelEvento(payload({ pull_request: { labels: [] } })), []);
  assert.equal(hayAprobacion([]), false);
  assert.deepEqual(etiquetasDelEvento(undefined), []);
  assert.deepEqual(etiquetasDelEvento("/no/existe/event.json"), []);
});

test("un payload ilegible se lee como «sin aprobación», nunca como «sin problema»", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "kronos-guardian-roto-"));
  const archivo = path.join(dir, "event.json");
  fs.writeFileSync(archivo, "{ esto no es json", "utf8");

  assert.deepEqual(etiquetasDelEvento(archivo), []);
  assert.equal(hayAprobacion(etiquetasDelEvento(archivo)), false);
});

test("una etiqueta parecida no abre el portón", () => {
  const cercanas = [
    "riesgo-crítico",
    "Riesgo-Crítico-Revisado ",
    "riesgo-crítico-revisado-por-bot",
    "revisado"
  ];

  for (const nombre of cercanas) {
    assert.equal(
      hayAprobacion([nombre]),
      false,
      `«${nombre}» no es la etiqueta pactada y no puede bajar un CRITICAL`
    );
  }
});

test("el parche de comentarios se reconoce hasta sin ver el /* que abrió el bloque", () => {
  const { esCambioSoloComentarios } = require("../src/parche");
  const RUTA = "server/src/modules/capsules/capsule.crypto.js";

  // Así llega un hunk real tras purgar los registros del repo: tres líneas de
  // contexto y dos cambios, todos de comentario; el `/*` que abre el bloque
  // está fuera del hunk.
  const hunk = [
    "@@ -1,7 +1,7 @@",
    " /*",
    "  * Cifrado de cápsulas del tiempo.",
    "- *",
    "- * FASE 5 del plan maestro.",
    "+ * Fase 5.",
    "  */",
    " const crypto = require(\"node:crypto\");"
  ].join("\n");

  assert.equal(esCambioSoloComentarios(RUTA, hunk), true, "solo comentario: no debe cortar el paso");

  // Y basta una línea ejecutiva entre los comentarios para volver a cortar.
  const mezclado = [
    "@@ -1,7 +1,7 @@",
    " /*",
    "- * FASE 5 del plan maestro.",
    "+ * Fase 5.",
    "  */",
    "+ const clave = derivarClave(proceso.env.JWT_SECRET);"
  ].join("\n");

  assert.equal(
    esCambioSoloComentarios(RUTA, mezclado),
    false,
    "una línea de código dentro del hunk es un cambio real y tiene que bloquear"
  );

  // Sin parche no se demuestra nada: fail-closed.
  assert.equal(esCambioSoloComentarios(RUTA, undefined), false);
  assert.equal(esCambioSoloComentarios(RUTA, ""), false);
  assert.equal(esCambioSoloComentarios(RUTA, "@@ -1,3 +1,3 @@\n context only"), false);
  assert.equal(esCambioSoloComentarios("server/src/otro.archivo", "+ // comentario"), false);
});

test("un bloque que queda abierto al final del hunk no se da por inocuo", () => {
  const { esCambioSoloComentarios } = require("../src/parche");

  // Abre `/*` y el hunk termina sin cerrarlo: puede que el `*/` y el código que
  // deja libre estén en otro hunk.
  const abierto = "@@ -1,2 +1,2 @@\n-// nota\n+/* nota larga\n+ * sigue\n+ * y sigue";

  assert.equal(esCambioSoloComentarios("server/src/config/environment.js", abierto), false);
});
