const crypto = require("node:crypto");
const mongoose = require("mongoose");
const { assertE2ETarget } = require("./e2e-target-guard");

const E2E_DATABASE = "test";
const PROTECTED_DATABASES = new Set([
  "kronos-space-com",
  "kronos_restore",
  "kronos_social_ai"
]);

function makeRunId() {
  return (
    process.env.KRONOS_E2E_RUN_ID?.trim() ||
    `${process.pid}-${Date.now()}-${crypto.randomBytes(6).toString("hex")}`
  );
}

const e2eRunId = makeRunId();
let state = null;

function uriForE2E() {
  const uri = process.env.KRONOS_E2E_MONGODB_URI?.trim();
  if (!uri) {
    throw new Error("E2E_TARGET_BLOCKED: falta KRONOS_E2E_MONGODB_URI");
  }
  return uri;
}

async function snapshotDatabase(db) {
  const collections = await db.collections();
  const baseline = new Map();
  for (const collection of collections) {
    const ids = await collection.find({}, { projection: { _id: 1 } }).toArray();
    baseline.set(collection.collectionName, ids.map(({ _id }) => _id));
  }
  return baseline;
}

async function connectE2E() {
  if (state) return state;

  const uri = uriForE2E();
  const allowed = assertE2ETarget({
    uri,
    dbName: E2E_DATABASE,
    env: {
      ...process.env,
      MONGODB_URI: uri
    }
  });
  if (!allowed) {
    throw new Error("E2E_TARGET_BLOCKED: el destino E2E no fue demostrado");
  }

  const connection = await mongoose.connect(uri, {
    dbName: E2E_DATABASE,
    serverSelectionTimeoutMS: 15000
  });

  const databaseName = connection.connection.db.databaseName;
  if (PROTECTED_DATABASES.has(databaseName) || databaseName !== E2E_DATABASE) {
    await mongoose.disconnect().catch(() => {});
    throw new Error(
      `E2E_TARGET_BLOCKED: la base efectiva "${databaseName}" no es exactamente "${E2E_DATABASE}"`
    );
  }

  const baseline = await snapshotDatabase(connection.connection.db);
  // Los modelos cargados por las suites pueden crear su colección al primer
  // acceso. Se registran ahora como colecciones protegidas, incluso si aún
  // están vacías, para que la limpieza nunca elimine una colección de `test`
  // por haber sido materializada durante la ejecución.
  for (const model of Object.values(mongoose.models)) {
    if (model.collection?.name && !baseline.has(model.collection.name)) {
      baseline.set(model.collection.name, []);
    }
  }

  state = {
    connection: connection.connection,
    db: connection.connection.db,
    baseline,
    runId: e2eRunId
  };
  return state;
}

/**
 * El snapshot constituye el registro de IDs que no pertenecían a esta
 * ejecución. Al finalizar solo se eliminan los IDs nuevos; nunca se usa una
 * limpieza global. Esto también cubre documentos secundarios creados por las
 * rutas de la aplicación en colecciones conocidas.
 */
async function clearNewDocuments() {
  if (!state) return;
  const currentCollections = await state.db.collections();
  for (const collection of currentCollections) {
    const baselineIds = state.baseline.get(collection.collectionName);
    if (baselineIds === undefined) {
      await state.db.dropCollection(collection.collectionName).catch(() => {});
      continue;
    }
    await collection.deleteMany({ _id: { $nin: baselineIds } });
  }
  state.baseline = await snapshotDatabase(state.db);
}

async function cleanupE2E() {
  if (!state) return;
  await clearNewDocuments();
  await mongoose.disconnect();
  state = null;
}

function assertE2EDatabaseName(name) {
  if (String(name) !== E2E_DATABASE || PROTECTED_DATABASES.has(String(name))) {
    throw new Error(
      `E2E_TARGET_BLOCKED: la base E2E debe ser "${E2E_DATABASE}" y nunca una base protegida`
    );
  }
  return true;
}

module.exports = {
  E2E_DATABASE,
  PROTECTED_DATABASES,
  e2eRunId,
  connectE2E,
  cleanupE2E,
  clearNewDocuments,
  assertE2EDatabaseName
};
