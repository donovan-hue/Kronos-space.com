const test = require("node:test");
const assert = require("node:assert");
const crypto = require("node:crypto");
const mongoose = require("mongoose");

/**
 * ANALÍTICA PRIVADA DE CREADOR (Fase 8) — contratos con MongoDB real:
 * métricas solo de la propia obra, sin fuga entre cuentas.
 */
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env"), quiet: true });
process.env.JWT_SECRET = process.env.JWT_SECRET || "kronos-analytics-e2e-secret";
process.env.API_RATE_LIMIT_MAX = "10000";
process.env.ABUSE_RATE_LIMIT_MAX = "10000";
process.env.AUTH_RATE_LIMIT_MAX = "10000";

const { server } = require("../src/server");
const User = require("../src/modules/users/User");
const Post = require("../src/modules/posts/Post");

const mongoConfigured = Boolean(process.env.MONGODB_URI);
const tempDatabaseName = `kronos_e2e_${crypto.randomBytes(6).toString("hex")}`;
const PASSWORD = "KronosAnalytics123!";
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
    await Promise.all([User.deleteMany({}), Post.deleteMany({})]);
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

mongoTest("analytics: la analítica refleja solo la obra propia de la ventana", async () => {
  const creator = await register("Creadora");
  const other = await register("Otra");

  const mine = await createPost(creator.token, { content: "Mi obra" });
  await createPost(other.token, { content: "Obra ajena" });

  // Interacciones sobre mi publicación desde otra cuenta.
  await request(`/api/posts/${mine._id}/like`, { method: "POST", token: other.token });
  await request(`/api/posts/${mine._id}/comments`, {
    method: "POST",
    token: other.token,
    body: { content: "Me encanta" }
  });
  await request(`/api/posts/${mine._id}/save`, { method: "POST", token: other.token });
  // Segunda publicación propia para la serie temporal.
  await createPost(creator.token, {
    content: "Otra obra propia",
    media: { url: "/uploads/media/e2e-otra.jpg", type: "image" }
  });

  const analytics = await request("/api/analytics/creator", { token: creator.token });
  assert.strictEqual(analytics.status, 200, JSON.stringify(analytics.data));
  assert.equal(analytics.data.totals.posts, 2);
  assert.equal(analytics.data.totals.likes, 1);
  assert.equal(analytics.data.totals.comments, 1);
  assert.equal(analytics.data.totals.saves, 1);
  assert.equal(analytics.data.window.days, 30);
  assert.ok(Array.isArray(analytics.data.timeline) && analytics.data.timeline.length === 14);
  assert.ok(analytics.data.topPosts.length >= 1);
  assert.ok(analytics.data.topPosts[0].interactions >= 2, "la publicación con like y comentario encabeza");

  // La otra cuenta no ve mis números.
  const otherAnalytics = await request("/api/analytics/creator", { token: other.token });
  assert.equal(otherAnalytics.data.totals.posts, 1);
  assert.equal(otherAnalytics.data.totals.likes, 0);

  // Sin sesión no hay analítica.
  const anon = await request("/api/analytics/creator");
  assert.strictEqual(anon.status, 401);
});

mongoTest("analytics: los remixes recibidos se cuentan y la ventana se acota", async () => {
  const creator = await register("Creadora");
  const remixer = await register("Remixadora");
  await request(`/api/users/${creator.id}/follow`, { method: "POST", token: remixer.token });

  const original = await createPost(creator.token, {
    content: "Obra remezclable",
    media: { url: "/uploads/media/e2e-remixable.jpg", type: "image" }
  });
  const remix = await request(`/api/posts/${original._id}/remix`, {
    method: "POST",
    token: remixer.token,
    body: { content: "Versión propia" }
  });
  assert.strictEqual(remix.status, 201, JSON.stringify(remix.data));

  const analytics = await request("/api/analytics/creator?days=7", { token: creator.token });
  assert.strictEqual(analytics.status, 200);
  assert.equal(analytics.data.window.days, 7);
  assert.equal(analytics.data.totals.remixes, 1, "el remix recibido cuenta para la creadora");

  const remixerAnalytics = await request("/api/analytics/creator", { token: remixer.token });
  assert.equal(remixerAnalytics.data.totals.remixes, 0, "el remix no cuenta para quien lo hace");

  // Ventana inválida cae en el default, no en error.
  const fallback = await request("/api/analytics/creator?days=nada", { token: creator.token });
  assert.strictEqual(fallback.status, 200);
  assert.equal(fallback.data.window.days, 30);
});
