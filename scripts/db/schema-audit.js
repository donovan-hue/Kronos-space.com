#!/usr/bin/env node
/**
 * FASE 3 (auditoría de esquema) — informe del esquema declarado.
 *
 *   node scripts/db/schema-audit.js              # resumen + JSON
 *   node scripts/db/schema-audit.js --markdown   # además docs/db/ESQUEMA.md
 *
 * No necesita MongoDB: describe lo que promete el código. El contraste con
 * los datos reales lo hace `scripts/db/inventory.js`.
 */

const fs = require("node:fs");
const path = require("node:path");

const { ROOT, EXIT, parseArgs } = require("./_bootstrap");

const { buildSchemaReport } = require(path.join(ROOT, "server", "src", "db", "schemaReport"));

function formatValue(value) {
  if (value === undefined) return "";
  if (value === "") return '""';
  if (Array.isArray(value)) return value.map((item) => `\`${item}\``).join(", ");
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") return `\`${JSON.stringify(value)}\``;
  return `\`${value}\``;
}

function fieldRow(field) {
  const marks = [];
  if (field.required) marks.push("obligatorio");
  if (field.unique) marks.push("único");
  if (field.indexed && !field.unique) marks.push("indexado");
  if (field.select === false) marks.push("`select:false`");
  if (typeof field.ttlSeconds === "number") marks.push(`TTL ${field.ttlSeconds}s`);
  if (field.lowercase) marks.push("minúsculas");
  if (field.trim) marks.push("recortado");

  return `| \`${field.name}\` | ${field.type} | ${marks.join(", ") || "—"} | ${field.ref ? `\`${field.ref}\`` : "—"} | ${field.enum ? formatValue(field.enum) : "—"} | ${formatValue(field.default) || "—"} |`;
}

function toMarkdown(report) {
  const lines = [];

  lines.push("# Esquema declarado (generado)");
  lines.push("");
  lines.push(`Generado por \`node scripts/db/schema-audit.js --markdown\` el ${report.generatedAt}.`);
  lines.push("No editar a mano: se regenera desde los esquemas Mongoose.");
  lines.push("");
  lines.push(`Colecciones: **${report.totalCollections}** · campos: **${report.totalFields}** · índices declarados: **${report.totalIndexes}**.`);
  lines.push("");
  lines.push("## Riesgos estructurales detectados sin datos");
  lines.push("");
  lines.push("| Severidad | Colección | Campo | Observación |");
  lines.push("|---|---|---|---|");

  for (const risk of report.risks) {
    lines.push(`| ${risk.severity} | \`${risk.collection}\` | \`${risk.field}\` | ${risk.message} |`);
  }

  if (!report.risks.length) lines.push("| — | — | — | sin riesgos |");

  lines.push("");

  for (const collection of report.collections) {
    lines.push(`## \`${collection.collection}\` — ${collection.model}`);
    lines.push("");
    lines.push(`Dominio: **${collection.domain}** · marcas temporales: ${collection.timestamps ? "sí" : "no"}${collection.sensitive ? " · **datos sensibles**" : ""}`);
    if (collection.purpose) lines.push(`\n${collection.purpose}`);
    if (collection.retention) lines.push(`\nRetención: ${collection.retention}`);
    lines.push("");
    lines.push("| Campo | Tipo | Reglas | Referencia | Catálogo | Por defecto |");
    lines.push("|---|---|---|---|---|---|");
    for (const field of collection.fields) lines.push(fieldRow(field));
    lines.push("");

    if (collection.indexes.length) {
      lines.push("Índices declarados:");
      lines.push("");
      for (const index of collection.indexes) {
        const options = Object.entries(index.options)
          .filter(([key]) => key !== "background")
          .map(([key, value]) => `${key}=${JSON.stringify(value)}`)
          .join(", ");
        lines.push(`- \`${JSON.stringify(index.key)}\`${options ? ` · ${options}` : ""}`);
      }
      lines.push("");
    }
  }

  return `${lines.join("\n")}\n`;
}

function main() {
  const { flags } = parseArgs();
  const report = buildSchemaReport();

  const critical = report.risks.filter((risk) => risk.severity === "critical");
  const warnings = report.risks.filter((risk) => risk.severity === "warning");
  const reviewed = report.risks.filter((risk) => risk.severity === "reviewed");

  process.stdout.write("\nAuditoría del esquema declarado\n");
  process.stdout.write(`  colecciones:       ${report.totalCollections}\n`);
  process.stdout.write(`  campos:            ${report.totalFields}\n`);
  process.stdout.write(`  índices:           ${report.totalIndexes}\n`);
  process.stdout.write(`  riesgos críticos:  ${critical.length}\n`);
  process.stdout.write(`  avisos:            ${warnings.length}\n`);
  process.stdout.write(`  revisados:         ${reviewed.length}\n`);

  for (const risk of critical) {
    process.stdout.write(`    CRÍTICO ${risk.collection}.${risk.field}: ${risk.message}\n`);
  }

  const reportsDir = path.join(ROOT, "docs", "db", "reports");
  fs.mkdirSync(reportsDir, { recursive: true });
  fs.writeFileSync(path.join(reportsDir, "schema-audit.json"), `${JSON.stringify(report, null, 2)}\n`);
  process.stdout.write("\nInforme: docs/db/reports/schema-audit.json\n");

  if (flags.markdown) {
    const markdownPath = path.join(ROOT, "docs", "db", "ESQUEMA.md");
    fs.mkdirSync(path.dirname(markdownPath), { recursive: true });
    fs.writeFileSync(markdownPath, toMarkdown(report));
    process.stdout.write("Documento: docs/db/ESQUEMA.md\n");
  }

  return critical.length ? EXIT.FAILURE : EXIT.OK;
}

process.exit(main());
