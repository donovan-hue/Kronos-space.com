const test = require("node:test");
const assert = require("node:assert/strict");

const analytics = require("../src/modules/analytics/analytics.routes");

function routeFor(path) {
  return (analytics.stack || []).find((layer) => layer.route?.path === path)?.route;
}

test("la analítica de creador es una única ruta privada con ventana acotada", () => {
  const creator = routeFor("/creator");
  assert.ok(creator, "falta GET /creator");
  assert.equal(creator.methods.get, true);
  const names = creator.stack.map((layer) => layer.name);
  assert.ok(names.includes("auth"), "debe exigir sesión");
  assert.ok(names.includes("requireUser"), "debe exigir usuario");
  const paths = (analytics.stack || []).filter((layer) => layer.route).map((layer) => layer.route.path);
  assert.deepEqual(paths, ["/creator"], "sin rutas públicas ni de administrador");
});

test("las constantes de la analítica fijan los límites del contrato", () => {
  assert.equal(analytics.DEFAULT_WINDOW_DAYS, 30);
  assert.ok(analytics.MAX_WINDOW_DAYS >= analytics.DEFAULT_WINDOW_DAYS);
  assert.equal(analytics.TIMELINE_DAYS, 14);
  assert.equal(analytics.TOP_POSTS_LIMIT, 5);
});

test("el linaje permite contar remixes sobre publicaciones propias", () => {
  const Post = require("../src/modules/posts/Post");
  assert.equal(Post.schema.path("lineage.derivedFrom").options.ref, "Post");
});
