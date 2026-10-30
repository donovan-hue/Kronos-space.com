const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

/**
 * El diario de migraciones se lee en un solo sitio.
 *
 * `down()` no borra el registro: deja una lápida con `direction: "down"`. Es
 * lo que permite auditar un rollback, y es también lo que convierte «¿está
 * aplicada?» en una comparación que hay que hacer bien. Antes la comparación
 * estaba copiada en `up`, en `down`, en `status` y en
 * `scripts/backup-verify.js`: cuatro oportunidades de discrepar sobre el mismo
 * registro, y la discrepancia se veía como una migración reaplicada o como un
 * respaldo que afirmaba cubrir una versión que ya no estaba.
 */

const { estaAplicada, claveDeRecord, DIRECCION_REVERTIDA } = require("../src/migrations/journalState");
const runner = require("../src/migrations/runner");

test("la lápida de reversión no cuenta como aplicada; la ausencia de dirección, sí", () => {
  assert.equal(estaAplicada(null), false);
  assert.equal(estaAplicada(undefined), false);
  assert.equal(estaAplicada({ version: 3, appliedAt: new Date() }), true, "un registro viejo sin `direction` es una aplicación");
  assert.equal(estaAplicada({ version: 3, direction: "up" }), true);
  assert.equal(estaAplicada({ version: 3, direction: DIRECCION_REVERTIDA }), false);
  assert.equal(estaAplicada({ version: 3, direction: "REVERTIDA" }), true, "solo la lápida literal revierte; un valor desconocido no se asume");
});

test("la clave del registro sale de version o de _id, no solo de version", () => {
  assert.equal(claveDeRecord({ version: 7 }), 7);
  assert.equal(claveDeRecord({ _id: 7, appliedAt: new Date() }), 7, "un diario remendado a mano conserva su _id como versión");
  assert.equal(claveDeRecord({ _id: 9, version: 7 }), 7, "version manda sobre _id");
  assert.equal(claveDeRecord(null), null);
});

test("appliedMap ve la migración aplicada aunque el registro no traiga version", async () => {
  const registros = [{ _id: 4, name: "sin-campo-version", direction: "up" }];
  const db = {
    collection: () => ({
      find: () => ({ toArray: async () => registros })
    })
  };

  const aplicado = await runner.appliedMap(db);

  assert.equal(aplicado.get(4) !== undefined, true, "indexada por _id");
  assert.equal(estaAplicada(aplicado.get(4)), true);
});

test("el runner exporta la lectura compartida: no hay dos interpretaciones en el repo", () => {
  assert.equal(runner.estaAplicada, estaAplicada);
});

test("ninguna otra fuente del repo compara `direction` a mano", () => {
  const raiz = path.join(__dirname, "..", "..");
  const permitidos = new Set([path.join("server", "src", "migrations", "journalState.js")]);
  const buscar = [];
  const caminar = (directorio) => {
    for (const entrada of fs.readdirSync(directorio, { withFileTypes: true })) {
      const ruta = path.join(directorio, entrada.name);

      if (entrada.isDirectory()) {
        if (["node_modules", "uploads", "dist", ".git"].includes(entrada.name)) continue;
        caminar(ruta);
      } else if (/\.(js|mjs)$/.test(entrada.name)) {
        buscar.push(ruta);
      }
    }
  };

  for (const base of ["server/src", "scripts"]) caminar(path.join(raiz, base));

  const copia = [];

  for (const ruta of buscar) {
    const relativo = path.relative(raiz, ruta);

    if (permitidos.has(relativo)) continue;

    const fuente = fs.readFileSync(ruta, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

    if (/direction\s*[!=]==?\s*["'`]?(up|down)/.test(fuente)) copia.push(relativo);
  }

  assert.deepEqual(
    copia,
    [],
    "el estado del diario se decide en journalState.js; comparar `direction` en otro archivo es la forma de que dos herramientas discrepen del mismo registro"
  );
});
