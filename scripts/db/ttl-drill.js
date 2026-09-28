#!/usr/bin/env node
/**
 * R-08 — ensayo del borrado por TTL, con datos vencidos de verdad.
 *
 *   node scripts/db/ttl-drill.js
 *
 * El plan de índices incluye dos TTL con `expireAfterSeconds: 0`
 * (`refreshtokens.expiresAt` y `sessionrevocations.expiresAt`), y la
 * migración 005 puede crear un tercero sobre `notifications`. La cabecera de
 * `004-indexes.js` afirmaba que «un índice no contiene datos: crearlo o
 * borrarlo nunca pierde documentos». Para un TTL eso es falso: en cuanto el
 * índice existe, MongoDB borra en segundo plano todo documento cuya fecha ya
 * pasó, y `dropIndex` no los devuelve.
 *
 * El ensayo de rollback no podía detectarlo porque la siembra fija
 * `expiresAt` en el futuro (`+24 h`, `+7 días`): datos que estructuralmente
 * no pueden disparar el borrado. Este ensayo siembra vencidos a propósito y
 * mide el efecto.
 *
 * Lo que demuestra, en este orden:
 *   1. conteos conocidos ANTES del índice;
 *   2. respaldo real previo con el flujo aislado de ensayo CI;
 *   3. creación del TTL y espera activa hasta observar el borrado;
 *   4. qué documentos desaparecieron, exactamente;
 *   5. que `dropIndex` —el `down()` de la migración— NO los recupera;
 *   6. que el respaldo SÍ los recupera.
 *
 * Trabaja siempre sobre una base propia con sufijo `_ttl`, nunca sobre la
 * configurada, y nunca sobre una que parezca de producción.
 */

const { spawnSync } = require("node:child_process");
const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");

const {
  EXIT,
  ROOT,
  assertNotProductionDatabase,
  databaseNameFromUri,
  redactUri,
  requireUri,
  requireServerModule,
  writeReport
} = require("./_bootstrap");

const SUFIJO = "_ttl";
const COLECCION = "refreshtokens";
const INDICE = "expiresAt_1";

/** Reemplaza el nombre de base dentro de la URI conservando el resto. */
function fixtureUri(uri, name) {
  const [head, query] = String(uri).split("?");
  const withoutDb = head.replace(/\/[^/]*$/, "");
  return `${withoutDb}/${name}${query ? `?${query}` : ""}`;
}

const log = (mensaje) => process.stdout.write(`${mensaje}\n`);

/**
 * Documentos del ensayo. El caso límite importa: un `expiresAt` nulo NO es
 * una fecha, así que el TTL debe ignorarlo. Si desapareciera, el índice
 * estaría borrando más de lo que declara.
 */
function semilla(mongoose) {
  const oid = () => new mongoose.Types.ObjectId();
  const ahora = Date.now();
  const vencidos = [];
  for (let i = 0; i < 5; i += 1) {
    vencidos.push({
      _id: oid(),
      etiqueta: `vencido-multiple-${i}`,
      token: `t-vencido-${i}`,
      expiresAt: new Date(ahora - (i + 2) * 3600000)
    });
  }
  return [
    { _id: oid(), etiqueta: "vigente", token: "t-vigente", expiresAt: new Date(ahora + 86400000) },
    { _id: oid(), etiqueta: "vencido-unico", token: "t-vencido-unico", expiresAt: new Date(ahora - 3600000) },
    ...vencidos,
    { _id: oid(), etiqueta: "sin-fecha", token: "t-sin-fecha", expiresAt: null }
  ];
}

/** Ejecuta una herramienta del repositorio con una URI concreta. */
function ejecutar(script, args, uri) {
  const entorno = { ...process.env, MONGODB_URI: uri };
  delete entorno.KRONOS_MIGRATION_CONFIRM;
  const resultado = spawnSync(process.execPath, [path.join(ROOT, script), ...args], {
    cwd: ROOT,
    encoding: "utf8",
    env: entorno,
    maxBuffer: 32 * 1024 * 1024
  });
  return {
    code: resultado.status,
    salida: `${resultado.stdout || ""}${resultado.stderr || ""}`.trim()
  };
}

async function etiquetasDe(db) {
  const docs = await db.collection(COLECCION).find({}, { projection: { etiqueta: 1 } }).toArray();
  return docs.map((doc) => doc.etiqueta).sort();
}

async function main() {
  const uriBase = requireUri();
  const base = databaseNameFromUri(uriBase);
  assertNotProductionDatabase(base, "El ensayo de TTL");

  const nombre = `${base}${SUFIJO}`;
  const nombreRecuperacion = `${base}${SUFIJO}_recuperada`;
  assertNotProductionDatabase(nombre, "El ensayo de TTL");
  assertNotProductionDatabase(nombreRecuperacion, "La recuperación del ensayo de TTL");

  const uri = fixtureUri(uriBase, nombre);
  const uriRecuperacion = fixtureUri(uriBase, nombreRecuperacion);

  const mongoose = requireServerModule("mongoose");
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 15000, autoIndex: false });
  const db = mongoose.connection.db;

  const fallos = [];
  const informe = { base: nombre, pasos: {} };
  const respaldo = fs.mkdtempSync(path.join(os.tmpdir(), "kronos-ttl-"));

  try {
    log(`Base del ensayo: ${nombre} (${redactUri(uri)})`);

    // ---- 1. estado conocido antes del índice --------------------------------
    await db.collection(COLECCION).drop().catch(() => {});
    const documentos = semilla(mongoose);
    await db.collection(COLECCION).insertMany(documentos);

    const antes = await db.collection(COLECCION).countDocuments({});
    const etiquetasAntes = await etiquetasDe(db);
    const vencidosEsperados = documentos.filter(
      (doc) => doc.expiresAt instanceof Date && doc.expiresAt.getTime() < Date.now()
    ).length;

    log("\n1. ANTES del índice TTL");
    log(`   documentos: ${antes} (vigente 1 · vencidos ${vencidosEsperados} · sin fecha 1)`);
    informe.pasos.antes = { documentos: antes, vencidosEsperados, etiquetas: etiquetasAntes };

    // ---- 2. respaldo previo con la herramienta aislada de ensayo ------------
    log("\n2. Respaldo previo (scripts/ci/trial-backup-restore.js)");
    const salidaRespaldo = ejecutar("scripts/ci/trial-backup-restore.js", ["--out", respaldo], uri);
    if (salidaRespaldo.code !== 0) {
      fallos.push(`el respaldo previo falló: ${salidaRespaldo.salida.split("\n").slice(-2).join(" ")}`);
    }
    log(`   ${salidaRespaldo.code === 0 ? "respaldo creado" : "FALLÓ"} en ${respaldo}`);
    informe.pasos.respaldo = { code: salidaRespaldo.code, directorio: respaldo };

    // ---- 3. acelerar el monitor TTL y crear el índice -----------------------
    // Por defecto el monitor duerme 60 s. Sin acelerarlo el ensayo tardaría
    // minutos; si el servidor no lo permite se dice, no se finge.
    let monitorAcelerado = false;
    try {
      await db.admin().command({ setParameter: 1, ttlMonitorSleepSecs: 1 });
      monitorAcelerado = true;
    } catch (error) {
      log(`   aviso: no se pudo acelerar el monitor TTL (${error.codeName || error.message})`);
    }

    log("\n3. Creación del índice TTL (expireAfterSeconds: 0)");
    await db.collection(COLECCION).createIndex({ expiresAt: 1 }, { name: INDICE, expireAfterSeconds: 0 });

    const limite = Date.now() + (monitorAcelerado ? 45000 : 150000);
    let despues = antes;
    while (Date.now() < limite) {
      despues = await db.collection(COLECCION).countDocuments({});
      if (despues <= antes - vencidosEsperados) break;
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    const etiquetasDespues = await etiquetasDe(db);
    const desaparecidas = etiquetasAntes.filter((etiqueta) => !etiquetasDespues.includes(etiqueta));

    log("\n4. DESPUÉS del índice TTL");
    log(`   documentos: ${antes} → ${despues} (borrados ${antes - despues})`);
    log(`   desaparecidos: ${desaparecidas.join(", ") || "ninguno"}`);
    log(`   monitor TTL acelerado: ${monitorAcelerado ? "sí (1 s)" : "no (60 s por defecto)"}`);
    informe.pasos.despues = {
      documentos: despues,
      borrados: antes - despues,
      desaparecidas,
      monitorAcelerado
    };

    if (antes - despues !== vencidosEsperados) {
      fallos.push(
        `el TTL borró ${antes - despues} documentos y se esperaban ${vencidosEsperados}: el ensayo no observó el efecto que debe demostrar`
      );
    }
    if (!etiquetasDespues.includes("vigente")) {
      fallos.push("el TTL borró el documento vigente: estaría borrando de más");
    }
    if (!etiquetasDespues.includes("sin-fecha")) {
      fallos.push("el TTL borró el documento sin fecha: un valor nulo no es una fecha vencida");
    }

    // ---- 5. el rollback de la migración NO recupera nada --------------------
    log("\n5. Rollback del índice (lo que hace down())");
    await db.collection(COLECCION).dropIndex(INDICE).catch(() => {});
    const trasRollback = await db.collection(COLECCION).countDocuments({});
    const recuperadosPorRollback = trasRollback - despues;

    log(`   documentos: ${despues} → ${trasRollback} (recuperados ${recuperadosPorRollback})`);
    log("   dropIndex retira el índice; los documentos borrados NO vuelven.");
    informe.pasos.rollback = { documentos: trasRollback, recuperados: recuperadosPorRollback };

    if (recuperadosPorRollback !== 0) {
      fallos.push(`dropIndex recuperó ${recuperadosPorRollback} documentos: el modelo del ensayo es incorrecto`);
    }

    // ---- 6. el respaldo SÍ los recupera -------------------------------------
    log("\n6. Recuperación desde el respaldo");
    const salidaRestore = ejecutar(
      "scripts/ci/trial-backup-restore.js",
      ["--restore", respaldo, "--target-uri", uriRecuperacion],
      uri
    );
    let recuperados = 0;
    if (salidaRestore.code !== 0) {
      fallos.push(`la restauración falló: ${salidaRestore.salida.split("\n").slice(-3).join(" ")}`);
    } else {
      const conexion = await mongoose.createConnection(uriRecuperacion, { serverSelectionTimeoutMS: 15000 }).asPromise();
      try {
        recuperados = await conexion.db.collection(COLECCION).countDocuments({});
      } finally {
        await conexion.close();
      }
    }
    log(`   base ${nombreRecuperacion}: ${recuperados} documentos (originales ${antes})`);
    informe.pasos.recuperacion = { base: nombreRecuperacion, documentos: recuperados, code: salidaRestore.code };

    if (recuperados !== antes) {
      fallos.push(`el respaldo devolvió ${recuperados} documentos y el original tenía ${antes}`);
    }

    // ---- 7. clasificación ---------------------------------------------------
    log("\n7. Clasificación de lo que ocurre en una migración con TTL");
    log("   reversible con down()          : la creación del índice (dropIndex lo retira)");
    log(`   NO reversible con down()       : ${antes - despues} documentos borrados por el monitor TTL`);
    log("   recuperable solo desde respaldo: esos mismos documentos");
    log("");
    log("   Advertencia operativa: un respaldo tomado DESPUÉS de que exista el");
    log("   índice TTL lo incluye en su manifiesto, y al restaurarlo se recrea");
    log("   y vuelve a borrar lo vencido. Para recuperar hay que usar un");
    log("   respaldo anterior al índice, como hace el paso 6.");

    informe.clasificacion = {
      reversiblePorMigracion: ["creación del índice TTL"],
      irreversiblePorMigracion: `${antes - despues} documentos vencidos borrados por el monitor TTL`,
      soloRecuperableDesdeRespaldo: `${antes - despues} documentos`
    };
  } finally {
    await mongoose.disconnect();
    fs.rmSync(respaldo, { recursive: true, force: true });
  }

  informe.fallos = fallos;
  const ruta = writeReport("ttl-drill.json", informe);
  log(`\nInforme: ${ruta}`);

  if (fallos.length) {
    log(`\nEnsayo de TTL NO superado:\n  - ${fallos.join("\n  - ")}`);
    return EXIT.FAILURE;
  }

  log("\nEnsayo de TTL superado: el borrado se observa, el rollback no lo revierte y el respaldo sí.");
  return EXIT.OK;
}

main()
  .then((code) => process.exit(code))
  .catch((error) => {
    process.stderr.write(`ERROR: ${redactUri(error?.message || String(error))}\n`);
    process.exit(EXIT.FAILURE);
  });
