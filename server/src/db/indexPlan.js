/**
 * KRONOS — plan de índices y análisis de redundancia.
 *
 * El plan NO se escribe a mano: se deriva de los esquemas Mongoose reales
 * (`schema.indexes()`), que son la fuente de verdad de la aplicación. Este
 * módulo añade únicamente el análisis:
 *
 *   - `diffIndexes`: qué falta en la base, qué sobra y qué entra en conflicto.
 *   - `findRedundantIndexes`: índices cuyo prefijo ya cubre otro índice.
 *   - `describePlan`: informe legible para inventario y auditoría.
 *
 * Todas las funciones son puras (no abren conexiones) para poder probarse
 * sin MongoDB. La aplicación real de los cambios vive en las migraciones.
 */

const { listCollections } = require("./registry");

/** Opciones que hacen que un índice NO sea sustituible por otro más largo. */
const SPECIAL_OPTIONS = [
  "unique",
  "expireAfterSeconds",
  "partialFilterExpression",
  "sparse",
  "collation",
  "weights",
  "hidden",
  "wildcardProjection"
];

/** Opciones que importan al comparar un índice deseado con el de la base. */
const COMPARED_OPTIONS = [
  "unique",
  "expireAfterSeconds",
  "partialFilterExpression",
  "sparse"
];

/** Firma estable de una clave de índice: conserva orden y dirección. */
function keySignature(key = {}) {
  return Object.entries(key)
    .map(([field, direction]) => `${field}:${direction}`)
    .join(",");
}

/** Nombre por defecto que MongoDB asigna a una clave. */
function defaultIndexName(key = {}) {
  return Object.entries(key)
    .map(([field, direction]) => `${field}_${direction}`)
    .join("_");
}

/** ¿`candidate` es prefijo (mismo orden y dirección) de `other`? */
function isKeyPrefixOf(candidate = {}, other = {}) {
  const a = Object.entries(candidate);
  const b = Object.entries(other);

  if (a.length === 0 || a.length >= b.length) return false;

  return a.every(([field, direction], position) =>
    b[position][0] === field && b[position][1] === direction);
}

function hasSpecialOptions(options = {}) {
  return SPECIAL_OPTIONS.some((option) => options[option] !== undefined && options[option] !== false);
}

function comparableOptions(options = {}) {
  const result = {};

  for (const option of COMPARED_OPTIONS) {
    if (options[option] === undefined) continue;
    if (option === "unique" || option === "sparse") {
      if (options[option]) result[option] = true;
      continue;
    }
    result[option] = options[option];
  }

  return result;
}

/**
 * Índices deseados por colección, derivados de los esquemas.
 * `_id_` no se declara: MongoDB lo crea siempre y nunca debe tocarse.
 */
function desiredIndexes() {
  const plan = new Map();

  for (const entry of listCollections()) {
    const indexes = entry.Model.schema.indexes().map(([key, rawOptions = {}]) => {
      const options = { ...rawOptions };
      // `background` es un remanente sin efecto desde MongoDB 4.2: no forma
      // parte del contrato del índice y ensucia cualquier comparación.
      delete options.background;
      const name = options.name || defaultIndexName(key);
      delete options.name;

      return {
        collection: entry.collection,
        model: entry.model,
        name,
        key,
        signature: keySignature(key),
        options
      };
    });

    plan.set(entry.collection, indexes);
  }

  return plan;
}

/** Lista plana del plan (útil para informes y pruebas). */
function desiredIndexList() {
  return [...desiredIndexes().values()].flat();
}

/**
 * Índices redundantes dentro de un conjunto: su clave es prefijo de otro y
 * no aportan una restricción propia (único, TTL, parcial, sparse…).
 *
 * @param {Array<{name:string,key:Object,options?:Object}>} indexes
 * @returns {Array<{name:string,supersededBy:string,reason:string}>}
 */
function findRedundantIndexes(indexes = []) {
  const usable = indexes.filter((index) => index.name !== "_id_");
  const redundant = [];

  for (const candidate of usable) {
    if (hasSpecialOptions(candidate.options || {})) continue;

    const superseding = usable.find((other) =>
      other.name !== candidate.name && isKeyPrefixOf(candidate.key, other.key));

    if (!superseding) continue;

    redundant.push({
      collection: candidate.collection,
      name: candidate.name,
      key: candidate.key,
      supersededBy: superseding.name,
      supersededByKey: superseding.key,
      reason: `La clave ${keySignature(candidate.key)} es prefijo de ${keySignature(superseding.key)}: MongoDB usa el índice compuesto para las mismas consultas.`
    });
  }

  return redundant;
}

/**
 * Compara los índices de una colección en la base con el plan.
 *
 * @param {Array} existing Resultado de `collection.listIndexes().toArray()`.
 * @param {Array} desired  Índices deseados de esa colección.
 */
function diffIndexes(existing = [], desired = []) {
  const existingBySignature = new Map(
    existing
      .filter((index) => index.name !== "_id_")
      .map((index) => [keySignature(index.key), index])
  );
  const desiredBySignature = new Map(desired.map((index) => [index.signature, index]));

  const missing = [];
  const conflicting = [];

  for (const index of desired) {
    const current = existingBySignature.get(index.signature);

    if (!current) {
      missing.push(index);
      continue;
    }

    const currentOptions = comparableOptions(current);
    const wantedOptions = comparableOptions(index.options);

    if (JSON.stringify(currentOptions) !== JSON.stringify(wantedOptions)) {
      conflicting.push({
        ...index,
        existingName: current.name,
        existingOptions: currentOptions,
        desiredOptions: wantedOptions
      });
    }
  }

  const unknown = [...existingBySignature.values()]
    .filter((index) => !desiredBySignature.has(keySignature(index.key)))
    .map((index) => ({
      name: index.name,
      key: index.key,
      signature: keySignature(index.key),
      options: comparableOptions(index)
    }));

  return { missing, conflicting, unknown };
}

/** Informe completo del plan: totales, redundancias y TTL declarados. */
function describePlan() {
  const plan = desiredIndexes();
  const collections = [];

  for (const [collection, indexes] of plan) {
    collections.push({
      collection,
      total: indexes.length,
      indexes: indexes.map((index) => ({
        name: index.name,
        key: index.key,
        options: index.options
      })),
      redundant: findRedundantIndexes(indexes),
      ttl: indexes
        .filter((index) => index.options.expireAfterSeconds !== undefined)
        .map((index) => ({ name: index.name, expireAfterSeconds: index.options.expireAfterSeconds }))
    });
  }

  collections.sort((a, b) => a.collection.localeCompare(b.collection));

  return {
    collections,
    totalIndexes: collections.reduce((sum, item) => sum + item.total, 0),
    totalRedundant: collections.reduce((sum, item) => sum + item.redundant.length, 0)
  };
}

module.exports = {
  SPECIAL_OPTIONS,
  COMPARED_OPTIONS,
  keySignature,
  defaultIndexName,
  isKeyPrefixOf,
  hasSpecialOptions,
  comparableOptions,
  desiredIndexes,
  desiredIndexList,
  findRedundantIndexes,
  diffIndexes,
  describePlan
};
