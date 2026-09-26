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

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const { ROOT, EXIT, parseArgs, writeReport, run, requireServerModule } = require("./_bootstrap");

const UPLOAD_PREFIX = "/uploads/";
const BUCKET = "kronosUploads";
const UPLOAD_DIRS = ["media", "avatars", "covers"];
const DEFAULT_SAMPLE = 0; // 0 = todos los documentos

const IMAGE_EXT = new Set(["jpg", "jpeg", "png", "gif", "webp", "avif", "bmp", "heic"]);
const VIDEO_EXT = new Set(["mp4", "webm", "mov", "m4v", "avi", "mkv"]);
const AUDIO_EXT = new Set(["mp3", "wav", "ogg", "m4a", "aac"]);

function extensionOf(url) {
  const match = /\.([a-z0-9]+)$/i.exec(String(url || "").split("?")[0]);
  return match ? match[1].toLowerCase() : "";
}

function familyOf(extension) {
  if (IMAGE_EXT.has(extension)) return "image";
  if (VIDEO_EXT.has(extension)) return "video";
  if (AUDIO_EXT.has(extension)) return "audio";
  return "";
}

/**
 * Coherencia declarada vs. real de un objeto multimedia.
 * No corrige nada: describe la discrepancia para que una persona decida.
 */
function mediaInconsistencies(media, origin) {
  if (!media || typeof media !== "object") return [];

  const url = typeof media.url === "string" ? media.url : "";
  const problems = [];

  if (!url) {
    if (media.type || media.mimeType) {
      problems.push({ ...origin, url: "", problem: "tipo declarado sin URL", declared: media.type || media.mimeType, actual: "" });
    }
    return problems;
  }

  const extension = extensionOf(url);
  const family = familyOf(extension);
  const declared = String(media.type || "");

  if (!declared) {
    problems.push({ ...origin, url, problem: "URL sin tipo declarado", declared: "", actual: family || extension });
  } else if (family && declared !== family) {
    problems.push({ ...origin, url, problem: "type no coincide con la extensión", declared, actual: family });
  }

  if (media.mimeType && family) {
    const mimeFamily = String(media.mimeType).split("/")[0];
    if (mimeFamily && mimeFamily !== family) {
      problems.push({ ...origin, url, problem: "mimeType no coincide con la extensión", declared: media.mimeType, actual: family });
    }
  }

  const width = Number(media.width) || 0;
  const height = Number(media.height) || 0;
  const orientation = String(media.orientation || "");

  if (orientation && width > 0 && height > 0) {
    const real = width === height ? "square" : (height > width ? "vertical" : "horizontal");
    if (orientation !== real) {
      problems.push({
        ...origin,
        url,
        problem: "orientation no coincide con width/height",
        declared: `${orientation} (${width}x${height})`,
        actual: real
      });
    }
  }

  return problems;
}

/** Recorre `media` y `mediaItems[]` de un documento buscando incoherencias. */
function inspectMedia(document, collection) {
  const origin = { collection, id: String(document._id) };
  const problems = [...mediaInconsistencies(document.media, origin)];

  if (Array.isArray(document.mediaItems)) {
    for (const item of document.mediaItems) problems.push(...mediaInconsistencies(item, origin));
  }

  return problems;
}

/** Archivos de idéntico contenido: se agrupan por tamaño y solo ahí se calcula el hash. */
function duplicateDiskFiles(disk) {
  const bySize = new Map();

  for (const [name, size] of disk) {
    if (!size) continue;
    if (!bySize.has(size)) bySize.set(size, []);
    bySize.get(size).push(name);
  }

  const duplicates = [];
  const base = path.join(ROOT, "server", "uploads");

  for (const [size, names] of bySize) {
    if (names.length < 2) continue;

    const byHash = new Map();
    for (const name of names) {
      let digest;
      try {
        digest = crypto.createHash("sha256").update(fs.readFileSync(path.join(base, name))).digest("hex");
      } catch {
        continue;
      }
      if (!byHash.has(digest)) byHash.set(digest, []);
      byHash.get(digest).push(name);
    }

    for (const [digest, group] of byHash) {
      if (group.length > 1) {
        duplicates.push({ sha256: digest.slice(0, 16), bytes: size, copies: group.length, files: group.slice(0, 10) });
      }
    }
  }

  return duplicates.sort((a, b) => b.bytes * b.copies - a.bytes * a.copies);
}

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

  const referenced = new Map(); // url -> [{collection, id}]  (muestra acotada)
  const referenceCount = new Map(); // url -> nº real de referencias
  const inconsistencies = [];
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
      inconsistencies.push(...inspectMedia(document, entry.collection));

      const urls = collectUploadUrls(document);
      if (!urls.size) continue;
      withMedia += 1;

      for (const url of urls) {
        referenceCount.set(url, (referenceCount.get(url) || 0) + 1);
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
    broken.push({ url, references: referenceCount.get(url) || holders.length, samples: holders.slice(0, 5) });
  }

  const referencedNames = new Set([...referenced.keys()].map(relativeName));
  const orphanDisk = [...disk.keys()].filter((name) => !referencedNames.has(name));
  const orphanGrid = [...grid.files.keys()].filter((name) => !referencedNames.has(name));
  const onlyInGrid = [...grid.files.keys()].filter((name) => referencedNames.has(name) && !disk.has(name));

  const orphanBytes =
    orphanDisk.reduce((total, name) => total + (disk.get(name) || 0), 0) +
    orphanGrid.reduce((total, name) => total + (grid.files.get(name)?.length || 0), 0);

  const totalReferences = [...referenceCount.values()].reduce((total, value) => total + value, 0);
  const brokenUrls = new Set(broken.map((item) => item.url));
  const brokenReferenceCount = broken.reduce((total, item) => total + item.references, 0);

  const duplicateUrls = [...referenceCount.entries()]
    .filter(([, count]) => count > 1)
    .map(([url, count]) => ({ url, references: count, samples: (referenced.get(url) || []).slice(0, 5) }))
    .sort((a, b) => b.references - a.references);

  const duplicateFiles = flags.skipHash ? [] : duplicateDiskFiles(disk);
  const duplicateBytes = duplicateFiles.reduce((total, item) => total + item.bytes * (item.copies - 1), 0);

  const byProblem = new Map();
  for (const item of inconsistencies) {
    byProblem.set(item.problem, (byProblem.get(item.problem) || 0) + 1);
  }

  const report = {
    generatedAt: new Date().toISOString(),
    database: db.databaseName,
    sample: sample || "completo",
    gridfs: { bucket: BUCKET, available: grid.available, files: grid.files.size },
    disk: { files: disk.size },
    referencedUrls: referenced.size,
    references: {
      total: totalReferences,
      distinctUrls: referenced.size,
      valid: totalReferences - brokenReferenceCount,
      broken: brokenReferenceCount,
      brokenUrls: brokenUrls.size
    },
    duplicates: {
      urlsReferencedMoreThanOnce: duplicateUrls.length,
      identicalFiles: duplicateFiles.length,
      recoverableBytes: duplicateBytes,
      topUrls: duplicateUrls.slice(0, 10),
      topFiles: duplicateFiles.slice(0, 10)
    },
    inconsistencies: {
      total: inconsistencies.length,
      byProblem: Object.fromEntries([...byProblem.entries()].sort((a, b) => b[1] - a[1])),
      samples: inconsistencies.slice(0, 25)
    },
    perCollection,
    brokenReferences: broken,
    orphans: {
      disk: orphanDisk,
      gridfs: orphanGrid,
      bytes: orphanBytes
    },
    servedFromGridFsOnly: onlyInGrid.length,
    proposedActions: [
      broken.length
        ? `Revisar ${broken.length} URL(s) sin archivo: restaurar desde respaldo o limpiar la referencia en la base. No se borra nada desde aquí.`
        : "Sin referencias rotas: ninguna acción.",
      orphanDisk.length + orphanGrid.length
        ? `Conservar ${orphanDisk.length + orphanGrid.length} archivo(s) huérfano(s) (${(orphanBytes / 1048576).toFixed(2)} MB) hasta confirmar respaldo; la limpieza es la migración 006 con --allow-data-deletion.`
        : "Sin archivos huérfanos: ninguna acción.",
      inconsistencies.length
        ? `Corregir ${inconsistencies.length} metadato(s) incoherentes (type/mimeType/orientation) con una migración de datos; no afectan al archivo almacenado.`
        : "Metadatos coherentes: ninguna acción.",
      duplicateFiles.length
        ? `Evaluar deduplicación de ${duplicateFiles.length} grupo(s) de archivos idénticos (${(duplicateBytes / 1048576).toFixed(2)} MB recuperables) mediante referencia compartida.`
        : "Sin archivos duplicados: ninguna acción."
    ],
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
    process.stdout.write(`  referencias totales:  ${report.references.total} (válidas ${report.references.valid} · rotas ${report.references.broken})\n`);
    process.stdout.write(`  referencias rotas:    ${broken.length}\n`);
    process.stdout.write(`  huérfanos disco:      ${orphanDisk.length}\n`);
    process.stdout.write(`  huérfanos GridFS:     ${orphanGrid.length}\n`);
    process.stdout.write(`  espacio recuperable:  ${(orphanBytes / 1048576).toFixed(2)} MB\n`);
    process.stdout.write(`  URLs duplicadas:      ${report.duplicates.urlsReferencedMoreThanOnce} (archivos idénticos ${report.duplicates.identicalFiles})\n`);
    process.stdout.write(`  metadatos incoherentes: ${report.inconsistencies.total}\n`);

    for (const [problem, count] of Object.entries(report.inconsistencies.byProblem)) {
      process.stdout.write(`    ${problem}: ${count}\n`);
    }

    for (const item of broken.slice(0, 10)) {
      process.stdout.write(`    ROTA ${item.url} (${item.references} referencias)\n`);
    }

    process.stdout.write("\nAcciones propuestas (ninguna se ejecuta):\n");
    for (const action of report.proposedActions) process.stdout.write(`  - ${action}\n`);

    process.stdout.write("\nNada se borra desde aquí: la limpieza exige respaldo verificado\n");
    process.stdout.write("y autorización explícita (migración 006 con --allow-data-deletion).\n");
  }

  process.stdout.write(`\nInforme: ${file}\n`);

  return broken.length ? EXIT.FAILURE : EXIT.OK;
}

run(main);
