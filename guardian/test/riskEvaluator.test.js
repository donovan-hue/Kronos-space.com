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

test("las cuatro rutas que el guardián no veía entran como vigiladas y suben a HIGH", () => {
  const { esRutaVigilada, RUTAS_VIGILADAS } = require("../src/riskEvaluator");

  assert.deepEqual(
    [...RUTAS_VIGILADAS].sort(),
    [
      "client/src/App.jsx",
      "client/src/navigation/model.jsx",
      "client/src/services/apiClient.js",
      "client/src/services/authStorage.js"
    ].sort(),
    "la lista de vigilancia es auditada: quitar una entrada exige explicar por qué"
  );

  for (const ruta of RUTAS_VIGILADAS) {
    assert.equal(esRutaVigilada(ruta), true, `${ruta} debía estar vigilada`);
    assert.equal(esRutaCritica(ruta), false, `${ruta} no puede bloquear el merge`);

    const { overall, items } = evaluateRisk([{ filename: ruta, status: "modified" }]);

    assert.equal(overall, "HIGH", `${ruta} debía informar riesgo HIGH y produjo ${overall}`);
    assert.ok(
      items.some((it) => it.reasons.some((r) => r.includes("Ruta vigilada"))),
      `${ruta} debía explicar por qué se vigila`
    );
  }

  assert.equal(esRutaVigilada("client/src/features/social/Post.jsx"), false);
});

test("vigilar no es bloquear: una ruta vigilada nunca deja el check inutilizable", () => {
  // El argumento está en el propio módulo: App.jsx y el modelo de navegación se
  // tocan en casi cualquier cambio de pantalla. Si subieran a CRITICAL, ningún
  // PR de frontend pasaría y el informe entero se leería como ruido.
  for (const ruta of require("../src/riskEvaluator").RUTAS_VIGILADAS) {
    const { overall } = evaluateRisk([{ filename: ruta, status: "modified" }]);

    assert.notEqual(overall, "CRITICAL", `${ruta} no debe fallar el job`);
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

test("la etiqueta baja CRITICAL a HIGH y lo anota; nada más cambia", () => {
  const rutas = [...RUTAS_CRITICAS, "client/src/App.jsx", "server/src/modules/auth/auth.routes.js"];
  const sin = evaluateRisk(rutas.map((filename) => ({ filename, status: "modified" })));
  const con = evaluateRisk(rutas.map((filename) => ({ filename, status: "modified" })), { aprobacion: true });

  assert.equal(sin.overall, "CRITICAL", "sin aprobación el portón tiene que estar cerrado");
  assert.equal(con.overall, "HIGH", "con aprobación el PR pasa, pero queda marcado");

  for (const ruta of RUTAS_CRITICAS) {
    const antes = sin.items.find((i) => i.file === ruta);
    const despues = con.items.find((i) => i.file === ruta);
    assert.equal(antes.level, "CRITICAL");
    assert.equal(despues.level, "HIGH", `${ruta} debía bajar a HIGH, no desaparecer`);
    assert.ok(
      despues.reasons.some((r) => r.includes("riesgo-crítico-revisado")),
      `${ruta} debe decir en el informe quién asume la revisión`
    );
    assert.ok(
      despues.reasons.some((r) => r.startsWith("Ruta crítica:")),
      "la razón original no se borra: el archivo sigue siendo crítico"
    );
  }

  // Las demás reglas no se tocan: la aprobación no es un «todo verde».
  const vig = con.items.find((i) => i.file === "client/src/App.jsx");
  assert.equal(vig.level, "HIGH");
  const auth = con.items.find((i) => i.file === "server/src/modules/auth/auth.routes.js");
  assert.equal(auth.level, "HIGH", "auth era HIGH antes y sigue HIGH");
});

test("la aprobación no inventa archivos: lo que no está en el PR no se menciona", () => {
  const { overall, items } = evaluateRisk([{ filename: "README.md", status: "modified" }], {
    aprobacion: true
  });

  assert.deepEqual(items, [], "un README no tiene riesgo que reconocer");
  assert.equal(overall, "LOW");
});

test("cualquier otro valor de la opción no abre el portón", () => {
  for (const aprobacion of [undefined, null, false, "true", 1, {}]) {
    const { overall } = evaluateRisk(
      [{ filename: RUTAS_CRITICAS[0], status: "modified" }],
      { aprobacion }
    );
    assert.equal(
      overall,
      "CRITICAL",
      `aprobacion=${JSON.stringify(aprobacion) ?? String(aprobacion)} no puede bastar: solo ` +
      "booleano `true` leído de la etiqueta cuenta"
    );
  }
});
