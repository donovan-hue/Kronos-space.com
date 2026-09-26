#!/usr/bin/env node
/**
 * KRONOS — CLI de migraciones versionadas.
 *
 *   node scripts/db/migrate.js status
 *   node scripts/db/migrate.js up --dry-run
 *   node scripts/db/migrate.js up --backup backups/kronos-backup-...
 *   node scripts/db/migrate.js up --to 4
 *   node scripts/db/migrate.js down --to 3
 *   node scripts/db/migrate.js validate          (no necesita base)
 *
 * Banderas:
 *   --dry-run              simula sin escribir
 *   --to <versión>         límite superior (up) o destino (down)
 *   --backup <directorio>  respaldo verificado exigido por algunas versiones
 *   --confirm <base>       confirmación obligatoria en producción
 *   --allow-data-deletion  autoriza los borrados que una migración proponga
 *
 * Salida: 0 correcto · 1 fallo · 2 uso · 3 sin configuración.
 */

const fs = require("node:fs");
const path = require("node:path");

const { EXIT, ROOT, parseArgs, run, requireServerModule } = require("./_bootstrap");

const migrations = require(path.join(ROOT, "server", "src", "migrations"));
const runner = require(path.join(ROOT, "server", "src", "migrations", "runner"));

function usage() {
  process.stderr.write(
    "Uso: node scripts/db/migrate.js <status|up|down|validate> [--dry-run] [--to N] [--backup DIR] [--confirm BASE] [--allow-data-deletion]\n"
  );
  return EXIT.USAGE;
}

/** Lee y valida el manifiesto de un respaldo ya verificado. */
function loadBackupManifest(directory) {
  if (!directory || directory === true) {
    throw new Error("--backup requiere la ruta del respaldo verificado.");
  }

  const absolute = path.resolve(directory);
  const manifestPath = path.join(absolute, "manifest.json");

  if (!fs.existsSync(manifestPath)) {
    throw new Error(`El respaldo ${absolute} no tiene manifest.json: no es verificable.`);
  }

  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));

  if (!manifest.verifiedAt) {
    throw new Error(
      "El manifiesto no tiene marca de verificación. Ejecuta node scripts/backup-verify.js --check <directorio> antes de migrar."
    );
  }

  return { ...manifest, directory: absolute };
}

function printStatus(rows) {
  const width = Math.max(...rows.map((row) => row.name.length));

  for (const row of rows) {
    const mark = row.state === "aplicada" ? "✔" : "·";
    const backup = row.requiresBackup ? " [respaldo requerido]" : "";
    const changed = row.changed ? " [CÓDIGO CAMBIADO]" : "";
    const when = row.appliedAt ? ` ${new Date(row.appliedAt).toISOString()}` : "";
    process.stdout.write(`${mark} ${String(row.version).padStart(3, "0")} ${row.name.padEnd(width)} ${row.state}${when}${backup}${changed}\n`);
  }
}

async function main() {
  const { flags, positional } = parseArgs();
  const command = positional[0] || "status";

  if (!["status", "up", "down", "validate"].includes(command)) return usage();

  // `validate` no necesita base: comprueba el conjunto de migraciones.
  if (command === "validate") {
    const problems = runner.validateMigrations(migrations);

    if (problems.length) {
      process.stderr.write(`Conjunto inválido:\n- ${problems.join("\n- ")}\n`);
      return EXIT.FAILURE;
    }

    process.stdout.write(`Conjunto válido: ${migrations.length} migraciones, versiones ${migrations.map((m) => m.version).join(", ")}.\n`);
    return EXIT.OK;
  }

  const dryRun = Boolean(flags.dryRun);
  const to = flags.to !== undefined ? Number(flags.to) : undefined;

  if (flags.to !== undefined && !Number.isInteger(to)) {
    process.stderr.write("--to debe ser un número de versión entero.\n");
    return EXIT.USAGE;
  }

  return run(async ({ mongoose, db, redactedUri }) => {
    process.stdout.write(`Base: ${db.databaseName} (${redactedUri})\n`);

    if (command === "status") {
      printStatus(await runner.status({ db, migrations }));
      return EXIT.OK;
    }

    const options = {
      db,
      mongoose,
      migrations,
      dryRun,
      flags: {
        allowDataDeletion: Boolean(flags.allowDataDeletion),
        backupVerified: Boolean(flags.backup)
      },
      confirmation: typeof flags.confirm === "string" ? flags.confirm : process.env.KRONOS_MIGRATION_CONFIRM || ""
    };

    if (command === "up") {
      if (flags.backup) options.backup = loadBackupManifest(flags.backup);
      if (to !== undefined) options.to = to;

      const result = await runner.up(options);

      process.stdout.write(
        `\nResumen: ${result.applied.length} aplicadas${dryRun ? " (simulación)" : ""}, ${result.skipped.length} omitidas.\n`
      );

      for (const entry of result.applied) {
        process.stdout.write(`  ${entry.version} ${entry.name}: ${JSON.stringify(entry.result).slice(0, 400)}\n`);
      }

      return EXIT.OK;
    }

    options.to = to ?? 0;
    const result = await runner.down(options);
    process.stdout.write(`\nRevertidas: ${result.reverted.length}${dryRun ? " (simulación)" : ""}.\n`);
    return EXIT.OK;
  });
}

main().catch((error) => {
  process.stderr.write(`ERROR: ${error?.message || error}\n`);
  process.exit(EXIT.FAILURE);
});

module.exports = { loadBackupManifest };
