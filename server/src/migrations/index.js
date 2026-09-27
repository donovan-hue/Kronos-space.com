/**
 * KRONOS — catálogo de migraciones.
 *
 * El orden del array ES el orden de ejecución y debe coincidir con las
 * versiones ascendentes (el ejecutor lo valida antes de tocar la base).
 * Añadir una migración = añadir un archivo y su entrada aquí; nunca editar
 * una versión ya aplicada (el checksum del diario lo detecta y aborta).
 */

const baseline = require("./001-baseline");
const userSchema = require("./002-user-schema");
const postSchema = require("./003-post-schema");
const indexes = require("./004-indexes");
const notifications = require("./005-notifications");
const cleanup = require("./006-cleanup");

const migrations = [baseline, userSchema, postSchema, indexes, notifications, cleanup];

module.exports = migrations;
module.exports.byVersion = new Map(migrations.map((migration) => [migration.version, migration]));
