#!/usr/bin/env node
/**
 * FASE 10 (multimedia) — integridad entre la base y el almacenamiento.
 *
 *   node scripts/db/media-orphans.js                 # informe (solo lectura)
 *   node scripts/db/media-orphans.js --sample 2000   # limita documentos por colección
 *   node scripts/db/media-orphans.js --json
 *
 * Responde a las dos preguntas del plan maestro:
 *
 *   1. ¿Hay URLs en la base que ya no existen en disco ni en GridFS?
 *      → REFERENCIAS ROTAS: el usuario ve un hueco. Es un fallo crítico.
 *   2. ¿Hay archivos guardados que ya nadie referencia?
 *      → HUÉRFANOS: ocupan espacio. Se listan; NO se borran.
 *
 * Esta herramienta nunca borra nada: el borrado de archivos es una acción
 * irreversible que exige respaldo verificado y autorización humana, así que
 * se deja a la migración 006 con `--allow-data-deletion`.
 */

const fs = require("node:fs");
const path = require("node:path");

const { ROOT, EXIT, parseArgs, writeReport, run, requireServerModule } = require("./_bootstrap");

const UPLOAD_PREFIX = "/uploads/";
const BUCKET = "kronosUploads";
const UPLOAD_DIRS = ["media", "avatars", "covers"];
const DEFAULT_SAMPLE = 0; // 0 = todos los documentos

/** Extrae, en profundidad, cada URL `/uploads/...` de un documento. */
function collectUploadUrls(value, found = new Set(), depth = 0) {
  if (depth > 12 || value === null || value === undefined) return found;

  if (typeof value === "string") {
    if (value.startsWith(UPLOAD_PREFIX)) found.add(value.split("?")[0]);
    return found;
  }

  if (Array.isArray(value)) {
    for (const item of value) collectUploadUrls(item, found, depth + 1);
    return found;
  }

  if (typeof value === "object" && !(value instanceof Date)) {
    if (typeof value._bsontype === "string") return found;
    for (const item of Object.values(value)) collectUploadUrls(item, found, depth + 1);
  }

  return found;
}

function relativeName(url) {
  return String(url || "").replace(/^\/uploads\//, "");
}

/** Archivos presentes en el disco del proceso. */
function listDiskFiles() {
  const files = new Map();
  const base = path.join(ROOT, "server", "uploads");

  for (const directory of UPLOAD_DIRS) {
    const full = path.join(base, directory);
    if (!fs.existsSync(full)) continue;

    for (const entry of fs.readdirSync(full, { withFileTypes: true })) {
      if (!entry.isFile()) continue;
      const name = `${directory}/${entry.name}`;
      files.set(name, fs.statSync(path.join(full, entry.name)).size);
    }
  }

  return files;
}

/** Archivos presentes en GridFS (la copia que sobrevive al redespliegue). */
async function listGridFsFiles(db) {
  const collections = await db.listCollections({ name: `${BUCKET}.files` }).toArray();
  if (!collections.length) return { files: new Map(), available: false };

  const files = new Map();
  const cursor = db.collection(`${BUCKET}.files`).find({}, { projection: { filename: 1, length: 1, uploadDate: 1 } });

  for await (const file of cursor) {
    const previous = files.get(file.filename);
    // Un mismo nombre puede tener varias revisiones: se cuenta la última.
    if (!previous || previous.uploadDate < file.uploadDate) {
      files.set(file.filename, { length: file.length, uploadDate: file.uploadDate });
    }
  }

  return { files, available: true };
}

async function main({ db }) {
  const { flags } = parseArgs();
  const sample = Number(flags.sample || DEFAULT_SAMPLE);
  const registry = requireServerModule(path.join(ROOT, "server", "src", "db", "registry"));

  const referenced = new Map(); // url -> [{collection, id}]
  const perCollection = [];
  const existing = new Set((await db.listCollections().toArray()).map((item) => item.name));

  for (const entry of registry.listCollections()) {
    if (!existing.has(entry.collection)) continue;

    let cursor = db.collection(entry.collection).find({});
    if (sample > 0) cursor = cursor.limit(sample);

    let scanned = 0;
    let withMedia = 0;

    for await (const document of cursor) {
      scanned += 1;
      const urls = collectUploadUrls(document);
      if (!urls.size) continue;
      withMedia += 1;

      for (const url of urls) {
        if (!referenced.has(url)) referenced.set(url, []);
        const holders = referenced.get(url);
        if (holders.length < 20) holders.push({ collection: entry.collection, id: String(document._id) });
      }
    }

    if (withMedia) perCollection.push({ collection: entry.collection, scanned, documentsWithMedia: withMedia });
  }

  const disk = listDiskFiles();
  const grid = await listGridFsFiles(db);

  const broken = [];
  for (const [url, holders] of referenced) {
    const name = relativeName(url);
    if (disk.has(name) || grid.files.has(name)) continue;
    broken.push({ url, references: holders.length, samples: holders.slice(0, 5) });
  }

  const referencedNames = new Set([...referenced.keys()].map(relativeName));
  const orphanDisk = [...disk.keys()].filter((name) => !referencedNames.has(name));
  const orphanGrid = [...grid.files.keys()].filter((name) => !referencedNames.has(name));
  const onlyInGrid = [...grid.files.keys()].filter((name) => referencedNames.has(name) && !disk.has(name));

  const orphanBytes =
    orphanDisk.reduce((total, name) => total + (disk.get(name) || 0), 0) +
    orphanGrid.reduce((total, name) => total + (grid.files.get(name)?.length || 0), 0);

  const report = {
    generatedAt: new Date().toISOString(),
    database: db.databaseName,
    sample: sample || "completo",
    gridfs: { bucket: BUCKET, available: grid.available, files: grid.files.size },
    disk: { files: disk.size },
    referencedUrls: referenced.size,
    perCollection,
    brokenReferences: broken,
    orphans: {
      disk: orphanDisk,
      gridfs: orphanGrid,
      bytes: orphanBytes
    },
    servedFromGridFsOnly: onlyInGrid.length,
    verdict: broken.length ? "REFERENCIAS_ROTAS" : "OK"
  };

  const file = writeReport(`media-orphans-${new Date().toISOString().slice(0, 10)}.json`, report);

  if (flags.json) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } else {
    process.stdout.write("\nIntegridad multimedia (base ↔ almacenamiento)\n");
    process.stdout.write(`  base de datos:        ${report.database}\n`);
    process.stdout.write(`  URLs referenciadas:   ${report.referencedUrls}\n`);
    process.stdout.write(`  archivos en disco:    ${disk.size}\n`);
    process.stdout.write(`  archivos en GridFS:   ${grid.files.size}${grid.available ? "" : " (bucket ausente)"}\n`);
    process.stdout.write(`  solo en GridFS:       ${onlyInGrid.length} (el disco del proceso ya no los tiene)\n`);
    process.stdout.write(`  referencias rotas:    ${broken.length}\n`);
    process.stdout.write(`  huérfanos disco:      ${orphanDisk.length}\n`);
    process.stdout.write(`  huérfanos GridFS:     ${orphanGrid.length}\n`);
    process.stdout.write(`  espacio recuperable:  ${(orphanBytes / 1048576).toFixed(2)} MB\n`);

    for (const item of broken.slice(0, 10)) {
      process.stdout.write(`    ROTA ${item.url} (${item.references} referencias)\n`);
    }

    process.stdout.write("\nNada se borra desde aquí: la limpieza exige respaldo verificado\n");
    process.stdout.write("y autorización explícita (migración 006 con --allow-data-deletion).\n");
  }

  process.stdout.write(`\nInforme: ${file}\n`);

  return broken.length ? EXIT.FAILURE : EXIT.OK;
}

run(main);
