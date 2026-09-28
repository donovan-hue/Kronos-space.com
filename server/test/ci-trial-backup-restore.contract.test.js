const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const ROOT = path.join(__dirname, "..", "..");
const TRIAL_SCRIPT = path.join(ROOT, "scripts", "ci", "trial-backup-restore.js");
const FIXTURE_SCRIPT = path.join(ROOT, "scripts", "ci", "prepare-production-restore-fixture.js");
const WORKFLOW = path.join(ROOT, ".github", "workflows", "kronos-e2e.yml");
const TTL_DRILL = path.join(ROOT, "scripts", "db", "ttl-drill.js");

const {
  assertTrialEnvironment,
  parseMongoUri,
  assertSafeTrialPlan,
  assertEmptyTarget,
  createContentDigest,
  normalizeIndexes,
  compareIndexes,
  deriveTotals,
  ensureTempDirectory
} = require(TRIAL_SCRIPT);
const {
  assertCiFixtureEnvironment,
  assertExactLocalUri
} = require(FIXTURE_SCRIPT);

function source(file) {
  return fs.readFileSync(file, "utf8");
}

test("el flujo sintético falla cerrado fuera de CI+test", () => {
  assert.throws(() => assertTrialEnvironment({}), /CI=true.*NODE_ENV=test/);
  assert.throws(() => assertTrialEnvironment({ CI: "true", NODE_ENV: "production" }), /CI=true.*NODE_ENV=test/);
  assert.throws(() => assertTrialEnvironment({ CI: "false", NODE_ENV: "test" }), /CI=true.*NODE_ENV=test/);
  assert.doesNotThrow(() => assertTrialEnvironment({ CI: "true", NODE_ENV: "test" }));
});

test("el flujo sintético solo admite loopback, sin credenciales y bases de ensayo", () => {
  assert.equal(parseMongoUri("mongodb://127.0.0.1:27017/kronos_ensayo").database, "kronos_ensayo");
  assert.equal(parseMongoUri("mongodb://localhost:27017/kronos_ci_chain").database, "kronos_ci_chain");
  assert.throws(() => parseMongoUri("mongodb://mongo.example.com/kronos_ensayo"), /loopback/);
  assert.throws(() => parseMongoUri("mongodb://usuario:secreto@127.0.0.1/kronos_ensayo"), /credenciales/);
  assert.throws(() => parseMongoUri("mongodb+srv://cluster.example/kronos_ensayo"), /mongodb:\/\/ local/);
  assert.throws(() => parseMongoUri("mongodb://127.0.0.1/kronos-space-com"), /no está autorizada/);
  assert.throws(() => parseMongoUri("mongodb://127.0.0.1/kronos_restore"), /no está autorizada/);
  assert.throws(() => parseMongoUri("mongodb://127.0.0.1/admin"), /no está autorizada/);
});

test("el plan de restore sintético separa origen y target y exige target vacío", () => {
  assert.deepEqual(
    assertSafeTrialPlan(
      "mongodb://127.0.0.1:27017/kronos_ensayo",
      "mongodb://127.0.0.1:27017/kronos_migration_test"
    ),
    { sourceDatabase: "kronos_ensayo", targetDatabase: "kronos_migration_test" }
  );
  assert.throws(() => assertSafeTrialPlan(
    "mongodb://127.0.0.1:27017/kronos_ensayo",
    "mongodb://127.0.0.1:27018/kronos_ensayo"
  ), /coinciden/);
  assert.doesNotThrow(() => assertEmptyTarget([]));
  assert.throws(() => assertEmptyTarget([{ name: "users" }]), /no está vacío.*users/);
});

test("el backup de ensayo queda limitado al directorio temporal", () => {
  const inside = path.join(os.tmpdir(), "kronos-ci-contract");
  assert.equal(ensureTempDirectory(inside), path.resolve(inside));
  assert.throws(() => ensureTempDirectory(path.join(ROOT, "backup")), /debe vivir bajo/);
});

test("los totales, contenido e índices del ensayo se verifican sin omitir extras", () => {
  const first = createContentDigest();
  first.add("uno");
  first.add("dos");
  const second = createContentDigest();
  second.add("dos");
  second.add("uno");
  assert.equal(first.close(), second.close(), "el digest no depende del orden del cursor");

  assert.deepEqual(deriveTotals({ collections: { a: { count: 2 }, b: { count: 3 } } }), {
    collections: 2,
    documents: 5
  });
  assert.throws(() => deriveTotals({ collections: { a: { count: -1 } } }), /count inválido/);

  const expected = normalizeIndexes([{ name: "email_1", key: { email: 1 }, unique: true }]);
  const same = normalizeIndexes([
    { name: "_id_", key: { _id: 1 } },
    { name: "email_1", key: { email: 1 }, unique: true }
  ]);
  assert.equal(compareIndexes(expected, same).ok, true);
  const extra = normalizeIndexes([...same, { name: "unexpected_1", key: { unexpected: 1 } }]);
  assert.deepEqual(compareIndexes(expected, extra).extra, ["unexpected_1"]);
});

test("el fixture contractual exige nombres exactos, loopback, sin credenciales y CI+test", () => {
  assert.throws(() => assertCiFixtureEnvironment({ CI: "true", NODE_ENV: "production" }), /CI=true.*NODE_ENV=test/);
  assert.doesNotThrow(() => assertCiFixtureEnvironment({ CI: "true", NODE_ENV: "test" }));
  assert.equal(
    assertExactLocalUri("mongodb://127.0.0.1:27017/kronos-space-com", "kronos-space-com", "origen"),
    "kronos-space-com"
  );
  assert.throws(() => assertExactLocalUri(
    "mongodb://127.0.0.1:27017/kronos_ensayo",
    "kronos-space-com",
    "origen"
  ), /exactamente.*kronos-space-com/);
  assert.throws(() => assertExactLocalUri(
    "mongodb://user:secret@127.0.0.1:27017/kronos-space-com",
    "kronos-space-com",
    "origen"
  ), /credenciales/);
  assert.throws(() => assertExactLocalUri(
    "mongodb://production.example/kronos_restore",
    "kronos_restore",
    "target"
  ), /loopback/);
});

test("workflow separa ensayos y conserva un único E2E legítimo del contrato productivo", () => {
  const workflow = source(WORKFLOW);
  const productionRestores = workflow.match(/node scripts\/backup-verify\.js --restore/g) || [];
  assert.equal(productionRestores.length, 1, "debe existir un solo restore del contrato productivo");
  assert.match(workflow, /MONGODB_URI: mongodb:\/\/127\.0\.0\.1:27017\/kronos-space-com/);
  assert.match(workflow, /MONGODB_TARGET_URI: mongodb:\/\/127\.0\.0\.1:27017\/kronos_restore/);
  assert.match(workflow, /prepare-production-restore-fixture\.js/);
  assert.match(workflow, /backup-verify\.js --restore[^\n]*[\s\S]{0,120}--target-db kronos_restore/);
  assert.doesNotMatch(workflow, /backup-verify\.js --restore[^\n]*--target-uri/);
  assert.doesNotMatch(workflow, /--drop-target-collections/);
  assert.doesNotMatch(workflow, /manifest\.database\s*=/);

  const trialCalls = workflow.match(/scripts\/ci\/trial-backup-restore\.js/g) || [];
  assert.ok(trialCalls.length >= 9, "los flujos genéricos deben usar la herramienta de ensayo");
  assert.match(workflow, /MONGODB_URI: mongodb:\/\/127\.0\.0\.1:27017\/kronos_ci_chain/);
});

test("el ensayo TTL ya no invoca ni importa el restore productivo", () => {
  const ttl = source(TTL_DRILL);
  const trial = source(TRIAL_SCRIPT);
  assert.doesNotMatch(ttl, /scripts\/backup-verify\.js/);
  assert.match(ttl, /scripts\/ci\/trial-backup-restore\.js/);
  assert.doesNotMatch(ttl, /--drop-target-collections/);
  assert.doesNotMatch(trial, /require\([^\n]*backup-verify/);
  assert.doesNotMatch(trial, /deleteMany\(|dropDatabase\(|drop-target-collections/);
});
