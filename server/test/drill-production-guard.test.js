const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  PRODUCTION_DB_HINTS,
  looksLikeProductionDatabase,
  assertNotProductionDatabase
} = require("../../scripts/db/_bootstrap");

const RAIZ = path.join(__dirname, "..", "..");
const fuente = (rel) => fs.readFileSync(path.join(RAIZ, rel), "utf8");

/**
 * KRONOS — R-05: el ensayo de rollback podía alcanzar producción.
 *
 * `rollback-drill.js` ejecuta `migrate.js down --to 0`, la operación más
 * destructiva del repositorio: deshace las seis migraciones y retira los 61
 * índices. Era el único de los tres ensayos sin guarda de nombre de base, y
 * además lanzaba los procesos hijos con `env: process.env`, de modo que
 * heredaba `KRONOS_MIGRATION_CONFIRM`.
 *
 * `migrate.js` acepta esa variable como confirmación válida. Encadenado:
 * el operador exporta la confirmación para la migración real de producción y,
 * en esa misma terminal, lanza el ensayo de rollback —que la checklist pide
 * en su punto 9—. La confirmación ambiental satisfacía la guarda y el ensayo
 * deshacía producción entera sin preguntar.
 *
 * La lista de nombres, además, ya había divergido: la de `detection-drill.js`
 * no incluía `kronos_social_ai`, el nombre real de la base de producción.
 */

const DEBEN_BLOQUEAR = [
  "kronos_social_ai", "KRONOS_SOCIAL_AI", "kronos_prod", "prod",
  "produccion", "PRODUCCION", "live", "live_db", "app-production",
  "", "   ", null, undefined
];

const DEBEN_PASAR = ["kronos_ensayo", "kronos_migration_test", "kronos_dev", "test", "staging_copy"];

test("R-05: la guarda reconoce los nombres de base real, incluido kronos_social_ai", () => {
  const colados = DEBEN_BLOQUEAR.filter((nombre) => !looksLikeProductionDatabase(nombre));
  assert.deepEqual(
    colados,
    [],
    `estos nombres no se reconocen como producción: ${colados.map((n) => JSON.stringify(n)).join(", ")}`
  );

  // Fail-closed: un nombre ausente no se supone seguro.
  assert.equal(looksLikeProductionDatabase(undefined), true);
  assert.equal(looksLikeProductionDatabase(""), true);

  for (const nombre of DEBEN_BLOQUEAR) {
    assert.throws(
      () => assertNotProductionDatabase(nombre, "La operación"),
      /parece una base de producción/,
      `${JSON.stringify(nombre)} debe cortar la ejecución`
    );
  }
});

test("la guarda no bloquea las bases de ensayo legítimas", () => {
  for (const nombre of DEBEN_PASAR) {
    assert.doesNotThrow(
      () => assertNotProductionDatabase(nombre, "La operación"),
      `${nombre} es una copia de ensayo y debe permitirse`
    );
  }
  assert.ok(PRODUCTION_DB_HINTS.length >= 4, "la lista de indicios no puede quedarse vacía");
});

test("R-05: el ensayo de rollback comprueba el nombre antes de deshacer nada", () => {
  const codigo = fuente("scripts/db/rollback-drill.js");

  assert.match(codigo, /assertNotProductionDatabase/, "debe usar la guarda compartida");

  const posGuarda = codigo.indexOf("assertNotProductionDatabase(db.databaseName");
  const posMigrar = codigo.indexOf('ejecutar("migrate.js"');
  assert.ok(posGuarda > 0, "la guarda debe aplicarse sobre el nombre real de la base");
  assert.ok(
    posGuarda < posMigrar,
    "la comprobación tiene que ocurrir antes de la primera llamada a migrate.js"
  );
});

test("R-05: el ensayo no hereda KRONOS_MIGRATION_CONFIRM en los procesos hijos", () => {
  const codigo = fuente("scripts/db/rollback-drill.js");

  assert.match(
    codigo,
    /delete\s+\w+\.KRONOS_MIGRATION_CONFIRM/,
    "el entorno del hijo debe retirar la confirmación ambiental"
  );
  assert.doesNotMatch(
    codigo,
    /env:\s*process\.env/,
    "pasar process.env entero devuelve la confirmación heredada al hijo"
  );

  // Que la confirmación siga siendo aceptable para migrate.js es lo que hace
  // peligrosa la herencia: si dejara de serlo, esta prueba sobraría.
  assert.match(
    fuente("scripts/db/migrate.js"),
    /process\.env\.KRONOS_MIGRATION_CONFIRM/,
    "migrate.js acepta la variable: por eso el ensayo no puede pasársela"
  );
});

test("los tres ensayos que escriben comparten la misma guarda", () => {
  for (const script of ["seed-staging.js", "detection-drill.js", "rollback-drill.js"]) {
    assert.match(
      fuente(`scripts/db/${script}`),
      /assertNotProductionDatabase/,
      `${script} debe usar la guarda compartida de _bootstrap.js`
    );
  }

  // Una copia local volvería a divergir, que es como kronos_social_ai quedó
  // fuera de la lista del ensayo de detección.
  for (const script of ["seed-staging.js", "detection-drill.js", "rollback-drill.js"]) {
    assert.doesNotMatch(
      fuente(`scripts/db/${script}`),
      /const PRODUCTION_HINTS\s*=/,
      `${script} no puede mantener su propia lista de indicios`
    );
  }
});
