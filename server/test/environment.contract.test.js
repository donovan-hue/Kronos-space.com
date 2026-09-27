const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  ENTORNOS_SIN_DATOS_REALES,
  normalizeEnvironment,
  isKnownNonProductionEnvironment,
  isProductionEnvironment,
  isProductionProcessEnv
} = require("../src/config/environment");

const RAIZ = path.join(__dirname, "..", "..");

/**
 * KRONOS — clasificación del entorno.
 *
 * Cuatro sitios respondían por su cuenta a «¿es esto producción?» comparando
 * `NODE_ENV` contra la cadena exacta, y en tres de ellos la respuesta
 * equivocada abría la puerta: el ejecutor de migraciones dejaba de exigir
 * `--confirm` para escribir en la base real, el arranque admitía un
 * despliegue sin `CLIENT_URL`, y las subidas perdían la copia durable en
 * silencio. Bastaba con que el entorno se escribiera `Production` o, mucho
 * más probable, con que nadie lo escribiera.
 *
 * Estas pruebas fijan la clasificación y, sobre todo, impiden que el patrón
 * vuelva a colarse en una guarda nueva.
 */

const PRODUCCION = [
  "production", "Production", "PRODUCTION", "prod", "Prod", "PROD",
  " production ", "\tproduction\n", "prod-eu", "production-us-east",
  "live", "staging", "produccion", "prd", "main", "release",
  undefined, null, "", "   "
];

const SIN_DATOS_REALES = [
  "development", "Development", "DEVELOPMENT", " development ",
  "test", "Test", "TEST", " test ", "\ttest\n"
];

test("todo lo que no consta como entorno sin datos reales es producción", () => {
  for (const valor of PRODUCCION) {
    assert.equal(
      isProductionEnvironment(valor),
      true,
      `NODE_ENV=${JSON.stringify(valor)} debe tratarse como producción`
    );
    assert.equal(isKnownNonProductionEnvironment(valor), false, `NODE_ENV=${JSON.stringify(valor)}`);
  }
});

test("development y test se reconocen con cualquier caja y espacios", () => {
  for (const valor of SIN_DATOS_REALES) {
    assert.equal(
      isProductionEnvironment(valor),
      false,
      `NODE_ENV=${JSON.stringify(valor)} consta como entorno sin datos reales`
    );
    assert.equal(isKnownNonProductionEnvironment(valor), true, `NODE_ENV=${JSON.stringify(valor)}`);
  }
});

test("normalizeEnvironment recorta y baja a minúsculas sin romperse con ausencias", () => {
  assert.equal(normalizeEnvironment(" Production \n"), "production");
  assert.equal(normalizeEnvironment(undefined), "");
  assert.equal(normalizeEnvironment(null), "");
  assert.equal(normalizeEnvironment(""), "");
});

test("isProductionProcessEnv clasifica el entorno del proceso", () => {
  const previo = process.env.NODE_ENV;
  try {
    process.env.NODE_ENV = "Production";
    assert.equal(isProductionProcessEnv(), true);
    delete process.env.NODE_ENV;
    assert.equal(isProductionProcessEnv(), true, "sin NODE_ENV se falla cerrado");
    process.env.NODE_ENV = "test";
    assert.equal(isProductionProcessEnv(), false);
  } finally {
    if (previo === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previo;
  }
});

test("un valor ausente NO se sustituye por el NODE_ENV del proceso", () => {
  // Con `function isProductionEnvironment(value = process.env.NODE_ENV)`, una
  // guarda que recibiera un entorno sin definir consultaba el del proceso y
  // respondía por un valor que nadie le había dado: corriendo bajo
  // NODE_ENV=test contestaba «no es producción» y volvía a abrir la puerta.
  // Sin parámetro por defecto, lo desconocido se clasifica como desconocido.
  const previo = process.env.NODE_ENV;
  try {
    process.env.NODE_ENV = "test";
    for (const ausente of [undefined, null, ""]) {
      assert.equal(
        isProductionEnvironment(ausente),
        true,
        `un entorno ${JSON.stringify(ausente)} no puede heredar el NODE_ENV del proceso`
      );
    }
    assert.equal(normalizeEnvironment(undefined), "", "normalizeEnvironment tampoco hereda");
  } finally {
    if (previo === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previo;
  }
});

test("la lista de entornos exentos es exactamente la documentada", () => {
  // Ampliarla es una decisión de seguridad, no un detalle: cada valor nuevo
  // es un entorno más que puede escribir sin confirmar.
  assert.deepEqual([...ENTORNOS_SIN_DATOS_REALES].sort(), ["development", "test"]);
});

/**
 * Las guardas de seguridad no pueden volver a decidir por su cuenta.
 *
 * `federation.service.js` queda deliberadamente fuera: elige qué origen
 * anunciar, no autoriza nada, y ahí tratar lo desconocido como producción
 * haría que un entorno de desarrollo publicara enlaces a la API real.
 */
test("ninguna guarda de producción compara NODE_ENV contra la cadena exacta", () => {
  const GUARDAS = [
    "server/src/migrations/runner.js",
    "server/src/server.js",
    "server/src/config/db.js",
    "server/src/config/durableUploads.js"
  ];

  const infractores = [];
  for (const relativa of GUARDAS) {
    const codigo = fs.readFileSync(path.join(RAIZ, relativa), "utf8");
    // Se ignoran los comentarios: explican precisamente este defecto.
    const sinComentarios = codigo
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    if (/NODE_ENV\s*[!=]==\s*["']production["']/.test(sinComentarios)) infractores.push(relativa);
  }

  assert.deepEqual(
    infractores,
    [],
    `estas guardas vuelven a comparar NODE_ENV con la cadena exacta y fallan abiertas: ${infractores.join(", ")}`
  );

  // Un detector que no mira nada aprueba cualquier cosa.
  assert.equal(GUARDAS.length, 4);
  for (const relativa of GUARDAS) {
    assert.ok(fs.existsSync(path.join(RAIZ, relativa)), `falta ${relativa}: el detector dejaría de vigilarla`);
  }
});
