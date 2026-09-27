#!/usr/bin/env node
/**
 * Diagnóstico de producción — EXCLUSIVAMENTE LECTURA.
 *
 * Convierte en evidencia los tres puntos que la auditoría dejó BLOCKED:
 * qué configuración corre, qué índices existen y cuántos documentos vencidos
 * borraría la creación de los TTL.
 *
 * NO escribe. No hay en este fichero una sola llamada capaz de modificar
 * datos, y `server/test/production-readonly-diagnostics.test.js` lo comprueba
 * leyendo el código fuente, no confiando en esta frase.
 *
 * Uso:
 *
 *   MONGODB_URI='mongodb+srv://usuario:clave@host/kronos_social_ai' \
 *   KRONOS_DIAG_ALLOW_DB=kronos_social_ai \
 *   node scripts/db/production-readonly-diagnostics.js
 *
 *   # con salida a fichero, para adjuntarla como evidencia
 *   ... node scripts/db/production-readonly-diagnostics.js --json informe.json
 *
 * La base de destino hay que DECLARARLA en `KRONOS_DIAG_ALLOW_DB`. No basta
 * con que la URI la nombre: quien ejecuta esto tiene que escribir a mano
 * contra qué base va, y si no coincide con la de la URI el script se detiene.
 * Es la única forma de que un copiar y pegar de la URI equivocada no acabe
 * en un informe atribuido a la base que no era.
 *
 * Última línea de la salida, siempre:
 *
 *   READ_ONLY_ASSERTION=PASS      todas las guardas pasaron, exit 0
 *   READ_ONLY_ASSERTION=BLOCKED   alguna falló, exit != 0
 */

"use strict";

const fs = require("node:fs");
const path = require("node:path");

/* -------------------------------------------------------------------------
 * Guardas previas a la conexión
 * ---------------------------------------------------------------------- */

const ALLOW_VAR = "KRONOS_DIAG_ALLOW_DB";

/** Nombres que jamás se aceptan como destino de nada automático. */
const ENTORNOS_PROHIBIDOS = [/(^|[-._])test([-._]|$)/i, /ensayo/i, /staging/i];

const EXIT = { OK: 0, BLOCKED: 2, ERROR: 3 };

const salida = [];
function emit(linea = "") {
  salida.push(linea);
  process.stdout.write(`${linea}\n`);
}

/** Quita usuario y contraseña de una URI para poder enseñarla. */
function redactUri(uri) {
  return String(uri ?? "").replace(/\/\/[^@/]*@/, "//<credenciales>@");
}

/** Nombre de la base que la URI declara, o null si no declara ninguna. */
function databaseFromUri(uri) {
  const match = /^mongodb(\+srv)?:\/\/[^/]+\/([^?]*)/i.exec(String(uri ?? "").trim());
  if (!match) return null;
  const nombre = decodeURIComponent(match[2] || "").trim();
  return nombre || null;
}

/**
 * Comprueba todo lo que se puede comprobar SIN conectar.
 * Devuelve la lista de motivos de bloqueo; vacía significa que se puede
 * seguir. Fail-closed: cualquier ambigüedad es un motivo.
 */
function evaluarGuardas(env = process.env) {
  const motivos = [];

  const uri = env.MONGODB_URI;
  if (!uri || !String(uri).trim()) {
    motivos.push("Falta MONGODB_URI.");
    return motivos;
  }

  if (!/^mongodb(\+srv)?:\/\//i.test(String(uri).trim())) {
    motivos.push("MONGODB_URI no tiene forma de URI de MongoDB.");
    return motivos;
  }

  const baseUri = databaseFromUri(uri);
  if (!baseUri) {
    motivos.push(
      "MONGODB_URI no incluye una base explícita. Añádela para que no haya duda de contra qué se consulta."
    );
  }

  const declarada = String(env[ALLOW_VAR] ?? "").trim();
  if (!declarada) {
    motivos.push(
      `Falta ${ALLOW_VAR}. Declara explícitamente la base que esperas consultar.`
    );
  } else if (baseUri && declarada !== baseUri) {
    motivos.push(
      `La URI apunta a "${baseUri}" y ${ALLOW_VAR} declara "${declarada}": no coinciden.`
    );
  }

  const objetivo = declarada || baseUri || "";
  for (const patron of ENTORNOS_PROHIBIDOS) {
    if (patron.test(objetivo)) {
      motivos.push(
        `La base "${objetivo}" parece de pruebas o de ensayo. Este diagnóstico describe PRODUCCIÓN; ` +
        "apuntarlo a otra cosa produciría un informe que no sirve como evidencia."
      );
      break;
    }
  }

  return motivos;
}

/* -------------------------------------------------------------------------
 * Consultas — todas de lectura
 * ---------------------------------------------------------------------- */

/** Colecciones afectadas por TTL según el plan de migración. */
const TTL_OBJETIVO = [
  { collection: "refreshtokens", field: "expiresAt" },
  { collection: "sessionrevocations", field: "expiresAt" },
  { collection: "notifications", field: "createdAt" }
];

async function inventarioIndices(db, nombres) {
  const filas = [];
  for (const name of nombres) {
    let indices = [];
    try {
      indices = await db.collection(name).listIndexes().toArray();
    } catch {
      continue;
    }
    for (const index of indices) {
      filas.push({
        collection: name,
        name: index.name,
        key: index.key,
        unique: Boolean(index.unique),
        sparse: Boolean(index.sparse),
        partial: Boolean(index.partialFilterExpression),
        ttl: index.expireAfterSeconds !== undefined ? index.expireAfterSeconds : null
      });
    }
  }
  return filas;
}

async function analisisTtl(db, nombres) {
  const ahora = new Date();
  const filas = [];

  for (const objetivo of TTL_OBJETIVO) {
    if (!nombres.includes(objetivo.collection)) continue;
    const coleccion = db.collection(objetivo.collection);
    const campo = objetivo.field;

    const indices = await coleccion.listIndexes().toArray().catch(() => []);
    const ttlVivo = indices.find(
      (index) => index.expireAfterSeconds !== undefined && index.key && index.key[campo] !== undefined
    );

    const [total, vencidos, vigentes, sinCampo] = await Promise.all([
      coleccion.countDocuments({}),
      coleccion.countDocuments({ [campo]: { $lt: ahora } }),
      coleccion.countDocuments({ [campo]: { $gte: ahora } }),
      coleccion.countDocuments({ $or: [{ [campo]: null }, { [campo]: { $exists: false } }] })
    ]);

    filas.push({
      collection: objetivo.collection,
      field: campo,
      indexName: ttlVivo ? ttlVivo.name : null,
      expireAfterSeconds: ttlVivo ? ttlVivo.expireAfterSeconds : null,
      total,
      expired: vencidos,
      active: vigentes,
      missingField: sinCampo
    });
  }

  return filas;
}

/**
 * Duplicados que harían fallar un índice único con E11000.
 * `$group` + `$match` es una agregación de lectura; no escribe nada.
 */
async function duplicadosParaUnicos(db, indices) {
  const resultados = [];
  const unicos = indices.filter((index) => index.unique && index.name !== "_id_");

  for (const index of unicos) {
    const claves = Object.keys(index.key || {}).filter((k) => k !== "_id");
    if (!claves.length) continue;

    const agrupacion = {};
    for (const clave of claves) agrupacion[clave.replace(/\./g, "_")] = `$${clave}`;

    let muestras = [];
    try {
      muestras = await db
        .collection(index.collection)
        .aggregate(
          [
            { $group: { _id: agrupacion, n: { $sum: 1 } } },
            { $match: { n: { $gt: 1 } } },
            { $limit: 5 }
          ],
          { allowDiskUse: true }
        )
        .toArray();
    } catch (error) {
      resultados.push({
        collection: index.collection,
        index: index.name,
        keys: claves,
        status: "ERROR",
        detail: error.message,
        duplicates: null
      });
      continue;
    }

    resultados.push({
      collection: index.collection,
      index: index.name,
      keys: claves,
      status: muestras.length ? "DUPLICADOS" : "LIMPIO",
      duplicates: muestras.length,
      detail: muestras.length
        ? "La creación del índice único fallaría con E11000 hasta resolverlos."
        : "Sin duplicados en la muestra."
    });
  }

  return resultados;
}

async function gridfs(db, nombres) {
  const buckets = new Map();
  for (const name of nombres) {
    const match = /^(.*)\.(files|chunks)$/.exec(name);
    if (!match) continue;
    const bucket = buckets.get(match[1]) || { bucket: match[1], files: null, chunks: null, bytes: null };
    if (match[2] === "files") {
      bucket.files = await db.collection(name).countDocuments({});
      const suma = await db
        .collection(name)
        .aggregate([{ $group: { _id: null, bytes: { $sum: "$length" } } }])
        .toArray()
        .catch(() => []);
      bucket.bytes = suma.length ? suma[0].bytes : null;
    } else {
      bucket.chunks = await db.collection(name).countDocuments({});
    }
    buckets.set(match[1], bucket);
  }
  return [...buckets.values()];
}

/* -------------------------------------------------------------------------
 * Presentación
 * ---------------------------------------------------------------------- */

function tabla(cabeceras, filas) {
  if (!filas.length) return ["  (sin datos)"];
  const anchos = cabeceras.map((h, i) =>
    Math.max(String(h).length, ...filas.map((f) => String(f[i] ?? "").length))
  );
  const linea = (celdas) =>
    "  | " + celdas.map((c, i) => String(c ?? "").padEnd(anchos[i])).join(" | ") + " |";
  return [linea(cabeceras), "  |" + anchos.map((a) => "-".repeat(a + 2)).join("|") + "|",
    ...filas.map(linea)];
}

function mb(bytes) {
  if (typeof bytes !== "number") return "n/d";
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

/* -------------------------------------------------------------------------
 * Principal
 * ---------------------------------------------------------------------- */

async function main() {
  emit("===== KRONOS · DIAGNÓSTICO DE PRODUCCIÓN (SOLO LECTURA) =====");
  emit(`Generado: ${new Date().toISOString()}`);
  emit();

  const motivos = evaluarGuardas(process.env);
  if (motivos.length) {
    emit("GUARDAS PREVIAS A LA CONEXIÓN: FALLARON");
    for (const motivo of motivos) emit(`  - ${motivo}`);
    emit();
    emit("No se abrió ninguna conexión.");
    emit("READ_ONLY_ASSERTION=BLOCKED");
    process.exitCode = EXIT.BLOCKED;
    return;
  }

  const uri = process.env.MONGODB_URI;
  const esperada = String(process.env[ALLOW_VAR]).trim();

  emit("GUARDAS PREVIAS A LA CONEXIÓN: PASAN");
  emit(`  URI:            ${redactUri(uri)}`);
  emit(`  Base declarada: ${esperada}`);
  emit();

  const mongoose = require("mongoose");
  let conexion = null;

  try {
    // `autoIndex: false` y `autoCreate: false`: ni un índice ni una colección
    // por accidente. Sin ellos, Mongoose puede crear ambos al vuelo.
    await mongoose.connect(uri, {
      dbName: esperada,
      autoIndex: false,
      autoCreate: false,
      serverSelectionTimeoutMS: 15000
    });
    conexion = mongoose.connection;

    const db = conexion.db;

    // Última comprobación, ya conectados: que la base sea la declarada.
    if (db.databaseName !== esperada) {
      emit(`La conexión quedó en "${db.databaseName}" y se declaró "${esperada}".`);
      emit("READ_ONLY_ASSERTION=BLOCKED");
      process.exitCode = EXIT.BLOCKED;
      return;
    }

    const info = await db.admin().serverInfo().catch(() => ({ version: "desconocida" }));

    emit("----- ENVIRONMENT -----");
    emit(`  DATABASE:       ${db.databaseName}`);
    emit(`  SERVER VERSION: ${info.version}`);
    emit(`  NODE_ENV local: ${process.env.NODE_ENV || "(sin declarar)"}  [del equipo que consulta, no del servidor]`);
    emit();

    const colecciones = (await db.listCollections().toArray())
      .filter((c) => c.type !== "view")
      .map((c) => c.name)
      .sort();

    emit("----- COLLECTION COUNTS -----");
    const conteos = [];
    let totalDocumentos = 0;
    for (const name of colecciones) {
      const n = await db.collection(name).countDocuments({});
      totalDocumentos += n;
      conteos.push({ collection: name, count: n });
    }
    for (const linea of tabla(["colección", "documentos"], conteos.map((c) => [c.collection, c.count]))) {
      emit(linea);
    }
    emit(`  TOTAL: ${totalDocumentos} documentos en ${colecciones.length} colecciones`);
    emit();

    emit("----- INDEX INVENTORY -----");
    const indices = await inventarioIndices(db, colecciones);
    for (const linea of tabla(
      ["colección", "índice", "clave", "unique", "TTL"],
      indices.map((i) => [
        i.collection,
        i.name,
        JSON.stringify(i.key),
        i.unique ? "sí" : "",
        i.ttl === null ? "" : `${i.ttl}s`
      ])
    )) {
      emit(linea);
    }
    emit(`  TOTAL: ${indices.length} índices · ${indices.filter((i) => i.unique).length} únicos · ${indices.filter((i) => i.ttl !== null).length} TTL`);
    emit();

    emit("----- TTL ANALYSIS -----");
    const ttl = await analisisTtl(db, colecciones);
    for (const linea of tabla(
      ["colección", "campo", "índice TTL", "total", "vencidos", "vigentes", "sin campo"],
      ttl.map((t) => [
        t.collection,
        t.field,
        t.indexName || "(no existe)",
        t.total,
        t.expired,
        t.active,
        t.missingField
      ])
    )) {
      emit(linea);
    }
    const enRiesgo = ttl.filter((t) => !t.indexName && t.expired > 0);
    if (enRiesgo.length) {
      emit();
      emit("  ATENCIÓN — documentos que la creación del índice TTL borraría:");
      for (const t of enRiesgo) emit(`    ${t.collection}.${t.field}: ${t.expired} documentos vencidos`);
      emit("    Son datos existentes. Este informe NO los clasifica como basura ni propone borrarlos:");
      emit("    la decisión es del operador, y el respaldo que los recupera es el ANTERIOR al índice.");
    }
    emit();

    emit("----- UNIQUE INDEX DUPLICATE CHECKS -----");
    const duplicados = await duplicadosParaUnicos(db, indices);
    for (const linea of tabla(
      ["colección", "índice", "claves", "estado", "muestras"],
      duplicados.map((d) => [d.collection, d.index, d.keys.join(", "), d.status, d.duplicates ?? "n/d"])
    )) {
      emit(linea);
    }
    emit();

    emit("----- DB STATS -----");
    const stats = await db.stats();
    emit(`  objects:     ${stats.objects}`);
    emit(`  collections: ${stats.collections}`);
    emit(`  dataSize:    ${mb(stats.dataSize)}`);
    emit(`  storageSize: ${mb(stats.storageSize)}`);
    emit(`  indexSize:   ${mb(stats.indexSize)}`);
    emit();

    emit("----- GRIDFS -----");
    const buckets = await gridfs(db, colecciones);
    for (const linea of tabla(
      ["bucket", "files", "chunks", "almacenamiento aprox."],
      buckets.map((b) => [b.bucket, b.files ?? "n/d", b.chunks ?? "n/d", mb(b.bytes)])
    )) {
      emit(linea);
    }
    emit();

    const informe = {
      generatedAt: new Date().toISOString(),
      database: db.databaseName,
      serverVersion: info.version,
      collections: conteos,
      totalDocuments: totalDocumentos,
      indexes: indices,
      ttl,
      uniqueDuplicates: duplicados,
      stats: {
        objects: stats.objects,
        collections: stats.collections,
        dataSize: stats.dataSize,
        storageSize: stats.storageSize,
        indexSize: stats.indexSize
      },
      gridfs: buckets,
      readOnlyAssertion: "PASS"
    };

    const jsonIndex = process.argv.indexOf("--json");
    if (jsonIndex !== -1 && process.argv[jsonIndex + 1]) {
      const destino = path.resolve(process.argv[jsonIndex + 1]);
      fs.writeFileSync(destino, `${JSON.stringify(informe, null, 2)}\n`);
      emit(`Informe JSON: ${destino}`);
      emit();
    }

    emit("READ_ONLY_ASSERTION=PASS");
    process.exitCode = EXIT.OK;
  } catch (error) {
    emit();
    emit(`ERROR durante el diagnóstico: ${redactUri(error.message)}`);
    emit("READ_ONLY_ASSERTION=BLOCKED");
    process.exitCode = EXIT.ERROR;
  } finally {
    if (conexion) await mongoose.disconnect().catch(() => {});
  }
}

if (require.main === module) {
  main().catch((error) => {
    emit(`ERROR no controlado: ${redactUri(error.message)}`);
    emit("READ_ONLY_ASSERTION=BLOCKED");
    process.exit(EXIT.ERROR);
  });
}

module.exports = {
  ALLOW_VAR,
  ENTORNOS_PROHIBIDOS,
  EXIT,
  TTL_OBJETIVO,
  redactUri,
  databaseFromUri,
  evaluarGuardas
};
