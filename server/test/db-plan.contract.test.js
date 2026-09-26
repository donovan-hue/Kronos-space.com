const test = require("node:test");
const assert = require("node:assert");

/**
 * KRONOS — contrato del plan de base de datos.
 *
 * Estas pruebas no necesitan MongoDB: validan las piezas declarativas que
 * gobiernan la migración (registro de colecciones, plan de índices, consultas
 * críticas, catálogo de integridad y catálogo de migraciones). Si alguien
 * añade un modelo, una consulta de feed o una migración sin su índice, su
 * regla o su rollback, el fallo aparece aquí antes de tocar datos reales.
 */

const registry = require("../src/db/registry");
const indexPlan = require("../src/db/indexPlan");
const criticalQueries = require("../src/db/criticalQueries");
const integrity = require("../src/db/integrity");
const migrations = require("../src/migrations");
const { validateMigrations } = require("../src/migrations/runner");
const { collectAuthorIds } = require("../src/modules/posts/repostHydration");
const { canViewPostWithScope } = require("../src/modules/posts/audience.service");

// ---------------------------------------------------------------- registro

test("registro: todos los modelos Mongoose están declarados", () => {
  const undeclared = registry.undeclaredModels();
  assert.deepStrictEqual(
    undeclared,
    [],
    `modelos sin declarar en server/src/db/registry.js: ${undeclared.join(", ")}`
  );
});

test("registro: nombres de colección únicos y con dominio", () => {
  const collections = registry.listCollections();
  assert.ok(collections.length >= 27, "el registro debe cubrir todas las colecciones");

  const names = collections.map((entry) => entry.collection);
  assert.strictEqual(new Set(names).size, names.length, "hay nombres de colección duplicados");

  for (const entry of collections) {
    assert.ok(entry.domain, `la colección ${entry.collection} no declara dominio`);
    assert.ok(entry.model, `la colección ${entry.collection} no declara modelo`);
  }
});

// -------------------------------------------------------------- índices

test("plan de índices: sin índices redundantes", () => {
  const plan = indexPlan.describePlan();
  const redundant = plan.collections.flatMap((entry) =>
    entry.redundant.map((item) => `${entry.collection}:${item.name || item.redundant}`)
  );
  assert.deepStrictEqual(
    redundant,
    [],
    `índices cubiertos por el prefijo de otro (se pagan en cada escritura): ${redundant.join(", ")}`
  );
});

test("plan de índices: cada clave declarada es única dentro de su colección", () => {
  const seen = new Map();

  for (const index of indexPlan.desiredIndexList()) {
    const key = `${index.collection}::${indexPlan.keySignature(index.key)}`;
    assert.ok(!seen.has(key), `índice duplicado en ${index.collection}: ${key}`);
    seen.set(key, true);
  }
});

// ------------------------------------------------------- consultas críticas

test("consultas críticas: todas tienen un índice que las sostiene", () => {
  const coverage = criticalQueries.analyzeQueryCoverage();
  assert.ok(coverage.length >= 25, "el catálogo debe cubrir las consultas reales del producto");

  const uncovered = coverage.filter((item) => !item.covered).map((item) => item.id);
  assert.deepStrictEqual(
    uncovered,
    [],
    `consultas sin índice de apoyo (COLLSCAN garantizado en producción): ${uncovered.join(", ")}`
  );
});

test("consultas críticas: catálogo íntegro (id único, colección conocida, paginación acotada)", () => {
  const known = new Set(registry.knownCollectionNames());
  const ids = new Set();

  for (const query of criticalQueries.criticalQueries()) {
    assert.ok(!ids.has(query.id), `id de consulta duplicado: ${query.id}`);
    ids.add(query.id);
    assert.ok(known.has(query.collection), `${query.id} apunta a una colección desconocida: ${query.collection}`);
    assert.ok(query.description, `${query.id} no describe qué hace`);
    assert.ok(
      query.limit === undefined || (Number.isInteger(query.limit) && query.limit > 0 && query.limit <= 100),
      `${query.id} debe paginar con un límite acotado`
    );
  }
});

// -------------------------------------------------------------- integridad

test("catálogo de integridad: reglas bien formadas", () => {
  const problems = integrity.validateRuleCatalog();
  assert.deepStrictEqual(problems, [], `reglas de integridad inválidas: ${problems.join(" | ")}`);
});

test("catálogo de integridad: cubre las relaciones críticas del producto", () => {
  const rules = integrity.RULES;
  const ids = rules.map((rule) => rule.id);

  assert.ok(rules.length >= 20, "el catálogo debe cubrir las relaciones del producto");
  assert.ok(rules.some((rule) => rule.severity === "critical"), "debe haber reglas críticas");
  for (const expected of ["posts.author.exists", "notifications.recipient.exists", "messages.sender.exists"]) {
    assert.ok(ids.includes(expected), `falta la regla ${expected}`);
  }
});

// -------------------------------------------------------------- migraciones

test("migraciones: catálogo válido, ordenado y con rollback declarado", () => {
  const list = [...migrations];
  assert.strictEqual(list.length, 6, "el plan maestro define seis migraciones");

  const problems = validateMigrations(list);
  assert.deepStrictEqual(problems, [], `catálogo de migraciones inválido: ${problems.join(" | ")}`);

  let previous = 0;
  for (const migration of list) {
    assert.ok(migration.version > previous, `las versiones deben ser crecientes (${migration.version})`);
    previous = migration.version;
    assert.ok(migration.description, `la migración ${migration.version} no tiene descripción`);
    assert.strictEqual(typeof migration.up, "function", `la migración ${migration.version} no tiene up()`);
    assert.ok(
      typeof migration.down === "function" || typeof migration.rollback === "string",
      `la migración ${migration.version} no declara estrategia de reversión`
    );
  }
});

test("migraciones: ninguna borra datos sin autorización explícita", () => {
  const fs = require("node:fs");
  const path = require("node:path");
  const directory = path.join(__dirname, "..", "src", "migrations");

  for (const file of fs.readdirSync(directory).filter((name) => /^\d{3}-/.test(name))) {
    const source = fs.readFileSync(path.join(directory, file), "utf8");

    // Constantes del archivo que apuntan a colecciones internas del migrador
    // (kronos_*): son bitácora propia y su `down` puede limpiarlas.
    const internal = [...source.matchAll(/const\s+([A-Z_]+)\s*=\s*"(kronos_[a-z_]+)"/g)].map((match) => match[1]);
    const allowed = new RegExp(`(kronos_|deleteWhenAuthorized${internal.length ? `|${internal.join("|")}` : ""})`);

    for (const line of source.split("\n")) {
      if (!/\.(deleteMany|deleteOne|drop)\(/.test(line)) continue;
      if (allowed.test(line)) continue;
      assert.fail(`${file} borra datos de usuario sin pasar por deleteWhenAuthorized: ${line.trim()}`);
    }
  }
});

// ------------------------------------------------- visibilidad por ámbito

function scopeOf({ viewerId = "v1", following = [], circles = [], orbits = [] } = {}) {
  return {
    viewerId,
    viewer: null,
    following,
    followingIds: new Set(following.map(String)),
    circleIds: new Set(circles.map(String)),
    orbitIds: new Set(orbits.map(String))
  };
}

test("visibilidad: el ámbito precargado aplica las mismas reglas de audiencia", () => {
  const scope = scopeOf({ following: ["a1"], circles: ["c1"], orbits: ["o1"] });

  assert.strictEqual(canViewPostWithScope({ author: "v1", audience: { type: "private" } }, scope), true, "el autor siempre se ve");
  assert.strictEqual(canViewPostWithScope({ author: "a1" }, scope), true, "sin audiencia declarada es público");
  assert.strictEqual(canViewPostWithScope({ author: "a1", audience: { type: "public" } }, scope), true);
  assert.strictEqual(canViewPostWithScope({ author: "a1", audience: { type: "private" } }, scope), false);
  assert.strictEqual(canViewPostWithScope({ author: "a1", audience: { type: "followers" } }, scope), true, "sigue al autor");
  assert.strictEqual(canViewPostWithScope({ author: "a9", audience: { type: "followers" } }, scope), false, "no sigue al autor");
  assert.strictEqual(canViewPostWithScope({ author: "a9", audience: { type: "circle", circleId: "c1" } }, scope), true);
  assert.strictEqual(canViewPostWithScope({ author: "a9", audience: { type: "circle", circleId: "c9" } }, scope), false);
  assert.strictEqual(canViewPostWithScope({ author: "a9", audience: { type: "orbit", orbitId: "o1" } }, scope), true);
  assert.strictEqual(canViewPostWithScope({ author: "a9", audience: { type: "orbit", orbitId: "o9" } }, scope), false);
  assert.strictEqual(canViewPostWithScope({ author: "a9", audience: { type: "circle" } }, scope), false, "círculo sin id no se ve");
  assert.strictEqual(canViewPostWithScope({ author: "a9", audience: { type: "desconocida" } }, scope), false, "tipo fuera de catálogo se deniega");
});

test("hidratación por lotes: los autores se deduplican y se descartan ids inválidos", () => {
  const ids = collectAuthorIds([
    { author: { _id: "507f1f77bcf86cd799439011" } },
    { author: "507f1f77bcf86cd799439011" },
    { author: "507f1f77bcf86cd799439012" },
    { author: "no-es-un-id" },
    { author: null },
    {}
  ]);

  assert.deepStrictEqual(ids, ["507f1f77bcf86cd799439011", "507f1f77bcf86cd799439012"]);
});
