/**
 * 003 — esquema de publicaciones al día.
 *
 * Los feeds filtran por `audience.type`, `moderation.hidden` y `hashtags`.
 * Un documento antiguo sin esos campos obliga a MongoDB a evaluar `$exists`
 * en memoria y deja fuera del índice a la publicación. Esta migración
 * materializa los valores por defecto que el esquema ya declara.
 *
 * No toca `likes` ni `reactions`: la normalización de reacciones vive en la
 * capa de lectura (normalizePost) y reescribirla aquí cambiaría contadores
 * históricos sin necesidad.
 */

const { backfillMissingField, undoBackfill } = require("./helpers");

const COLLECTION = "posts";

const DEFAULTS = [
  { field: "audience", value: { type: "public" } },
  { field: "moderation.hidden", value: false },
  { field: "hashtags", value: [] },
  { field: "mediaItems", value: [] },
  { field: "reactions", value: [] },
  { field: "savedBy", value: [] },
  { field: "likes", value: [] },
  { field: "comments", value: [] },
  { field: "lineage", value: { derivedFrom: null, tool: "", aiGenerated: false } }
];

module.exports = {
  version: 3,
  name: "003-post-schema",
  description:
    "Materializa en `posts` los valores por defecto del esquema (audiencia pública, moderación visible, hashtags, colecciones vacías y linaje) para que los índices de feed cubran también las publicaciones antiguas.",
  requiresBackup: true,
  idempotent: true,
  rollback:
    "down() retira exactamente los campos rellenados usando kronos_migration_undo. Si el conteo superó el límite de deshacer, restaurar el respaldo verificado previo.",

  async precondition(ctx) {
    const exists = await ctx.db.listCollections({ name: COLLECTION }).hasNext();
    if (!exists) return { ok: true, reason: "colección aún inexistente: nada que rellenar" };

    const invalidAudience = await ctx.db.collection(COLLECTION).countDocuments({
      "audience.type": { $exists: true, $nin: ["public", "followers", "private", "circle", "orbit"] }
    });

    if (invalidAudience > 0) {
      return {
        ok: false,
        reason: `Hay ${invalidAudience} publicaciones con audience.type fuera del catálogo. Revisar antes de migrar: cambiarlo automáticamente alteraría la visibilidad.`
      };
    }

    return { ok: true };
  },

  async up(ctx) {
    const steps = [];

    for (const entry of DEFAULTS) {
      steps.push(await backfillMissingField(ctx, { collection: COLLECTION, ...entry }));
    }

    const posts = ctx.db.collection(COLLECTION);
    const audit = {
      circleWithoutId: await posts.countDocuments({ "audience.type": "circle", "audience.circleId": { $in: [null, undefined] } }),
      orbitWithoutId: await posts.countDocuments({ "audience.type": "orbit", "audience.orbitId": { $in: [null, undefined] } }),
      repostsWithoutSource: await posts.countDocuments({ repostOf: { $ne: null }, content: "" , "media.url": "" })
    };

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
    if (ctx.dryRun) return { ok: true };

    const posts = ctx.db.collection(COLLECTION);

    for (const entry of DEFAULTS) {
      const pending = await posts.countDocuments({ [entry.field]: { $exists: false } });
      if (pending > 0) {
        return { ok: false, reason: `${entry.field} sigue ausente en ${pending} publicaciones` };
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
