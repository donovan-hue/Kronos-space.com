/**
 * KRONOS — ejecutor de migraciones versionadas.
 *
 * Reglas que impone este ejecutor (no son opcionales):
 *
 *  1. Toda migración tiene versión única, nombre y descripción.
 *  2. Se aplican en orden de versión y se registran en `kronos_migrations`.
 *  3. Una migración ya aplicada no se vuelve a aplicar (журнал + checksum).
 *  4. Antes de aplicar se ejecuta `precondition(ctx)`: si devuelve un fallo,
 *     la migración no corre y el proceso termina con error.
 *  5. `--dry-run` recorre exactamente el mismo camino sin escribir: cada
 *     migración recibe `ctx.dryRun` y debe respetarlo.
 *  6. Las migraciones que declaran `requiresBackup` exigen un respaldo
 *     verificado del MISMO servidor y base (manifiesto de backup-verify).
 *  7. Contra una base de producción hace falta confirmación explícita.
 *  8. Un candado (`kronos_migration_lock`) impide dos ejecuciones a la vez.
 *
 * El ejecutor no borra datos por su cuenta: cada migración decide, y las que
 * borran deben pedir una autorización explícita a través de `ctx.flags`.
 */

const crypto = require("node:crypto");
const os = require("node:os");

const JOURNAL_COLLECTION = "kronos_migrations";
const { isProductionEnvironment } = require("../config/environment");

const LOCK_COLLECTION = "kronos_migration_lock";
const LOCK_ID = "migrations";
const DEFAULT_LOCK_TTL_MS = 15 * 60 * 1000;

/** Error con código estable para que los scripts decidan el exit code. */
class MigrationError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = "MigrationError";
    this.code = code;
    this.details = details;
  }
}

/** Checksum del contenido declarado de la migración (detecta ediciones). */
function checksumOf(migration) {
  const material = JSON.stringify({
    version: migration.version,
    name: migration.name,
    up: String(migration.up),
    down: migration.down ? String(migration.down) : null
  });

  return crypto.createHash("sha256").update(material).digest("hex").slice(0, 32);
}

/**
 * Valida el conjunto de migraciones antes de tocar la base.
 * @returns {string[]} lista de problemas (vacía = conjunto válido)
 */
function validateMigrations(migrations = []) {
  const problems = [];
  const versions = new Set();

  for (const migration of migrations) {
    const label = migration?.version || "(sin versión)";

    if (!Number.isInteger(migration?.version) || migration.version <= 0) {
      problems.push(`${label}: la versión debe ser un entero positivo`);
    } else if (versions.has(migration.version)) {
      problems.push(`${label}: versión duplicada`);
    } else {
      versions.add(migration.version);
    }

    if (!migration?.name || typeof migration.name !== "string") {
      problems.push(`${label}: falta name`);
    }

    if (!migration?.description || typeof migration.description !== "string") {
      problems.push(`${label}: falta description`);
    }

    if (typeof migration?.up !== "function") {
      problems.push(`${label}: falta up(ctx)`);
    }

    if (migration?.down !== undefined && typeof migration.down !== "function") {
      problems.push(`${label}: down debe ser una función si existe`);
    }

    if (typeof migration?.rollback !== "string" || !migration.rollback.trim()) {
      problems.push(`${label}: falta la estrategia de rollback documentada`);
    }

    if (migration?.precondition !== undefined && typeof migration.precondition !== "function") {
      problems.push(`${label}: precondition debe ser una función si existe`);
    }
  }

  const ordered = migrations.map((migration) => migration?.version);
  const sorted = [...ordered].sort((a, b) => a - b);

  if (JSON.stringify(ordered) !== JSON.stringify(sorted)) {
    problems.push("Las migraciones deben exportarse ordenadas por versión ascendente");
  }

  return problems;
}

function journal(db) {
  return db.collection(JOURNAL_COLLECTION);
}

/** Estado aplicado de cada versión, indexado por versión. */
async function appliedMap(db) {
  const records = await journal(db).find({}).toArray();
  return new Map(records.map((record) => [record.version, record]));
}

async function acquireLock(db, { owner, ttlMs = DEFAULT_LOCK_TTL_MS, dryRun = false }) {
  if (dryRun) return { acquired: true, dryRun: true };

  const now = new Date();
  const expiresAt = new Date(now.getTime() + ttlMs);
  const collection = db.collection(LOCK_COLLECTION);

  // Un candado caducado (proceso muerto) se puede tomar; uno vivo, no.
  const result = await collection.findOneAndUpdate(
    { _id: LOCK_ID, $or: [{ expiresAt: { $lte: now } }, { expiresAt: { $exists: false } }] },
    { $set: { owner, acquiredAt: now, expiresAt } },
    { upsert: false, returnDocument: "after" }
  );

  if (result) return { acquired: true, lock: result };

  try {
    await collection.insertOne({ _id: LOCK_ID, owner, acquiredAt: now, expiresAt });
    return { acquired: true };
  } catch (error) {
    if (error?.code !== 11000) throw error;
    const current = await collection.findOne({ _id: LOCK_ID });
    throw new MigrationError(
      "MIGRATION_LOCKED",
      `Hay otra ejecución de migraciones en curso (owner: ${current?.owner || "desconocido"}).`,
      { lock: current }
    );
  }
}

async function releaseLock(db, { dryRun = false } = {}) {
  if (dryRun) return;
  await db.collection(LOCK_COLLECTION).deleteOne({ _id: LOCK_ID });
}

/**
 * Comprueba la autorización para escribir contra esta base.
 * En producción exige confirmación explícita del nombre de la base.
 *
 * La comparación era `environment !== "production"` contra la cadena exacta,
 * de modo que la única barrera que impide migrar la base real por accidente
 * desaparecía con `Production`, `PROD`, `live` o —el caso más probable, y el
 * peor— con `NODE_ENV` sin definir, que es como llega desde un portátil o un
 * runner cualquiera. Nueve de cada diez valores dejaban la guarda inactiva.
 * Ahora se pregunta al revés: solo `development` y `test` eximen de
 * confirmar.
 */
function assertWriteAuthorized({ db, dryRun, environment, confirmation }) {
  if (dryRun) return;
  if (!isProductionEnvironment(environment)) return;

  if (confirmation !== db.databaseName) {
    throw new MigrationError(
      "MIGRATION_CONFIRMATION_REQUIRED",
      `Producción requiere confirmación explícita: repite el nombre de la base (${db.databaseName}) con --confirm o KRONOS_MIGRATION_CONFIRM.`
    );
  }
}

/**
 * Nivel de verificación que un manifiesto debe declarar para autorizar una
 * migración. Duplicar el valor literal aquí es deliberado: `server/` no puede
 * depender de `scripts/`, y la prueba de contrato comprueba que ambos
 * extremos siguen diciendo lo mismo.
 */
const RESTORE_VERIFIED = "RESTORE_VERIFIED";

/**
 * Comprueba que existe un respaldo RESTAURADO de ESTA base.
 *
 * No basta con que el manifiesto exista ni con que sus checksums cuadren: un
 * respaldo íntegro que nadie ha conseguido restaurar no es un respaldo, es un
 * fichero. El nivel se exige aquí además de en el CLI porque el runner es lo
 * que de verdad ejecuta la migración, y una comprobación que vive solo en la
 * capa de arriba se salta con solo llamar a la de abajo.
 */
function assertBackupAvailable({ migration, db, backup, dryRun }) {
  if (!migration.requiresBackup || dryRun) return;

  if (!backup) {
    throw new MigrationError(
      "MIGRATION_BACKUP_REQUIRED",
      `${migration.version} exige un respaldo verificado. Ejecuta node scripts/backup-verify.js y pásalo con --backup <directorio>.`
    );
  }

  if (backup.database && backup.database !== db.databaseName) {
    throw new MigrationError(
      "MIGRATION_BACKUP_MISMATCH",
      `El respaldo corresponde a "${backup.database}" y la migración apunta a "${db.databaseName}".`
    );
  }

  if (backup.verification !== RESTORE_VERIFIED) {
    throw new MigrationError(
      "MIGRATION_BACKUP_NOT_RESTORED",
      `${migration.version} exige un respaldo con restauración demostrada. ` +
      `El manifiesto declara "${backup.verification || "sin verificar"}". ` +
      "Ejecuta node scripts/backup-verify.js --restore <dir> --target-uri <base de ensayo> hasta obtener RESTORE_VERIFIED."
    );
  }
}

function createContext({ db, mongoose, dryRun, flags, logger, version }) {
  const messages = [];

  const log = (message, data) => {
    const entry = data === undefined ? message : `${message} ${JSON.stringify(data)}`;
    messages.push(entry);
    logger(`    ${entry}`);
  };

  return {
    context: { db, mongoose, dryRun, flags, log, version },
    messages
  };
}

/**
 * Aplica las migraciones pendientes.
 *
 * @returns {Promise<{applied: Array, skipped: Array, dryRun: boolean}>}
 */
async function up({
  db,
  mongoose,
  migrations,
  to = Infinity,
  dryRun = false,
  flags = {},
  backup = null,
  // Sin `|| "development"`: ese fallback convertía un NODE_ENV ausente o
  // vacío —el caso más frecuente— en un entorno exento, y la guarda de
  // confirmación no llegaba a activarse nunca. Que lo clasifique quien sabe.
  environment = process.env.NODE_ENV,
  confirmation = process.env.KRONOS_MIGRATION_CONFIRM || "",
  logger = console.log
} = {}) {
  const problems = validateMigrations(migrations);
  if (problems.length) {
    throw new MigrationError("MIGRATION_SET_INVALID", `Conjunto de migraciones inválido:\n- ${problems.join("\n- ")}`);
  }

  assertWriteAuthorized({ db, dryRun, environment, confirmation });

  const owner = `${os.hostname()}:${process.pid}`;
  await acquireLock(db, { owner, dryRun });

  const applied = [];
  const skipped = [];

  try {
    const already = await appliedMap(db);

    for (const migration of migrations) {
      if (migration.version > to) {
        skipped.push({ version: migration.version, reason: "fuera del rango --to" });
        continue;
      }

      const record = already.get(migration.version);
      if (record && record.direction !== "down") {
        const checksum = checksumOf(migration);
        if (record.checksum && record.checksum !== checksum) {
          throw new MigrationError(
            "MIGRATION_CHECKSUM_MISMATCH",
            `${migration.version} ya está aplicada pero su código cambió (checksum ${record.checksum} → ${checksum}). Crea una migración nueva en vez de editar una aplicada.`
          );
        }
        skipped.push({ version: migration.version, reason: "ya aplicada" });
        continue;
      }

      assertBackupAvailable({ migration, db, backup, dryRun });

      logger(`\n▶ ${migration.version} ${migration.name}${dryRun ? " (simulación)" : ""}`);
      logger(`    ${migration.description}`);

      const { context, messages } = createContext({
        db,
        mongoose,
        dryRun,
        flags,
        logger,
        version: migration.version
      });

      if (typeof migration.precondition === "function") {
        const verdict = await migration.precondition(context);
        if (verdict && verdict.ok === false) {
          throw new MigrationError(
            "MIGRATION_PRECONDITION_FAILED",
            `${migration.version}: precondición no cumplida — ${verdict.reason || "sin detalle"}`,
            { version: migration.version }
          );
        }
      }

      const startedAt = Date.now();
      const result = (await migration.up(context)) || {};
      const durationMs = Date.now() - startedAt;

      if (typeof migration.verify === "function") {
        const verification = await migration.verify(context);
        if (verification && verification.ok === false) {
          throw new MigrationError(
            "MIGRATION_VERIFICATION_FAILED",
            `${migration.version}: la verificación posterior falló — ${verification.reason || "sin detalle"}`,
            { version: migration.version, result }
          );
        }
      }

      const entry = {
        version: migration.version,
        name: migration.name,
        description: migration.description,
        checksum: checksumOf(migration),
        direction: "up",
        appliedAt: new Date(),
        durationMs,
        dryRun,
        result,
        log: messages
      };

      if (!dryRun) {
        await journal(db).replaceOne({ _id: migration.version }, { _id: migration.version, ...entry }, { upsert: true });
      }

      logger(`    ✔ ${dryRun ? "simulada" : "aplicada"} en ${durationMs} ms`);
      applied.push(entry);
    }
  } finally {
    await releaseLock(db, { dryRun });
  }

  return { applied, skipped, dryRun };
}

/**
 * Revierte migraciones aplicadas, de la más nueva a la más antigua.
 * `to` es la versión hasta la que se quiere volver (inclusive se revierte
 * todo lo que sea mayor que `to`).
 */
async function down({
  db,
  mongoose,
  migrations,
  to = 0,
  dryRun = false,
  flags = {},
  // Sin `|| "development"`: ese fallback convertía un NODE_ENV ausente o
  // vacío —el caso más frecuente— en un entorno exento, y la guarda de
  // confirmación no llegaba a activarse nunca. Que lo clasifique quien sabe.
  environment = process.env.NODE_ENV,
  confirmation = process.env.KRONOS_MIGRATION_CONFIRM || "",
  logger = console.log
} = {}) {
  const problems = validateMigrations(migrations);
  if (problems.length) {
    throw new MigrationError("MIGRATION_SET_INVALID", `Conjunto de migraciones inválido:\n- ${problems.join("\n- ")}`);
  }

  assertWriteAuthorized({ db, dryRun, environment, confirmation });

  const owner = `${os.hostname()}:${process.pid}`;
  await acquireLock(db, { owner, dryRun });

  const reverted = [];

  try {
    const already = await appliedMap(db);
    const pending = [...migrations]
      .filter((migration) => migration.version > to)
      .filter((migration) => {
        const record = already.get(migration.version);
        return record && record.direction !== "down";
      })
      .sort((a, b) => b.version - a.version);

    for (const migration of pending) {
      if (typeof migration.down !== "function") {
        throw new MigrationError(
          "MIGRATION_IRREVERSIBLE",
          `${migration.version} no define down(): revertir exige restaurar el respaldo (ver ${migration.rollback}).`
        );
      }

      logger(`\n◀ revertir ${migration.version} ${migration.name}${dryRun ? " (simulación)" : ""}`);

      const { context, messages } = createContext({
        db,
        mongoose,
        dryRun,
        flags,
        logger,
        version: migration.version
      });
      const startedAt = Date.now();
      const result = (await migration.down(context)) || {};
      const durationMs = Date.now() - startedAt;

      if (!dryRun) {
        await journal(db).replaceOne(
          { _id: migration.version },
          {
            _id: migration.version,
            version: migration.version,
            name: migration.name,
            description: migration.description,
            checksum: checksumOf(migration),
            direction: "down",
            revertedAt: new Date(),
            durationMs,
            result,
            log: messages
          },
          { upsert: true }
        );
      }

      logger(`    ✔ ${dryRun ? "simulada" : "revertida"} en ${durationMs} ms`);
      reverted.push({ version: migration.version, name: migration.name, result });
    }
  } finally {
    await releaseLock(db, { dryRun });
  }

  return { reverted, dryRun };
}

/** Estado actual: qué está aplicado, qué falta y si el código cambió. */
async function status({ db, migrations }) {
  const already = await appliedMap(db);

  return migrations.map((migration) => {
    const record = already.get(migration.version);
    const checksum = checksumOf(migration);

    return {
      version: migration.version,
      name: migration.name,
      description: migration.description,
      requiresBackup: Boolean(migration.requiresBackup),
      state: !record || record.direction === "down" ? "pendiente" : "aplicada",
      appliedAt: record?.appliedAt || null,
      revertedAt: record?.revertedAt || null,
      changed: Boolean(record?.checksum && record.checksum !== checksum)
    };
  });
}

module.exports = {
  JOURNAL_COLLECTION,
  LOCK_COLLECTION,
  LOCK_ID,
  MigrationError,
  checksumOf,
  validateMigrations,
  acquireLock,
  releaseLock,
  assertWriteAuthorized,
  assertBackupAvailable,
  appliedMap,
  up,
  down,
  status
};
