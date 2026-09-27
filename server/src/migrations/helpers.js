/**
 * KRONOS — utilidades compartidas por las migraciones.
 *
 * Tres garantías que aportan estas funciones:
 *
 *  - Toda escritura se puede simular (`dryRun`) contando exactamente los
 *    mismos documentos que se modificarían.
 *  - Todo relleno de campos deja un registro de deshacer (`kronos_migration_undo`)
 *    con los identificadores afectados, de modo que `down()` revierte solo
 *    lo que la migración tocó y nunca datos ajenos.
 *  - Las comprobaciones de referencias huérfanas se hacen por lotes, sin
 *    cargar colecciones enteras en memoria.
 */

const UNDO_COLLECTION = "kronos_migration_undo";

/** Límite de identificadores guardados para deshacer un paso. */
const UNDO_MAX_IDS = 200_000;

/** Tamaño de lote para comprobaciones de existencia. */
const LOOKUP_BATCH = 1_000;

/**
 * Rellena un campo ausente con su valor por defecto de esquema.
 *
 * Solo toca documentos donde el campo NO existe: es idempotente y nunca
 * sobrescribe un valor real del usuario.
 *
 * @returns {Promise<{collection:string, field:string, matched:number, modified:number, undoRecorded:boolean}>}
 */
async function backfillMissingField(ctx, { collection, field, value, extraFilter = {} }) {
  const { db, dryRun, log } = ctx;
  const filter = { ...extraFilter, [field]: { $exists: false } };
  const target = db.collection(collection);
  const matched = await target.countDocuments(filter);

  if (matched === 0) {
    return { collection, field, matched: 0, modified: 0, undoRecorded: false };
  }

  if (dryRun) {
    log(`simulación: ${collection}.${field} se rellenaría en ${matched} documentos`);
    return { collection, field, matched, modified: 0, undoRecorded: false };
  }

  const ids = matched <= UNDO_MAX_IDS
    ? (await target.find(filter, { projection: { _id: 1 } }).toArray()).map((doc) => doc._id)
    : null;

  const result = await target.updateMany(filter, { $set: { [field]: value } });

  if (ids) {
    await db.collection(UNDO_COLLECTION).insertOne({
      version: ctx.version,
      step: `${collection}.${field}`,
      action: "unset",
      collection,
      field,
      ids,
      createdAt: new Date()
    });
  } else {
    log(`aviso: ${collection}.${field} afectó ${matched} documentos (> ${UNDO_MAX_IDS}); el rollback exige restaurar respaldo`);
  }

  log(`${collection}.${field}: ${result.modifiedCount} documentos rellenados`);

  return {
    collection,
    field,
    matched,
    modified: result.modifiedCount,
    undoRecorded: Boolean(ids)
  };
}

/** Revierte un `backfillMissingField` usando el registro de deshacer. */
async function undoBackfill(ctx, { collection, field }) {
  const { db, dryRun, log } = ctx;
  const undo = db.collection(UNDO_COLLECTION);
  const records = await undo.find({ version: ctx.version, collection, field, action: "unset" }).toArray();

  if (!records.length) {
    return { collection, field, reverted: 0, note: "sin registro de deshacer" };
  }

  let reverted = 0;

  for (const record of records) {
    if (dryRun) {
      reverted += record.ids.length;
      continue;
    }

    const result = await db.collection(collection).updateMany(
      { _id: { $in: record.ids } },
      { $unset: { [field]: "" } }
    );
    reverted += result.modifiedCount;
    await undo.deleteOne({ _id: record._id });
  }

  log(`${collection}.${field}: ${reverted} documentos revertidos`);

  return { collection, field, reverted };
}

/**
 * Identificadores referenciados que ya no existen en la colección destino.
 *
 * @param {object} ctx
 * @param {object} options
 * @param {string} options.from        Colección que referencia.
 * @param {string} options.field       Campo con la referencia (ObjectId).
 * @param {string} options.to          Colección referenciada.
 * @param {object} [options.filter]    Filtro extra sobre `from`.
 * @param {number} [options.limit]     Máximo de documentos huérfanos a listar.
 */
async function findOrphanReferences(ctx, { from, field, to, filter = {}, limit = 1000 }) {
  const { db } = ctx;
  const source = db.collection(from);
  const target = db.collection(to);

  const referenced = await source.distinct(field, {
    ...filter,
    [field]: { $nin: [null, ""], $exists: true }
  });

  const missing = [];

  for (let index = 0; index < referenced.length; index += LOOKUP_BATCH) {
    const batch = referenced.slice(index, index + LOOKUP_BATCH);
    const found = await target
      .find({ _id: { $in: batch } }, { projection: { _id: 1 } })
      .toArray();
    const foundIds = new Set(found.map((doc) => String(doc._id)));

    for (const id of batch) {
      if (!foundIds.has(String(id))) missing.push(id);
      if (missing.length >= limit) break;
    }

    if (missing.length >= limit) break;
  }

  if (!missing.length) {
    return { from, field, to, referenced: referenced.length, orphanValues: [], orphanDocuments: 0 };
  }

  const orphanDocuments = await source.countDocuments({ ...filter, [field]: { $in: missing } });

  return {
    from,
    field,
    to,
    referenced: referenced.length,
    orphanValues: missing,
    orphanDocuments
  };
}

/**
 * Borra documentos solo cuando la ejecución lo autoriza explícitamente.
 * Sin autorización devuelve el recuento y no toca nada.
 */
async function deleteWhenAuthorized(ctx, { collection, filter, reason }) {
  const { db, dryRun, flags, log } = ctx;
  const matched = await db.collection(collection).countDocuments(filter);

  if (matched === 0) return { collection, matched: 0, deleted: 0, authorized: Boolean(flags.allowDataDeletion) };

  if (!flags.allowDataDeletion) {
    log(`${collection}: ${matched} documentos candidatos a borrar (${reason}). Sin --allow-data-deletion no se borra nada.`);
    return { collection, matched, deleted: 0, authorized: false, reason };
  }

  if (dryRun) {
    log(`simulación: ${collection} borraría ${matched} documentos (${reason})`);
    return { collection, matched, deleted: 0, authorized: true, dryRun: true, reason };
  }

  const result = await db.collection(collection).deleteMany(filter);
  log(`${collection}: ${result.deletedCount} documentos borrados (${reason})`);

  return { collection, matched, deleted: result.deletedCount, authorized: true, reason };
}

/** Campos presentes en la base que el esquema ya no declara. */
async function findUnknownFields(ctx, { collection, knownFields, sampleSize = 1000 }) {
  const { db } = ctx;
  const documents = await db.collection(collection).find({}, { limit: sampleSize }).toArray();
  const known = new Set(knownFields);
  const unknown = new Map();

  for (const document of documents) {
    for (const key of Object.keys(document)) {
      if (known.has(key) || key === "_id" || key === "__v") continue;
      unknown.set(key, (unknown.get(key) || 0) + 1);
    }
  }

  return [...unknown.entries()]
    .map(([field, count]) => ({ field, count }))
    .sort((a, b) => b.count - a.count);
}

module.exports = {
  UNDO_COLLECTION,
  UNDO_MAX_IDS,
  backfillMissingField,
  undoBackfill,
  findOrphanReferences,
  deleteWhenAuthorized,
  findUnknownFields
};
