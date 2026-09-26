/**
 * 006 — limpieza controlada.
 *
 * Por defecto NO borra nada: audita referencias rotas, generaciones de IA
 * abandonadas y campos que el esquema ya no declara, y guarda el informe en
 * `kronos_integrity_reports`. El borrado exige `--allow-data-deletion`, y aun
 * así solo alcanza a documentos cuya referencia obligatoria ya no existe
 * (una notificación cuyo emisor fue borrado no es recuperable ni útil).
 *
 * El contenido del usuario (publicaciones, mensajes, cápsulas, historias)
 * nunca entra en la lista de borrado automático.
 */

const { findOrphanReferences, deleteWhenAuthorized } = require("./helpers");

const REPORT_COLLECTION = "kronos_integrity_reports";

/** Referencias obligatorias: sin el documento apuntado, la fila no sirve. */
const REQUIRED_REFERENCES = [
  { from: "notifications", field: "recipient", to: "users", deletable: true },
  { from: "notifications", field: "actor", to: "users", deletable: true },
  { from: "notifications", field: "post", to: "posts", deletable: false },
  { from: "posts", field: "author", to: "users", deletable: false },
  { from: "messages", field: "sender", to: "users", deletable: false },
  { from: "hiddenposts", field: "post", to: "posts", deletable: true },
  { from: "hiddenposts", field: "user", to: "users", deletable: true },
  { from: "seenposts", field: "post", to: "posts", deletable: true },
  { from: "seenposts", field: "user", to: "users", deletable: true },
  { from: "feedsignals", field: "user", to: "users", deletable: true },
  { from: "blocks", field: "blocker", to: "users", deletable: true },
  { from: "blocks", field: "blocked", to: "users", deletable: true },
  { from: "mutes", field: "muter", to: "users", deletable: true },
  { from: "mutes", field: "muted", to: "users", deletable: true },
  { from: "channelmessages", field: "channel", to: "channels", deletable: true },
  { from: "channels", field: "orbit", to: "orbits", deletable: false },
  { from: "savedcollections", field: "owner", to: "users", deletable: false },
  { from: "circles", field: "owner", to: "users", deletable: false },
  { from: "drafts", field: "author", to: "users", deletable: false }
];

/** Generaciones que nunca terminaron: ocupan espacio y confunden al historial. */
const ABANDONED_AI = [
  { collection: "imagegenerations", statusField: "status", pending: ["queued", "processing"] },
  { collection: "videogenerations", statusField: "status", pending: ["queued", "processing"] },
  { collection: "scripts", statusField: "status", pending: ["queued", "processing"] }
];

const ABANDONED_AFTER_HOURS = 24;

async function collectionExists(db, name) {
  return db.listCollections({ name }).hasNext();
}

module.exports = {
  version: 6,
  name: "006-cleanup",
  description:
    "Audita referencias rotas, generaciones de IA abandonadas y colecciones no declaradas. Solo borra con --allow-data-deletion y únicamente filas cuya referencia obligatoria desapareció.",
  requiresBackup: true,
  idempotent: true,
  rollback:
    "El informe es reversible (borrar el documento de kronos_integrity_reports). Los borrados autorizados NO son reversibles: exigen restaurar el respaldo verificado previo a la ejecución.",

  async precondition(ctx) {
    if (ctx.flags.allowDataDeletion && ctx.dryRun === false && !ctx.flags.backupVerified) {
      return {
        ok: false,
        reason:
          "Borrar exige un respaldo verificado en la misma ejecución (--backup <directorio>). Sin él, la limpieza no está autorizada."
      };
    }
    return { ok: true };
  },

  async up(ctx) {
    const orphans = [];

    for (const reference of REQUIRED_REFERENCES) {
      if (!(await collectionExists(ctx.db, reference.from))) continue;

      const result = await findOrphanReferences(ctx, {
        from: reference.from,
        field: reference.field,
        to: reference.to
      });

      if (!result.orphanDocuments) continue;

      ctx.log(
        `huérfanos: ${reference.from}.${reference.field} → ${reference.to}: ${result.orphanDocuments} documentos`
      );

      const deletion = reference.deletable
        ? await deleteWhenAuthorized(ctx, {
          collection: reference.from,
          filter: { [reference.field]: { $in: result.orphanValues } },
          reason: `referencia rota a ${reference.to}`
        })
        : { collection: reference.from, matched: result.orphanDocuments, deleted: 0, authorized: false, reason: "contenido de usuario: revisión manual" };

      orphans.push({
        from: reference.from,
        field: reference.field,
        to: reference.to,
        orphanDocuments: result.orphanDocuments,
        deletion
      });
    }

    const cutoff = new Date(Date.now() - ABANDONED_AFTER_HOURS * 60 * 60 * 1000);
    const abandoned = [];

    for (const entry of ABANDONED_AI) {
      if (!(await collectionExists(ctx.db, entry.collection))) continue;

      const filter = { [entry.statusField]: { $in: entry.pending }, createdAt: { $lt: cutoff } };
      const matched = await ctx.db.collection(entry.collection).countDocuments(filter);

      if (!matched) continue;

      ctx.log(`generaciones abandonadas en ${entry.collection}: ${matched}`);

      // Una generación abandonada no se borra: se marca como fallida para que
      // el historial del usuario sea honesto y deje de esperar un resultado.
      let updated = 0;
      if (!ctx.dryRun) {
        const result = await ctx.db.collection(entry.collection).updateMany(filter, {
          $set: {
            [entry.statusField]: "failed",
            error: `Generación abandonada: sin respuesta del proveedor tras ${ABANDONED_AFTER_HOURS} h (migración 006).`
          }
        });
        updated = result.modifiedCount;
      }

      abandoned.push({ collection: entry.collection, matched, updated });
    }

    const existing = (await ctx.db.listCollections({}, { nameOnly: true }).toArray()).map((item) => item.name);
    const { knownCollectionNames } = require("../db/registry");
    const declared = new Set(knownCollectionNames());
    const undeclared = existing.filter(
      (name) => !declared.has(name) && !name.startsWith("kronos_") && !name.startsWith("system.") && !name.startsWith("kronosUploads.")
    );

    if (undeclared.length) {
      ctx.log(`colecciones no declaradas (no se tocan): ${undeclared.join(", ")}`);
    }

    const report = {
      version: 6,
      createdAt: new Date(),
      database: ctx.db.databaseName,
      dryRun: ctx.dryRun,
      deletionAuthorized: Boolean(ctx.flags.allowDataDeletion),
      orphans,
      abandoned,
      undeclaredCollections: undeclared
    };

    if (!ctx.dryRun) {
      await ctx.db.collection(REPORT_COLLECTION).insertOne(report);
    }

    return {
      orphanGroups: orphans.length,
      orphanDocuments: orphans.reduce((sum, item) => sum + item.orphanDocuments, 0),
      deleted: orphans.reduce((sum, item) => sum + (item.deletion?.deleted || 0), 0),
      abandoned,
      undeclaredCollections: undeclared
    };
  },

  async down(ctx) {
    if (ctx.dryRun) return { removedReports: 0, dryRun: true };
    const result = await ctx.db.collection(REPORT_COLLECTION).deleteMany({ version: 6 });
    ctx.log(`informes de integridad eliminados: ${result.deletedCount}`);
    return {
      removedReports: result.deletedCount,
      note: "Los borrados autorizados no se revierten aquí: restaurar respaldo si fuera necesario."
    };
  },

  REPORT_COLLECTION,
  REQUIRED_REFERENCES,
  ABANDONED_AI,
  ABANDONED_AFTER_HOURS
};
