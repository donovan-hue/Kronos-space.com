const test = require("node:test");
const assert = require("node:assert/strict");

const { Report, APPEAL_STATUSES } = require("../src/modules/moderation/Report");
const moderation = require("../src/modules/moderation/moderation.routes");

function routeFor(method, path) {
  return (moderation.stack || []).find(
    (layer) => layer.route?.path === path && layer.route.methods[method]
  )?.route;
}

test("las apelaciones tienen estados propios y una sola por reporte", () => {
  assert.deepEqual(APPEAL_STATUSES, ["submitted", "accepted", "rejected"]);
  assert.equal(Report.schema.path("appeal.status").enumValues.length, 3);
  assert.equal(Report.schema.path("appeal.status").options.default, null);
  assert.equal(Report.schema.path("appeal.text").instance, "String");
});

test("las rutas de confianza existen con su capa de permisos", () => {
  const appeal = routeFor("post", "/reports/:reportId/appeal");
  assert.ok(appeal, "falta POST /reports/:reportId/appeal");
  assert.equal(appeal.stack.length, 3, "la apelación exige sesión y usuario");

  const review = routeFor("patch", "/reports/:reportId/appeal");
  assert.ok(review, "falta PATCH /reports/:reportId/appeal");
  assert.equal(review.stack.length, 4, "revisar la apelación exige administrador");

  const health = routeFor("get", "/health");
  assert.ok(health, "falta GET /health");
  assert.equal(health.stack.length, 4, "la salud de comunidad exige administrador");
});

test("la apelación no sustituye los estados de reporte", () => {
  // Contrato documental: los estados de reporte siguen intactos y la
  // apelación convive con ellos.
  assert.deepEqual(Report.schema.path("status").enumValues, [
    "pending",
    "reviewing",
    "resolved",
    "dismissed"
  ]);
});
