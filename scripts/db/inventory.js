#!/usr/bin/env node
/**
 * FASE 1 — inventario de la base de datos real.
 *
 *   node scripts/db/inventory.js            # informe en consola + JSON
 *   node scripts/db/inventory.js --json     # solo la ruta del informe
 *
 * Informa, por colección: documentos, tamaño, tamaño de índices, índices
 * declarados, índices redundantes, índices que faltan respecto al plan y
 * campos presentes que el esquema ya no declara.
 *
 * Nunca imprime credenciales ni contenido de documentos: solo metadatos.
 */

const path = require("node:path");

const { EXIT, ROOT, parseArgs, run, writeReport } = require("./_bootstrap");

const { listCollections, knownCollectionNames } = require(path.join(ROOT, "server", "src", "db", "registry"));
const { desiredIndexes, diffIndexes, findRedundantIndexes, keySignature } = require(path.join(ROOT, "server", "src", "db", "indexPlan"));

/** Campos de primer nivel declarados por el esquema del modelo. */
function schemaFields(Model) {
  return new Set(Object.keys(Model.schema.paths).map((path_) => path_.split(".")[0]));
}

async function collectionStats(db, name) {
  try {
    const stats = await db.command({ collStats: name });
    return {
      sizeBytes: stats.size || 0,
      storageBytes: stats.storageSize || 0,
      indexBytes: stats.totalIndexSize || 0,
      avgDocumentBytes: Math.round(stats.avgObjSize || 0)
    };
  } catch {
    return null;
  }
}

async function unknownFields(db, name, known, sampleSize) {
  const documents = await db.collection(name).find({}, { limit: sampleSize }).toArray();
  const counter = new Map();

  for (const document of documents) {
    for (const key of Object.keys(document)) {
      if (key === "_id" || key === "__v" || known.has(key)) continue;
      counter.set(key, (counter.get(key) || 0) + 1);
    }
  }

  return [...counter.entries()].map(([field, count]) => ({ field, count })).sort((a, b) => b.count - a.count);
}

async function main() {
  const { flags } = parseArgs();
  const sampleSize = Number(flags.sample) > 0 ? Number(flags.sample) : 500;

  return run(async ({ db, redactedUri }) => {
    const plan = desiredIndexes();
    const entries = listCollections();
    const existingNames = (await db.listCollections({}, { nameOnly: true }).toArray()).map((item) => item.name);

    const report = {
      generatedAt: new Date().toISOString(),
      database: db.databaseName,
      source: redactedUri,
      collections: [],
      undeclaredCollections: existingNames.filter(
        (name) => !knownCollectionNames().includes(name) && !name.startsWith("system.")
      ),
      totals: { documents: 0, sizeBytes: 0, indexBytes: 0, indexes: 0, missingIndexes: 0, redundantIndexes: 0 }
    };

    for (const entry of entries) {
      const present = existingNames.includes(entry.collection);
      const documents = present ? await db.collection(entry.collection).countDocuments({}) : 0;
      const indexes = present ? await db.collection(entry.collection).listIndexes().toArray() : [];
      const stats = present ? await collectionStats(db, entry.collection) : null;
      const desired = plan.get(entry.collection) || [];
      const { missing, conflicting, unknown } = diffIndexes(indexes, desired);
      const redundant = findRedundantIndexes(
        indexes
          .filter((index) => index.name !== "_id_")
          .map((index) => ({ collection: entry.collection, name: index.name, key: index.key, options: index }))
      );

      const item = {
        collection: entry.collection,
        model: entry.model,
        domain: entry.domain,
        purpose: entry.purpose,
        sensitive: entry.sensitive,
        retention: entry.retention,
        present,
        documents,
        stats,
        indexes: indexes.map((index) => ({
          name: index.name,
          key: keySignature(index.key),
          unique: Boolean(index.unique),
          ttlSeconds: index.expireAfterSeconds ?? null,
          partial: Boolean(index.partialFilterExpression)
        })),
        missingIndexes: missing.map((index) => ({ name: index.name, key: keySignature(index.key) })),
        conflictingIndexes: conflicting.map((index) => ({
          name: index.existingName,
          existing: index.existingOptions,
          desired: index.desiredOptions
        })),
        unknownIndexes: unknown.map((index) => ({ name: index.name, key: index.signature })),
        redundantIndexes: redundant.map((index) => ({ name: index.name, supersededBy: index.supersededBy })),
        unknownFields: present ? await unknownFields(db, entry.collection, schemaFields(entry.Model), sampleSize) : []
      };

      report.collections.push(item);
      report.totals.documents += documents;
      report.totals.sizeBytes += stats?.sizeBytes || 0;
      report.totals.indexBytes += stats?.indexBytes || 0;
      report.totals.indexes += indexes.length;
      report.totals.missingIndexes += missing.length;
      report.totals.redundantIndexes += redundant.length;
    }

    const file = writeReport(`inventory-${new Date().toISOString().slice(0, 10)}.json`, report);

    if (!flags.json) {
      process.stdout.write(`\nInventario de ${report.database}\n`);
      process.stdout.write(`${"colección".padEnd(22)}${"docs".padStart(9)}${"tamaño".padStart(12)}${"índices".padStart(9)}${"faltan".padStart(8)}${"redund.".padStart(9)}\n`);

      for (const item of report.collections) {
        process.stdout.write(
          `${item.collection.padEnd(22)}${String(item.documents).padStart(9)}${String(item.stats?.sizeBytes ?? 0).padStart(12)}${String(item.indexes.length).padStart(9)}${String(item.missingIndexes.length).padStart(8)}${String(item.redundantIndexes.length).padStart(9)}\n`
        );
      }

      process.stdout.write(
        `\nTotales: ${report.totals.documents} documentos, ${report.totals.indexes} índices, ${report.totals.missingIndexes} por crear, ${report.totals.redundantIndexes} redundantes.\n`
      );

      if (report.undeclaredCollections.length) {
        process.stdout.write(`Colecciones no declaradas en el registro: ${report.undeclaredCollections.join(", ")}\n`);
      }
    }

    process.stdout.write(`Informe: ${file}\n`);
    return EXIT.OK;
  });
}

main();
