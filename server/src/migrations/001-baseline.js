/**
 * 001 — línea base verificable del esquema.
 *
 * No modifica ni un solo documento de la aplicación: fotografía el estado
 * real (colecciones, conteos, tamaños, índices y versión del código) y lo
 * guarda en `kronos_schema_baseline`. Sin esta foto, ninguna migración
 * posterior puede demostrar el "antes" que exige el plan maestro.
 */

const { listCollections, knownCollectionNames } = require("../db/registry");

const BASELINE_COLLECTION = "kronos_schema_baseline";

async function collectionSnapshot(db, name) {
  const collection = db.collection(name);

  const [count, indexes, stats] = await Promise.all([
    collection.countDocuments({}),
    collection.listIndexes().toArray().catch(() => []),
    db
      .command({ collStats: name })
      .then((result) => ({
        size: result.size || 0,
        storageSize: result.storageSize || 0,
        totalIndexSize: result.totalIndexSize || 0,
        avgObjSize: result.avgObjSize || 0
      }))
      .catch(() => null)
  ]);

  return {
    collection: name,
    documents: count,
    indexes: indexes.map((index) => ({
      name: index.name,
      key: index.key,
      unique: Boolean(index.unique),
      sparse: Boolean(index.sparse),
      expireAfterSeconds: index.expireAfterSeconds,
      partialFilterExpression: index.partialFilterExpression || null
    })),
    stats
  };
}

async function buildSnapshot(ctx) {
  const { db } = ctx;
  const existing = (await db.listCollections({}, { nameOnly: true }).toArray()).map((item) => item.name);
  const declared = knownCollectionNames();

  const collections = [];
  for (const name of declared) {
    if (!existing.includes(name)) {
      collections.push({ collection: name, documents: 0, indexes: [], stats: null, absent: true });
      continue;
    }
    collections.push(await collectionSnapshot(db, name));
  }

  const undeclared = existing
    .filter((name) => !declared.includes(name))
    .filter((name) => !name.startsWith("kronos_") && !name.startsWith("system."));

  return {
    takenAt: new Date(),
    database: db.databaseName,
    declaredCollections: declared.length,
    collections,
    undeclaredCollections: undeclared,
    totals: {
      documents: collections.reduce((sum, item) => sum + item.documents, 0),
      indexes: collections.reduce((sum, item) => sum + item.indexes.length, 0)
    }
  };
}

module.exports = {
  version: 1,
  name: "001-baseline",
  description:
    "Registra la línea base del esquema (colecciones, conteos, tamaños e índices) sin tocar datos de la aplicación.",
  requiresBackup: false,
  idempotent: true,
  rollback: "Eliminar el snapshot de kronos_schema_baseline creado por esta versión. No afecta datos de la aplicación.",

  async precondition(ctx) {
    const models = listCollections();
    if (!models.length) {
      return { ok: false, reason: "El registro de colecciones está vacío" };
    }
    if (!ctx.db?.databaseName) {
      return { ok: false, reason: "Sin conexión a MongoDB" };
    }
    return { ok: true };
  },

  async up(ctx) {
    const snapshot = await buildSnapshot(ctx);

    ctx.log(
      `línea base: ${snapshot.collections.length} colecciones, ${snapshot.totals.documents} documentos, ${snapshot.totals.indexes} índices`
    );

    if (snapshot.undeclaredCollections.length) {
      ctx.log(`colecciones no declaradas en el registro: ${snapshot.undeclaredCollections.join(", ")}`);
    }

    if (!ctx.dryRun) {
      await ctx.db.collection(BASELINE_COLLECTION).insertOne({ version: 1, ...snapshot });
    }

    return {
      database: snapshot.database,
      collections: snapshot.collections.length,
      documents: snapshot.totals.documents,
      indexes: snapshot.totals.indexes,
      undeclaredCollections: snapshot.undeclaredCollections,
      perCollection: snapshot.collections.map((item) => ({
        collection: item.collection,
        documents: item.documents,
        indexes: item.indexes.length
      }))
    };
  },

  async down(ctx) {
    if (ctx.dryRun) return { removed: 0, dryRun: true };
    const result = await ctx.db.collection(BASELINE_COLLECTION).deleteMany({ version: 1 });
    ctx.log(`snapshots de línea base eliminados: ${result.deletedCount}`);
    return { removed: result.deletedCount };
  },

  BASELINE_COLLECTION,
  buildSnapshot
};
