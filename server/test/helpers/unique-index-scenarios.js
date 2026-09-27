/**
 * Escenarios de la comprobación de duplicados de índices ÚNICOS.
 *
 * Un solo catálogo para las dos capas de prueba, para que no puedan
 * divergir:
 *
 *   1. `unique-index-duplicates.contract.test.js` — sin base de datos.
 *      Fija la ESTRUCTURA que decide el veredicto: el dominio del índice
 *      (qué documentos indexa MongoDB) y la clave de agrupación (qué clave
 *      genera para cada uno).
 *
 *   2. `unique-index-duplicates.e2e.test.js` — contra MongoDB REAL.
 *      Inserta `documentos`, ejecuta el auditor y comprueba el veredicto
 *      contra el propio motor: crea el índice en una base temporal y exige
 *      que LIMPIO ⇔ la creación funciona, y DUPLICADOS ⇔ E11000. Si no hay
 *      MongoDB declarado, se OMITE (nunca se inventa el resultado).
 *
 * Reglas reproducidas, del manual de MongoDB 8.0:
 *
 *   - unique: «a unique index stores a null value for a document missing the
 *     indexed field; that is a missing index field is treated as another
 *     instance of a null index key value» → dos documentos sin el campo
 *     colisionan de verdad.
 *   - sparse: «only contain entries for documents that have the indexed
 *     field, even if the index field contains a null value… skips over any
 *     document that is missing the indexed field» y «allows multiple
 *     documents that omit the key».
 *   - sparse compuesto: «only indexes documents that contain a value for at
 *     least one of the keys»; las claves ausentes se indexan como null.
 *   - partial: la restricción única «only applies to documents that meet the
 *     filter expression»; `sparse` y `partialFilterExpression` son
 *     excluyentes entre sí.
 */

"use strict";

/**
 * @typedef {Object} Escenario
 * @property {string}  id               Identificador estable.
 * @property {string}  titulo           Caso tal como se exige en la tarea.
 * @property {Object}  indice           Definición como la devuelve listIndexes.
 * @property {Array}   documentos       Datos que se insertan en la capa real.
 * @property {"LIMPIO"|"DUPLICADOS"|"NO_AUDITADO"} esperado
 * @property {Object|null} dominioEsperado  Filtro exacto del dominio del índice.
 * @property {number}  documentosEnDominio  Cuántos documentos indexa MongoDB.
 * @property {string}  porque           Por qué ese veredicto es el correcto.
 */

/** @type {Escenario[]} */
const ESCENARIOS = [
  {
    id: "unique-normal-duplicado",
    titulo: "unique normal con duplicado real => DUPLICADOS",
    indice: { name: "email_1", key: { email: 1 }, unique: true },
    documentos: [
      { email: "ana@kronos.test" },
      { email: "ana@kronos.test" },
      { email: "leo@kronos.test" }
    ],
    esperado: "DUPLICADOS",
    dominioEsperado: null,
    documentosEnDominio: 3,
    porque: "Dos documentos comparten el valor: el índice único no se puede crear (E11000)."
  },
  {
    id: "unique-normal-limpio",
    titulo: "unique normal sin duplicados => LIMPIO",
    indice: { name: "email_1", key: { email: 1 }, unique: true },
    documentos: [
      { email: "ana@kronos.test" },
      { email: "leo@kronos.test" },
      { email: "mia@kronos.test" }
    ],
    esperado: "LIMPIO",
    dominioEsperado: null,
    documentosEnDominio: 3,
    porque: "Tres valores distintos y presentes: ninguna colisión."
  },
  {
    id: "unique-normal-varios-sin-campo",
    titulo: "unique NO sparse con varios documentos sin el campo => DUPLICADOS",
    indice: { name: "email_1", key: { email: 1 }, unique: true },
    documentos: [
      { email: "ana@kronos.test" },
      { nombre: "sin email" },
      { nombre: "tampoco tiene email" }
    ],
    esperado: "DUPLICADOS",
    dominioEsperado: null,
    documentosEnDominio: 3,
    porque:
      "Sin sparse, la ausencia del campo se indexa como una clave null más: " +
      "el segundo documento sin `email` choca con el primero. Corregir el falso " +
      "positivo del caso sparse no puede apagar esta detección.",
    // Este escenario es la contraprueba del arreglo: si alguien "arregla" el
    // falso positivo excluyendo siempre los documentos sin la clave, aquí
    // aparece un falso NEGATIVO y la prueba se pone roja.
    contraprueba: true
  },
  {
    id: "unique-sparse-produccion",
    titulo: "unique sparse con múltiples documentos sin campo => LIMPIO",
    indice: { name: "googleId_1", key: { googleId: 1 }, unique: true, sparse: true },
    documentos: [
      { googleId: "104729501234567890123" },
      { username: "local-1" },
      { username: "local-2" },
      { username: "local-3" },
      { username: "local-4" }
    ],
    esperado: "LIMPIO",
    dominioEsperado: { googleId: { $exists: true } },
    documentosEnDominio: 1,
    porque:
      "Es la forma exacta de users.googleId_1 en producción (1 documento con " +
      "googleId y el resto sin el campo). El índice sparse no indexa a los que " +
      "no lo tienen, así que no hay nada que pueda colisionar."
  },
  {
    id: "unique-sparse-valor-repetido",
    titulo: "unique sparse con un valor repetido => DUPLICADOS",
    indice: { name: "googleId_1", key: { googleId: 1 }, unique: true, sparse: true },
    documentos: [
      { googleId: "104729501234567890123" },
      { googleId: "104729501234567890123" },
      { username: "local-1" },
      { username: "local-2" }
    ],
    esperado: "DUPLICADOS",
    dominioEsperado: { googleId: { $exists: true } },
    documentosEnDominio: 2,
    porque: "El valor presente está repetido: eso sí es una colisión real dentro del índice."
  },
  {
    id: "unique-sparse-valores-distintos",
    titulo: "unique sparse con valores distintos => LIMPIO",
    indice: { name: "googleId_1", key: { googleId: 1 }, unique: true, sparse: true },
    documentos: [
      { googleId: "104729501234567890123" },
      { googleId: "104729509876543210987" },
      { username: "local-1" }
    ],
    esperado: "LIMPIO",
    dominioEsperado: { googleId: { $exists: true } },
    documentosEnDominio: 2,
    porque: "Dos valores distintos presentes y un documento fuera del índice."
  },
  {
    id: "unique-sparse-nulos-explicitos",
    titulo: "unique sparse con el campo presente a null repetido => DUPLICADOS",
    indice: { name: "googleId_1", key: { googleId: 1 }, unique: true, sparse: true },
    documentos: [
      { googleId: null },
      { googleId: null },
      { username: "local-1" }
    ],
    esperado: "DUPLICADOS",
    dominioEsperado: { googleId: { $exists: true } },
    documentosEnDominio: 2,
    porque:
      "Un índice sparse SÍ indexa el campo presente con valor null. Excluir por " +
      "`$exists:false` es correcto; excluir por `$ne:null` sería un falso negativo.",
    contraprueba: true
  },
  {
    id: "unique-compuesto-sparse-fuera-de-dominio",
    titulo: "unique compuesto sparse con documentos fuera de dominio => LIMPIO",
    indice: {
      name: "proveedor_1_externo_1",
      key: { proveedor: 1, externo: 1 },
      unique: true,
      sparse: true
    },
    documentos: [
      { proveedor: "google", externo: "abc" },
      { username: "local-1" },
      { username: "local-2" },
      { username: "local-3" }
    ],
    esperado: "LIMPIO",
    dominioEsperado: {
      $or: [{ proveedor: { $exists: true } }, { externo: { $exists: true } }]
    },
    documentosEnDominio: 1,
    porque:
      "En un compuesto sparse solo entran los documentos con al menos una de las " +
      "claves. Los tres que no tienen ninguna quedan fuera del índice."
  },
  {
    id: "unique-compuesto-sparse-clave-parcial-repetida",
    titulo: "unique compuesto sparse con media clave repetida => DUPLICADOS",
    indice: {
      name: "proveedor_1_externo_1",
      key: { proveedor: 1, externo: 1 },
      unique: true,
      sparse: true
    },
    documentos: [
      { proveedor: "google", nota: "sin externo" },
      { proveedor: "google", nota: "tampoco tiene externo" },
      { username: "local-1" }
    ],
    esperado: "DUPLICADOS",
    dominioEsperado: {
      $or: [{ proveedor: { $exists: true } }, { externo: { $exists: true } }]
    },
    documentosEnDominio: 2,
    porque:
      "Los dos entran en el índice (tienen `proveedor`) y la clave que falta se " +
      "indexa como null: ambos generan {google, null}. Es la colisión que el " +
      "`$ifNull` de la agrupación conserva y que agrupar por `$campo` a secas perdía.",
    contraprueba: true
  },
  {
    id: "unique-parcial-fuera-del-filtro",
    titulo: "partial unique respetando partialFilterExpression => LIMPIO",
    indice: {
      name: "message_sender_clientMessageId_unique",
      key: { sender: 1, clientMessageId: 1 },
      unique: true,
      partialFilterExpression: { clientMessageId: { $type: "string" } }
    },
    documentos: [
      { sender: "u1", clientMessageId: "m-1" },
      { sender: "u1", clientMessageId: null },
      { sender: "u1" },
      { sender: "u1" },
      { sender: "u2", clientMessageId: "m-1" }
    ],
    esperado: "LIMPIO",
    dominioEsperado: { clientMessageId: { $type: "string" } },
    documentosEnDominio: 2,
    porque:
      "Copia la forma de los dos índices únicos parciales reales de `messages`. " +
      "Los documentos sin clientMessageId de tipo string están fuera del dominio " +
      "del índice y la restricción única no les afecta."
  },
  {
    id: "unique-parcial-duplicado-dentro-del-filtro",
    titulo: "partial unique con duplicado dentro del filtro => DUPLICADOS",
    indice: {
      name: "message_sender_clientMessageId_unique",
      key: { sender: 1, clientMessageId: 1 },
      unique: true,
      partialFilterExpression: { clientMessageId: { $type: "string" } }
    },
    documentos: [
      { sender: "u1", clientMessageId: "m-1" },
      { sender: "u1", clientMessageId: "m-1" },
      { sender: "u1" },
      { sender: "u2" }
    ],
    esperado: "DUPLICADOS",
    dominioEsperado: { clientMessageId: { $type: "string" } },
    documentosEnDominio: 2,
    porque: "La pareja repetida cumple el filtro: la colisión es real."
  },
  {
    id: "indice-id-excluido",
    titulo: "índice _id excluido",
    indice: { name: "_id_", key: { _id: 1 }, unique: true },
    documentos: [{ nombre: "a" }, { nombre: "b" }],
    esperado: "NO_AUDITADO",
    dominioEsperado: null,
    documentosEnDominio: 2,
    porque:
      "MongoDB crea `_id_` siempre y no se puede recrear ni dejar caer: auditarlo " +
      "no informa de nada y añade ruido al informe."
  }
];

/** Escenarios que el auditor debe listar (todos menos `_id_`). */
const ESCENARIOS_AUDITADOS = ESCENARIOS.filter((caso) => caso.esperado !== "NO_AUDITADO");

/** Fila de inventario tal como la produce `inventarioIndices`. */
function filaInventario(escenario, coleccion) {
  const { indice } = escenario;
  return {
    collection: coleccion,
    name: indice.name,
    key: indice.key,
    unique: Boolean(indice.unique),
    sparse: Boolean(indice.sparse),
    partial: Boolean(indice.partialFilterExpression),
    partialFilterExpression: indice.partialFilterExpression ?? null,
    ttl: null
  };
}

/** Opciones con las que MongoDB crearía ese mismo índice. */
function opcionesCreacion(escenario) {
  const { indice } = escenario;
  const opciones = { name: indice.name, unique: true };
  if (indice.sparse) opciones.sparse = true;
  if (indice.partialFilterExpression) {
    opciones.partialFilterExpression = indice.partialFilterExpression;
  }
  return opciones;
}

module.exports = {
  ESCENARIOS,
  ESCENARIOS_AUDITADOS,
  filaInventario,
  opcionesCreacion
};
