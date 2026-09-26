const test = require("node:test");
const assert = require("node:assert");
const crypto = require("node:crypto");
const mongoose = require("mongoose");

/**
 * FASE 7 (optimización de consultas) — evidencia medida, no visual.
 *
 * Mide operaciones REALES contra MongoDB por petición de feed usando el
 * canal de depuración de Mongoose. El contrato es doble:
 *
 *   1. el coste de una página NO crece con el número de publicaciones
 *      (antes cada repost disparaba ~3 consultas extra: original, audiencia
 *      y bloqueo),
 *   2. la hidratación por lotes redacta exactamente lo mismo que la versión
 *      publicación a publicación: original ausente, privado o bloqueado.
 */
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env"), quiet: true });
process.env.JWT_SECRET = process.env.JWT_SECRET || "kronos-nplus1-e2e-secret";
process.env.API_RATE_LIMIT_MAX = "10000";
process.env.ABUSE_RATE_LIMIT_MAX = "10000";
process.env.AUTH_RATE_LIMIT_MAX = "10000";

const { server } = require("../src/server");
const User = require("../src/modules/users/User");
const Post = require("../src/modules/posts/Post");
const { Block } = require("../src/modules/moderation/moderation.service");

const mongoConfigured = Boolean(process.env.MONGODB_URI);
const tempDatabaseName = `kronos_e2e_${crypto.randomBytes(6).toString("hex")}`;
const PASSWORD = "KronosFeed123!";
let baseUrl;
let connected = false;

function mongoTest(name, fn) {
  test(name, async (t) => {
    if (!mongoConfigured) return t.skip("Requiere MONGODB_URI real (base temporal kronos_e2e_*). Sin URI no se mide nada.");
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
  return { id: response.data.user.id, token: response.data.token };
}

/** Cuenta operaciones reales contra la base durante `fn`. */
async function countOperations(fn) {
  const operations = [];
  mongoose.set("debug", (collection, method) => {
    operations.push(`${collection}.${method}`);
  });

  try {
    const result = await fn();
    return { result, operations };
  } finally {
    mongoose.set("debug", false);
  }
}

test.before(async () => {
  if (mongoConfigured) {
    await mongoose.connect(process.env.MONGODB_URI, { dbName: tempDatabaseName, serverSelectionTimeoutMS: 15000 });
    connected = true;
    await Promise.all([User.deleteMany({}), Post.deleteMany({}), Block.deleteMany({})]);
  }
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

test.beforeEach(async () => {
  if (connected) await Promise.all([Post.deleteMany({}), Block.deleteMany({})]);
});

test.after(async () => {
  if (server.listening) await new Promise((resolve) => server.close(resolve));
  if (connected) {
    if (tempDatabaseName.startsWith("kronos_e2e_")) await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  }
});

mongoTest("feed: el coste en consultas no crece con el tamaño de la página", async () => {
  const author = await register("Autora");
  const viewer = await register("Lectora");

  const originals = [];
  for (let index = 0; index < 12; index += 1) {
    const created = await request("/api/posts", { method: "POST", token: author.token, body: { content: `Original ${index}` } });
    assert.strictEqual(created.status, 201, JSON.stringify(created.data));
    originals.push(created.data.post._id);
  }

  for (const postId of originals) {
    const reposted = await request(`/api/posts/${postId}/repost`, { method: "POST", token: viewer.token });
    assert.strictEqual(reposted.status, 201, JSON.stringify(reposted.data));
  }

  const small = await countOperations(() => request("/api/posts/feed?limit=3", { token: viewer.token }));
  const large = await countOperations(() => request("/api/posts/feed?limit=12", { token: viewer.token }));

  assert.strictEqual(small.result.status, 200, JSON.stringify(small.result.data));
  assert.strictEqual(large.result.status, 200, JSON.stringify(large.result.data));
  assert.strictEqual(large.result.data.posts.length, 12, "la página grande devuelve 12 publicaciones");

  const growth = large.operations.length - small.operations.length;
  console.log(
    `KRONOS_METRIC feed.operaciones limit=3:${small.operations.length} limit=12:${large.operations.length} crecimiento:${growth}`
  );
  console.log(`KRONOS_METRIC feed.operaciones.detalle ${large.operations.join(" ")}`);

  // Con N+1 el crecimiento sería de ~27 operaciones (9 publicaciones más
  // × 3 consultas). Por lotes, el plan de consultas es el mismo.
  assert.strictEqual(growth, 0, `la página grande hizo ${growth} consultas extra: sigue habiendo N+1`);
  assert.ok(large.operations.length <= 20, `una página de feed no debe costar ${large.operations.length} operaciones`);
});

mongoTest("feed: el repost se redacta cuando el original deja de ser visible", async () => {
  const author = await register("Autora");
  const viewer = await register("Lectora");

  const first = await request("/api/posts", { method: "POST", token: author.token, body: { content: "Se vuelve privado" } });
  const second = await request("/api/posts", { method: "POST", token: author.token, body: { content: "Se borra" } });
  const third = await request("/api/posts", { method: "POST", token: author.token, body: { content: "Queda visible" } });

  for (const created of [first, second, third]) {
    const reposted = await request(`/api/posts/${created.data.post._id}/repost`, { method: "POST", token: viewer.token });
    assert.strictEqual(reposted.status, 201, JSON.stringify(reposted.data));
  }

  await Post.updateOne({ _id: first.data.post._id }, { $set: { audience: { type: "private" } } });
  await Post.deleteOne({ _id: second.data.post._id });

  const feed = await request("/api/posts/feed?limit=20", { token: viewer.token });
  assert.strictEqual(feed.status, 200, JSON.stringify(feed.data));

  const reposts = feed.data.posts.filter((post) => post.author?._id === viewer.id || post.author === viewer.id);
  assert.strictEqual(reposts.length, 3, "los tres reposts siguen en el feed de su autora");

  const visibles = reposts.filter((post) => post.repostOf);
  assert.strictEqual(visibles.length, 1, "solo el original público sobrevive");
  assert.strictEqual(visibles[0].repostOf.content, "Queda visible");

  for (const redacted of reposts.filter((post) => !post.repostOf)) {
    assert.strictEqual(redacted.content, "", "el repost redactado no conserva la copia heredada");
    assert.strictEqual(redacted.media?.url || "", "", "el repost redactado no conserva media heredada");
  }
});

mongoTest("feed: un bloqueo posterior redacta el repost del autor bloqueado", async () => {
  const author = await register("Autora");
  const viewer = await register("Lectora");

  const created = await request("/api/posts", { method: "POST", token: author.token, body: { content: "Antes del bloqueo" } });
  const reposted = await request(`/api/posts/${created.data.post._id}/repost`, { method: "POST", token: viewer.token });
  assert.strictEqual(reposted.status, 201, JSON.stringify(reposted.data));

  const before = await request("/api/posts/feed?limit=20", { token: viewer.token });
  const beforeRepost = before.data.posts.find((post) => post._id === reposted.data.post._id);
  assert.ok(beforeRepost?.repostOf, "antes del bloqueo el original es visible");

  const blocked = await request(`/api/moderation/blocks/${author.id}`, { method: "POST", token: viewer.token });
  assert.ok([200, 201].includes(blocked.status), JSON.stringify(blocked.data));

  const after = await request("/api/posts/feed?limit=20", { token: viewer.token });
  const afterRepost = after.data.posts.find((post) => post._id === reposted.data.post._id);
  assert.ok(afterRepost, "el repost propio sigue listado");
  assert.strictEqual(afterRepost.repostOf, null, "tras el bloqueo el original queda redactado");
  assert.strictEqual(afterRepost.content, "", "tras el bloqueo no queda copia heredada");
});
