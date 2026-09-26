#!/usr/bin/env node
/**
 * FASE 5 — validación de datos (antes y después de migrar).
 *
 *   node scripts/db/validate-data.js
 *   node scripts/db/validate-data.js --only posts,users
 *   node scripts/db/validate-data.js --counts        # además, conteo por colección
 *
 * Códigos de salida:
 *   0 sin fallos críticos · 1 al menos una regla crítica incumplida
 *
 * Las advertencias no rompen la salida, pero se imprimen y quedan en el
 * informe JSON: el plan exige comparar "antes" y "después" con evidencia.
 */

const path = require("node:path");

const { EXIT, ROOT, parseArgs, run, writeReport } = require("./_bootstrap");

const { runIntegrityChecks } = require(path.join(ROOT, "server", "src", "db", "integrity"));
const { knownCollectionNames } = require(path.join(ROOT, "server", "src", "db", "registry"));

async function documentCounts(db) {
  const counts = {};
  const existing = (await db.listCollections({}, { nameOnly: true }).toArray()).map((item) => item.name);

  for (const name of knownCollectionNames()) {
    counts[name] = existing.includes(name) ? await db.collection(name).countDocuments({}) : 0;
  }

  return counts;
}

async function main() {
  const { flags } = parseArgs();
  const only = typeof flags.only === "string" ? flags.only.split(",").map((value) => value.trim()) : null;
  const label = typeof flags.label === "string" ? flags.label : "validacion";

  return run(async ({ db, redactedUri }) => {
    const { results, failedCritical, failedWarning, ok } = await runIntegrityChecks(db, { only });
    const counts = flags.counts ? await documentCounts(db) : null;

    process.stdout.write(`\nValidación de integridad — ${db.databaseName}\n`);

    for (const result of results) {
      const state = result.skipped ? "omitida" : result.ok ? "OK" : result.severity === "critical" ? "FALLO" : "aviso";
      const detail = result.detail ? ` — ${result.detail}` : "";
      process.stdout.write(`  [${state.padEnd(7)}] ${result.id}${detail}\n`);
    }

    process.stdout.write(
      `\nReglas: ${results.length} · críticas incumplidas: ${failedCritical} · avisos: ${failedWarning}\n`
    );

    if (counts) {
      process.stdout.write("\nDocumentos por colección:\n");
      for (const [collection, total] of Object.entries(counts)) {
        process.stdout.write(`  ${collection.padEnd(22)}${String(total).padStart(9)}\n`);
      }
    }

    const file = writeReport(`${label}-${new Date().toISOString().replace(/[:.]/g, "-")}.json`, {
      generatedAt: new Date().toISOString(),
      database: db.databaseName,
      source: redactedUri,
      failedCritical,
      failedWarning,
      counts,
      results
    });

    process.stdout.write(`Informe: ${file}\n`);

    return ok ? EXIT.OK : EXIT.FAILURE;
  });
}

main();
