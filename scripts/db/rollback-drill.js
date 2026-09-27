#!/usr/bin/env node
/**
 * FASE 15 — ensayo de rollback con evidencia comparativa.
 *
 *   node scripts/db/rollback-drill.js --backup backups/kronos-backup-XXXX
 *   node scripts/db/rollback-drill.js --backup <dir> --seed-expired 8 --allow-ttl-deletions
 *
 * `--seed-expired N` añade N refresh tokens ya vencidos antes de empezar: sin
 * ellos el ciclo no ejerce el borrado por TTL y el invariante de conteos se
 * cumple por construcción. `--allow-ttl-deletions` acepta esa pérdida como
 * esperada; sin la bandera el ensayo falla y señala `ttl-drill.js`.
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

const { EXIT, ROOT, assertNotProductionDatabase, parseArgs, run, writeReport } = require("./_bootstrap");
const { runIntegrityChecks } = require("../../server/src/db/integrity");

const INTERNAL_PREFIX = "kronos_";

function ejecutar(script, args, log) {
  const file = path.join(ROOT, "scripts", "db", script);
  const started = Date.now();

  // El hijo NO hereda `KRONOS_MIGRATION_CONFIRM`. `migrate.js` la acepta como
  // confirmación válida, así que un ensayo lanzado en la misma terminal donde
  // el operador acaba de exportarla para la migración real habría ejecutado
  // `down --to 0` contra la base confirmada sin preguntar nada. Un ensayo no
  // puede reutilizar una autorización que no le dieron a él.
  const entornoHijo = { ...process.env };
  delete entornoHijo.KRONOS_MIGRATION_CONFIRM;

  const result = spawnSync(process.execPath, [file, ...args], {
    cwd: ROOT,
    encoding: "utf8",
    env: entornoHijo,
    maxBuffer: 32 * 1024 * 1024
  });

  const salida = `${result.stdout || ""}${result.stderr || ""}`.trim();
  const ultimas = salida.split("\n").filter((line) => line.trim()).slice(-4);

  log(`  $ node scripts/db/${script} ${args.join(" ")} → salida ${result.status} (${Date.now() - started} ms)`);
  ultimas.forEach((line) => log(`      ${line}`));

  return { code: result.status, output: salida, tail: ultimas };
}

/**
 * Siembra tokens ya vencidos para que el ciclo ejerza el camino peligroso.
 *
 * `seed-staging.js` fija `expiresAt` en el futuro, así que el ensayo corría
 * sobre datos que estructuralmente no podían disparar un TTL y el invariante
 * de conteos se cumplía por construcción. Sin vencidos, este ensayo no
 * demuestra nada sobre el borrado por TTL.
 */
async function sembrarVencidos(db, mongoose, cantidad) {
  const ahora = Date.now();
  const documentos = [];
  for (let i = 0; i < cantidad; i += 1) {
    documentos.push({
      _id: new mongoose.Types.ObjectId(),
      token: `ensayo-vencido-${i}`,
      familyId: `familia-ensayo-${i}`,
      expiresAt: new Date(ahora - (i + 1) * 3600000)
    });
  }
  await db.collection("refreshtokens").insertMany(documentos);
  return documentos.length;
}

/**
 * Espera a que el monitor TTL haga su trabajo antes de fotografiar el estado.
 *
 * Duerme 60 s por defecto, así que la instantánea posterior a la migración se
 * tomaba antes del primer barrido y los documentos vencidos todavía figuraban
 * presentes: el ensayo daba «ESTABLE» sobre una pérdida que estaba a punto de
 * ocurrir. Se acelera el monitor y se espera a que los conteos se asienten.
 */
async function esperarTtl(db, inicial, log) {
  const nuevos = [];
  for (const [name, datos] of Object.entries(inicial.dataCollections)) {
    const previos = new Set(datos.ttlIndexes || []);
    const vivos = await db.collection(name).listIndexes().toArray().catch(() => []);
    const creados = vivos
      .filter((index) => index.expireAfterSeconds !== undefined && index.name !== "_id_")
      .map((index) => index.name)
      .filter((nombre) => !previos.has(nombre));
    if (creados.length) nuevos.push({ name, creados });
  }
  if (!nuevos.length) return { esperado: false };

  let acelerado = false;
  try {
    await db.admin().command({ setParameter: 1, ttlMonitorSleepSecs: 1 });
    acelerado = true;
  } catch {
    // Sin permiso para acelerarlo se espera el ciclo normal del servidor.
  }

  log(`   TTL creados por la migración: ${nuevos.map((item) => `${item.name} [${item.creados.join(", ")}]`).join(" · ")}`);
  log(`   esperando al monitor TTL (${acelerado ? "acelerado a 1 s" : "ciclo por defecto"})…`);

  const limite = Date.now() + (acelerado ? 40000 : 130000);
  let anterior = -1;
  let estables = 0;
  while (Date.now() < limite) {
    let total = 0;
    for (const item of nuevos) total += await db.collection(item.name).countDocuments({});
    if (total === anterior) {
      estables += 1;
      if (estables >= 3) break;
    } else {
      estables = 0;
      anterior = total;
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  return { esperado: true, acelerado, colecciones: nuevos };
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
      indexes: indexes.map((index) => index.name).sort(),
      // Un TTL borra documentos por su cuenta: hay que poder distinguir esa
      // pérdida de una causada por la migración.
      ttlIndexes: indexes
        .filter((index) => index.expireAfterSeconds !== undefined && index.name !== "_id_")
        .map((index) => index.name)
        .sort()
    };
  }

  const { results: integrity } = await runIntegrityChecks(db);
  const failed = integrity.filter((item) => !item.skipped && !item.ok);

  // El ejecutor no borra el registro al revertir: lo reemplaza marcándolo
  // con `direction: "down"`. Aplicada = existe registro y no está revertida,
  // exactamente el criterio que usa el propio runner.
  const journal = await db
    .collection("kronos_migrations")
    .find({ direction: { $ne: "down" } }, { projection: { version: 1, name: 1, _id: 0 } })
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

/**
 * Firma del conjunto de índices, limitada a las colecciones que ya existían
 * al empezar.
 *
 * `createIndex` crea la colección si no existe, así que la migración 004 hace
 * aparecer las colecciones declaradas en el plan que la base todavía no
 * tenía. Al revertir, los índices se borran pero la colección vacía se queda:
 * borrarla sería una operación destructiva que ninguna migración debe hacer
 * por su cuenta. Compararlas falsearía el resultado, así que se excluyen del
 * cotejo y se informan aparte.
 */
function indexSignature(snap, universo = null) {
  return Object.entries(snap.collections)
    .filter(([name]) => !name.startsWith(INTERNAL_PREFIX))
    .filter(([name]) => !universo || universo.has(name))
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

async function main({ db, mongoose, redactedUri }) {
  const { flags } = parseArgs();
  const log = (message) => process.stdout.write(`${message}\n`);

  if (!flags.backup || flags.backup === true) {
    throw new Error(
      "Falta --backup <dir>: el ensayo aplica migraciones que exigen respaldo verificado. " +
      "Crea uno con scripts/backup-verify.js --out <dir> y verifícalo con --check <dir>."
    );
  }

  // Este ensayo ejecuta `migrate.js down --to 0`: deshace las seis
  // migraciones y retira los 61 índices. Es la operación más destructiva del
  // repositorio y era la única de los tres ensayos sin guarda de nombre.
  assertNotProductionDatabase(db.databaseName, "El ensayo de rollback (down --to 0)");

  const backup = String(flags.backup);
  const failures = [];
  const pasos = [];

  log(`Base: ${db.databaseName} (${redactedUri})`);
  log(`Respaldo verificado: ${backup}\n`);

  if (flags.seedExpired) {
    const cantidad = Number(flags.seedExpired) || 0;
    if (cantidad > 0) {
      const sembrados = await sembrarVencidos(db, mongoose, cantidad);
      log(`0. Sembrados ${sembrados} refresh tokens YA VENCIDOS para ejercer el camino TTL\n`);
    }
  }

  log("1. Instantánea inicial");
  const inicial = await snapshot(db, "inicial");
  log(`   ${inicial.totals.collections} colecciones · ${inicial.totals.documents} documentos · ${inicial.totals.indexes} índices · diario [${inicial.journal.join(", ") || "vacío"}]`);

  log("\n2. Migrar");
  pasos.push({ paso: "migrar", ...ejecutar("migrate.js", ["up", "--backup", backup], log) });
  const ttl = await esperarTtl(db, inicial, log);

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

  const perdidasPorTtl = [];

  for (const name of [...nombres].sort()) {
    const valores = etapas.map((etapa) => etapa.dataCollections[name]?.documents ?? 0);
    const estable = valores.every((valor) => valor === valores[0]);

    // ¿La migración creó un TTL aquí? Entonces la caída de documentos la
    // provocó el monitor de MongoDB, no una escritura de la migración, y
    // `down()` no puede deshacerla. Son dos hechos distintos y hay que
    // nombrarlos distinto; confundirlos fue lo que dejó R-08 sin detectar.
    const ttlInicial = new Set(inicial.dataCollections[name]?.ttlIndexes || []);
    const ttlCreados = (migrado.dataCollections[name]?.ttlIndexes || [])
      .filter((indice) => !ttlInicial.has(indice));
    const bajoTtl = ttlCreados.length > 0 && valores[1] < valores[0];

    let estado = estable ? "ESTABLE" : "CAMBIÓ";
    if (bajoTtl) {
      estado = "TTL";
      perdidasPorTtl.push({
        coleccion: name,
        borrados: valores[0] - valores[1],
        indices: ttlCreados,
        recuperable: "solo desde el respaldo previo al índice"
      });
    }

    filasDocumentos.push([name, ...valores, estado]);

    if (!estable && !bajoTtl) {
      failures.push(`${name}: el número de documentos cambió durante el ciclo (${valores.join(" → ")}).`);
    }
    if (bajoTtl && !flags.allowTtlDeletions) {
      failures.push(
        `${name}: la migración creó el índice TTL [${ttlCreados.join(", ")}] y desaparecieron ` +
        `${valores[0] - valores[1]} documentos vencidos. down() NO los recupera. ` +
        "Ejecuta scripts/db/ttl-drill.js para medir el efecto y repite con --allow-ttl-deletions si es esperado."
      );
    }
  }

  if (perdidasPorTtl.length) {
    log("\nPérdida por TTL (irreversible con down(), solo recuperable desde respaldo):");
    for (const perdida of perdidasPorTtl) {
      log(`   ${perdida.coleccion}: ${perdida.borrados} documentos · índices [${perdida.indices.join(", ")}]`);
    }
  }

  // --- Invariante 2 y 3: índices vuelven y se reproducen ---
  const universo = new Set(Object.keys(inicial.dataCollections));
  const firmaInicial = indexSignature(inicial, universo);
  const firmaMigrado = indexSignature(migrado, universo);
  const firmaRevertido = indexSignature(revertido, universo);
  const firmaReaplicado = indexSignature(reaplicado, universo);

  // Diferencia explicada, no escondida: colecciones que no existían y que la
  // migración creó al declarar índices sobre ellas.
  const creadasPorLaMigracion = Object.keys(migrado.dataCollections)
    .filter((name) => !universo.has(name))
    .sort();

  for (const name of creadasPorLaMigracion) {
    const documentos = migrado.dataCollections[name]?.documents ?? 0;
    if (documentos > 0) {
      failures.push(`La migración creó la colección "${name}" con ${documentos} documentos: debería nacer vacía.`);
    }
  }

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

  if (creadasPorLaMigracion.length) {
    log(`\n### Colecciones creadas por la migración (vacías, excluidas del cotejo de índices)\n`);
    log(table(
      creadasPorLaMigracion.map((name) => [
        name,
        migrado.dataCollections[name]?.documents ?? 0,
        (migrado.dataCollections[name]?.indexes || []).length,
        (revertido.dataCollections[name]?.indexes || []).length,
        "createIndex crea la colección; revertir borra el índice, no la colección"
      ]),
      ["colección", "documentos", "índices tras migrar", "índices tras revertir", "explicación"]
    ));
  }

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
    const previos = new Set(inicial.dataCollections[name]?.indexes || ["_id_"]);
    return total + item.indexes.filter((index) => !previos.has(index)).length;
  }, 0);

  const informe = {
    generatedAt: new Date().toISOString(),
    database: db.databaseName,
    backup,
    indicesCreadosPorLaMigracion: indicesCreados,
    ttl: {
      indicesCreados: ttl.esperado ? ttl.colecciones : [],
      monitorAcelerado: Boolean(ttl.acelerado),
      perdidas: perdidasPorTtl,
      nota: perdidasPorTtl.length
        ? "Estos documentos los borró el monitor TTL de MongoDB. down() retira el índice pero NO los devuelve: solo se recuperan desde un respaldo anterior al índice."
        : "Ningún documento vencido en el ciclo."
    },
    coleccionesCreadasPorLaMigracion: creadasPorLaMigracion,
    invariantes: {
      documentosEstables: filasDocumentos.every((row) => ["ESTABLE", "TTL"].includes(row[row.length - 1])),
      sinPerdidaAjenaAlTtl: filasDocumentos.every((row) => row[row.length - 1] !== "CAMBIÓ"),
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
