const test = require("node:test");
const assert = require("node:assert");

/**
 * Silencio por tipo de aviso (bloque 1.1).
 *
 * Antes había un solo interruptor (`notifications.inApp`): apagar «guardados»
 * apagaba también los comentarios. Aquí se comprueba el mapa de grupos y que
 * los avisos que no se pueden silenciar (moderación y reportes) queden fuera.
 */

const { GROUPS, MUTABLE_GROUPS, groupOf, isMuted } = require("../src/modules/notifications/notificationGroups");
const { NOTIFICATION_TYPES } = require("../src/modules/notifications/Notification");

test("cada tipo social tiene grupo; moderación y reporte no", () => {
  assert.equal(groupOf("comment"), "comments");
  assert.equal(groupOf("save"), "saves");
  assert.equal(groupOf("story"), "stories");
  assert.equal(groupOf("follow"), "*");
  assert.equal(groupOf("like"), "*");
  assert.equal(groupOf("repost"), "*");
  assert.equal(groupOf("event"), "*");
  assert.equal(groupOf("moderation"), "");
  assert.equal(groupOf("report"), "");
});

test("no hay tipos del catálogo sin decisión tomada", () => {
  // `live` y `capsule` son invitaciones: no se silencian, igual que moderación.
  const sinGrupo = NOTIFICATION_TYPES.filter((type) => !groupOf(type));
  assert.deepEqual(sinGrupo.sort(), ["capsule", "live", "moderation", "report"].sort());
  for (const type of Object.keys(GROUPS)) {
    assert.ok(NOTIFICATION_TYPES.includes(type), `${type} no está en el catálogo`);
  }
});

test("solo los grupos declarados son silenciables", () => {
  assert.deepEqual([...MUTABLE_GROUPS].sort(), ["*", "comments", "saves", "stories"].sort());
});

test("isMuted respeta el grupo y no silencia lo que no tiene grupo", () => {
  assert.equal(isMuted("comment", { comments: true }), true);
  assert.equal(isMuted("comment", { comments: false }), false);
  assert.equal(isMuted("comment", {}), false);
  assert.equal(isMuted("comment", undefined), false);
  assert.equal(isMuted("like", { "*": true }), true);
  assert.equal(isMuted("like", { comments: true }), false);
  // Moderación y reportes nunca se silencian, ni con el comodín.
  assert.equal(isMuted("moderation", { "*": true, comments: true }), false);
  assert.equal(isMuted("report", { "*": true }), false);
});
