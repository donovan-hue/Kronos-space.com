/**
 * 002 — esquema de usuarios al día.
 *
 * Solo rellena valores por defecto que el esquema ya declara y que faltan en
 * documentos antiguos. No renombra, no borra y no reescribe ningún dato que
 * el usuario haya elegido.
 *
 * Las inconsistencias que exigen criterio humano (mayúsculas en email o
 * usuario, cuentas sin contraseña ni googleId) se informan, no se "corrigen"
 * a ciegas: normalizar un email puede colisionar con un índice único y dejar
 * a alguien sin acceso.
 */

const { backfillMissingField, undoBackfill } = require("./helpers");

const COLLECTION = "users";

/** Campos con valor por defecto en el esquema que deben existir siempre. */
const DEFAULTS = [
  { field: "role", value: "user" },
  { field: "emailVerified", value: false },
  { field: "displayName", value: "" },
  { field: "bio", value: "" },
  { field: "avatar", value: "" },
  { field: "cover", value: "" },
  { field: "followers", value: [] },
  { field: "following", value: [] },
  { field: "profilePrivacy.showBio", value: true },
  { field: "profilePrivacy.showFollowCounts", value: true },
  { field: "profilePrivacy.discoverable", value: true },
  { field: "preferences.onboarded", value: false },
  { field: "preferences.notifications.inApp", value: true },
  { field: "preferences.notifications.email", value: false },
  { field: "preferences.content.showSensitive", value: false },
  { field: "preferences.language", value: "es-MX" },
  { field: "preferences.aiPersonality", value: "normal" },
  { field: "preferences.feed.mode", value: "latest" },
  { field: "preferences.feed.interests", value: [] }
];

async function auditInconsistencies(ctx) {
  const users = ctx.db.collection(COLLECTION);

  const [
    usernameNotNormalized,
    emailNotNormalized,
    withoutCredentials,
    invalidRole,
    invalidLanguage
  ] = await Promise.all([
    users.countDocuments({ $expr: { $ne: ["$username", { $toLower: "$username" }] } }),
    users.countDocuments({ $expr: { $ne: ["$email", { $toLower: "$email" }] } }),
    users.countDocuments({ passwordHash: { $in: [null, ""] }, googleId: { $in: [null, ""] } }),
    users.countDocuments({ role: { $nin: ["user", "admin"] } }),
    users.countDocuments({ "preferences.language": { $nin: ["es-MX", "en", null] } })
  ]);

  return {
    usernameNotNormalized,
    emailNotNormalized,
    withoutCredentials,
    invalidRole,
    invalidLanguage
  };
}

module.exports = {
  version: 2,
  name: "002-user-schema",
  description:
    "Rellena en `users` los valores por defecto declarados por el esquema (rol, verificación, privacidad y preferencias) e informa inconsistencias que requieren decisión humana.",
  requiresBackup: true,
  idempotent: true,
  rollback:
    "down() retira exactamente los campos rellenados usando kronos_migration_undo. Si el conteo superó el límite de deshacer, restaurar el respaldo verificado previo.",

  async precondition(ctx) {
    const exists = await ctx.db.listCollections({ name: COLLECTION }).hasNext();
    if (!exists) return { ok: true, reason: "colección aún inexistente: nada que rellenar" };

    const duplicateUsernames = await ctx.db
      .collection(COLLECTION)
      .aggregate([
        { $group: { _id: { $toLower: "$username" }, total: { $sum: 1 } } },
        { $match: { total: { $gt: 1 } } },
        { $limit: 1 }
      ])
      .toArray();

    if (duplicateUsernames.length) {
      return {
        ok: false,
        reason:
          "Hay usernames duplicados al normalizar a minúsculas. Resolverlo manualmente antes de migrar: la corrección automática podría bloquear cuentas."
      };
    }

    return { ok: true };
  },

  async up(ctx) {
    const steps = [];

    for (const entry of DEFAULTS) {
      steps.push(await backfillMissingField(ctx, { collection: COLLECTION, ...entry }));
    }

    const audit = await auditInconsistencies(ctx);

    for (const [key, value] of Object.entries(audit)) {
      if (value > 0) ctx.log(`revisión manual pendiente: ${key} = ${value}`);
    }

    return {
      collection: COLLECTION,
      backfilled: steps.filter((step) => step.matched > 0),
      totalModified: steps.reduce((sum, step) => sum + step.modified, 0),
      audit
    };
  },

  async verify(ctx) {
    const users = ctx.db.collection(COLLECTION);

    for (const entry of DEFAULTS) {
      const pending = await users.countDocuments({ [entry.field]: { $exists: false } });
      if (pending > 0 && !ctx.dryRun) {
        return { ok: false, reason: `${entry.field} sigue ausente en ${pending} documentos` };
      }
    }

    return { ok: true };
  },

  async down(ctx) {
    const reverted = [];

    for (const entry of [...DEFAULTS].reverse()) {
      reverted.push(await undoBackfill(ctx, { collection: COLLECTION, field: entry.field }));
    }

    return { collection: COLLECTION, reverted };
  },

  DEFAULTS
};
