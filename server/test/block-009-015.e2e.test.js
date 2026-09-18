const test = require("node:test");
const assert = require("node:assert");
const crypto = require("node:crypto");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const { io: ioClient } = require("socket.io-client");

/**
 * BLOQUES 009-015 — contratos con MongoDB real. No reutiliza suites de
 * bloques cerrados: cubre solo discovery, dispositivos, admin y trazabilidad.
 */
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env"), quiet: true });
process.env.JWT_SECRET = process.env.JWT_SECRET || "kronos-block-009-015-e2e-secret";
process.env.API_RATE_LIMIT_MAX = "10000";
process.env.ABUSE_RATE_LIMIT_MAX = "10000";
process.env.AUTH_RATE_LIMIT_MAX = "10000";

const { server, io } = require("../src/server");
const User = require("../src/modules/users/User");
const Post = require("../src/modules/posts/Post");
const { RefreshToken, SessionRevocation } = require("../src/modules/auth/session.service");
const Block = require("../src/modules/moderation/Block");

const mongoConfigured = Boolean(process.env.MONGODB_URI);
const tempDatabaseName = `kronos_e2e_${crypto.randomBytes(6).toString("hex")}`;
const PASSWORD = "KronosBlock123!";
let baseUrl;
let connected = false;

function mongoTest(name, fn) {
  test(name, async (t) => {
    if (!mongoConfigured) return t.skip("Requiere MONGODB_URI real (base temporal kronos_e2e_*). Sin URI no se simula persistencia.");
    try { await fn(); } catch (error) {
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
  try { data = await response.json(); } catch { data = null; }
  return { status: response.status, data, requestId: response.headers.get("x-request-id") };
}

async function register(displayName = "E2E Kronos") {
  const suffix = crypto.randomBytes(5).toString("hex");
  const response = await request("/api/auth/register", { method: "POST", body: {
    username: `e2e_${suffix}`, email: `e2e.${suffix}@example.test`, password: PASSWORD, displayName
  } });
  assert.strictEqual(response.status, 201, JSON.stringify(response.data));
  return { id: response.data.user.id, email: response.data.user.email, token: response.data.token, refreshToken: response.data.refreshToken };
}

async function createPost(token, content) {
  const response = await request("/api/posts", { method: "POST", token, body: { content } });
  assert.strictEqual(response.status, 201, JSON.stringify(response.data));
  return response.data.post;
}

function connectSocket(token) {
  const socket = ioClient(baseUrl, { auth: { token }, transports: ["websocket"], reconnection: false, timeout: 5000 });
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { socket.disconnect(); reject(new Error("SOCKET_CONNECT_TIMEOUT")); }, 6000);
    socket.on("connect", () => { clearTimeout(timer); resolve(socket); });
    socket.on("connect_error", (error) => { clearTimeout(timer); socket.disconnect(); reject(error); });
  });
}

function waitForDisconnect(socket) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("SOCKET_DISCONNECT_TIMEOUT")), 6000);
    socket.once("disconnect", () => { clearTimeout(timer); resolve(); });
  });
}

test.before(async () => {
  if (mongoConfigured) {
    await mongoose.connect(process.env.MONGODB_URI, { dbName: tempDatabaseName, serverSelectionTimeoutMS: 15000 });
    connected = true;
    await Promise.all([User.deleteMany({}), Post.deleteMany({}), RefreshToken.deleteMany({}), SessionRevocation.deleteMany({}), Block.deleteMany({})]);
  }
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
  await new Promise((resolve) => io.close(resolve));
  if (server.listening) await new Promise((resolve) => server.close(resolve));
  if (connected) {
    if (tempDatabaseName.startsWith("kronos_e2e_")) await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  }
});

mongoTest("009: búsqueda global respeta el bloqueo y devuelve contenido visible", async () => {
  const viewer = await register("Viewer");
  const author = await register("Nebulosa Creator");
  await createPost(author.token, "Nebulosa especial de Kronos");

  const visible = await request("/api/search?q=Nebulosa&scope=all", { token: viewer.token });
  assert.strictEqual(visible.status, 200, JSON.stringify(visible.data));
  assert.strictEqual(visible.data.users.length, 1);
  assert.strictEqual(visible.data.posts.length, 1);
  assert.ok(visible.requestId);

  const blocked = await request(`/api/moderation/blocks/${author.id}`, { method: "POST", token: viewer.token });
  assert.strictEqual(blocked.status, 200, JSON.stringify(blocked.data));
  const hidden = await request("/api/search?q=Nebulosa&scope=all", { token: viewer.token });
  assert.strictEqual(hidden.status, 200, JSON.stringify(hidden.data));
  assert.strictEqual(hidden.data.users.length, 0);
  assert.strictEqual(hidden.data.posts.length, 0);
});

mongoTest("011: preferencias y revocación de dispositivo son persistentes", async () => {
  const user = await register();
  const login = await request("/api/auth/login", { method: "POST", body: { email: user.email, password: PASSWORD } });
  assert.strictEqual(login.status, 200, JSON.stringify(login.data));
  const firstFamily = jwt.decode(user.token).sid;
  const secondFamily = jwt.decode(login.data.token).sid;
  assert.ok(firstFamily && secondFamily && firstFamily !== secondFamily);

  const preferences = await request("/api/users/me/preferences", { method: "PATCH", token: user.token, body: { notifications: { inApp: false }, content: { showSensitive: true }, language: "en" } });
  assert.strictEqual(preferences.status, 200, JSON.stringify(preferences.data));
  assert.strictEqual(preferences.data.preferences.notifications.inApp, false);
  assert.strictEqual(preferences.data.preferences.content.showSensitive, true);
  assert.strictEqual(preferences.data.preferences.language, "en");

  const sessions = await request("/api/auth/sessions", { token: user.token });
  assert.strictEqual(sessions.status, 200, JSON.stringify(sessions.data));
  assert.strictEqual(sessions.data.sessions.length, 2);

  const activeSocket = await connectSocket(login.data.token);
  const disconnected = waitForDisconnect(activeSocket);
  const revoke = await request(`/api/auth/sessions/${secondFamily}`, { method: "DELETE", token: user.token });
  assert.strictEqual(revoke.status, 200, JSON.stringify(revoke.data));
  await disconnected;
  await assert.rejects(() => connectSocket(login.data.token), /AUTH_REVOKED/);

  const oldDevice = await request("/api/users/me", { token: login.data.token });
  assert.strictEqual(oldDevice.status, 401);
  assert.strictEqual(oldDevice.data.code, "SESSION_REVOKED");
});

mongoTest("013/015: admin y observabilidad requieren rol real y no JWT manipulado", async () => {
  const admin = await register("Admin");
  const member = await register("Member");
  const denied = await request("/api/admin/overview", { token: member.token });
  assert.strictEqual(denied.status, 403);

  await User.updateOne({ _id: admin.id }, { $set: { role: "admin" } });
  const overview = await request("/api/admin/overview", { token: admin.token });
  assert.strictEqual(overview.status, 200, JSON.stringify(overview.data));
  assert.strictEqual(overview.data.users, 2);

  const users = await request("/api/admin/users?q=member", { token: admin.token });
  assert.strictEqual(users.status, 200, JSON.stringify(users.data));
  assert.strictEqual(users.data.users[0].email, member.email);

  const metrics = await request("/api/observability/summary", { token: admin.token });
  assert.strictEqual(metrics.status, 200, JSON.stringify(metrics.data));
  assert.ok(metrics.data.requests.total > 0);
});
