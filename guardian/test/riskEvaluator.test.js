const test = require("node:test");
const assert = require("node:assert/strict");

/**
 * Reglas de riesgo del guardián.
 *
 * Se importan de `src/classify` y `src/riskEvaluator`, que son puros: no
 * arrastran `githubClient`, así que estas pruebas corren sin `GITHUB_TOKEN` y
 * sin instalar `@octokit/rest`. Mientras `classifyFile` vivió en
 * `diffAnalyzer.js` eso era imposible — el módulo lanzaba en la importación si
 * faltaba el token.
 *
 * El caso decisivo es el primero: `index.js` falla el job cuando el riesgo
 * general es CRITICAL, y antes ninguna regla podía producir ese nivel, así que
 * la rama era inalcanzable y el check pasaba siempre en verde.
 */

const { classifyFile } = require("../src/classify");
const {
  evaluateRisk,
  aggregateOverallRisk,
  esRutaCritica,
  RUTAS_CRITICAS
} = require("../src/riskEvaluator");

test("CRITICAL es alcanzable: el portón de index.js no es código muerto", () => {
  for (const ruta of RUTAS_CRITICAS) {
    const { overall, items } = evaluateRisk([{ filename: ruta, status: "modified" }]);

    assert.equal(
      overall,
      "CRITICAL",
      `${ruta} debía producir riesgo CRITICAL y produjo ${overall}`
    );
    assert.equal(items.length, 1, `${ruta} debía aparecer en el informe`);
    assert.equal(items[0].level, "CRITICAL");
  }
});

test("una ruta crítica sigue siéndolo aunque llegue con prefijo de repositorio", () => {
  assert.equal(esRutaCritica("server/src/config/environment.js"), true);
  assert.equal(esRutaCritica("Kronos-space.com/server/src/config/environment.js"), true);
  assert.equal(esRutaCritica("server/src/config/db.js"), false);
});

test("un cambio de autenticación es HIGH y NO bloquea el merge", () => {
  const { overall } = evaluateRisk([
    { filename: "server/src/modules/auth/auth.routes.js", status: "modified" }
  ]);

  assert.equal(overall, "HIGH");
  assert.notEqual(
    overall,
    "CRITICAL",
    "HIGH no debe fallar el job: bloquear cualquier PR de autenticación haría el check inutilizable"
  );
});

test("el riesgo general es el máximo de los archivos, en los dos sentidos", () => {
  const mixto = evaluateRisk([
    { filename: "client/src/App.jsx", status: "modified" },
    { filename: "server/src/modules/auth/auth.routes.js", status: "modified" },
    { filename: "server/src/config/environment.js", status: "modified" }
  ]);
  assert.equal(mixto.overall, "CRITICAL");

  const sinCritico = evaluateRisk([
    { filename: "client/src/App.jsx", status: "modified" },
    { filename: "server/src/modules/auth/auth.routes.js", status: "modified" }
  ]);
  assert.equal(sinCritico.overall, "HIGH");

  assert.equal(aggregateOverallRisk([]), "LOW");
});

test("el guardián se ve a sí mismo y ve las herramientas de operación", () => {
  // Antes ambos caían en "other", que evaluateRisk no puntúa: cambiar las
  // propias reglas de riesgo no producía ni una línea en el informe.
  assert.equal(classifyFile("guardian/src/riskEvaluator.js"), "guardian");
  assert.equal(classifyFile("scripts/db/migrate.js"), "scripts");

  const guardian = evaluateRisk([
    { filename: "guardian/src/riskEvaluator.js", status: "modified" }
  ]);
  assert.equal(guardian.items.length, 1);
  assert.equal(guardian.items[0].level, "MEDIUM");

  const scripts = evaluateRisk([{ filename: "scripts/db/migrate.js", status: "modified" }]);
  assert.equal(scripts.items.length, 1);
  assert.equal(scripts.items[0].level, "MEDIUM");
});

test("las zonas de siempre siguen clasificando igual", () => {
  assert.equal(classifyFile("client/src/App.jsx"), "client");
  assert.equal(classifyFile("server/src/server.js"), "server");
  assert.equal(classifyFile(".github/workflows/ci.yml"), "config");
  assert.equal(classifyFile("docker/Dockerfile"), "config");
  assert.equal(classifyFile("README.md"), "other");
});

test("un cambio de producto corriente no produce informe", () => {
  const { overall, items } = evaluateRisk([
    { filename: "client/src/features/pulse/Pulse.jsx", status: "modified" },
    { filename: "server/src/modules/posts/normalizePost.js", status: "modified" }
  ]);

  assert.equal(overall, "LOW");
  assert.equal(items.length, 0, "sin razones de riesgo no hay nada que informar");
});

test("un archivo sin nombre no revienta el evaluador", () => {
  assert.doesNotThrow(() => evaluateRisk([{}, null, { filename: "" }]));
  assert.equal(evaluateRisk([{}]).overall, "LOW");
});
