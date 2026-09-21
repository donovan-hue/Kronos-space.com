const test = require("node:test");
const assert = require("node:assert");
const crypto = require("node:crypto");
const mongoose = require("mongoose");

/**
 * PULSO (Fase 6) — contratos con MongoDB real: la sesión es finita, no
 * repite lo ya visto, respeta señales más/menos y la audiencia.
 */
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env"), quiet: true });
process.env.JWT_SECRET = process.env.JWT_SECRET || "kronos-pulse-e2e-secret";
process.env.API_RATE_LIMIT_MAX = "10000";
process.env.ABUSE_RATE_LIMIT_MAX = "10000";
process.env.AUTH_RATE_LIMIT_MAX = "10000";

const { server } = require("../src/server");
const User = require("../src/modules/users/User");
const Post = require("../src/modules/posts/Post");
const SeenPost = require("../src/modules/pulse/SeenPost");
const FeedSignal = require("../src/modules/pulse/FeedSignal");

const mongoConfigured = Boolean(process.env.MONGODB_URI);
const tempDatabaseName = `kronos_e2e_${crypto.randomBytes(6).toString("hex")}`;
const PASSWORD = "KronosPulse123!";
let baseUrl;
let connected = false;

function mongoTest(name, fn) {
  test(name, async (t) => {
    if (!mongoConfigured) return t.skip("Requiere MONGODB_URI real (base temporal kronos_e2e_*). Sin URI no se simula persistencia.");
    try {
      await fn();
    } catch (error) {
      console.log(`KRONOS_E2E_FAIL [${name}] :: ${(error?.message || error).toString().replace(/\s+/g, " ").slice(0, 500)}`);
      throw error;
    }
  });
}

async function request(path, { method = "GET", token, body } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body) headers["Content-Type"] = "application/json";
  const response = await fetch(`${baseUrl}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  let data = null;
  try {
    data = await response.json();
  } catch {
    data = null;
  }
  return { status: response.status, data };
}

async function register(displayName) {
  const suffix = crypto.randomBytes(5).toString("hex");
  const response = await request("/api/auth/register", {
    method: "POST",
    body: {
      username: `e2e_${suffix}`,
      email: `e2e.${suffix}@example.test`,
      password: PASSWORD,
      displayName
    }
  });
  assert.strictEqual(response.status, 201, JSON.stringify(response.data));
  return { id: response.data.user.id, token: response.data.token, username: response.data.user.username };
}

async function createPost(token, body) {
  const response = await request("/api/posts", { method: "POST", token, body });
  assert.strictEqual(response.status, 201, JSON.stringify(response.data));
  return response.data.post;
}

test.before(async () => {
  if (mongoConfigured) {
    await mongoose.connect(process.env.MONGODB_URI, { dbName: tempDatabaseName, serverSelectionTimeoutMS: 15000 });
    connected = true;
    await Promise.all([User.deleteMany({}), Post.deleteMany({}), SeenPost.deleteMany({}), FeedSignal.deleteMany({})]);
  }
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
  if (server.listening) await new Promise((resolve) => server.close(resolve));
  if (connected) {
    if (tempDatabaseName.startsWith("kronos_e2e_")) await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  }
});

mongoTest("pulso: la sesión es finita y no repite lo ya visto", async () => {
  const author = await register("Autora");
  const viewer = await register("Lectora");
  await request(`/api/users/${author.id}/follow`, { method: "POST", token: viewer.token });

  for (let index = 0; index < 5; index += 1) {
    await createPost(author.token, { content: `Pulso ${index}` });
  }

  const first = await request("/api/pulse?limit=3", { token: viewer.token });
  assert.strictEqual(first.status, 200, JSON.stringify(first.data));
  assert.strictEqual(first.data.sessionSize, 3, "la sesión se corta en el límite pedido");
  const firstIds = first.data.posts.map((post) => post._id);

  for (const postId of firstIds) {
    const seen = await request(`/api/pulse/seen/${postId}`, { method: "POST", token: viewer.token });
    assert.strictEqual(seen.status, 200, JSON.stringify(seen.data));
    // Idempotente: marcar dos veces no duplica.
    await request(`/api/pulse/seen/${postId}`, { method: "POST", token: viewer.token });
  }
  const seenDocs = await SeenPost.countDocuments({ user: viewer.id });
  assert.strictEqual(seenDocs, 3, "tres vistos, sin duplicados");

  const second = await request("/api/pulse?limit=3", { token: viewer.token });
  const secondIds = second.data.posts.map((post) => post._id);
  assert.strictEqual(second.data.sessionSize, 2, "quedaban solo dos sin ver");
  assert.ok(secondIds.every((id) => !firstIds.includes(id)), "nada de la primera sesión se repite");

  const third = await request("/api/pulse?limit=3", { token: viewer.token });
  assert.strictEqual(third.data.sessionSize, 0);
  assert.strictEqual(third.data.completed, true, "la sesión termina de verdad");
});

mongoTest("pulso: las señales more priorizan y less excluyen", async () => {
  const author = await register("Autora");
  const viewer = await register("Lectora");
  await request(`/api/users/${author.id}/follow`, { method: "POST", token: viewer.token });

  const arte = await createPost(author.token, { content: "Obra nueva", hashtags: ["arte"] });
  await createPost(author.token, { content: "Otra obra", hashtags: ["arte"] });
  const comida = await createPost(author.token, { content: "Receta", hashtags: ["comida"] });

  const less = await request("/api/pulse/signal", {
    method: "POST",
    token: viewer.token,
    body: { postId: comida._id, direction: "less" }
  });
  assert.strictEqual(less.status, 200, JSON.stringify(less.data));
  assert.deepEqual(less.data.tags, ["comida"]);

  const more = await request("/api/pulse/signal", {
    method: "POST",
    token: viewer.token,
    body: { postId: arte._id, direction: "more" }
  });
  assert.strictEqual(more.status, 200, JSON.stringify(more.data));

  const session = await request("/api/pulse?limit=10", { token: viewer.token });
  assert.strictEqual(session.status, 200);
  assert.ok(session.data.lessTags.includes("comida"));
  assert.ok(session.data.moreTags.includes("arte"));
  const contents = session.data.posts.map((post) => post.content);
  assert.ok(contents.includes("Obra nueva"), "lo marcado como more sigue presente");
  assert.ok(!contents.includes("Receta"), "lo marcado como less queda fuera");
  // Prioridad real: las publicaciones de arte van primero.
  assert.ok(contents.indexOf("Obra nueva") < contents.indexOf("Otra obra") || contents.every((c) => c !== "Otra obra"));

  const signals = await request("/api/pulse/signals", { token: viewer.token });
  assert.strictEqual(signals.status, 200);
  assert.equal(signals.data.signals.length, 2, "una señal por tema, sin duplicados");
});

mongoTest("pulso: respeta la audiencia de las publicaciones", async () => {
  const author = await register("Autora");
  const follower = await register("Seguidora");
  const stranger = await register("Desconocida");
  await request(`/api/users/${author.id}/follow`, { method: "POST", token: follower.token });

  await createPost(author.token, {
    content: "Solo para seguidores",
    audience: { type: "followers" }
  });
  await createPost(author.token, { content: "Público del pulso" });

  const asFollower = await request("/api/pulse", { token: follower.token });
  const followerContents = asFollower.data.posts.map((post) => post.content);
  assert.ok(followerContents.includes("Solo para seguidores"), "la seguidora ve la privada");
  assert.ok(followerContents.includes("Público del pulso"));

  const asStranger = await request("/api/pulse", { token: stranger.token });
  const strangerContents = asStranger.data.posts.map((post) => post.content);
  assert.ok(!strangerContents.includes("Solo para seguidores"), "quien no sigue no ve la privada");
  assert.ok(strangerContents.includes("Público del pulso"));
});
