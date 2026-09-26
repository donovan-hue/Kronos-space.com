/**
 * 004 — índices al plan.
 *
 * Crea los índices que el esquema declara y que faltan en la base, y retira
 * únicamente los que el análisis demuestra redundantes: aquellos cuya clave
 * es prefijo exacto de otro índice existente y que no imponen ninguna
 * restricción propia (único, TTL, parcial o sparse).
 *
 * Un índice no contiene datos: crearlo o borrarlo nunca pierde documentos, y
 * `down()` restaura la situación anterior con la especificación guardada en
 * el diario de migraciones.
 */

const { desiredIndexes, diffIndexes, findRedundantIndexes, keySignature } = require("../db/indexPlan");

/** Índices que jamás se tocan aunque el análisis los señale. */
const PROTECTED_INDEX_NAMES = new Set(["_id_"]);

async function listExisting(db, collection) {
  try {
    return await db.collection(collection).listIndexes().toArray();
  } catch (error) {
    // NamespaceNotFound: la colección aún no existe en esta base.
    if (error?.code === 26 || error?.codeName === "NamespaceNotFound") return null;
    throw error;
  }
}

function toCreateSpec(index) {
  const options = { name: index.name, ...index.options };
  return { key: index.key, options };
}

module.exports = {
  version: 4,
  name: "004-indexes",
  description:
    "Sincroniza los índices con el plan derivado de los esquemas: crea los que faltan y retira los redundantes por prefijo. No modifica documentos.",
  requiresBackup: false,
  idempotent: true,
  rollback:
    "down() borra los índices creados por esta versión y recrea los retirados con su especificación original (guardada en kronos_migrations).",

  async precondition(ctx) {
    const plan = desiredIndexes();
    if (!plan.size) return { ok: false, reason: "El plan de índices está vacío" };

    for (const [collection, indexes] of plan) {
      const redundant = findRedundantIndexes(indexes);
      if (redundant.length) {
        return {
          ok: false,
          reason: `El propio plan declara índices redundantes en ${collection}: ${redundant
            .map((item) => item.name)
            .join(", ")}. Corregir el esquema antes de migrar.`
        };
      }
    }

    return { ok: true };
  },

  async up(ctx) {
    const { db, dryRun, log } = ctx;
    const plan = desiredIndexes();
    const created = [];
    const dropped = [];
    const kept = [];

    for (const [collection, desired] of plan) {
      const existing = await listExisting(db, collection);

      if (existing === null) {
        log(`${collection}: colección inexistente; los índices se crearán con el primer documento`);
        continue;
      }

      const { missing, conflicting, unknown } = diffIndexes(existing, desired);

      for (const index of missing) {
        const spec = toCreateSpec(index);
        if (dryRun) {
          log(`simulación: crear ${collection}.${index.name} ${keySignature(index.key)}`);
        } else {
          await db.collection(collection).createIndex(spec.key, spec.options);
          log(`creado ${collection}.${index.name} ${keySignature(index.key)}`);
        }
        created.push({ collection, name: index.name, key: index.key, options: index.options });
      }

      for (const conflict of conflicting) {
        // Un índice con las mismas claves pero distintas opciones (único, TTL,
        // parcial) NO se recrea automáticamente: cambiarlo puede rechazar
        // escrituras o borrar documentos por TTL. Se informa y se detiene.
        log(
          `conflicto en ${collection}.${conflict.existingName}: opciones en base ${JSON.stringify(conflict.existingOptions)} vs plan ${JSON.stringify(conflict.desiredOptions)}`
        );
        kept.push({ collection, name: conflict.existingName, reason: "conflicto de opciones: requiere decisión humana" });
      }

      // Solo se retiran índices que (a) no están en el plan y (b) el análisis
      // demuestra redundantes frente al conjunto deseado.
      const analysisInput = [
        ...desired.map((index) => ({ collection, name: index.name, key: index.key, options: index.options })),
        ...unknown.map((index) => ({ collection, name: index.name, key: index.key, options: index.options }))
      ];
      const redundant = findRedundantIndexes(analysisInput);
      const removable = new Set(
        redundant
          .filter((item) => unknown.some((index) => index.name === item.name))
          .map((item) => item.name)
      );

      for (const index of unknown) {
        if (PROTECTED_INDEX_NAMES.has(index.name)) continue;

        if (!removable.has(index.name)) {
          kept.push({
            collection,
            name: index.name,
            key: index.key,
            reason: "fuera del plan pero no redundante: se conserva hasta revisión humana"
          });
          continue;
        }

        const original = existing.find((item) => item.name === index.name);
        const spec = {
          collection,
          name: index.name,
          key: original.key,
          options: {
            unique: original.unique,
            sparse: original.sparse,
            expireAfterSeconds: original.expireAfterSeconds,
            partialFilterExpression: original.partialFilterExpression
          }
        };

        if (dryRun) {
          log(`simulación: retirar redundante ${collection}.${index.name} ${keySignature(index.key)}`);
        } else {
          await db.collection(collection).dropIndex(index.name);
          log(`retirado redundante ${collection}.${index.name} ${keySignature(index.key)}`);
        }
        dropped.push(spec);
      }
    }

    return { created, dropped, kept, dryRun };
  },

  async verify(ctx) {
    if (ctx.dryRun) return { ok: true };

    const plan = desiredIndexes();

    for (const [collection, desired] of plan) {
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
    const record = await db.collection("kronos_migrations").findOne({ _id: 4 });
    const created = record?.result?.created || [];
    const dropped = record?.result?.dropped || [];
    const undone = { removed: [], restored: [] };

    for (const index of created) {
      if (dryRun) {
        log(`simulación: borrar ${index.collection}.${index.name}`);
      } else {
        await db.collection(index.collection).dropIndex(index.name).catch((error) => {
          if (error?.codeName !== "IndexNotFound") throw error;
        });
        log(`borrado ${index.collection}.${index.name}`);
      }
      undone.removed.push(`${index.collection}.${index.name}`);
    }

    for (const index of dropped) {
      const options = { name: index.name };
      if (index.options?.unique) options.unique = true;
      if (index.options?.sparse) options.sparse = true;
      if (index.options?.expireAfterSeconds !== undefined && index.options.expireAfterSeconds !== null) {
        options.expireAfterSeconds = index.options.expireAfterSeconds;
      }
      if (index.options?.partialFilterExpression) {
        options.partialFilterExpression = index.options.partialFilterExpression;
      }

      if (dryRun) {
        log(`simulación: recrear ${index.collection}.${index.name}`);
      } else {
        await db.collection(index.collection).createIndex(index.key, options);
        log(`recreado ${index.collection}.${index.name}`);
      }
      undone.restored.push(`${index.collection}.${index.name}`);
    }

    return undone;
  }
};
