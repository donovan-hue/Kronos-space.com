#!/usr/bin/env node
/**
 * Flujo EJSON exclusivo para ensayos CI sobre MongoDB local.
 *
 * Este archivo existe para que los backups sintéticos de migración, TTL y
 * rollback NO pasen por el contrato de restore de producción de
 * scripts/backup-verify.js. No acepta Atlas, credenciales, nombres de
 * producción ni ejecución fuera de CI+NODE_ENV=test.
 *
 * Uso:
 *   node scripts/ci/trial-backup-restore.js --out /tmp/backup
 *   node scripts/ci/trial-backup-restore.js --check /tmp/backup
 *   node scripts/ci/trial-backup-restore.js --restore /tmp/backup \
 *     --target-uri mongodb://127.0.0.1:27017/kronos_migration_test
 */
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const readline = require("node:readline");

const TRIAL_SCOPE = "KRONOS_CI_TRIAL_ONLY";
const TRIAL_FORMAT = "ci-ejson-canonical-v1";
const VERIFICATION = {
  NONE: "NONE",
  CHECKSUM: "CHECKSUM_VERIFIED",
  RESTORE: "RESTORE_VERIFIED"
};
const SAFE_DATABASE_PATTERNS = [
  /^kronos_ci(?:_|$)/,
  /^kronos_ensayo(?:_|$)/,
  /^kronos_migration_test(?:_|$)/,
  /^kronos_restore_proof(?:_|$)/,
  /^kronos_ttl(?:_|$)/,
  /^kronos_rollback(?:_|$)/,
  /^kronos_e2e(?:_|$)/
];
const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]", "::1"]);

function requireWorkspaceModule(name) {
  const candidates = [
    name,
    path.join(__dirname, "..", "..", "node_modules", name),
    path.join(__dirname, "..", "..", "server", "node_modules", name)
  ];
  for (const candidate of candidates) {
    try {
      return require(candidate);
    } catch {
      // siguiente candidato
    }
  }
  throw new Error(`No se pudo cargar ${name}; ejecuta npm ci.`);
}

function log(message) {
  process.stdout.write(`${message}\n`);
}

function fail(error) {
  const message = error?.message || String(error);
  process.stderr.write(`TRIAL_BACKUP_FAIL: ${message}\n`);
  process.exit(1);
}

function assertTrialEnvironment(env = process.env) {
  if (env.CI !== "true" || env.NODE_ENV !== "test") {
    throw new Error("El flujo de ensayo exige simultáneamente CI=true y NODE_ENV=test.");
  }
}

function parseMongoUri(uri, label = "MongoDB") {
  let parsed;
  try {
    parsed = new URL(String(uri || ""));
  } catch {
    throw new Error(`La URI ${label} no es válida.`);
  }
  if (!/^mongodb:$/.test(parsed.protocol)) {
    throw new Error(`La URI ${label} debe usar mongodb:// local; mongodb+srv y otros protocolos están prohibidos.`);
  }
  if (!LOCAL_HOSTS.has(parsed.hostname)) {
    throw new Error(`La URI ${label} debe apuntar a loopback, no a "${parsed.hostname || "(sin host)"}".`);
  }
  if (parsed.username || parsed.password) {
    throw new Error(`La URI ${label} de ensayo no puede contener credenciales.`);
  }
  const database = decodeURIComponent(parsed.pathname.replace(/^\//, ""));
  if (!database || !SAFE_DATABASE_PATTERNS.some((pattern) => pattern.test(database))) {
    throw new Error(`La base "${database || "(sin nombre)"}" no está autorizada para ensayos CI.`);
  }
  return { database, hostname: parsed.hostname };
}

function assertSafeTrialPlan(sourceUri, targetUri) {
  const source = parseMongoUri(sourceUri, "de origen");
  const target = parseMongoUri(targetUri, "de target");
  if (source.database === target.database) {
    throw new Error(`Origen y target de ensayo coinciden en "${source.database}".`);
  }
  return { sourceDatabase: source.database, targetDatabase: target.database };
}

function assertEmptyTarget(collections) {
  const names = (collections || []).map((item) => typeof item === "string" ? item : item?.name).filter(Boolean);
  if (names.length) {
    throw new Error(`El target de ensayo no está vacío: ${names.join(", ")}. No se borra ni se vacía automáticamente.`);
  }
}

function createContentDigest() {
  const digests = [];
  return {
    add(canonical) {
      digests.push(crypto.createHash("sha256").update(canonical).digest());
    },
    close() {
      digests.sort(Buffer.compare);
      const hash = crypto.createHash("sha256");
      for (const digest of digests) hash.update(digest);
      return hash.digest("hex");
    }
  };
}

function normalizeIndexes(indexes) {
  return (indexes || [])
    .filter((index) => index && index.name !== "_id_")
    .map((index) => ({
      name: index.name,
      key: index.key,
      unique: Boolean(index.unique),
      sparse: Boolean(index.sparse),
      expireAfterSeconds: index.expireAfterSeconds ?? null,
      partialFilterExpression: index.partialFilterExpression || null
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function compareIndexes(expected, actual) {
  const actualByName = new Map(actual.map((index) => [index.name, index]));
  const expectedNames = new Set(expected.map((index) => index.name));
  const missing = expected.filter((index) => !actualByName.has(index.name)).map((index) => index.name);
  const different = expected
    .filter((index) => actualByName.has(index.name))
    .filter((index) => JSON.stringify(index) !== JSON.stringify(actualByName.get(index.name)))
    .map((index) => index.name);
  const extra = actual.filter((index) => !expectedNames.has(index.name)).map((index) => index.name);
  return { missing, different, extra, ok: !missing.length && !different.length && !extra.length };
}

function ensureTempDirectory(requested) {
  if (!requested || requested === true) throw new Error("Falta directorio de backup de ensayo.");
  const absolute = path.resolve(requested);
  const relative = path.relative(os.tmpdir(), absolute);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`El backup de ensayo debe vivir bajo ${os.tmpdir()}.`);
  }
  return absolute;
}

function parseArgs(argv = process.argv.slice(2)) {
  const flags = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
    const next = argv[index + 1];
    if (next && !next.startsWith("--")) {
      flags[key] = next;
      index += 1;
    } else {
      flags[key] = true;
    }
  }
  return flags;
}

function hashFile(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash("sha256");
    const stream = fs.createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", () => resolve(hash.digest("hex")));
  });
}

function writeChunk(stream, chunk) {
  if (stream.write(chunk)) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      stream.off("drain", onDrain);
      stream.off("error", onError);
    };
    const onDrain = () => {
      cleanup();
      resolve();
    };
    const onError = (error) => {
      cleanup();
      reject(error);
    };
    stream.once("drain", onDrain);
    stream.once("error", onError);
  });
}

async function connect(uri) {
  const mongoose = requireWorkspaceModule("mongoose");
  return mongoose.createConnection(uri, {
    serverSelectionTimeoutMS: 15000,
    autoIndex: false,
    autoCreate: false
  }).asPromise();
}

async function dumpCollection(collection, filePath) {
  const { EJSON } = requireWorkspaceModule("bson");
  const stream = fs.createWriteStream(filePath, { encoding: "utf8" });
  const fileHash = crypto.createHash("sha256");
  const content = createContentDigest();
  let count = 0;
  const cursor = collection.find({});
  try {
    for await (const document of cursor) {
      const canonical = EJSON.stringify(document, { relaxed: false });
      const line = `${canonical}\n`;
      fileHash.update(line);
      content.add(canonical);
      await writeChunk(stream, line);
      count += 1;
    }
  } finally {
    await cursor.close().catch(() => {});
  }
  await new Promise((resolve, reject) => {
    stream.once("error", reject);
    stream.end(resolve);
  });
  return { count, sha256: fileHash.digest("hex"), contentSha256: content.close() };
}

async function readBackupFile(filePath, onDocument = null) {
  const { EJSON } = requireWorkspaceModule("bson");
  const input = fs.createReadStream(filePath, { encoding: "utf8" });
  const lines = readline.createInterface({ input, crlfDelay: Infinity });
  const content = createContentDigest();
  let count = 0;
  try {
    for await (const line of lines) {
      if (!line) continue;
      const document = EJSON.parse(line, { relaxed: false });
      content.add(line);
      count += 1;
      if (onDocument) await onDocument(document);
    }
  } finally {
    lines.close();
    input.destroy();
  }
  return { count, contentSha256: content.close() };
}

function readManifest(directory) {
  const file = path.join(directory, "manifest.json");
  if (!fs.existsSync(file)) throw new Error("El backup de ensayo no contiene manifest.json.");
  const manifest = JSON.parse(fs.readFileSync(file, "utf8"));
  if (manifest.scope !== TRIAL_SCOPE || manifest.format !== TRIAL_FORMAT || manifest.mode !== "ci-json") {
    throw new Error("El manifest no pertenece al flujo aislado de ensayos CI.");
  }
  parseMongoUri(`mongodb://127.0.0.1/${manifest.database}`, "de manifest");
  return { manifest, file };
}

function deriveTotals(manifest) {
  const entries = Object.values(manifest.collections || {});
  let documents = 0;
  for (const entry of entries) {
    if (!Number.isSafeInteger(entry?.count) || entry.count < 0) {
      throw new Error("Una colección del manifest de ensayo tiene count inválido.");
    }
    documents += entry.count;
  }
  return { collections: entries.length, documents };
}

function stamp(directory, level, totals, targetDatabase = null) {
  const { manifest, file } = readManifest(directory);
  // Volver a comprobar checksums nunca puede borrar una prueba de restore ya
  // obtenida: el sello solo avanza, igual que el contrato productivo.
  const rank = { [VERIFICATION.NONE]: 0, [VERIFICATION.CHECKSUM]: 1, [VERIFICATION.RESTORE]: 2 };
  const current = rank[manifest.verification] ?? 0;
  const requested = rank[level] ?? 0;
  manifest.verification = current > requested ? manifest.verification : level;
  manifest.verifiedAt = new Date().toISOString();
  manifest.verifiedCollections = totals.collections;
  manifest.verifiedDocuments = totals.documents;
  if (level === VERIFICATION.RESTORE) {
    manifest.restoreVerifiedAt = manifest.verifiedAt;
    manifest.restoreTarget = targetDatabase;
  } else {
    manifest.checksumVerifiedAt = manifest.verifiedAt;
  }
  fs.writeFileSync(file, `${JSON.stringify(manifest, null, 2)}\n`);
}

async function verifyBackup(directory) {
  const { manifest } = readManifest(directory);
  const totals = deriveTotals(manifest);
  if (
    Object.prototype.hasOwnProperty.call(manifest, "verifiedCollections")
    && manifest.verifiedCollections !== totals.collections
  ) {
    throw new Error("verifiedCollections no coincide con el detalle del ensayo.");
  }
  if (
    Object.prototype.hasOwnProperty.call(manifest, "verifiedDocuments")
    && manifest.verifiedDocuments !== totals.documents
  ) {
    throw new Error("verifiedDocuments no coincide con el detalle del ensayo.");
  }

  for (const [name, entry] of Object.entries(manifest.collections || {})) {
    const filePath = path.join(directory, entry.file);
    if (!fs.existsSync(filePath)) throw new Error(`Falta el archivo de ensayo para ${name}.`);
    if (await hashFile(filePath) !== entry.sha256) throw new Error(`SHA-256 inválido en ${name}.`);
    const read = await readBackupFile(filePath);
    if (read.count !== entry.count) throw new Error(`Conteo inválido en ${name}.`);
    if (read.contentSha256 !== entry.contentSha256) throw new Error(`Contenido inválido en ${name}.`);
  }
  return { manifest, totals };
}

async function createBackup(directory, sourceUri) {
  const source = parseMongoUri(sourceUri, "de origen");
  if (fs.existsSync(path.join(directory, "manifest.json"))) {
    throw new Error("El directorio ya contiene un backup de ensayo.");
  }
  fs.mkdirSync(directory, { recursive: true });
  const connection = await connect(sourceUri);
  const manifest = {
    scope: TRIAL_SCOPE,
    mode: "ci-json",
    format: TRIAL_FORMAT,
    database: source.database,
    createdAt: new Date().toISOString(),
    verification: VERIFICATION.NONE,
    collections: {}
  };
  try {
    const names = (await connection.db.listCollections({}, { nameOnly: true }).toArray())
      .map((item) => item.name)
      .filter((name) => !name.startsWith("system."))
      .sort();
    for (const name of names) {
      const file = `${Buffer.from(name, "utf8").toString("hex")}.ejson`;
      const collection = connection.db.collection(name);
      const dumped = await dumpCollection(collection, path.join(directory, file));
      const indexes = normalizeIndexes(await collection.listIndexes().toArray().catch(() => []));
      manifest.collections[name] = { file, ...dumped, indexes };
      log(`  ${name}: ${dumped.count} documentos`);
    }
  } finally {
    await connection.close();
  }
  fs.writeFileSync(path.join(directory, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  const verified = await verifyBackup(directory);
  stamp(directory, VERIFICATION.CHECKSUM, verified.totals);
  log(`OK: backup de ensayo ${source.database} (${verified.totals.collections} colecciones, ${verified.totals.documents} documentos).`);
}

async function insertBackup(collection, filePath, batchSize = 500) {
  let batch = [];
  const flush = async () => {
    if (!batch.length) return;
    await collection.insertMany(batch, { ordered: false });
    batch = [];
  };
  await readBackupFile(filePath, async (document) => {
    batch.push(document);
    if (batch.length >= batchSize) await flush();
  });
  await flush();
}

async function restoreIndexes(collection, indexes) {
  for (const index of normalizeIndexes(indexes)) {
    const options = { name: index.name };
    if (index.unique) options.unique = true;
    if (index.sparse) options.sparse = true;
    if (index.expireAfterSeconds !== null) options.expireAfterSeconds = index.expireAfterSeconds;
    if (index.partialFilterExpression) options.partialFilterExpression = index.partialFilterExpression;
    await collection.createIndex(index.key, options);
  }
  return normalizeIndexes(await collection.listIndexes().toArray().catch(() => []));
}

async function digestCollection(collection) {
  const { EJSON } = requireWorkspaceModule("bson");
  const digest = createContentDigest();
  const cursor = collection.find({});
  try {
    for await (const document of cursor) digest.add(EJSON.stringify(document, { relaxed: false }));
  } finally {
    await cursor.close().catch(() => {});
  }
  return digest.close();
}

async function restoreBackup(directory, sourceUri, targetUri) {
  const plan = assertSafeTrialPlan(sourceUri, targetUri);
  const verified = await verifyBackup(directory);
  if (verified.manifest.database !== plan.sourceDatabase) {
    throw new Error(
      `El backup de ensayo pertenece a "${verified.manifest.database}" y la URI apunta a "${plan.sourceDatabase}".`
    );
  }
  if (![VERIFICATION.CHECKSUM, VERIFICATION.RESTORE].includes(verified.manifest.verification)) {
    throw new Error("El backup de ensayo no alcanzó CHECKSUM_VERIFIED.");
  }

  const connection = await connect(targetUri);
  const restored = [];
  try {
    if (connection.db.databaseName !== plan.targetDatabase) {
      throw new Error(`MongoDB conectó a "${connection.db.databaseName}" y se esperaba "${plan.targetDatabase}".`);
    }
    assertEmptyTarget(await connection.db.listCollections({}, { nameOnly: true }).toArray());

    for (const [name, entry] of Object.entries(verified.manifest.collections || {})) {
      const collection = connection.db.collection(name);
      await insertBackup(collection, path.join(directory, entry.file));
      const actualIndexes = await restoreIndexes(collection, entry.indexes);
      const expectedIndexes = normalizeIndexes(entry.indexes);
      const indexComparison = compareIndexes(expectedIndexes, actualIndexes);
      const documents = await collection.countDocuments({});
      const contentSha256 = await digestCollection(collection);
      if (documents !== entry.count) throw new Error(`${name}: conteo restaurado distinto.`);
      if (contentSha256 !== entry.contentSha256) throw new Error(`${name}: contenido restaurado distinto.`);
      if (!indexComparison.ok) throw new Error(`${name}: índices restaurados distintos.`);
      restored.push({ collection: name, documents, contentSha256, indexes: actualIndexes.length });
    }
  } finally {
    await connection.close();
  }

  const totalDocuments = restored.reduce((sum, item) => sum + item.documents, 0);
  if (restored.length !== verified.totals.collections || totalDocuments !== verified.totals.documents) {
    throw new Error("Los totales restaurados del ensayo no coinciden con el backup.");
  }
  const proof = {
    scope: TRIAL_SCOPE,
    restoredAt: new Date().toISOString(),
    sourceDatabase: plan.sourceDatabase,
    targetDatabase: plan.targetDatabase,
    collections: restored,
    totalDocuments
  };
  fs.writeFileSync(path.join(directory, "restore-proof.json"), `${JSON.stringify(proof, null, 2)}\n`);
  stamp(directory, VERIFICATION.RESTORE, verified.totals, plan.targetDatabase);
  log(`OK: restore de ensayo ${plan.sourceDatabase} → ${plan.targetDatabase} (${totalDocuments} documentos).`);
}

async function main() {
  assertTrialEnvironment();
  const flags = parseArgs();
  if (flags.out) {
    const directory = ensureTempDirectory(flags.out);
    const sourceUri = process.env.MONGODB_URI;
    parseMongoUri(sourceUri, "de origen");
    await createBackup(directory, sourceUri);
    return;
  }
  if (flags.check) {
    const directory = ensureTempDirectory(flags.check);
    const verified = await verifyBackup(directory);
    stamp(directory, VERIFICATION.CHECKSUM, verified.totals);
    log(`OK: backup de ensayo verificado (${verified.totals.collections} colecciones, ${verified.totals.documents} documentos).`);
    return;
  }
  if (flags.restore) {
    const directory = ensureTempDirectory(flags.restore);
    if (!flags.targetUri || flags.targetUri === true) throw new Error("Falta --target-uri local para el ensayo.");
    await restoreBackup(directory, process.env.MONGODB_URI, flags.targetUri);
    return;
  }
  throw new Error("Uso: --out DIR | --check DIR | --restore DIR --target-uri URI_LOCAL");
}

if (require.main === module) main().catch(fail);

module.exports = {
  TRIAL_SCOPE,
  TRIAL_FORMAT,
  SAFE_DATABASE_PATTERNS,
  assertTrialEnvironment,
  parseMongoUri,
  assertSafeTrialPlan,
  assertEmptyTarget,
  createContentDigest,
  normalizeIndexes,
  compareIndexes,
  deriveTotals,
  ensureTempDirectory,
  writeChunk
};
