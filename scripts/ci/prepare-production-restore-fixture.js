#!/usr/bin/env node
/**
 * Construye el único fixture que ejercita el contrato real de
 * scripts/backup-verify.js en CI. Usa los nombres exactos exigidos por el
 * contrato, pero únicamente contra MongoDB loopback, sin credenciales y con
 * bases inicialmente vacías. Nunca acepta una URI de producción.
 */
const path = require("node:path");

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

function assertCiFixtureEnvironment(env = process.env) {
  if (env.CI !== "true" || env.NODE_ENV !== "test") {
    throw new Error("El fixture contractual exige CI=true y NODE_ENV=test.");
  }
}

function assertExactLocalUri(uri, expectedDatabase, label) {
  let parsed;
  try {
    parsed = new URL(String(uri || ""));
  } catch {
    throw new Error(`La URI ${label} no es válida.`);
  }
  if (parsed.protocol !== "mongodb:") throw new Error(`La URI ${label} debe usar mongodb://.`);
  if (!LOCAL_HOSTS.has(parsed.hostname)) throw new Error(`La URI ${label} debe apuntar a loopback.`);
  if (parsed.username || parsed.password) throw new Error(`La URI ${label} no puede contener credenciales.`);
  const database = decodeURIComponent(parsed.pathname.replace(/^\//, ""));
  if (database !== expectedDatabase) {
    throw new Error(`La URI ${label} debe apuntar exactamente a "${expectedDatabase}", no a "${database}".`);
  }
  return database;
}

async function assertDatabaseEmpty(connection, label) {
  const collections = await connection.db.listCollections({}, { nameOnly: true }).toArray();
  if (collections.length) {
    throw new Error(`${label} no está vacía: ${collections.map((item) => item.name).join(", ")}.`);
  }
}

async function main() {
  assertCiFixtureEnvironment();
  const sourceUri = process.env.MONGODB_URI;
  const targetUri = process.env.MONGODB_TARGET_URI;
  assertExactLocalUri(sourceUri, "kronos-space-com", "de origen");
  assertExactLocalUri(targetUri, "kronos_restore", "de target");

  const mongoose = requireWorkspaceModule("mongoose");
  const source = await mongoose.createConnection(sourceUri, {
    serverSelectionTimeoutMS: 15000,
    autoIndex: false,
    autoCreate: false
  }).asPromise();
  const target = await mongoose.createConnection(targetUri, {
    serverSelectionTimeoutMS: 15000,
    autoIndex: false,
    autoCreate: false
  }).asPromise();

  try {
    if (source.db.databaseName !== "kronos-space-com" || target.db.databaseName !== "kronos_restore") {
      throw new Error("MongoDB conectó a una base distinta de la declarada en las URIs del fixture.");
    }
    await assertDatabaseEmpty(source, "La fuente contractual");
    await assertDatabaseEmpty(target, "El target contractual");

    const collection = source.db.collection("ci_restore_contract_fixture");
    await collection.insertMany([
      {
        _id: "contract-fixture-1",
        category: "alpha",
        sequence: 1,
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
        nested: { valid: true, tags: ["ci", "restore"] }
      },
      {
        _id: "contract-fixture-2",
        category: "beta",
        sequence: 2,
        createdAt: new Date("2026-01-02T00:00:00.000Z"),
        nested: { valid: true, tags: ["local", "ephemeral"] }
      }
    ]);
    await collection.createIndex({ category: 1, sequence: -1 }, {
      name: "category_sequence_contract",
      unique: true
    });
    process.stdout.write("OK: fixture local kronos-space-com listo; kronos_restore permanece vacío.\n");
  } finally {
    await Promise.allSettled([source.close(), target.close()]);
  }
}

if (require.main === module) {
  main().catch((error) => {
    process.stderr.write(`CI_FIXTURE_FAIL: ${error?.message || error}\n`);
    process.exit(1);
  });
}

module.exports = { assertCiFixtureEnvironment, assertExactLocalUri };
