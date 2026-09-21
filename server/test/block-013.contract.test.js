const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");

const Post = require("../src/modules/posts/Post");
const Draft = require("../src/modules/drafts/Draft");
const postsRouter = require("../src/modules/posts/posts.routes");

test("013: multimedia de video conserva una portada persistible sin abrir un campo arbitrario", () => {
  const mediaPath = Post.schema.path("media");
  const posterPath = mediaPath.schema.path("posterUrl");
  const draftPosterPath = Draft.schema.path("media").schema.path("posterUrl");

  assert.equal(posterPath.instance, "String");
  assert.equal(posterPath.options.maxlength, 2000);
  assert.equal(draftPosterPath.instance, "String");
  assert.equal(draftPosterPath.options.maxlength, 2000);
  assert.equal(Post.schema.options.strict, true);
  assert.equal(Draft.schema.options.strict, true);
});

test("013: la subida de media y la publicación siguen siendo operaciones autenticadas", async () => {
  const app = express();
  app.use(express.json());
  app.use("/posts", postsRouter);
  const server = await new Promise((resolve) => {
    const instance = app.listen(0, "127.0.0.1", () => resolve(instance));
  });
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  try {
    const upload = await fetch(`${baseUrl}/posts/media/upload`, { method: "POST" });
    const create = await fetch(`${baseUrl}/posts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: "Video con portada" })
    });
    assert.equal(upload.status, 401);
    assert.equal(create.status, 401);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
