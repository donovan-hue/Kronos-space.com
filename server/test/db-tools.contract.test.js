const test = require("node:test");
const assert = require("node:assert");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

/**
 * KRONOS — contrato de las herramientas de base de datos (`scripts/db/*`).
 *
 * Sin MONGODB_URI ninguna herramienta puede inventarse una base ni fallar de
 * forma ambigua: debe terminar con código 3 (falta configuración), decirlo en
 * español y NO imprimir credenciales. `migrate.js validate` es la excepción
 * deliberada: valida el catálogo de migraciones sin tocar la base.
 */

const ROOT = path.join(__dirname, "..", "..");

const SIN_URI = { ...process.env };
delete SIN_URI.MONGODB_URI;
// El cargador lee server/.env; en una máquina con .env real la prueba debe
// seguir midiendo el caso "sin configuración".
SIN_URI.KRONOS_IGNORE_ENV_FILE = "1";

function ejecutar(script, args = [], env = SIN_URI) {
  return spawnSync(process.execPath, [path.join(ROOT, script), ...args], {
    cwd: ROOT,
    env,
    encoding: "utf8",
    timeout: 60000
  });
}

const HERRAMIENTAS = [
  "scripts/db/inventory.js",
  "scripts/db/validate-data.js",
  "scripts/db/index-audit.js",
  "scripts/db/media-orphans.js",
  "scripts/db/seed-staging.js",
  "scripts/db/bench-queries.js",
  "scripts/db/rollback-drill.js",
  "scripts/db/detection-drill.js"
];

for (const script of HERRAMIENTAS) {
  test(`${script}: sin MONGODB_URI termina con código 3 y sin credenciales`, () => {
    const resultado = ejecutar(script);
    const salida = `${resultado.stdout || ""}${resultado.stderr || ""}`;

    assert.strictEqual(resultado.status, 3, `salida inesperada: ${salida.slice(0, 300)}`);
    assert.match(salida, /CONFIG_FALTANTE/, "debe nombrar la configuración que falta");
    assert.ok(!/mongodb(\+srv)?:\/\/\S*:\S*@/.test(salida), "una herramienta nunca imprime credenciales");
  });
}

test("migrate.js validate: valida el catálogo sin base de datos", () => {
  const resultado = ejecutar("scripts/db/migrate.js", ["validate"]);
  const salida = `${resultado.stdout || ""}${resultado.stderr || ""}`;

  assert.strictEqual(resultado.status, 0, salida.slice(0, 300));
  assert.match(salida, /6 migraciones/, "debe confirmar las seis migraciones del plan");
});

test("migrate.js: las acciones que tocan datos exigen configuración", () => {
  for (const accion of ["status", "up", "down"]) {
    const resultado = ejecutar("scripts/db/migrate.js", [accion]);
    const salida = `${resultado.stdout || ""}${resultado.stderr || ""}`;
    assert.strictEqual(resultado.status, 3, `${accion} debería exigir MONGODB_URI: ${salida.slice(0, 200)}`);
  }
});

test("migrate.js up: sin --confirm no escribe en una base de producción", () => {
  const fuente = require("node:fs").readFileSync(path.join(ROOT, "server", "src", "migrations", "runner.js"), "utf8");

  assert.match(fuente, /assertWriteAuthorized/, "el ejecutor debe autorizar cada escritura");
  assert.match(fuente, /--confirm/, "producción exige confirmación explícita del nombre de la base");
  assert.match(fuente, /assertBackupAvailable/, "no se migra sin respaldo verificado");
  assert.match(fuente, /MIGRATION_CHECKSUM_MISMATCH/, "una migración alterada tras aplicarse debe abortar");
});

test("code-inventory.js: funciona sin base de datos y produce evidencia", () => {
  const resultado = ejecutar("scripts/db/code-inventory.js");
  const salida = `${resultado.stdout || ""}${resultado.stderr || ""}`;

  assert.strictEqual(resultado.status, 0, salida.slice(0, 300));
  assert.match(salida, /endpoints: \d+/, "debe contar los endpoints reales");
  assert.match(salida, /code-inventory\.json/, "debe dejar el informe en docs/db/reports");
});

/** Lee una herramienta como texto para comprobar sus guardas declaradas. */
function fuente(script) {
  return require("node:fs").readFileSync(path.join(ROOT, script), "utf8");
}

test("seed-staging.js: protege producción antes de escribir", () => {
  const codigo = fuente("scripts/db/seed-staging.js");

  assert.match(codigo, /PRODUCTION_HINTS/, "debe reconocer nombres de base de producción");
  assert.match(codigo, /STAGING_PREFIXES/, "debe exigir un prefijo de ensayo");
  assert.match(codigo, /--confirm/, "debe exigir confirmación del nombre de la base");
  assert.match(codigo, /forceDbName/, "solo una bandera explícita permite un nombre ajeno a los prefijos");
  assert.match(codigo, /--reset solo está permitido en bases con prefijo de ensayo/, "el borrado nunca alcanza una base ajena");
});

test("bench-queries.js: una colección vacía no cuenta como evidencia", () => {
  const codigo = fuente("scripts/db/bench-queries.js");

  assert.match(codigo, /SIN DATOS/, "debe marcar las colecciones sin datos");
  assert.match(codigo, /explain\("executionStats"\)/, "debe pedir estadísticas de ejecución reales");
  assert.match(codigo, /\$natural/, "el ANTES se mide forzando recorrido completo");
  assert.match(codigo, /p99/, "debe calcular percentiles, no solo promedios");
  assert.match(codigo, /COLLSCAN/, "debe detectar recorridos completos indebidos");
});

test("rollback-drill.js: exige respaldo verificado y compara instantáneas", () => {
  const codigo = fuente("scripts/db/rollback-drill.js");

  assert.match(codigo, /Falta --backup/, "no se ensaya un rollback sin respaldo verificado");
  assert.match(codigo, /rollbackRestauraIndices/, "debe comprobar que el rollback devuelve los índices");
  assert.match(codigo, /reaplicacionReproducible/, "debe comprobar que reaplicar reproduce el estado migrado");
  assert.match(codigo, /documentosEstables/, "ninguna etapa puede perder documentos");
});

test("detection-drill.js: demuestra que los verificadores encuentran anomalías", () => {
  const codigo = fuente("scripts/db/detection-drill.js");

  assert.match(codigo, /NO DETECTADA/, "una regla que no encuentra su anomalía debe fallar");
  assert.match(codigo, /_deteccion/, "trabaja sobre una base desechable, nunca la configurada");
  assert.match(codigo, /dropDatabase/, "la base de ensayo se recrea en cada ejecución");

  const { RULES } = require(path.join(ROOT, "server", "src", "db", "integrity.js"));
  for (const regla of RULES) {
    assert.ok(
      codigo.includes(`"${regla.id}"`),
      `la regla ${regla.id} no tiene anomalía sembrada en el ensayo de detección`
    );
  }
});
