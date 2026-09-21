const test = require("node:test");
const assert = require("node:assert/strict");

const { normalizePoll } = require("../src/modules/posts/normalizePost");
const Post = require("../src/modules/posts/Post");
const Draft = require("../src/modules/drafts/Draft");

const optionA = "65f000000000000000000001";
const optionB = "65f000000000000000000002";
const voterA = "65f000000000000000000011";
const voterB = "65f000000000000000000012";

test("encuesta normalizada calcula agregados y no expone usuarios votantes", () => {
  const normalized = normalizePoll({
    question: "¿Qué formato prefieres?",
    options: [
      { _id: optionA, text: "Texto" },
      { _id: optionB, text: "Video" }
    ],
    votes: [
      { user: voterA, optionId: optionA },
      { user: voterB, optionId: optionB },
      { user: voterA, optionId: optionA }
    ],
    closesAt: null
  }, voterB);

  assert.equal(normalized.totalVotes, 2);
  assert.equal(normalized.selectedOptionId, optionB);
  assert.deepEqual(normalized.options.map(({ text, votes, percentage }) => ({ text, votes, percentage })), [
    { text: "Texto", votes: 1, percentage: 50 },
    { text: "Video", votes: 1, percentage: 50 }
  ]);
  assert.equal(normalized.options.some((option) => "user" in option), false);
  assert.equal("votes" in normalized, false);
});

test("modelo de publicaciones persiste encuesta, voto único por usuario y opciones limitadas", () => {
  const poll = Post.schema.path("poll");
  assert.ok(poll);
  assert.equal(Post.schema.path("poll.options").instance, "Array");
  assert.equal(Post.schema.path("poll.votes").instance, "Array");
  assert.equal(Post.schema.path("poll.question").options.maxlength, 200);
  assert.equal(Post.schema.path("poll.options").validators[1].validator([
    { text: "A" },
    { text: "B" }
  ]), true);
  assert.equal(Post.schema.path("poll.options").validators[1].validator([{ text: "A" }]), false);
});

test("borradores conservan pregunta, opciones y cierre sin guardar votos", () => {
  assert.ok(Draft.schema.path("poll"));
  assert.equal(Draft.schema.path("poll.question").options.maxlength, 200);
  assert.equal(Draft.schema.path("poll.options").instance, "Array");
  assert.equal(Draft.schema.path("poll.votes"), undefined);
  const routesSource = require("fs").readFileSync(require("path").join(__dirname, "../src/modules/drafts/drafts.routes.js"), "utf8");
  assert.match(routesSource, /poll: parsed\.poll/);
});

test("contrato de voto existe con autenticación y usa la publicación normalizada", () => {
  const routes = require("../src/modules/posts/posts.routes").stack || [];
  const route = routes.find((layer) => layer.route?.path === "/:postId/poll/vote");
  assert.ok(route, "debe existir POST /:postId/poll/vote");
  assert.equal(route.route.methods.post, true);
  assert.ok(route.route.stack.length >= 3, "la ruta debe incluir auth, requireUser y handler");
});
