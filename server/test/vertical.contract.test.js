const test = require("node:test");
const assert = require("node:assert/strict");

const Post = require("../src/modules/posts/Post");
const postsRouter = require("../src/modules/posts/posts.routes");

function routeFor(path) {
  return (postsRouter.stack || []).find((layer) => layer.route?.path === path)?.route;
}

test("la media de publicaciones persiste dimensiones y orientación acotada", () => {
  assert.equal(Post.schema.path("media.width").instance, "Number");
  assert.equal(Post.schema.path("media.height").instance, "Number");
  assert.deepEqual(Post.schema.path("media.orientation").enumValues, ["vertical", "horizontal", "square", ""]);
  assert.equal(Post.schema.path("media.orientation").defaultValue, "");
});

test("parseMedia calcula orientación desde dimensiones válidas y las sanea", () => {
  const { parseMedia } = postsRouter;
  const vertical = parseMedia({ url: "/uploads/media/v.mp4", type: "video", width: 1080, height: 1920 });
  assert.equal(vertical.media.orientation, "vertical");
  assert.equal(vertical.media.width, 1080);
  assert.equal(vertical.media.height, 1920);

  const horizontal = parseMedia({ url: "/uploads/media/h.mp4", type: "video", width: 1920, height: 1080 });
  assert.equal(horizontal.media.orientation, "horizontal");

  const square = parseMedia({ url: "/uploads/media/s.mp4", type: "video", width: 1080, height: 1080 });
  assert.equal(square.media.orientation, "square");

  const unknown = parseMedia({ url: "/uploads/media/viejo.mp4", type: "video" });
  assert.equal(unknown.media.orientation, "");
  assert.equal(unknown.media.width, 0);

  const nonsense = parseMedia({ url: "/uploads/media/n.mp4", type: "video", width: -4, height: 1e9 });
  assert.equal(nonsense.media.width, 0);
  assert.equal(nonsense.media.height, 0);
  assert.equal(nonsense.media.orientation, "");
});

test("el filtro del feed vertical solo admite videos no horizontales", () => {
  const { verticalFeedFilter } = postsRouter;
  const filter = verticalFeedFilter({ "moderation.hidden": { $ne: true }, author: { $nin: ["x"] } });
  assert.equal(filter["media.type"], "video");
  assert.deepEqual(filter["media.orientation"], { $ne: "horizontal" });
  assert.deepEqual(filter.author, { $nin: ["x"] });
  assert.deepEqual(filter["moderation.hidden"], { $ne: true });
});

test("GET /vertical existe, exige sesión y se declara antes que /:postId", () => {
  const route = routeFor("/vertical");
  assert.ok(route, "falta la ruta /vertical");
  assert.equal(route.stack.length, 3, "debe exigir auth y usuario");
  const paths = postsRouter.stack.filter((layer) => layer.route).map((layer) => layer.route.path);
  assert.ok(paths.indexOf("/vertical") < paths.indexOf("/:postId"), "/vertical debe registrarse antes que /:postId");
});
