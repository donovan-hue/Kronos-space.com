"use strict";

/**
 * Cómo se lee el diario de migraciones.
 *
 * El diario (`kronos_migrations`) no borra el registro cuando una migración se
 * revierte: deja una lápida con `direction: "down"`. Es deliberado —un `rollback` que borra su propio rastro no se puede auditar—, pero tiene un
 * coste: «¿está aplicada?» deja de ser «existe el registro» y pasa a ser «el
 * registro existe y no es una lápida».
 *
 * Esa comparación estaba escrita a mano en cuatro sitios (`up`, `down`,
 * `status` del runner y el inventario de `scripts/backup-verify.js`). Cuatro
 * lecturas del mismo dato es la forma exacta en que una herramienta empieza a
 * discrepar de la otra: el runner decide que hay que aplicar y el verificador
 * de respaldos afirma que esa versión ya estaba cubierta —o al revés—, y nadie
 * ve la contradicción porque cada archivo la resuelve sola.
 *
 * Vive en su propio módulo, sin dependencias, porque lo consumen a la vez el
 * runner y un script operativo que no puede arrastrar mongoose para saber si
 * un registro cuenta como aplicado.
 */

const DIRECCION_APLICADA = "up";
const DIRECCION_REVERTIDA = "down";

/** ¿El registro del diario cuenta como una migración aplicada hoy? */
function estaAplicada(record) {
  if (!record) return false;

  // Un registro viejo sin `direction` es una aplicación: el campo se añadió
  // después, y tratarlo como reversión volvería a aplicar migraciones ya
  // aplicadas en bases anteriores al campo.
  return String(record.direction || DIRECCION_APLICADA) !== DIRECCION_REVERTIDA;
}

/** Clave del registro: el `_id` es la versión; `version` puede faltar. */
function claveDeRecord(record) {
  return record?.version ?? record?._id ?? null;
}

module.exports = {
  DIRECCION_APLICADA,
  DIRECCION_REVERTIDA,
  estaAplicada,
  claveDeRecord
};
