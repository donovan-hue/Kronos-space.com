/**
 * R-12 — la guarda del destino E2E, con URIs sintéticas.
 *
 * Aquí no se conecta a nada: se comprueba la DECISIÓN. Ninguna de estas URIs
 * existe; son cadenas construidas para el caso.
 */

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  ALLOWLIST_VAR,
  TEMP_DB_PATTERN,
  extractHosts,
  extractDatabase,
  evaluateE2ETarget,
  assertE2ETarget
} = require("./helpers/e2e-target-guard");

const DB_OK = "kronos_e2e_a1b2c3d4e5f6";
const SIN_ALLOWLIST = {};

// ---------------------------------------------------------------------------
// Análisis de la URI
// ---------------------------------------------------------------------------

test("R-12: el host se extrae sin tocar las credenciales", () => {
  assert.deepEqual(extractHosts("mongodb://127.0.0.1:27017/x"), ["127.0.0.1"]);
  assert.deepEqual(
    extractHosts("mongodb+srv://usuario:contra@cluster0.ab12c.mongodb.net/base"),
    ["cluster0.ab12c.mongodb.net"]
  );
  // Contraseña con @ dentro: se corta por el ÚLTIMO @, no por el primero.
  assert.deepEqual(
    extractHosts("mongodb://u:p@ss@word@host.ejemplo.net:27017/base"),
    ["host.ejemplo.net"]
  );
  // Conjunto de réplicas: todos los nodos cuentan.
  assert.deepEqual(
    extractHosts("mongodb://a.ejemplo.net:27017,b.ejemplo.net:27018/base"),
    ["a.ejemplo.net", "b.ejemplo.net"]
  );
  assert.deepEqual(extractHosts("mongodb://[::1]:27017/base"), ["::1"]);
  assert.equal(extractHosts("no-es-una-uri"), null);
});

test("R-12: la base embebida en la URI se reconoce", () => {
  assert.equal(extractDatabase("mongodb://h:27017/kronos_social_ai"), "kronos_social_ai");
  assert.equal(extractDatabase("mongodb+srv://u:p@c.net/prod?retryWrites=true"), "prod");
  assert.equal(extractDatabase("mongodb://h:27017/"), null);
  assert.equal(extractDatabase("mongodb://h:27017"), null);
});

// ---------------------------------------------------------------------------
// Casos que DEBEN bloquearse
// ---------------------------------------------------------------------------

test("R-12: una URI productiva se rechaza aunque la base sea temporal", () => {
  // Es el caso exacto que la guarda anterior dejaba pasar: dbName pisa la
  // base, así que nadie se enteraba de que el clúster era el real.
  const v = evaluateE2ETarget({
    uri: "mongodb+srv://u:p@db.kronos-space.com/cualquiera",
    dbName: DB_OK,
    env: SIN_ALLOWLIST
  });
  assert.equal(v.decision, "BLOCK");
  assert.match(v.reason, /patrón de producción/);
});

test("R-12: se rechaza el host con marca prod o live", () => {
  for (const host of [
    "mongodb+srv://u:p@cluster-prod.mongodb.net/x",
    "mongodb+srv://u:p@kronos.live.mongodb.net/x",
    "mongodb+srv://u:p@produccion.ejemplo.net/x"
  ]) {
    const v = evaluateE2ETarget({ uri: host, dbName: DB_OK, env: SIN_ALLOWLIST });
    assert.equal(v.decision, "BLOCK", host);
  }
});

test("R-12: se rechaza la base productiva embebida aunque el host sea neutro", () => {
  const v = evaluateE2ETarget({
    uri: "mongodb+srv://u:p@cluster0.ab12c.mongodb.net/kronos_social_ai",
    dbName: DB_OK,
    env: { [ALLOWLIST_VAR]: "cluster0.ab12c.mongodb.net" }
  });
  assert.equal(v.decision, "BLOCK");
  assert.match(v.reason, /kronos_social_ai/);
});

test("R-12: se rechaza una base de destino que no es la temporal esperada", () => {
  for (const dbName of ["kronos_social_ai", "", null, "kronos_e2e_", "kronos_e2e_XYZ", "otra"]) {
    const v = evaluateE2ETarget({
      uri: "mongodb://127.0.0.1:27017/x",
      dbName,
      env: SIN_ALLOWLIST
    });
    assert.equal(v.decision, "BLOCK", `dbName=${JSON.stringify(dbName)}`);
  }
});

test("R-12: una URI que no se puede analizar no se supone segura", () => {
  for (const uri of ["no-es-una-uri", "http://host/base", "mongodb://", "mongodb://   "]) {
    const v = evaluateE2ETarget({ uri, dbName: DB_OK, env: SIN_ALLOWLIST });
    assert.equal(v.decision, "BLOCK", uri);
  }
});

test("R-12: un host remoto no declarado NO se ejecuta", () => {
  // Ambiguo no es seguro: sin declaración no se conecta.
  const v = evaluateE2ETarget({
    uri: "mongodb+srv://u:p@cluster0.ab12c.mongodb.net/base",
    dbName: DB_OK,
    env: SIN_ALLOWLIST
  });
  assert.equal(v.decision, "SKIP");
  assert.match(v.reason, new RegExp(ALLOWLIST_VAR));
});

test("R-12: con allowlist declarada, un host ajeno a ella se bloquea", () => {
  const v = evaluateE2ETarget({
    uri: "mongodb+srv://u:p@otro-cluster.mongodb.net/base",
    dbName: DB_OK,
    env: { [ALLOWLIST_VAR]: "cluster0.ab12c.mongodb.net" }
  });
  assert.equal(v.decision, "BLOCK");
  assert.match(v.reason, /no están en/);
});

test("R-12: en un conjunto de réplicas basta un nodo no declarado para bloquear", () => {
  const v = evaluateE2ETarget({
    uri: "mongodb://a.test.net:27017,b.ajeno.net:27017/base",
    dbName: DB_OK,
    env: { [ALLOWLIST_VAR]: "a.test.net" }
  });
  assert.equal(v.decision, "BLOCK");
  assert.match(v.reason, /b\.ajeno\.net/);
});

// ---------------------------------------------------------------------------
// Casos que DEBEN permitirse
// ---------------------------------------------------------------------------

test("R-12: el MongoDB local se permite aunque la URI nombre la base de producción", () => {
  // El contenedor efímero de CI usa ese nombre a propósito para ensayar la
  // cadena con nombres realistas. Bloquearlo por el nombre es un falso
  // positivo, y en CI dejó sin sembrar todo lo que venía detrás.
  const v = evaluateE2ETarget({
    uri: "mongodb://127.0.0.1:27017/kronos_social_ai",
    dbName: DB_OK,
    env: SIN_ALLOWLIST
  });
  assert.equal(v.decision, "ALLOW");

  // Pero el mismo nombre en un host REMOTO sigue bloqueando.
  const remoto = evaluateE2ETarget({
    uri: "mongodb+srv://u:p@cluster0.ab12c.mongodb.net/kronos_social_ai",
    dbName: DB_OK,
    env: { [ALLOWLIST_VAR]: "cluster0.ab12c.mongodb.net" }
  });
  assert.equal(remoto.decision, "BLOCK");
});

test("R-12: el MongoDB local se permite sin declaración", () => {
  for (const host of ["127.0.0.1", "localhost", "mongo"]) {
    const v = evaluateE2ETarget({
      uri: `mongodb://${host}:27017/base`,
      dbName: DB_OK,
      env: SIN_ALLOWLIST
    });
    assert.equal(v.decision, "ALLOW", host);
  }
});

test("R-12: un clúster remoto declarado se permite", () => {
  const v = evaluateE2ETarget({
    uri: "mongodb+srv://u:p@cluster0.ab12c.mongodb.net/pruebas",
    dbName: DB_OK,
    env: { [ALLOWLIST_VAR]: "cluster0.ab12c.mongodb.net, otro.mongodb.net" }
  });
  assert.equal(v.decision, "ALLOW");
});

test("R-12: sin MONGODB_URI se omite, no se bloquea", () => {
  for (const uri of [undefined, null, "", "   "]) {
    const v = evaluateE2ETarget({ uri, dbName: DB_OK, env: SIN_ALLOWLIST });
    assert.equal(v.decision, "SKIP");
  }
});

// ---------------------------------------------------------------------------
// Aplicación de la decisión
// ---------------------------------------------------------------------------

test("R-12: assertE2ETarget lanza en BLOCK y no filtra la URI", () => {
  const uri = "mongodb+srv://usuario:CONTRASENA_SECRETA@db.kronos-space.com/base";
  let error = null;
  try {
    assertE2ETarget({ uri, dbName: DB_OK, env: SIN_ALLOWLIST });
  } catch (e) {
    error = e;
  }
  assert.ok(error, "debe lanzar");
  assert.equal(error.code, "E2E_TARGET_BLOCKED");
  assert.ok(!error.message.includes("CONTRASENA_SECRETA"), "no puede filtrar la contraseña");
  assert.ok(!error.message.includes("usuario:"), "no puede filtrar el usuario");
});

test("R-12: assertE2ETarget devuelve false en SKIP y avisa en voz alta", () => {
  const avisos = [];
  const salida = assertE2ETarget({
    uri: "mongodb+srv://u:p@cluster0.ab12c.mongodb.net/base",
    dbName: DB_OK,
    env: SIN_ALLOWLIST,
    logger: { warn: (m) => avisos.push(m) }
  });
  assert.equal(salida, false);
  assert.equal(avisos.length, 1, "un SKIP silencioso sería peor que no tener guarda");
  assert.match(avisos[0], /omitido/);
});

test("R-12: assertE2ETarget devuelve true cuando el destino está demostrado", () => {
  assert.equal(
    assertE2ETarget({ uri: "mongodb://127.0.0.1:27017/x", dbName: DB_OK, env: SIN_ALLOWLIST }),
    true
  );
});

// ---------------------------------------------------------------------------
// La guarda decorativa que había antes
// ---------------------------------------------------------------------------

test("R-12: las pruebas E2E usan la guarda antes de conectar", () => {
  const dir = __dirname;
  const ficheros = fs.readdirSync(dir).filter((f) => f.endsWith(".e2e.test.js"));
  assert.ok(ficheros.length >= 10, "deben existir las pruebas E2E");

  const sinGuarda = [];
  for (const fichero of ficheros) {
    const fuente = fs.readFileSync(path.join(dir, fichero), "utf8");
    if (!/mongoose\.connect\(/.test(fuente)) continue;
    if (!/assertE2ETarget|evaluateE2ETarget/.test(fuente)) sinGuarda.push(fichero);
  }
  assert.deepEqual(
    sinGuarda,
    [],
    `estas pruebas conectan sin demostrar el destino: ${sinGuarda.join(", ")}`
  );
});

test("R-12: el patrón temporal exige aleatoriedad real", () => {
  assert.ok(TEMP_DB_PATTERN.test("kronos_e2e_a1b2c3d4e5f6"));
  assert.ok(!TEMP_DB_PATTERN.test("kronos_e2e_"));
  assert.ok(!TEMP_DB_PATTERN.test("kronos_e2e_zzzzzzzzzzzz"));
  assert.ok(!TEMP_DB_PATTERN.test("kronos_e2e_a1b2c3"));
});
