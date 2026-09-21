const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const mongoose = require("mongoose");
const Post = require("../src/modules/posts/Post");
const normalizePost = require("../src/modules/posts/normalizePost");
const { AUDIENCE_TYPES, normalizeAudience, withAudienceFilter } = require("../src/modules/posts/audience.service");
const { extractHashtags, normalizeHashtagQuery } = require("../src/modules/posts/hashtag.service");
const postsRouter = require("../src/modules/posts/posts.routes");

const owner = new mongoose.Types.ObjectId();
const visitor = new mongoose.Types.ObjectId();

let server;
let baseUrl;

test.before(async () => {
  const app = express();
  app.use(express.json());
  app.use("/posts", postsRouter);
  await new Promise((resolve) => {
    server = app.listen(0, "127.0.0.1", resolve);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
  if (server?.listening) await new Promise((resolve) => server.close(resolve));
});

test("031: el modelo de publicaciones conserva un catálogo de reacciones múltiples", () => {
  const reactionPath = Post.schema.path("reactions");
  assert.ok(reactionPath, "reactions debe existir en Post");
  assert.deepEqual(reactionPath.schema.path("type").enumValues, ["like", "love", "laugh", "wow", "sad", "angry"]);
  assert.ok(reactionPath.schema.path("user"));
  assert.deepEqual(Post.schema.path("audience").schema.path("type").enumValues, ["public", "followers", "private", "circle", "orbit"]);
  assert.ok(Post.schema.path("audience").schema.path("circleId"));
  assert.ok(Post.schema.path("audience").schema.path("orbitId"));
  assert.ok(Post.schema.path("hashtags"));
  assert.deepEqual(AUDIENCE_TYPES, ["public", "followers", "private", "circle", "orbit"]);
});

test("032: normalización cuenta reacciones, protege sus usuarios y mantiene likes antiguos", () => {
  const result = normalizePost(
    {
      _id: "post-1",
      content: "Prueba",
      likes: [visitor],
      reactions: [
        { user: owner, type: "love" },
        { user: visitor, type: "wow" }
      ],
      audience: { type: "followers" },
      savedBy: [],
      comments: [
        { _id: "root", user: owner, content: "Raíz", parentComment: null },
        { _id: "reply", user: visitor, content: "Respuesta", parentComment: "root" }
      ]
    },
    visitor
  );

  assert.equal(result.reaction, "wow");
  assert.deepEqual(result.reactionCounts, { like: 0, love: 1, laugh: 0, wow: 1, sad: 0, angry: 0 });
  assert.equal(result.reactionsCount, 2);
  assert.equal(result.likesCount, 0);
  assert.equal(result.liked, false);
  assert.equal(result.reactions, undefined, "no expone IDs privados de reacciones");
  assert.deepEqual(result.audience, { type: "followers" });
  assert.equal(result.commentsCount, 2);
  assert.equal(result.commentThreads[0].replies[0].parentCommentId, "root");
  assert.equal(result.comments[1].parentComment, undefined, "no expone el campo interno del padre");
});

test("033: audiencia solo acepta visibilidades conocidas y filtra históricos como públicos", async () => {
  assert.deepEqual(normalizeAudience("private"), { type: "private" });
  assert.deepEqual(normalizeAudience({ type: "circle", circleId: owner.toString() }), { type: "circle", circleId: owner.toString() });
  assert.deepEqual(normalizeAudience({ type: "orbit", orbitId: owner.toString() }), { type: "orbit", orbitId: owner.toString() });
  assert.equal(normalizeAudience("circle"), null);
  const filter = await withAudienceFilter({ "moderation.hidden": { $ne: true } }, owner);
  assert.ok(Array.isArray(filter.$and));
  assert.ok(filter.$and.at(-1).$or.some((item) => item["audience.type"]?.$exists === false));
});

test("034: los hashtags se normalizan, deduplican y se pueden consultar como tema", () => {
  assert.deepEqual(extractHashtags("#Kronos #kronos #Diseño_3D y #café"), ["kronos", "diseño_3d", "café"]);
  assert.equal(normalizeHashtagQuery("#Diseño_3D"), "diseño_3d");
  assert.equal(normalizeHashtagQuery("#no válido"), "");
});

test("035: las nuevas rutas de interacción y temas exigen autenticación", async () => {
  const reactionResponse = await fetch(`${baseUrl}/posts/${owner}/reaction`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type: "love" })
  });
  const topicResponse = await fetch(`${baseUrl}/posts/topic/kronos`);
  assert.equal(reactionResponse.status, 401);
  assert.equal(topicResponse.status, 401);
});

test("036: una reacción desconocida no pertenece al contrato público", () => {
  assert.equal(Post.REACTION_TYPES.includes("rocket"), false);
  assert.equal(Post.REACTION_TYPES.includes("love"), true);
});
