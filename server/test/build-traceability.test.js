/**
 * R-10/R-11 — trazabilidad de la compilación desplegada.
 *
 * El backend vive en Render y no deja rastro auditable de qué commit ejecuta:
 * no hay manifiesto en el repositorio y los despliegues que GitHub registra
 * son los del cliente en Vercel. La única fuente de verdad posible es
 * preguntárselo al propio servicio.
 */

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const { getBuildInfo, firstEnv, COMMIT_VARS } = require("../src/config/buildInfo");
const { isProductionEnvironment, isKnownNonProductionEnvironment, normalizeEnvironment } =
  require("../src/config/environment");

const SHA = "1f3ad3664c0d9e2923afa17b9371526602b7face";

test("R-10: sin variables de plataforma, la compilación se declara NO trazable", () => {
  const info = getBuildInfo({});
  assert.equal(info.commit, null);
  assert.equal(info.commitShort, null);
  assert.equal(info.traceable, false, "no puede fingir trazabilidad que no tiene");
});

test("R-10: Render aporta commit, rama, repositorio y servicio sin tocar el panel", () => {
  // Render inyecta estas variables en build y en ejecución por su cuenta.
  const info = getBuildInfo({
    RENDER_GIT_COMMIT: SHA,
    RENDER_GIT_BRANCH: "main",
    RENDER_GIT_REPO_SLUG: "donovan-hue/Kronos-space.com",
    RENDER_SERVICE_NAME: "kronos-api"
  });
  assert.equal(info.commit, SHA);
  assert.equal(info.commitShort, "1f3ad36");
  assert.equal(info.branch, "main");
  assert.equal(info.repo, "donovan-hue/Kronos-space.com");
  assert.equal(info.service, "kronos-api");
  assert.equal(info.traceable, true);
});

test("R-10: un valor que no es un SHA no se publica como commit", () => {
  // Un "unknown" o un literal sin sustituir daría trazabilidad falsa, que es
  // peor que no tener ninguna porque invita a confiar en ella.
  for (const basura of ["unknown", "", "   ", "$COMMIT_SHA", "no-hex-aqui", "12345", "g".repeat(40)]) {
    const info = getBuildInfo({ RENDER_GIT_COMMIT: basura });
    assert.equal(info.commit, null, `no debe aceptar ${JSON.stringify(basura)}`);
    assert.equal(info.traceable, false);
  }
});

test("R-10: se acepta el SHA corto y se normaliza a minúsculas", () => {
  assert.equal(getBuildInfo({ RENDER_GIT_COMMIT: "1F3AD36" }).commit, "1f3ad36");
  assert.equal(getBuildInfo({ RENDER_GIT_COMMIT: "1F3AD36" }).traceable, true);
});

test("R-10: el orden de preferencia de plataformas es estable", () => {
  const info = getBuildInfo({ RENDER_GIT_COMMIT: SHA, GITHUB_SHA: "0".repeat(40) });
  assert.equal(info.commit, SHA, "Render manda sobre GITHUB_SHA");
  assert.ok(COMMIT_VARS.indexOf("RENDER_GIT_COMMIT") < COMMIT_VARS.indexOf("GITHUB_SHA"));
});

test("R-10: una variable en blanco no cuenta como configurada", () => {
  // Es la diferencia entre «no configurado» y «configurado a vacío», que es
  // justo el matiz que convierte una guarda en fail-open.
  assert.equal(firstEnv(["A", "B"], { A: "   ", B: "valor" }), "valor");
  assert.equal(firstEnv(["A"], { A: "" }), null);
  assert.equal(firstEnv(["A"], {}), null);
  assert.equal(firstEnv(["A"], { A: 123 }), null, "un número no es una cadena de entorno");
});

test("R-11: el entorno informado es el EFECTIVO y distingue si fue declarado", () => {
  // Esta es la tabla que el punto 10 de la lista de pre-producción necesita.
  const esperado = [
    [undefined, "production", false],
    ["", "production", false],
    ["   ", "production", false],
    ["production", "production", true],
    ["PRODUCTION", "production", true],
    [" production ", "production", true],
    ["test", "test", true],
    ["development", "development", true],
    ["staging", "production", false],
    ["prod", "production", false]
  ];

  for (const [valor, entorno, declarado] of esperado) {
    const efectivo = isProductionEnvironment(valor) ? "production" : normalizeEnvironment(valor);
    const fueDeclarado =
      isKnownNonProductionEnvironment(valor) || normalizeEnvironment(valor) === "production";

    assert.equal(efectivo, entorno, `NODE_ENV=${JSON.stringify(valor)}`);
    assert.equal(fueDeclarado, declarado, `declarado para NODE_ENV=${JSON.stringify(valor)}`);
  }
});

test("R-11: health expone la trazabilidad y nunca la URI", () => {
  const fuente = fs.readFileSync(
    path.join(__dirname, "..", "src", "server.js"),
    "utf8"
  );
  const bruto = fuente.slice(
    fuente.indexOf("const healthResponse"),
    fuente.indexOf('app.get("/health"')
  );
  // Se quitan los comentarios: lo que importa es qué CÓDIGO se serializa, no
  // qué palabras aparecen en la prosa que lo explica.
  const bloque = bruto.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  assert.match(bloque, /build:/);
  assert.match(bloque, /commit: BUILD_INFO\.commit/);
  assert.match(bloque, /environmentDeclared/);
  assert.match(bloque, /autoIndex: resolveAutoIndex\(\)/);
  // Ni la cadena de conexión ni nada que huela a credencial.
  assert.ok(!/MONGODB_URI/.test(bloque), "health no puede mencionar la URI");
  assert.ok(!/password|secret|tokenHash|passwordHash/i.test(bloque));
});

test("R-10: el commit se resuelve una sola vez, no en cada petición", () => {
  const fuente = fs.readFileSync(path.join(__dirname, "..", "src", "server.js"), "utf8");
  assert.match(fuente, /const BUILD_INFO = getBuildInfo\(\);/);
  const bloque = fuente.slice(
    fuente.indexOf("const healthResponse"),
    fuente.indexOf('app.get("/health"')
  );
  assert.ok(
    !/getBuildInfo\(\)/.test(bloque),
    "recalcularlo por petición añadiría trabajo a un endpoint que los balanceadores golpean sin parar"
  );
});

test("R-10: verify-deploy informa del commit desplegado", () => {
  const script = fs.readFileSync(
    path.join(__dirname, "..", "..", "scripts", "verify-deploy.sh"),
    "utf8"
  );
  assert.match(script, /\.build\.commit|build\.commit/, "debe leer el commit del health");
  assert.match(script, /EXPECTED_COMMIT/, "debe poder compararlo con el commit esperado");
});
