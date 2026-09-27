const test = require("node:test");
const assert = require("node:assert/strict");

const { assertWriteAuthorized, MigrationError, up, down } = require("../src/migrations/runner");

/**
 * KRONOS — R-04: la guarda `--confirm` del ejecutor de migraciones.
 *
 * Es la única barrera entre `node scripts/db/migrate.js up` y una escritura
 * en la base real. Comparaba `environment !== "production"` contra la cadena
 * exacta y, además, `up()`/`down()` rellenaban el valor ausente con
 * `process.env.NODE_ENV || "development"`. La combinación dejaba la guarda
 * inactiva en nueve de cada diez entornos, incluido el más probable de
 * todos: un operador o un runner sin `NODE_ENV` definido, al que el fallback
 * bautizaba «development» y eximía de confirmar.
 *
 * No hay base de datos aquí: la guarda es una función pura que solo lee
 * `databaseName` y se ejecuta antes de tomar el candado y antes de cualquier
 * operación contra Mongo. El objeto de una sola clave es el argumento real
 * que recibe, no un sustituto de Mongo.
 */

const BASE_REAL = { databaseName: "kronos_social_ai" };

const DEBEN_EXIGIR_CONFIRMACION = [
  "production", "Production", "PRODUCTION", "prod", "PROD",
  " production ", "live", "staging", "prod-eu", "produccion",
  undefined, null, "", "   "
];

const EXENTOS = ["development", "Development", " development ", "test", "TEST", " test "];

test("R-04: sin confirmación, cualquier entorno que no conste como seguro queda bloqueado", () => {
  const colados = [];

  for (const environment of DEBEN_EXIGIR_CONFIRMACION) {
    try {
      assertWriteAuthorized({ db: BASE_REAL, dryRun: false, environment, confirmation: "" });
      colados.push(environment);
    } catch (error) {
      assert.ok(error instanceof MigrationError, `NODE_ENV=${JSON.stringify(environment)}`);
      assert.equal(error.code, "MIGRATION_CONFIRMATION_REQUIRED");
    }
  }

  assert.deepEqual(
    colados,
    [],
    `estos valores de NODE_ENV permiten migrar ${BASE_REAL.databaseName} sin confirmar: ${colados.map((v) => JSON.stringify(v)).join(", ")}`
  );
});

test("R-04: up() y down() no blanquean un NODE_ENV ausente o vacío", async () => {
  // Esta prueba tiene que entrar por `up()`/`down()`, no por la guarda: lo
  // que se vigila aquí es el valor por defecto del parámetro. Con el viejo
  // `process.env.NODE_ENV || "development"`, un entorno sin definir se
  // rebautizaba como exento y la confirmación no se pedía jamás.
  //
  // `up()` valida el conjunto de migraciones y llama a la guarda antes de
  // tomar el candado, así que con una lista vacía no se toca Mongo: el
  // objeto `db` nunca llega a usarse para nada más que su nombre.
  const previo = process.env.NODE_ENV;

  for (const ausente of [undefined, "", "   "]) {
    try {
      if (ausente === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = ausente;

      for (const [nombre, ejecutar] of [["up", up], ["down", down]]) {
        await assert.rejects(
          () => ejecutar({ db: BASE_REAL, migrations: [], confirmation: "", logger: () => {} }),
          (error) => error.code === "MIGRATION_CONFIRMATION_REQUIRED",
          `${nombre}() con NODE_ENV=${JSON.stringify(ausente)} debe exigir confirmación`
        );
      }
    } finally {
      if (previo === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = previo;
    }
  }
});

test("la confirmación correcta autoriza, y solo para esa base", () => {
  assert.doesNotThrow(() => assertWriteAuthorized({
    db: BASE_REAL,
    dryRun: false,
    environment: "production",
    confirmation: "kronos_social_ai"
  }));

  // Confirmar el nombre de otra base no sirve: es la comprobación que evita
  // pegar a ciegas el comando de un ensayo anterior.
  assert.throws(
    () => assertWriteAuthorized({
      db: BASE_REAL,
      dryRun: false,
      environment: "production",
      confirmation: "kronos_ensayo"
    }),
    (error) => error.code === "MIGRATION_CONFIRMATION_REQUIRED"
  );
});

test("development y test siguen sin pedir confirmación, y el dry-run tampoco", () => {
  for (const environment of EXENTOS) {
    assert.doesNotThrow(
      () => assertWriteAuthorized({ db: { databaseName: "kronos_dev" }, dryRun: false, environment, confirmation: "" }),
      `NODE_ENV=${JSON.stringify(environment)} no debería exigir confirmación`
    );
  }

  // El dry-run no escribe: exigir confirmación para inspeccionar empujaría al
  // operador a tener el --confirm ya escrito cuando llegue la ejecución real.
  assert.doesNotThrow(() => assertWriteAuthorized({
    db: BASE_REAL,
    dryRun: true,
    environment: "production",
    confirmation: ""
  }));
});
