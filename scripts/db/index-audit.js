#!/usr/bin/env node
/**
 * FASE 6 — auditoría de índices con explain() sobre consultas reales.
 *
 *   node scripts/db/index-audit.js
 *   node scripts/db/index-audit.js --verbose
 *
 * Las consultas auditadas son exactamente las formas que ejecuta la API
 * (feed, perfil, tema, vertical, bandeja, notificaciones, historial de
 * Kairos…). Para cada una se comprueba el plan ganador:
 *
 *   COLLSCAN            → no hay índice utilizable (fallo)
 *   SORT en memoria     → el índice no cubre el orden (aviso)
 *   IXSCAN              → correcto
 *
 * Salida 1 si alguna consulta crítica termina en COLLSCAN.
 */

const path = require("node:path");

const { EXIT, ROOT, parseArgs, run, writeReport } = require("./_bootstrap");

const { criticalQueries } = require(path.join(ROOT, "server", "src", "db", "criticalQueries"));

/** Recorre el árbol del plan buscando etapas concretas. */
function collectStages(stage, found = []) {
  if (!stage || typeof stage !== "object") return found;
  if (stage.stage) found.push(stage.stage);
  if (stage.inputStage) collectStages(stage.inputStage, found);
  if (Array.isArray(stage.inputStages)) for (const child of stage.inputStages) collectStages(child, found);
  if (stage.queryPlan) collectStages(stage.queryPlan, found);
  return found;
}

function indexNamesOf(stage, found = []) {
  if (!stage || typeof stage !== "object") return found;
  if (stage.indexName) found.push(stage.indexName);
  if (stage.inputStage) indexNamesOf(stage.inputStage, found);
  if (Array.isArray(stage.inputStages)) for (const child of stage.inputStages) indexNamesOf(child, found);
  if (stage.queryPlan) indexNamesOf(stage.queryPlan, found);
  return found;
}

async function explainQuery(db, query) {
  const collection = db.collection(query.collection);
  // Una colección vacía no demuestra nada: el planificador puede elegir
  // cualquier plan sin coste. Se informa, pero no se convierte en fallo.
  const documents = await collection.estimatedDocumentCount();

  const cursor = collection.find(query.filter, {
    projection: query.projection,
    sort: query.sort,
    limit: query.limit || 20
  });

  const explained = await cursor.explain("executionStats");
  const winning = explained.queryPlanner?.winningPlan || {};
  const stages = collectStages(winning);
  const indexes = [...new Set(indexNamesOf(winning))];
  const execution = explained.executionStats || {};

  return {
    id: query.id,
    collection: query.collection,
    description: query.description,
    severity: query.severity || "critical",
    empty: documents === 0,
    collectionDocuments: documents,
    stages,
    indexes,
    collscan: stages.includes("COLLSCAN"),
    inMemorySort: stages.includes("SORT"),
    documentsExamined: execution.totalDocsExamined ?? null,
    keysExamined: execution.totalKeysExamined ?? null,
    returned: execution.nReturned ?? null,
    millis: execution.executionTimeMillis ?? null
  };
}

async function main() {
  const { flags } = parseArgs();

  return run(async ({ db, redactedUri }) => {
    const queries = criticalQueries();
    const existing = (await db.listCollections({}, { nameOnly: true }).toArray()).map((item) => item.name);
    const results = [];

    for (const query of queries) {
      if (!existing.includes(query.collection)) {
        results.push({ id: query.id, collection: query.collection, skipped: true, reason: "colección inexistente" });
        continue;
      }
      results.push(await explainQuery(db, query));
    }

    const failures = results.filter(
      (result) => !result.skipped && !result.empty && result.collscan && result.severity === "critical"
    );
    const warnings = results.filter(
      (result) => !result.skipped && (result.empty || result.inMemorySort || (result.collscan && result.severity !== "critical"))
    );

    process.stdout.write(`\nAuditoría de índices — ${db.databaseName}\n`);

    for (const result of results) {
      if (result.skipped) {
        process.stdout.write(`  [omitida] ${result.id} (${result.reason})\n`);
        continue;
      }

      const state = result.empty
        ? "SIN DATOS"
        : result.collscan
          ? (result.severity === "critical" ? "COLLSCAN" : "collscan")
          : result.inMemorySort ? "SORT-MEM" : "IXSCAN";
      const index = result.indexes.length ? ` · ${result.indexes.join(", ")}` : "";
      const cost = ` · examinados ${result.documentsExamined} → devueltos ${result.returned} en ${result.millis} ms`;
      process.stdout.write(`  [${state.padEnd(8)}] ${result.id}${index}${cost}\n`);

      if (flags.verbose) process.stdout.write(`             etapas: ${result.stages.join(" → ")}\n`);
    }

    process.stdout.write(`\nConsultas: ${results.length} · COLLSCAN críticos: ${failures.length} · avisos: ${warnings.length}\n`);

    const file = writeReport(`index-audit-${new Date().toISOString().replace(/[:.]/g, "-")}.json`, {
      generatedAt: new Date().toISOString(),
      database: db.databaseName,
      source: redactedUri,
      results
    });

    process.stdout.write(`Informe: ${file}\n`);

    return failures.length ? EXIT.FAILURE : EXIT.OK;
  });
}

main();
