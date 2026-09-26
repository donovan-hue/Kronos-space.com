/**
 * FASE 2 del plan de migración — respaldo verificable y restauración probada.
 *
 * Tres modos:
 *   1. mongodump (preferido): volcado comprimido + manifiesto con conteos
 *      vivos; verificación por checksum del archivo.
 *   2. EJSON (alternativa sin herramientas de MongoDB): exportación por
 *      colección en Extended JSON canónico —ObjectId, fechas y binarios
 *      conservan su tipo— con SHA-256 del archivo y SHA-256 del contenido
 *      normalizado (independiente del orden de lectura).
 *   3. Restauración: vuelca un respaldo EJSON en una base AISLADA y demuestra
 *      la restauración comparando conteos y checksums de contenido.
 *
 * Uso:
 *   node scripts/backup-verify.js                       # crea y verifica en backups/
 *   node scripts/backup-verify.js --out DIR             # crea y verifica en DIR
 *   node scripts/backup-verify.js --check DIR           # verifica un respaldo
 *   node scripts/backup-verify.js --restore DIR \
 *        --target-uri mongodb://host/kronos_restore_test [--drop-target-collections]
 *
 * Requiere MONGODB_URI (server/.env) salvo en `--check`. Sale con código 1 si
 * algo falla: un respaldo que no se puede verificar no cuenta como respaldo.
 */
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { spawnSync } = require("node:child_process");

const ROOT = path.join(__dirname, "..");
const BACKUPS_ROOT = path.join(ROOT, "backups");
const MANIFEST_FORMAT = "ejson-canonical-v1";

// Los módulos viven en el workspace del servidor; el script vive en la
// raíz y debe funcionar con o sin dotenv instalado.
function requireServerModule(name) {
  const candidates = [
    name,
    path.join(ROOT, "node_modules", name),
    path.join(ROOT, "server", "node_modules", name)
  ];
  for (const candidate of candidates) {
    try {
      return require(candidate);
    } catch {
      // siguiente candidato
    }
  }
  throw new Error(`No se pudo cargar ${name}. Ejecuta npm install antes del respaldo.`);
}

// Parser mínimo de .env (sin dependencias): solo fija lo que falta.
function loadEnvFile(envPath) {
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (match && process.env[match[1]] === undefined) {
      process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
    }
  }
}

try {
  requireServerModule("dotenv").config({ path: path.join(ROOT, "server", ".env"), quiet: true });
} catch {
  loadEnvFile(path.join(ROOT, "server", ".env"));
}

/** Extended JSON canónico: sin él, ObjectId y fechas no sobreviven al viaje. */
function ejson() {
  return requireServerModule("bson").EJSON;
}

function log(message) {
  process.stdout.write(`${message}\n`);
}

function fail(message) {
  // Escritura síncrona: process.exit no espera el buffer de stderr.
  try {
    fs.writeSync(2, `BACKUP_FAIL: ${message}\n`);
  } catch {
    // stderr cerrado: nada que hacer, el código de salida ya informa.
  }
  process.exit(1);
}

/** Nunca se imprime una URI con credenciales. */
function redactUri(uri) {
  return String(uri || "").replace(/\/\/[^@/]+@/, "//***@");
}

function loadUri() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    fail("Falta MONGODB_URI (server/.env). Sin conexión no hay respaldo verificable.");
  }
  return uri;
}

function databaseNameFromUri(uri) {
  const match = /\/\/[^/]+\/([^?]+)/.exec(uri);
  return match ? decodeURIComponent(match[1]) : "kronos";
}

async function connectMongoose(uri) {
  const mongoose = requireServerModule("mongoose");
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 15000 });
  return mongoose;
}

function sha256(filePath) {
  const contents = fs.readFileSync(filePath);
  return crypto.createHash("sha256").update(contents).digest("hex");
}

/**
 * Checksum del CONTENIDO (no del archivo): documentos ordenados por _id y
 * serializados en EJSON canónico. Dos exportaciones de los mismos datos dan
 * el mismo valor aunque cambie el orden de lectura o el formato del archivo.
 * Es lo que permite demostrar que una restauración devolvió los mismos datos.
 */
function contentChecksum(documents) {
  const EJSON = ejson();
  const canonical = [...documents]
    .map((document) => EJSON.stringify(document, { relaxed: false }))
    .sort();
  return crypto.createHash("sha256").update(canonical.join("\n")).digest("hex");
}

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

/** Estado del diario de migraciones: qué versión de esquema respalda esto. */
async function schemaVersionOf(db) {
  try {
    const records = await db.collection("kronos_migrations").find({}).toArray();
    const applied = records.filter((record) => record.direction !== "down").map((record) => record.version);
    return { applied: applied.sort((a, b) => a - b), latest: applied.length ? Math.max(...applied) : 0 };
  } catch {
    return { applied: [], latest: 0 };
  }
}

async function jsonBackup(uri, targetDir) {
  const EJSON = ejson();
  const mongoose = await connectMongoose(uri);
  const manifest = {
    mode: "json",
    format: MANIFEST_FORMAT,
    createdAt: new Date().toISOString(),
    database: databaseNameFromUri(uri),
    source: redactUri(uri),
    schemaVersion: null,
    collections: {}
  };
  try {
    manifest.schemaVersion = await schemaVersionOf(mongoose.connection.db);
    const collections = await mongoose.connection.db.collections();
    for (const collection of collections) {
      const documents = await collection.find({}).toArray();
      const filePath = path.join(targetDir, `${collection.collectionName}.json`);
      fs.writeFileSync(filePath, EJSON.stringify(documents, { relaxed: false }));
      const indexes = await collection.listIndexes().toArray().catch(() => []);
      manifest.collections[collection.collectionName] = {
        count: documents.length,
        sha256: sha256(filePath),
        contentSha256: contentChecksum(documents),
        bytes: fs.statSync(filePath).size,
        indexes: indexes.map((index) => ({
          name: index.name,
          key: index.key,
          unique: Boolean(index.unique),
          expireAfterSeconds: index.expireAfterSeconds ?? null,
          partialFilterExpression: index.partialFilterExpression || null
        }))
      };
      log(`  ${collection.collectionName}: ${documents.length} documentos`);
    }
    fs.writeFileSync(path.join(targetDir, "manifest.json"), JSON.stringify(manifest, null, 2));
  } finally {
    await mongoose.disconnect();
  }
  return manifest;
}

/** Lee un archivo de respaldo aceptando EJSON canónico y JSON plano antiguo. */
function readBackupFile(filePath) {
  const raw = fs.readFileSync(filePath, "utf8");
  try {
    return ejson().parse(raw, { relaxed: false });
  } catch {
    return JSON.parse(raw);
  }
}

async function verifyJsonBackup(targetDir) {
  const manifestPath = path.join(targetDir, "manifest.json");
  if (!fs.existsSync(manifestPath)) fail("El respaldo no tiene manifest.json: no verificable.");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  let total = 0;
  for (const [name, entry] of Object.entries(manifest.collections || {})) {
    const filePath = path.join(targetDir, `${name}.json`);
    if (!fs.existsSync(filePath)) fail(`Falta ${name}.json en el respaldo.`);
    if (sha256(filePath) !== entry.sha256) fail(`${name}.json no coincide con su checksum: respaldo corrupto.`);
    const documents = readBackupFile(filePath);
    if (!Array.isArray(documents) || documents.length !== entry.count) {
      fail(`${name}.json tiene ${documents.length} documentos, el manifiesto espera ${entry.count}.`);
    }
    if (entry.contentSha256 && contentChecksum(documents) !== entry.contentSha256) {
      fail(`${name}.json cambió de contenido respecto al manifiesto: respaldo corrupto.`);
    }
    total += documents.length;
  }
  return { collections: Object.keys(manifest.collections || {}).length, documents: total };
}

async function mongodumpBackup(uri, targetDir) {
  const dump = spawnSync("mongodump", [
    `--uri=${uri}`,
    `--archive=${path.join(targetDir, "dump.archive")}`,
    "--gzip"
  ], { encoding: "utf8" });
  if (dump.error || dump.status !== 0) {
    log("  mongodump no disponible o falló; usando respaldo JSON verificable.");
    return null;
  }
  const mongoose = await connectMongoose(uri);
  const collections = {};
  let schemaVersion = null;
  try {
    schemaVersion = await schemaVersionOf(mongoose.connection.db);
    for (const collection of await mongoose.connection.db.collections()) {
      collections[collection.collectionName] = await collection.countDocuments({});
    }
  } finally {
    await mongoose.disconnect();
  }
  const manifest = {
    mode: "mongodump",
    createdAt: new Date().toISOString(),
    database: databaseNameFromUri(uri),
    source: redactUri(uri),
    schemaVersion,
    archive: "dump.archive",
    sha256: sha256(path.join(targetDir, "dump.archive")),
    bytes: fs.statSync(path.join(targetDir, "dump.archive")).size,
    collections
  };
  fs.writeFileSync(path.join(targetDir, "manifest.json"), JSON.stringify(manifest, null, 2));
  return manifest;
}

async function verifyMongodumpBackup(targetDir) {
  const manifestPath = path.join(targetDir, "manifest.json");
  if (!fs.existsSync(manifestPath)) fail("El respaldo no tiene manifest.json: no verificable.");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const archive = path.join(targetDir, manifest.archive || "dump.archive");
  if (!fs.existsSync(archive)) fail("Falta dump.archive en el respaldo.");
  if (manifest.bytes && fs.statSync(archive).size !== manifest.bytes) {
    fail("dump.archive cambió de tamaño respecto al manifiesto.");
  }
  if (sha256(archive) !== manifest.sha256) fail("dump.archive no coincide con su checksum: respaldo corrupto.");
  return { collections: Object.keys(manifest.collections || {}).length, documents: Object.values(manifest.collections || {}).reduce((a, b) => a + b, 0) };
}

/** Sella el manifiesto como verificado: las migraciones exigen esta marca. */
function stampVerification(targetDir, result) {
  const manifestPath = path.join(targetDir, "manifest.json");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  manifest.verifiedAt = new Date().toISOString();
  manifest.verifiedCollections = result.collections;
  manifest.verifiedDocuments = result.documents;
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  return manifest;
}

/** Ruta legible: relativa dentro del repositorio, absoluta fuera de él. */
function displayPath(target) {
  const relative = path.relative(ROOT, target);
  return relative.startsWith("..") ? target : relative;
}

/**
 * `--out <directorio>` fija dónde se escribe el respaldo (volumen montado,
 * ruta de un runner, disco externo). Sin la bandera se usa `backups/` con
 * marca de tiempo, como hasta ahora.
 */
async function runBackup(options = {}) {
  const uri = loadUri();
  const requested = typeof options.out === "string" && options.out.trim() ? options.out.trim() : "";
  const targetDir = requested
    ? path.resolve(requested)
    : path.join(BACKUPS_ROOT, `kronos-backup-${timestamp()}`);

  if (fs.existsSync(path.join(targetDir, "manifest.json"))) {
    fail(`${displayPath(targetDir)} ya contiene un respaldo. Usa otro directorio para no mezclar dos copias.`);
  }

  fs.mkdirSync(targetDir, { recursive: true });
  log(`Respaldo de ${databaseNameFromUri(uri)} → ${displayPath(targetDir)}`);
  const mongodumpManifest = await mongodumpBackup(uri, targetDir);
  let result;
  if (mongodumpManifest) {
    result = await verifyMongodumpBackup(targetDir);
    log(`Verificado (mongodump): ${result.collections} colecciones, ${result.documents} documentos.`);
  } else {
    await jsonBackup(uri, targetDir);
    result = await verifyJsonBackup(targetDir);
    log(`Verificado (ejson+sha256): ${result.collections} colecciones, ${result.documents} documentos.`);
  }
  stampVerification(targetDir, result);
  log(`OK: ${displayPath(targetDir)}`);
}

async function runCheck(targetDir) {
  if (!targetDir) fail("Uso: node scripts/backup-verify.js --check <directorio>");
  const absolute = path.resolve(targetDir);
  if (!fs.existsSync(absolute)) fail(`No existe ${absolute}`);
  const manifestPath = path.join(absolute, "manifest.json");
  if (!fs.existsSync(manifestPath)) fail("El respaldo no tiene manifest.json: no verificable.");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  // Elegir por contrato, no por excepción: los verificadores terminan con
  // fail() ante corrupción. Intentar primero mongodump hacía imposible
  // comprobar JSON y un fallback podría ocultar un respaldo corrupto.
  let result;
  if (manifest.mode === "mongodump") result = await verifyMongodumpBackup(absolute);
  else if (manifest.mode === "json") result = await verifyJsonBackup(absolute);
  else fail("Modo de respaldo no soportado. Se requiere json o mongodump.");
  stampVerification(absolute, result);
  log(`OK: respaldo verificado (${result.collections} colecciones, ${result.documents} documentos).`);
}

/**
 * Restauración probada sobre una base AISLADA.
 *
 * Reglas duras:
 *   - Exige --target-uri explícita: nunca restaura sobre MONGODB_URI.
 *   - Si el destino coincide con el origen, aborta salvo --force-same-target.
 *   - Nunca ejecuta dropDatabase; como mucho vacía las colecciones que el
 *     propio respaldo contiene y solo con --drop-target-collections.
 *   - Al terminar compara conteos y checksums de contenido: si no cuadran,
 *     la restauración NO se declara correcta.
 */
async function runRestore(targetDir, options) {
  if (!targetDir) fail("Uso: node scripts/backup-verify.js --restore <directorio> --target-uri <uri>");
  const absolute = path.resolve(targetDir);
  const manifestPath = path.join(absolute, "manifest.json");
  if (!fs.existsSync(manifestPath)) fail("El respaldo no tiene manifest.json: no restaurable.");

  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  if (manifest.mode !== "json") {
    fail("La restauración automática solo cubre respaldos EJSON. Para mongodump usa mongorestore y verifica después con --check.");
  }

  const targetUri = options.targetUri;
  if (!targetUri || targetUri === true) fail("Falta --target-uri con una base aislada de pruebas.");

  const sourceDatabase = manifest.database;
  const targetDatabase = databaseNameFromUri(targetUri);

  if (targetDatabase === sourceDatabase && !options.forceSameTarget) {
    fail(
      `El destino (${targetDatabase}) coincide con el origen del respaldo. Restaura en una base aislada o usa --force-same-target con plena conciencia.`
    );
  }

  const mongoose = await connectMongoose(targetUri);
  const db = mongoose.connection.db;
  const restored = [];
  const problems = [];

  try {
    for (const [name, entry] of Object.entries(manifest.collections || {})) {
      const filePath = path.join(absolute, `${name}.json`);
      if (!fs.existsSync(filePath)) fail(`Falta ${name}.json en el respaldo.`);
      if (sha256(filePath) !== entry.sha256) fail(`${name}.json no coincide con su checksum: respaldo corrupto.`);

      const documents = readBackupFile(filePath);
      const collection = db.collection(name);
      const existing = await collection.countDocuments({});

      if (existing > 0) {
        if (!options.dropTargetCollections) {
          fail(`La colección ${name} del destino ya tiene ${existing} documentos. Usa --drop-target-collections para vaciarla antes de restaurar.`);
        }
        await collection.deleteMany({});
      }

      if (documents.length) await collection.insertMany(documents, { ordered: false });

      const count = await collection.countDocuments({});
      const readBack = await collection.find({}).toArray();
      const checksum = contentChecksum(readBack);
      const countOk = count === entry.count;
      const checksumOk = !entry.contentSha256 || checksum === entry.contentSha256;

      if (!countOk) problems.push(`${name}: ${count} documentos restaurados, el manifiesto espera ${entry.count}`);
      if (!checksumOk) problems.push(`${name}: el contenido restaurado no coincide con el checksum del respaldo`);

      restored.push({ collection: name, documents: count, countOk, checksumOk });
      log(`  ${name}: ${count} documentos (${countOk && checksumOk ? "coincide" : "DIFERENCIA"})`);
    }
  } finally {
    await mongoose.disconnect();
  }

  if (problems.length) fail(`Restauración NO verificada:\n  - ${problems.join("\n  - ")}`);

  const total = restored.reduce((sum, item) => sum + item.documents, 0);
  const proofPath = path.join(absolute, "restore-proof.json");
  fs.writeFileSync(
    proofPath,
    JSON.stringify(
      {
        restoredAt: new Date().toISOString(),
        sourceDatabase,
        targetDatabase,
        collections: restored,
        totalDocuments: total
      },
      null,
      2
    )
  );

  log(`OK: restauración verificada en ${targetDatabase} (${restored.length} colecciones, ${total} documentos).`);
  log(`Prueba guardada en ${path.relative(ROOT, proofPath)}`);
}

function parseOptions(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
    const next = argv[index + 1];
    options[key] = next && !next.startsWith("--") ? next : true;
  }
  return options;
}

async function main() {
  const argv = process.argv.slice(2);
  const options = parseOptions(argv);

  const checkIndex = argv.indexOf("--check");
  if (checkIndex !== -1) {
    await runCheck(argv[checkIndex + 1]);
    return;
  }

  const restoreIndex = argv.indexOf("--restore");
  if (restoreIndex !== -1) {
    await runRestore(argv[restoreIndex + 1], options);
    return;
  }

  await runBackup(options);
}

main().catch((error) => fail(error?.message || error));
