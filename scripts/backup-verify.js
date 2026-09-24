/**
 * FASE 0 (restos) — respaldo verificable.
 *
 * Dos modos:
 *   1. mongodump (preferido): volcado .bson.gz por colección +
 *      manifiesto con conteos vivos; verificación de archivos.
 *   2. JSON (fallback sin herramientas): exportación por colección +
 *      manifiesto con conteos y SHA-256 de cada archivo; verificación
 *      releyendo cada archivo.
 *
 * Uso:
 *   node scripts/backup-verify.js              # crea y verifica
 *   node scripts/backup-verify.js --check DIR  # verifica un respaldo previo
 *
 * Requiere MONGODB_URI (server/.env). Sale con código 1 si algo falla:
 * un respaldo que no se puede verificar no cuenta como respaldo.
 */
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { spawnSync } = require("node:child_process");

const ROOT = path.join(__dirname, "..");
const BACKUPS_ROOT = path.join(ROOT, "backups");

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
  requireServerModule("dotenv").config({ path: path.join(ROOT, "server", ".env") });
} catch {
  loadEnvFile(path.join(ROOT, "server", ".env"));
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

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

async function jsonBackup(uri, targetDir) {
  const mongoose = await connectMongoose(uri);
  const manifest = {
    mode: "json",
    createdAt: new Date().toISOString(),
    database: databaseNameFromUri(uri),
    collections: {}
  };
  try {
    const collections = await mongoose.connection.db.collections();
    for (const collection of collections) {
      const documents = await collection.find({}).toArray();
      const filePath = path.join(targetDir, `${collection.collectionName}.json`);
      fs.writeFileSync(filePath, JSON.stringify(documents));
      manifest.collections[collection.collectionName] = {
        count: documents.length,
        sha256: sha256(filePath),
        bytes: fs.statSync(filePath).size
      };
      log(`  ${collection.collectionName}: ${documents.length} documentos`);
    }
    fs.writeFileSync(path.join(targetDir, "manifest.json"), JSON.stringify(manifest, null, 2));
  } finally {
    await mongoose.disconnect();
  }
  return manifest;
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
    const documents = JSON.parse(fs.readFileSync(filePath, "utf8"));
    if (!Array.isArray(documents) || documents.length !== entry.count) {
      fail(`${name}.json tiene ${documents.length} documentos, el manifiesto espera ${entry.count}.`);
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
  try {
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

async function runBackup() {
  const uri = loadUri();
  const targetDir = path.join(BACKUPS_ROOT, `kronos-backup-${timestamp()}`);
  fs.mkdirSync(targetDir, { recursive: true });
  log(`Respaldo de ${databaseNameFromUri(uri)} → ${path.relative(ROOT, targetDir)}`);
  const mongodumpManifest = await mongodumpBackup(uri, targetDir);
  if (mongodumpManifest) {
    const result = await verifyMongodumpBackup(targetDir);
    log(`Verificado (mongodump): ${result.collections} colecciones, ${result.documents} documentos.`);
  } else {
    await jsonBackup(uri, targetDir);
    const result = await verifyJsonBackup(targetDir);
    log(`Verificado (json+sha256): ${result.collections} colecciones, ${result.documents} documentos.`);
  }
  log(`OK: ${path.relative(ROOT, targetDir)}`);
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
  log(`OK: respaldo verificado (${result.collections} colecciones, ${result.documents} documentos).`);
}

async function main() {
  const checkIndex = process.argv.indexOf("--check");
  if (checkIndex !== -1) {
    await runCheck(process.argv[checkIndex + 1]);
    return;
  }
  await runBackup();
}

main().catch((error) => fail(error?.message || error));
