const test = require("node:test");
const assert = require("node:assert/strict");

const postsRouter = require("../src/modules/posts/posts.routes");
const Post = require("../src/modules/posts/Post");

test("el punto focal persiste como coordenadas relativas acotadas", () => {
  const x = Post.schema.path("media.focalPoint.x");
  const y = Post.schema.path("media.focalPoint.y");
  assert.equal(x.instance, "Number");
  assert.equal(y.instance, "Number");
  assert.equal(x.options.default, 0.5);
  assert.equal(y.options.default, 0.5);
  assert.equal(x.options.min, 0);
  assert.equal(x.options.max, 1);
});

test("parseFocalPoint acota cualquier entrada al rango 0..1", () => {
  const { parseFocalPoint } = postsRouter;
  assert.deepEqual(parseFocalPoint(undefined), { x: 0.5, y: 0.5 });
  assert.deepEqual(parseFocalPoint({ x: 0.25, y: 0.75 }), { x: 0.25, y: 0.75 });
  assert.deepEqual(parseFocalPoint({ x: 2, y: -1 }), { x: 1, y: 0 });
  assert.deepEqual(parseFocalPoint({ x: "nada", y: {} }), { x: 0.5, y: 0.5 });
});

test("parseMedia incluye el punto focal y el carrusel lo conserva por imagen", () => {
  const { parseMedia, parseMediaItems } = postsRouter;

  const single = parseMedia({ url: "/uploads/media/a.jpg", type: "image", focalPoint: { x: 0.2, y: 0.9 } });
  assert.equal(single.error, undefined);
  assert.deepEqual(single.media.focalPoint, { x: 0.2, y: 0.9 });

  const clamped = parseMedia({ url: "/uploads/media/a.jpg", type: "image", focalPoint: { x: 7, y: -3 } });
  assert.deepEqual(clamped.media.focalPoint, { x: 1, y: 0 });

  const carousel = parseMediaItems([
    { url: "/uploads/media/a.jpg", focalPoint: { x: 0.1, y: 0.2 } },
    { url: "/uploads/media/b.jpg" }
  ]);
  assert.equal(carousel.error, undefined);
  assert.deepEqual(carousel.mediaItems[0].focalPoint, { x: 0.1, y: 0.2 });
  assert.deepEqual(carousel.mediaItems[1].focalPoint, { x: 0.5, y: 0.5 });
});
