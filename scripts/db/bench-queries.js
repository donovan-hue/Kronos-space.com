#!/usr/bin/env node
/**
 * FASE 11 — explain() con datos y medición ANTES/DESPUÉS.
 *
 *   node scripts/db/bench-queries.js --samples 30
 *   node scripts/db/bench-queries.js --samples 15 --max-ratio 40
 *
 * Un `explain()` sobre una colección vacía no demuestra nada: cualquier plan
 * examina cero documentos y tarda cero milisegundos. Esta herramienta exige
 * datos y mide dos veces la MISMA consulta sobre los MISMOS documentos:
 *
 *   ANTES   → `hint({ $natural: 1 })`, que fuerza recorrido completo y
 *             ordenación en memoria: el comportamiento previo a la
 *             migración 004-indexes.
 *   DESPUÉS → el planificador elige libremente entre los índices creados.
 *
 * De cada consulta registra plan ganador, etapas, índice usado, documentos y
 * claves examinadas, devueltos, y los percentiles p50/p95/p99 de una serie de
 * ejecuciones reales. Un promedio esconde la cola; los percentiles no.
 *
 * Falla (código 1) si una consulta crítica sigue en COLLSCAN con índices
 * disponibles, si la relación documentos examinados / devueltos supera el
 * umbral, o si la colección está vacía (sin datos no hay evidencia).
 */

const { EXIT, parseArgs, run, writeReport, requireServerModule } = require("./_bootstrap");

const { criticalQueries, analyzeQueryCoverage } = require("../../server/src/db/criticalQueries");

const DEFAULT_SAMPLES = 25;
const DEFAULT_WARMUP = 3;
const DEFAULT_LIMIT = 20;
const DEFAULT_MAX_RATIO = 25;

/** Recorre el árbol del plan y devuelve las etapas en orden externo→interno. */
function planNodes(node, out = []) {
  if (!node || typeof node !== "object") return out;

  const stage = node.stage || node.type;
  if (stage) out.push({ stage, indexName: node.indexName || null });

  for (const key of ["queryPlan", "inputStage", "child"]) {
    if (node[key]) planNodes(node[key], out);
  }
  for (const key of ["inputStages", "children", "shards"]) {
    if (Array.isArray(node[key])) node[key].forEach((item) => planNodes(item, out));
  }

  return out;
}

function summarizePlan(explain) {
  const winning = explain?.queryPlanner?.winningPlan || {};
  const nodes = planNodes(winning);
  const stats = explain?.executionStats || {};

  return {
    stages: nodes.map((node) => node.stage),
    stageChain: nodes.map((node) => node.stage).join(" ← ") || "desconocido",
    indexUsed: nodes.find((node) => node.indexName)?.indexName || null,
    collscan: nodes.some((node) => node.stage === "COLLSCAN"),
    sortInMemory: nodes.some((node) => node.stage === "SORT"),
    nReturned: stats.nReturned ?? 0,
    docsExamined: stats.totalDocsExamined ?? 0,
    keysExamined: stats.totalKeysExamined ?? 0,
    executionTimeMillis: stats.executionTimeMillis ?? 0,
    rejectedPlans: (explain?.queryPlanner?.rejectedPlans || []).length
  };
}

function percentile(sorted, p) {
  if (!sorted.length) return 0;
  const rank = (p / 100) * (sorted.length - 1);
  const low = Math.floor(rank);
  const high = Math.ceil(rank);
  if (low === high) return sorted[low];
  return sorted[low] + (sorted[high] - sorted[low]) * (rank - low);
}

function round(value, decimals = 2) {
  return Number(value.toFixed(decimals));
}

function buildCursor(db, query, { natural }) {
  const cursor = db
    .collection(query.collection)
    .find(query.filter, query.projection ? { projection: query.projection } : {});

  if (query.sort) cursor.sort(query.sort);
  cursor.limit(query.limit || DEFAULT_LIMIT);
  if (natural) cursor.hint({ $natural: 1 });

  return cursor;
}

async function measure(db, query, { natural, samples, warmup }) {
  const explain = await buildCursor(db, query, { natural }).explain("executionStats");
  const plan = summarizePlan(explain);

  for (let index = 0; index < warmup; index += 1) {
    await buildCursor(db, query, { natural }).toArray();
  }

  const durations = [];
  for (let index = 0; index < samples; index += 1) {
    const start = process.hrtime.bigint();
    await buildCursor(db, query, { natural }).toArray();
    durations.push(Number(process.hrtime.bigint() - start) / 1e6);
  }

  durations.sort((a, b) => a - b);

  return {
    ...plan,
    samples: durations.length,
    p50: round(percentile(durations, 50), 3),
    p95: round(percentile(durations, 95), 3),
    p99: round(percentile(durations, 99), 3),
    min: round(durations[0] ?? 0, 3),
    max: round(durations[durations.length - 1] ?? 0, 3),
    mean: round(durations.reduce((total, value) => total + value, 0) / (durations.length || 1), 3)
  };
}

function changePercent(before, after) {
  if (!before) return null;
  return round(((after - before) / before) * 100, 1);
}

function table(rows, headers) {
  const widths = headers.map((header, column) =>
    Math.max(header.length, ...rows.map((row) => String(row[column] ?? "").length))
  );
  const line = (cells) => `| ${cells.map((cell, column) => String(cell ?? "").padEnd(widths[column])).join(" | ")} |`;

  return [
    line(headers),
    `|${widths.map((width) => "-".repeat(width + 2)).join("|")}|`,
    ...rows.map((row) => line(row))
  ].join("\n");
}

async function main({ db, redactedUri }) {
  const { flags } = parseArgs();
  const log = (message) => process.stdout.write(`${message}\n`);

  const samples = Number(flags.samples || DEFAULT_SAMPLES);
  const warmup = Number(flags.warmup || DEFAULT_WARMUP);
  const maxRatio = Number(flags.maxRatio || DEFAULT_MAX_RATIO);
  const allowEmpty = Boolean(flags.allowEmpty);

  if (!Number.isFinite(samples) || samples < 3) throw new Error("--samples debe ser >= 3.");

  const queries = criticalQueries();
  const coverage = new Map(analyzeQueryCoverage().map((item) => [item.id, item]));

  log(`Base: ${db.databaseName} (${redactedUri})`);
  log(`Muestras por consulta: ${samples} (calentamiento ${warmup}) · umbral examinados/devueltos: ${maxRatio}\n`);

  const counts = new Map();
  for (const name of new Set(queries.map((query) => query.collection))) {
    counts.set(name, await db.collection(name).countDocuments());
  }

  const results = [];
  const failures = [];
  const warnings = [];

  for (const query of queries) {
    const documents = counts.get(query.collection) ?? 0;

    if (documents === 0) {
      const detalle = `${query.id}: colección "${query.collection}" vacía — explain() sin datos no es evidencia.`;
      results.push({ id: query.id, collection: query.collection, severity: query.severity, status: "SIN DATOS", documents: 0 });
      if (allowEmpty) warnings.push(detalle);
      else failures.push(detalle);
      continue;
    }

    const after = await measure(db, query, { natural: false, samples, warmup });
    const before = await measure(db, query, { natural: true, samples, warmup });

    const expected = coverage.get(query.id)?.index || null;
    const docRatio = after.nReturned ? round(after.docsExamined / after.nReturned, 2) : null;
    const keyRatio = after.nReturned ? round(after.keysExamined / after.nReturned, 2) : null;

    const record = {
      id: query.id,
      collection: query.collection,
      description: query.description,
      severity: query.severity,
      documentsInCollection: documents,
      filter: JSON.stringify(query.filter),
      sort: query.sort ? JSON.stringify(query.sort) : null,
      limit: query.limit || DEFAULT_LIMIT,
      expectedIndex: expected,
      usedIndex: after.indexUsed,
      indexMatches: expected ? after.indexUsed === expected : null,
      after,
      before,
      docsExaminedRatio: docRatio,
      keysExaminedRatio: keyRatio,
      change: {
        p50: changePercent(before.p50, after.p50),
        p95: changePercent(before.p95, after.p95),
        p99: changePercent(before.p99, after.p99),
        docsExamined: changePercent(before.docsExamined, after.docsExamined),
        executionTimeMillis: changePercent(before.executionTimeMillis, after.executionTimeMillis)
      },
      status: "PASS"
    };

    if (after.collscan) {
      record.status = query.severity === "critical" ? "FAIL" : "WARNING";
      const detalle = `${query.id}: COLLSCAN sobre ${documents} documentos (índice esperado ${expected || "ninguno"}).`;
      if (query.severity === "critical") failures.push(detalle);
      else warnings.push(detalle);
    } else if (expected && after.indexUsed !== expected) {
      record.status = "WARNING";
      warnings.push(`${query.id}: índice usado "${after.indexUsed}" ≠ esperado "${expected}" (plan válido, revisar selectividad).`);
    }

    if (docRatio !== null && docRatio > maxRatio) {
      record.status = query.severity === "critical" ? "FAIL" : "WARNING";
      const detalle = `${query.id}: examina ${after.docsExamined} documentos para devolver ${after.nReturned} (relación ${docRatio} > ${maxRatio}).`;
      if (query.severity === "critical") failures.push(detalle);
      else warnings.push(detalle);
    }

    if (after.nReturned === 0) {
      record.status = record.status === "FAIL" ? "FAIL" : "WARNING";
      warnings.push(
        `${query.id}: la consulta no devuelve documentos sobre ${documents} de la colección; el plan es real pero la medición de tiempos pierde valor.`
      );
    }

    if (after.sortInMemory && !after.collscan) {
      warnings.push(`${query.id}: etapa SORT en memoria pese al índice (${after.stageChain}).`);
    }

    results.push(record);
  }

  const medidas = results.filter((item) => item.after);

  log("### Plan de ejecución con datos (DESPUÉS de los índices)\n");
  log(table(
    medidas.map((item) => [
      item.id,
      item.documentsInCollection,
      item.expectedIndex || "—",
      item.usedIndex || "COLLSCAN",
      item.after.stageChain,
      item.after.docsExamined,
      item.after.keysExamined,
      item.after.nReturned,
      item.after.executionTimeMillis,
      item.status
    ]),
    ["consulta", "docs col.", "índice esperado", "índice usado", "etapas", "docsExam", "keysExam", "nReturned", "execMs", "estado"]
  ));

  log("\n### Percentiles con datos reales\n");
  log(table(
    medidas.map((item) => [
      item.id,
      item.after.samples,
      item.after.p50,
      item.after.p95,
      item.after.p99,
      item.after.docsExamined,
      item.after.keysExamined
    ]),
    ["consulta", "muestras", "p50 ms", "p95 ms", "p99 ms", "docsExaminados", "keysExaminados"]
  ));

  log("\n### ANTES (recorrido completo) vs DESPUÉS (con índice)\n");
  log(table(
    medidas.map((item) => [
      item.id,
      item.before.p95,
      item.after.p95,
      item.change.p95 === null ? "—" : `${item.change.p95} %`,
      item.before.docsExamined,
      item.after.docsExamined,
      item.change.docsExamined === null ? "—" : `${item.change.docsExamined} %`
    ]),
    ["consulta", "p95 antes", "p95 después", "cambio p95", "docsExam antes", "docsExam después", "cambio docsExam"]
  ));

  const resumen = {
    generatedAt: new Date().toISOString(),
    database: db.databaseName,
    samples,
    warmup,
    maxRatio,
    totals: {
      queries: results.length,
      measured: medidas.length,
      pass: results.filter((item) => item.status === "PASS").length,
      warning: results.filter((item) => item.status === "WARNING").length,
      fail: results.filter((item) => item.status === "FAIL").length,
      withoutData: results.filter((item) => item.status === "SIN DATOS").length
    },
    failures,
    warnings,
    results
  };

  const file = writeReport("bench-queries.json", resumen);

  const mejoraDocs = medidas.length
    ? round(
      medidas.reduce((total, item) => total + (item.change.docsExamined ?? 0), 0) / medidas.length,
      1
    )
    : 0;

  log(`\nTotales: ${resumen.totals.measured} medidas · ${resumen.totals.pass} PASS · ${resumen.totals.warning} WARNING · ${resumen.totals.fail} FAIL · ${resumen.totals.withoutData} sin datos`);
  log(`Cambio medio de documentos examinados: ${mejoraDocs} %`);
  log(`Informe: ${file}`);

  if (warnings.length) {
    log("\nAvisos:");
    warnings.forEach((item) => log(`  - ${item}`));
  }

  if (failures.length) {
    process.stderr.write(`\nFALLOS (${failures.length}):\n${failures.map((item) => `  - ${item}`).join("\n")}\n`);
    return EXIT.FAILURE;
  }

  return EXIT.OK;
}

run(main);
