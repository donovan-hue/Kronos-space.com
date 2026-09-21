const test = require("node:test");
const assert = require("node:assert/strict");

const Post = require("../src/modules/posts/Post");
const postsRouter = require("../src/modules/posts/posts.routes");

function routeFor(path) {
  return (postsRouter.stack || []).find((layer) => layer.route?.path === path)?.route;
}

test("el linaje persiste derivación, herramienta y etiquetado IA", () => {
  assert.equal(Post.schema.path("lineage.derivedFrom").options.ref, "Post");
  assert.deepEqual(
    Post.schema.path("lineage.tool").enumValues,
    ["remix", "kairos-image", "kairos-video", "kairos-script", ""]
  );
  assert.equal(Post.schema.path("lineage.aiGenerated").instance, "Boolean");
});

test("el parser de linaje reserva remix para el endpoint verificado", () => {
  const { parseLineage } = postsRouter;
  assert.deepEqual(parseLineage(undefined).value, { derivedFrom: null, tool: "", aiGenerated: false });
  assert.deepEqual(parseLineage({ tool: "kairos-image", aiGenerated: true }).value, { derivedFrom: null, tool: "kairos-image", aiGenerated: true });
  assert.equal(parseLineage({ tool: "kairos-video" }).error, undefined);
  assert.match(parseLineage({ tool: "photoshop" }).error, /no válida/);
  assert.match(parseLineage({ tool: "remix" }).error, /endpoint de remix/);
  assert.equal(parseLineage({ tool: "", aiGenerated: true }).value.aiGenerated, true);
});

test("POST /:postId/remix existe, exige sesión y se registra después de /vertical", () => {
  const remix = routeFor("/:postId/remix");
  assert.ok(remix, "falta la ruta de remix");
  assert.equal(remix.stack.length, 3, "debe exigir auth y usuario");
  const paths = postsRouter.stack.filter((layer) => layer.route).map((layer) => layer.route.path);
  assert.ok(paths.indexOf("/vertical") < paths.indexOf("/:postId/remix"));
});
