/**
 * 007 — índices de colecciones añadidas al registro (proyectos, estudio y MCP).
 *
 * Las bases que ya aplicaron `004-indexes` no vuelven a ejecutarlo (su
 * checksum queda sellado en `kronos_migrations`). Esta migración crea los
 * índices declarados que falten en `projects`, `musictracks`, `voices` y
 * `mcpservicecredentials`, sin modificar documentos ni tocar colecciones
 * previas, y revierte en `down()` exactamente los índices creados por `007`.
 */

const { desiredIndexes, diffIndexes, findRedundantIndexes, keySignature } = require("../db/indexPlan");

const TARGET_COLLECTIONS = [
  "projects",
  "musictracks",
  "voices",
  "mcpservicecredentials"
];

async function listExisting(db, collection) {
  try {
    return await db.collection(collection).listIndexes().toArray();
  } catch (error) {
    if (error?.code === 26 || error?.codeName === "NamespaceNotFound") return null;
    throw error;
  }
}

module.exports = {
  version: 7,
  name: "007-registered-indexes",
  description:
    "Crea los índices declarados que falten en projects, musictracks, voices y mcpservicecredentials para bases donde 004 ya fue aplicada.",
  requiresBackup: false,
  idempotent: true,
  rollback:
    "down() borra únicamente los índices creados por esta migración (registrados en kronos_migrations._id = 7).",

  async precondition(_ctx) {
    const plan = desiredIndexes();
    for (const collection of TARGET_COLLECTIONS) {
      const indexes = plan.get(collection) || [];
      const redundant = findRedundantIndexes(indexes);
      if (redundant.length) {
        return {
          ok: false,
          reason: `Índices redundantes en ${collection}: ${redundant.map((item) => item.name).join(", ")}`
        };
      }
    }
    return { ok: true };
  },

  async up(ctx) {
    const { db, dryRun, log } = ctx;
    const plan = desiredIndexes();
    const created = [];

    for (const collection of TARGET_COLLECTIONS) {
      const desired = plan.get(collection) || [];
      if (!desired.length) continue;

      const existing = await listExisting(db, collection);
      if (existing === null) {
        log(`${collection}: colección inexistente; sin cambios hasta que exista`);
        continue;
      }

      const { missing } = diffIndexes(existing, desired);
      for (const index of missing) {
        const options = { name: index.name, ...index.options };
        if (dryRun) {
          log(`simulación: crear ${collection}.${index.name} ${keySignature(index.key)}`);
        } else {
          await db.collection(collection).createIndex(index.key, options);
          log(`creado ${collection}.${index.name} ${keySignature(index.key)}`);
        }
        created.push({ collection, name: index.name, key: index.key, options: index.options });
      }
    }

    return { created, dryRun };
  },

  async verify(ctx) {
    if (ctx.dryRun) return { ok: true };

    const plan = desiredIndexes();
    for (const collection of TARGET_COLLECTIONS) {
      const desired = plan.get(collection) || [];
      if (!desired.length) continue;
      const existing = await listExisting(ctx.db, collection);
      if (existing === null) continue;
      const { missing } = diffIndexes(existing, desired);
      if (missing.length) {
        return {
          ok: false,
          reason: `${collection} sigue sin ${missing.map((index) => index.name).join(", ")}`
        };
      }
    }

    return { ok: true };
  },

  async down(ctx) {
    const { db, dryRun, log } = ctx;
    const record = await db.collection("kronos_migrations").findOne({ _id: 7 });
    const created = record?.result?.created || [];
    const removed = [];

    for (const index of created) {
      if (dryRun) {
        log(`simulación: borrar ${index.collection}.${index.name}`);
      } else {
        await db.collection(index.collection).dropIndex(index.name).catch((error) => {
          if (error?.codeName !== "IndexNotFound") throw error;
        });
        log(`borrado ${index.collection}.${index.name}`);
      }
      removed.push(`${index.collection}.${index.name}`);
    }

    return { removed };
  }
};
