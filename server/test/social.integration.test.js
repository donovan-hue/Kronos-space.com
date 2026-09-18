const { test, before, after, mock } = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const jwt = require("jsonwebtoken");
const session = require("../src/modules/auth/session.service");
const Post = require("../src/modules/posts/Post");

// HTTP/JWT/routes are real; persistence is mocked. Never touches Atlas.
const previousSecret = process.env.JWT_SECRET;
process.env.JWT_SECRET = "isolated-social-test-secret";
mock.method(session, "isSessionRevoked", async () => false);
const router = require("../src/modules/posts/posts.routes");
const owner = "507f1f77bcf86cd799439011";
const other = "507f1f77bcf86cd799439012";
const postId = "507f1f77bcf86cd799439013";
const commentId = "507f1f77bcf86cd799439014";
let server, base;
function query(value) {
  const chain = { select: () => chain, populate: () => chain, lean: async () => value, then: (resolve, reject) => Promise.resolve(value).then(resolve, reject) };
  return chain;
}
before(async () => {
  const app = express(); app.use(express.json()); app.use("/posts", router);
  server = app.listen(0, "127.0.0.1");
  await new Promise(resolve => server.once("listening", resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
  await new Promise(resolve => server.close(resolve));
  mock.restoreAll();
  if (previousSecret === undefined) delete process.env.JWT_SECRET;
  else process.env.JWT_SECRET = previousSecret;
});
async function request(method, route, user, body) {
  const headers = { "Content-Type": "application/json" };
  if (user) headers.Authorization = `Bearer ${jwt.sign({ id: user }, process.env.JWT_SECRET, { expiresIn: "1m" })}`;
  return fetch(`${base}/posts${route}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
}

test("nuevas rutas sociales siguen exigiendo autenticación", async () => {
  for (const [method, path] of [["GET", "/saved"], ["POST", "/media/upload"], ["POST", `/${postId}/save`], ["POST", `/${postId}/repost`], ["PATCH", `/${postId}`], ["DELETE", `/${postId}`]]) {
    assert.equal((await request(method, path)).status, 401, `${method} ${path}`);
  }
});

test("crear publicación permite imagen sola, carrusel y sigue rechazando publicación vacía", async t => {
  const create = t.mock.method(Post, "create", async (doc) => ({
    ...doc,
    _id: postId,
    createdAt: new Date("2026-09-18T00:00:00Z"),
    updatedAt: new Date("2026-09-18T00:00:00Z"),
    populate: async () => {},
    toObject() {
      return {
        ...doc,
        _id: postId,
        author: { _id: owner, username: "owner", displayName: "Owner" },
        createdAt: this.createdAt,
        updatedAt: this.updatedAt
      };
    }
  }));

  const imageOnly = await request("POST", "/", owner, {
    content: "   ",
    media: { url: "/uploads/media/image.png", type: "image", mimeType: "image/png", size: 1234, alt: "Imagen" }
  });
  assert.equal(imageOnly.status, 201);
  const body = await imageOnly.json();
  assert.equal(body.post.content, "");
  assert.equal(body.post.hasMedia, true);
  assert.equal(create.mock.calls[0].arguments[0].media.url, "/uploads/media/image.png");

  const carousel = await request("POST", "/", owner, {
    content: "Carrusel",
    mediaItems: [
      { url: "/uploads/media/one.png", type: "image", mimeType: "image/png", size: 111, alt: "Uno" },
      { url: "/uploads/media/two.webp", type: "image", mimeType: "image/webp", size: 222, alt: "Dos" }
    ]
  });
  assert.equal(carousel.status, 201);
  const carouselBody = await carousel.json();
  assert.equal(carouselBody.post.mediaItems.length, 2);
  assert.equal(carouselBody.post.media.url, "/uploads/media/one.png");
  assert.equal(create.mock.calls[1].arguments[0].mediaItems[1].alt, "Dos");

  const tooMany = await request("POST", "/", owner, {
    content: "Too much",
    mediaItems: [1, 2, 3, 4, 5].map((index) => ({ url: `/uploads/media/${index}.png`, type: "image" }))
  });
  assert.equal(tooMany.status, 400);

  const videoInCarousel = await request("POST", "/", owner, {
    content: "Video en carrusel",
    mediaItems: [{ url: "/uploads/media/clip.mp4", type: "video", mimeType: "video/mp4" }]
  });
  assert.equal(videoInCarousel.status, 400);

  const empty = await request("POST", "/", owner, { content: "   " });
  assert.equal(empty.status, 400);
  assert.equal(create.mock.callCount(), 2);
});

test("editar/eliminar publicación ajena devuelve 403 sin escribir", async t => {
  t.mock.method(Post, "findById", () => query({ author: owner }));
  const update = t.mock.method(Post, "findByIdAndUpdate", () => { throw new Error("Unexpected write"); });
  const remove = t.mock.method(Post, "findByIdAndDelete", () => { throw new Error("Unexpected write"); });
  assert.equal((await request("PATCH", `/${postId}`, other, { content: "Change" })).status, 403);
  assert.equal((await request("DELETE", `/${postId}`, other)).status, 403);
  assert.equal(update.mock.callCount(), 0);
  assert.equal(remove.mock.callCount(), 0);
});

test("el autor puede editar y eliminar su publicación", async t => {
  t.mock.method(Post, "findById", () => query({ author: owner }));
  const update = t.mock.method(Post, "findByIdAndUpdate", () => query({ toObject: () => ({ _id: postId, author: owner, content: "Change", likes: [], savedBy: [] }) }));
  const remove = t.mock.method(Post, "findByIdAndDelete", async () => ({}));
  const response = await request("PATCH", `/${postId}`, owner, { content: "Change", mediaAlt: "Image description" });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).post.content, "Change");
  assert.equal(update.mock.calls[0].arguments[1].$set["media.alt"], "Image description");
  assert.equal((await request("DELETE", `/${postId}`, owner)).status, 200);
  assert.equal(remove.mock.callCount(), 1);
});

test("comentarios ajenos no pueden ser eliminados por terceros", async t => {
  t.mock.method(Post, "findById", () => query({ author: owner, comments: [{ _id: commentId, user: owner, content: "Comment" }] }));
  const update = t.mock.method(Post, "findByIdAndUpdate", () => { throw new Error("Unexpected write"); });
  assert.equal((await request("DELETE", `/${postId}/comments/${commentId}`, other)).status, 403);
  assert.equal(update.mock.callCount(), 0);
});

test("el upload acepta video real con firma MP4", async () => {
  const form = new FormData();
  form.append("media", new Blob([Buffer.from([0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d])], { type: "video/mp4" }), "clip.mp4");
  const response = await fetch(`${base}/posts/media/upload`, {
    method: "POST", headers: { Authorization: `Bearer ${jwt.sign({ id: owner }, process.env.JWT_SECRET, { expiresIn: "1m" })}` }, body: form
  });
  assert.equal(response.status, 201);
  const body = await response.json();
  assert.equal(body.type, "video");
  assert.equal(body.mimeType, "video/mp4");
  assert.match(body.url, /^\/uploads\/media\//);
});

test("el upload rechaza contenido que no coincide con MIME", async () => {
  const form = new FormData();
  form.append("media", new Blob(["not an image"], { type: "image/png" }), "invalid.png");
  const response = await fetch(`${base}/posts/media/upload`, {
    method: "POST", headers: { Authorization: `Bearer ${jwt.sign({ id: owner }, process.env.JWT_SECRET, { expiresIn: "1m" })}` }, body: form
  });
  assert.equal(response.status, 400);
});
