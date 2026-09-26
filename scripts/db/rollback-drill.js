#!/usr/bin/env node
/**
 * FASE 15 — ensayo de rollback con evidencia comparativa.
 *
 *   node scripts/db/rollback-drill.js --backup backups/kronos-backup-XXXX
 *
 * "rollback command completed" no demuestra nada. Este ensayo recorre el
 * ciclo completo tomando una instantánea en cada parada y comparándolas:
 *
 *   1. inicial      → instantánea previa
 *   2. migrar       → migrate.js up --backup <dir>
 *   3. validar      → validate-data.js --counts
 *   4. rollback     → migrate.js down --to 0
 *   5. validar      → validate-data.js --counts
 *   6. reaplicar    → migrate.js up --backup <dir>
 *   7. validar      → validate-data.js --counts
 *
 * Una instantánea contiene, por colección, el número de documentos y la
 * lista de índices; además el diario de migraciones y el recuento de
 * incumplimientos de integridad por severidad.
 *
 * Invariantes que se exigen (incumplir cualquiera devuelve código 1):
 *   - Ninguna colección de datos cambia de número de documentos en ninguna
 *     etapa: migrar y deshacer no pueden perder ni inventar documentos.
 *   - Tras el rollback los índices vuelven exactamente al conjunto inicial.
 *   - Tras reaplicar, los índices coinciden exactamente con los de la
 *     primera aplicación: la migración es reproducible.
 *   - Los incumplimientos críticos de integridad no aumentan en ninguna etapa.
 *   - El diario queda vacío tras el rollback y completo tras reaplicar.
 */

const { spawnSync } = require("node:child_process");
const path = require("node:path");

const { EXIT, ROOT, parseArgs, run, writeReport } = require("./_bootstrap");
const { runIntegrityChecks } = require("../../server/src/db/integrity");

const INTERNAL_PREFIX = "kronos_";

function ejecutar(script, args, log) {
  const file = path.join(ROOT, "scripts", "db", script);
  const started = Date.now();
  const result = spawnSync(process.execPath, [file, ...args], {
    cwd: ROOT,
    encoding: "utf8",
    env: process.env,
    maxBuffer: 32 * 1024 * 1024
  });

  const salida = `${result.stdout || ""}${result.stderr || ""}`.trim();
  const ultimas = salida.split("\n").filter((line) => line.trim()).slice(-4);

  log(`  $ node scripts/db/${script} ${args.join(" ")} → salida ${result.status} (${Date.now() - started} ms)`);
  ultimas.forEach((line) => log(`      ${line}`));

  return { code: result.status, output: salida, tail: ultimas };
}

async function snapshot(db, label) {
  const names = (await db.listCollections({}, { nameOnly: true }).toArray())
    .map((item) => item.name)
    .filter((name) => !name.startsWith("system."))
    .sort();

  const collections = {};

  for (const name of names) {
    const indexes = await db.collection(name).listIndexes().toArray().catch(() => []);
    collections[name] = {
      documents: await db.collection(name).countDocuments(),
      indexes: indexes.map((index) => index.name).sort()
    };
  }

  const { results: integrity } = await runIntegrityChecks(db);
  const failed = integrity.filter((item) => !item.skipped && !item.ok);

  const journal = await db
    .collection("kronos_migrations")
    .find({}, { projection: { version: 1, name: 1, _id: 0 } })
    .sort({ version: 1 })
    .toArray()
    .catch(() => []);

  return {
    label,
    takenAt: new Date().toISOString(),
    collections,
    dataCollections: Object.fromEntries(
      Object.entries(collections).filter(([name]) => !name.startsWith(INTERNAL_PREFIX))
    ),
    totals: {
      collections: names.length,
      documents: Object.values(collections).reduce((total, item) => total + item.documents, 0),
      indexes: Object.values(collections).reduce((total, item) => total + item.indexes.length, 0)
    },
    integrity: {
      evaluated: integrity.filter((item) => !item.skipped).length,
      failed: failed.length,
      critical: failed.filter((item) => item.severity === "critical").length,
      warning: failed.filter((item) => item.severity === "warning").length,
      ids: failed.map((item) => `${item.id}:${item.count ?? 0}`)
    },
    journal: journal.map((item) => item.version)
  };
}

function indexSignature(snap) {
  return Object.entries(snap.collections)
    .filter(([name]) => !name.startsWith(INTERNAL_PREFIX))
    .map(([name, item]) => `${name}:${item.indexes.join(",")}`)
    .sort()
    .join("|");
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

  if (!flags.backup || flags.backup === true) {
    throw new Error(
      "Falta --backup <dir>: el ensayo aplica migraciones que exigen respaldo verificado. " +
      "Crea uno con scripts/backup-verify.js --out <dir> y verifícalo con --check <dir>."
    );
  }

  const backup = String(flags.backup);
  const failures = [];
  const pasos = [];

  log(`Base: ${db.databaseName} (${redactedUri})`);
  log(`Respaldo verificado: ${backup}\n`);

  log("1. Instantánea inicial");
  const inicial = await snapshot(db, "inicial");
  log(`   ${inicial.totals.collections} colecciones · ${inicial.totals.documents} documentos · ${inicial.totals.indexes} índices · diario [${inicial.journal.join(", ") || "vacío"}]`);

  log("\n2. Migrar");
  pasos.push({ paso: "migrar", ...ejecutar("migrate.js", ["up", "--backup", backup], log) });

  log("\n3. Validar tras migrar");
  pasos.push({ paso: "validar-tras-migrar", ...ejecutar("validate-data.js", ["--counts"], log) });
  const migrado = await snapshot(db, "migrado");
  log(`   ${migrado.totals.documents} documentos · ${migrado.totals.indexes} índices · diario [${migrado.journal.join(", ") || "vacío"}]`);

  log("\n4. Rollback (down --to 0)");
  pasos.push({ paso: "rollback", ...ejecutar("migrate.js", ["down", "--to", "0"], log) });

  log("\n5. Validar tras rollback");
  pasos.push({ paso: "validar-tras-rollback", ...ejecutar("validate-data.js", ["--counts"], log) });
  const revertido = await snapshot(db, "revertido");
  log(`   ${revertido.totals.documents} documentos · ${revertido.totals.indexes} índices · diario [${revertido.journal.join(", ") || "vacío"}]`);

  log("\n6. Reaplicar");
  pasos.push({ paso: "reaplicar", ...ejecutar("migrate.js", ["up", "--backup", backup], log) });

  log("\n7. Validar tras reaplicar");
  pasos.push({ paso: "validar-tras-reaplicar", ...ejecutar("validate-data.js", ["--counts"], log) });
  const reaplicado = await snapshot(db, "reaplicado");
  log(`   ${reaplicado.totals.documents} documentos · ${reaplicado.totals.indexes} índices · diario [${reaplicado.journal.join(", ") || "vacío"}]`);

  const etapas = [inicial, migrado, revertido, reaplicado];

  // --- Invariante 1: ninguna colección de datos pierde documentos ---
  const nombres = new Set(etapas.flatMap((etapa) => Object.keys(etapa.dataCollections)));
  const filasDocumentos = [];

  for (const name of [...nombres].sort()) {
    const valores = etapas.map((etapa) => etapa.dataCollections[name]?.documents ?? 0);
    const estable = valores.every((valor) => valor === valores[0]);
    filasDocumentos.push([name, ...valores, estable ? "ESTABLE" : "CAMBIÓ"]);
    if (!estable) {
      failures.push(`${name}: el número de documentos cambió durante el ciclo (${valores.join(" → ")}).`);
    }
  }

  // --- Invariante 2 y 3: índices vuelven y se reproducen ---
  const firmaInicial = indexSignature(inicial);
  const firmaMigrado = indexSignature(migrado);
  const firmaRevertido = indexSignature(revertido);
  const firmaReaplicado = indexSignature(reaplicado);

  if (firmaRevertido !== firmaInicial) {
    failures.push("Tras el rollback los índices NO coinciden con el conjunto inicial.");
  }
  if (firmaReaplicado !== firmaMigrado) {
    failures.push("Tras reaplicar los índices NO coinciden con los de la primera aplicación.");
  }

  // --- Invariante 4: la integridad no empeora ---
  for (const etapa of etapas.slice(1)) {
    if (etapa.integrity.critical > inicial.integrity.critical) {
      failures.push(
        `Etapa "${etapa.label}": los incumplimientos críticos subieron de ${inicial.integrity.critical} a ${etapa.integrity.critical}.`
      );
    }
  }

  // --- Invariante 5: diario coherente ---
  if (revertido.journal.length !== 0) {
    failures.push(`Tras el rollback el diario debería estar vacío y contiene [${revertido.journal.join(", ")}].`);
  }
  if (reaplicado.journal.join(",") !== migrado.journal.join(",")) {
    failures.push(
      `El diario tras reaplicar [${reaplicado.journal.join(", ")}] no coincide con el de la primera aplicación [${migrado.journal.join(", ")}].`
    );
  }

  const fallosDeComando = pasos.filter((paso) => paso.code !== 0);
  for (const paso of fallosDeComando) {
    failures.push(`El paso "${paso.paso}" terminó con código ${paso.code}.`);
  }

  log("\n### Documentos por colección en cada etapa\n");
  log(table(filasDocumentos, ["colección", "inicial", "migrado", "revertido", "reaplicado", "estado"]));

  log("\n### Resumen por etapa\n");
  log(table(
    etapas.map((etapa) => [
      etapa.label,
      etapa.totals.collections,
      etapa.totals.documents,
      etapa.totals.indexes,
      etapa.journal.length ? etapa.journal.join(",") : "vacío",
      etapa.integrity.critical,
      etapa.integrity.warning
    ]),
    ["etapa", "colecciones", "documentos", "índices", "diario", "integridad crítica", "integridad aviso"]
  ));

  log("\n### Comparación de conjuntos de índices\n");
  log(table(
    [
      ["inicial vs revertido", firmaInicial === firmaRevertido ? "IDÉNTICOS" : "DIFERENTES"],
      ["migrado vs reaplicado", firmaMigrado === firmaReaplicado ? "IDÉNTICOS" : "DIFERENTES"],
      ["inicial vs migrado", firmaInicial === firmaMigrado ? "IDÉNTICOS (la migración no añadió índices)" : "DIFERENTES (la migración creó índices)"]
    ],
    ["comparación", "resultado"]
  ));

  const indicesCreados = Object.entries(migrado.dataCollections).reduce((total, [name, item]) => {
    const previos = new Set(inicial.dataCollections[name]?.indexes || []);
    return total + item.indexes.filter((index) => !previos.has(index)).length;
  }, 0);

  const informe = {
    generatedAt: new Date().toISOString(),
    database: db.databaseName,
    backup,
    indicesCreadosPorLaMigracion: indicesCreados,
    invariantes: {
      documentosEstables: filasDocumentos.every((row) => row[row.length - 1] === "ESTABLE"),
      rollbackRestauraIndices: firmaInicial === firmaRevertido,
      reaplicacionReproducible: firmaMigrado === firmaReaplicado,
      integridadNoEmpeora: etapas.slice(1).every((etapa) => etapa.integrity.critical <= inicial.integrity.critical),
      diarioCoherente: revertido.journal.length === 0 && reaplicado.journal.join(",") === migrado.journal.join(",")
    },
    etapas,
    pasos: pasos.map((paso) => ({ paso: paso.paso, code: paso.code, tail: paso.tail })),
    failures
  };

  const file = writeReport("rollback-drill.json", informe);

  log(`\nÍndices creados por la migración: ${indicesCreados}`);
  log(`Informe: ${file}`);

  if (failures.length) {
    process.stderr.write(`\nFALLOS (${failures.length}):\n${failures.map((item) => `  - ${item}`).join("\n")}\n`);
    return EXIT.FAILURE;
  }

  log("\nEnsayo de rollback superado: sin pérdida de datos, índices restaurados y reaplicación reproducible.");
  return EXIT.OK;
}

run(main);
