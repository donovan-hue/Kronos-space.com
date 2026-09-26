/**
 * 005 — notificaciones: consistencia y retención explícita.
 *
 * `notifications` crece sin límite: una cuenta activa acumula miles de avisos
 * que solo se leen en las primeras páginas. Esta migración:
 *
 *   1. Materializa `read: false` donde falta (el filtro de no leídas usa ese
 *      campo y un documento sin él quedaba fuera del índice).
 *   2. Crea un índice TTL **solo** si la operación declara explícitamente
 *      `NOTIFICATIONS_TTL_DAYS`. Sin esa variable no se crea nada: un TTL
 *      borra documentos y eso nunca se activa por omisión.
 *
 * La poda de notificaciones antiguas ya existentes requiere además
 * `--allow-data-deletion`. Dos llaves para borrar; ninguna por defecto.
 */

const { backfillMissingField, undoBackfill, deleteWhenAuthorized } = require("./helpers");

const COLLECTION = "notifications";
const TTL_INDEX_NAME = "notifications_ttl_createdAt";

function ttlDaysFromEnv(env = process.env) {
  const raw = Number(env.NOTIFICATIONS_TTL_DAYS);
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 0;
}

module.exports = {
  version: 5,
  name: "005-notifications",
  description:
    "Normaliza `read` en notificaciones y, solo con NOTIFICATIONS_TTL_DAYS definido, crea el índice TTL de retención. Sin esa variable no se borra ni caduca nada.",
  requiresBackup: true,
  idempotent: true,
  rollback:
    "down() retira el campo rellenado con kronos_migration_undo y borra el índice TTL si esta versión lo creó. Los documentos ya caducados por TTL solo se recuperan desde el respaldo.",

  async precondition(ctx) {
    const days = ttlDaysFromEnv();

    if (days && days < 7) {
      return {
        ok: false,
        reason: `NOTIFICATIONS_TTL_DAYS=${days} es demasiado agresivo para una retención segura (mínimo 7).`
      };
    }

    return { ok: true };
  },

  async up(ctx) {
    const read = await backfillMissingField(ctx, { collection: COLLECTION, field: "read", value: false });

    const days = ttlDaysFromEnv();
    let ttl = { enabled: false, days: 0, created: false };

    if (!days) {
      ctx.log("NOTIFICATIONS_TTL_DAYS no definido: retención indefinida (no se crea TTL)");
    } else {
      const seconds = days * 24 * 60 * 60;
      if (ctx.dryRun) {
        ctx.log(`simulación: crear TTL ${TTL_INDEX_NAME} (${days} días)`);
      } else {
        await ctx.db.collection(COLLECTION).createIndex(
          { createdAt: 1 },
          { name: TTL_INDEX_NAME, expireAfterSeconds: seconds }
        );
        ctx.log(`TTL creado: ${TTL_INDEX_NAME} (${days} días)`);
      }
      ttl = { enabled: true, days, created: !ctx.dryRun, indexName: TTL_INDEX_NAME };
    }

    // Poda opcional de lo ya acumulado: exige autorización explícita.
    let pruned = { matched: 0, deleted: 0, authorized: false };
    if (days) {
      const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
      pruned = await deleteWhenAuthorized(ctx, {
        collection: COLLECTION,
        filter: { createdAt: { $lt: cutoff }, read: true },
        reason: `notificaciones leídas anteriores a ${cutoff.toISOString()}`
      });
    }

    return { collection: COLLECTION, read, ttl, pruned };
  },

  async verify(ctx) {
    if (ctx.dryRun) return { ok: true };

    const pending = await ctx.db.collection(COLLECTION).countDocuments({ read: { $exists: false } });
    if (pending > 0) return { ok: false, reason: `read sigue ausente en ${pending} notificaciones` };

    return { ok: true };
  },

  async down(ctx) {
    const reverted = await undoBackfill(ctx, { collection: COLLECTION, field: "read" });

    let ttlRemoved = false;
    if (!ctx.dryRun) {
      await ctx.db
        .collection(COLLECTION)
        .dropIndex(TTL_INDEX_NAME)
        .then(() => {
          ttlRemoved = true;
          ctx.log(`TTL retirado: ${TTL_INDEX_NAME}`);
        })
        .catch((error) => {
          if (error?.codeName !== "IndexNotFound") throw error;
        });
    }

    return { collection: COLLECTION, reverted, ttlRemoved };
  },

  TTL_INDEX_NAME,
  ttlDaysFromEnv
};
