#!/usr/bin/env node
/**
 * FASE 1 (aplicación) — inventario estático del acceso a datos.
 *
 *   node scripts/db/code-inventory.js            # informe en consola
 *   node scripts/db/code-inventory.js --markdown # además escribe docs/db/INVENTARIO-CODIGO.md
 *
 * No necesita MongoDB: recorre `server/src` y responde, con evidencia de
 * archivo y línea, a las preguntas del plan maestro:
 *
 *   ¿dónde están los modelos? ¿cuántos find/findOne/aggregate/populate hay?
 *   ¿qué endpoints dependen de cada colección? ¿hay acceso directo al driver?
 *   ¿hay transacciones? ¿qué consultas escriben?
 */

const fs = require("node:fs");
const path = require("node:path");

const { ROOT, EXIT, parseArgs } = require("./_bootstrap");

const SERVER_SRC = path.join(ROOT, "server", "src");

const OPERATIONS = [
  { id: "find", pattern: /\.find\(/g, kind: "lectura" },
  { id: "findOne", pattern: /\.findOne\(/g, kind: "lectura" },
  { id: "findById", pattern: /\.findById\(/g, kind: "lectura" },
  { id: "countDocuments", pattern: /\.countDocuments\(/g, kind: "lectura" },
  { id: "distinct", pattern: /\.distinct\(/g, kind: "lectura" },
  { id: "exists", pattern: /\.exists\(/g, kind: "lectura" },
  { id: "aggregate", pattern: /\.aggregate\(/g, kind: "lectura" },
  { id: "populate", pattern: /\.populate\(/g, kind: "lectura" },
  { id: "lean", pattern: /\.lean\(\)/g, kind: "lectura" },
  { id: "create", pattern: /\.create\(/g, kind: "escritura" },
  { id: "insertOne", pattern: /\.insertOne\(/g, kind: "escritura" },
  { id: "insertMany", pattern: /\.insertMany\(/g, kind: "escritura" },
  { id: "updateOne", pattern: /\.updateOne\(/g, kind: "escritura" },
  { id: "updateMany", pattern: /\.updateMany\(/g, kind: "escritura" },
  { id: "findOneAndUpdate", pattern: /\.findOneAndUpdate\(/g, kind: "escritura" },
  { id: "findByIdAndUpdate", pattern: /\.findByIdAndUpdate\(/g, kind: "escritura" },
  { id: "findOneAndDelete", pattern: /\.findOneAndDelete\(/g, kind: "escritura" },
  { id: "deleteOne", pattern: /\.deleteOne\(/g, kind: "escritura" },
  { id: "deleteMany", pattern: /\.deleteMany\(/g, kind: "escritura" },
  { id: "bulkWrite", pattern: /\.bulkWrite\(/g, kind: "escritura" },
  { id: "save", pattern: /\.save\(\)/g, kind: "escritura" },
  { id: "startSession", pattern: /startSession\(/g, kind: "transacción" },
  { id: "withTransaction", pattern: /withTransaction\(/g, kind: "transacción" },
  { id: "driverDirecto", pattern: /(mongoose\.connection\.db|connection\.db\.collection|db\.collection\()/g, kind: "acceso directo" }
];

function walk(directory, files = []) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(full, files);
    else if (entry.name.endsWith(".js")) files.push(full);
  }
  return files;
}

function countMatches(source, pattern) {
  const matches = source.match(pattern);
  return matches ? matches.length : 0;
}

/** Prefijos reales de montaje leídos de server.js (no inventados). */
function mountedPrefixes() {
  const source = fs.readFileSync(path.join(SERVER_SRC, "server.js"), "utf8");
  const routes = new Map();
  const pattern = /app\.use\(\s*"(\/[^"]*)"\s*,\s*(?:[A-Za-z0-9_]+\s*,\s*)*([A-Za-z0-9_]+)\s*\)/g;
  let match;

  while ((match = pattern.exec(source)) !== null) {
    routes.set(match[2], match[1]);
  }

  const imports = new Map();
  const importPattern = /const\s+(?:\{\s*router:\s*)?([A-Za-z0-9_]+)\s*\}?\s*=\s*require\("\.\/(modules\/[^"]+)"\)/g;

  while ((match = importPattern.exec(source)) !== null) {
    imports.set(match[1], `${match[2]}.js`);
  }

  const byFile = new Map();
  for (const [variable, prefix] of routes) {
    const file = imports.get(variable);
    if (file) byFile.set(file, prefix);
  }

  return byFile;
}

function endpointsOf(source, prefix) {
  const pattern = /router\.(get|post|put|patch|delete)\(\s*"([^"]*)"/g;
  const endpoints = [];
  let match;

  while ((match = pattern.exec(source)) !== null) {
    const suffix = match[2] === "/" ? "" : match[2];
    endpoints.push({
      method: match[1].toUpperCase(),
      path: `${prefix || "(sin montar)"}${suffix}`
    });
  }

  return endpoints;
}

/** Modelos usados por un archivo, detectados por sus require(). */
function modelsUsedBy(source, modelsByFile) {
  const used = new Set();
  const pattern = /require\("([^"]+)"\)/g;
  let match;

  while ((match = pattern.exec(source)) !== null) {
    const target = match[1];
    for (const [file, model] of modelsByFile) {
      if (target.endsWith(path.basename(file, ".js")) || target.endsWith(file)) used.add(model);
    }
  }

  return [...used];
}

function buildInventory() {
  const registry = require(path.join(SERVER_SRC, "db", "registry"));
  const collections = registry.listCollections();

  const modelsByFile = new Map();
  for (const entry of collections) {
    const file = `${entry.model}.js`;
    modelsByFile.set(file, entry.model);
  }

  const prefixes = mountedPrefixes();
  const files = walk(SERVER_SRC).sort();

  const perFile = [];
  const totals = Object.fromEntries(OPERATIONS.map((operation) => [operation.id, 0]));
  const endpoints = [];

  for (const file of files) {
    const relative = path.relative(path.join(ROOT, "server"), file).replace(/\\/g, "/");
    const source = fs.readFileSync(file, "utf8");
    const operations = {};

    for (const operation of OPERATIONS) {
      const count = countMatches(source, operation.pattern);
      if (count) {
        operations[operation.id] = count;
        totals[operation.id] += count;
      }
    }

    const moduleKey = relative.replace(/^src\//, "");
    const prefix = prefixes.get(moduleKey);
    const fileEndpoints = endpointsOf(source, prefix);
    const models = modelsUsedBy(source, modelsByFile);

    if (fileEndpoints.length) {
      endpoints.push(...fileEndpoints.map((endpoint) => ({ ...endpoint, file: relative, models })));
    }

    if (Object.keys(operations).length || fileEndpoints.length) {
      perFile.push({ file: relative, operations, endpoints: fileEndpoints.length, models });
    }
  }

  const byCollection = collections.map((entry) => {
    const users = perFile.filter((item) => item.models.includes(entry.model));
    return {
      collection: entry.collection,
      model: entry.model,
      domain: entry.domain,
      files: users.map((item) => item.file),
      endpoints: endpoints.filter((endpoint) => endpoint.models.includes(entry.model)).map((endpoint) => `${endpoint.method} ${endpoint.path}`)
    };
  });

  return {
    generatedAt: new Date().toISOString(),
    scanned: files.length,
    totals,
    endpoints: endpoints.length,
    perFile: perFile.sort((a, b) => b.endpoints - a.endpoints || a.file.localeCompare(b.file)),
    byCollection
  };
}

function toMarkdown(inventory) {
  const lines = [];

  lines.push("# Inventario de acceso a datos (generado)");
  lines.push("");
  lines.push(`Generado por \`node scripts/db/code-inventory.js --markdown\` el ${inventory.generatedAt}.`);
  lines.push("No editar a mano: se regenera con el código.");
  lines.push("");
  lines.push("## Operaciones detectadas");
  lines.push("");
  lines.push("| Operación | Tipo | Apariciones |");
  lines.push("|---|---|---:|");

  for (const operation of OPERATIONS) {
    const total = inventory.totals[operation.id] || 0;
    if (!total) continue;
    lines.push(`| \`${operation.id}\` | ${operation.kind} | ${total} |`);
  }

  lines.push("");
  lines.push(`Endpoints detectados: **${inventory.endpoints}** en ${inventory.scanned} archivos de \`server/src\`.`);
  lines.push("");
  lines.push("## Colecciones y endpoints que dependen de ellas");
  lines.push("");
  lines.push("| Colección | Dominio | Archivos | Endpoints |");
  lines.push("|---|---|---:|---:|");

  for (const entry of inventory.byCollection) {
    lines.push(`| \`${entry.collection}\` | ${entry.domain} | ${entry.files.length} | ${entry.endpoints.length} |`);
  }

  lines.push("");
  lines.push("## Detalle por colección");
  lines.push("");

  for (const entry of inventory.byCollection) {
    lines.push(`### \`${entry.collection}\` (${entry.model})`);
    lines.push("");
    lines.push(`Archivos: ${entry.files.map((file) => `\`${file}\``).join(", ") || "—"}`);
    lines.push("");
    if (entry.endpoints.length) {
      lines.push("Endpoints:");
      lines.push("");
      for (const endpoint of entry.endpoints) lines.push(`- \`${endpoint}\``);
      lines.push("");
    }
  }

  return `${lines.join("\n")}\n`;
}

function main() {
  const { flags } = parseArgs();
  const inventory = buildInventory();

  process.stdout.write("\nInventario estático de acceso a datos\n");
  process.stdout.write(`  archivos analizados: ${inventory.scanned}\n`);
  process.stdout.write(`  endpoints: ${inventory.endpoints}\n`);

  for (const operation of OPERATIONS) {
    const total = inventory.totals[operation.id] || 0;
    if (total) process.stdout.write(`  ${operation.id.padEnd(18)} ${String(total).padStart(4)}  (${operation.kind})\n`);
  }

  const reportsDir = path.join(ROOT, "docs", "db", "reports");
  fs.mkdirSync(reportsDir, { recursive: true });
  const jsonPath = path.join(reportsDir, "code-inventory.json");
  fs.writeFileSync(jsonPath, `${JSON.stringify(inventory, null, 2)}\n`);
  process.stdout.write(`\nInforme: ${path.relative(ROOT, jsonPath)}\n`);

  if (flags.markdown) {
    const markdownPath = path.join(ROOT, "docs", "db", "INVENTARIO-CODIGO.md");
    fs.mkdirSync(path.dirname(markdownPath), { recursive: true });
    fs.writeFileSync(markdownPath, toMarkdown(inventory));
    process.stdout.write(`Documento: ${path.relative(ROOT, markdownPath)}\n`);
  }

  return EXIT.OK;
}

process.exit(main());
