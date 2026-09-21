const test = require("node:test");
const assert = require("node:assert");
const crypto = require("node:crypto");
const mongoose = require("mongoose");

/**
 * CONFIANZA (Fase 8) — contratos con MongoDB real: apelaciones del
 * denunciante y salud de comunidad para moderadores.
 */
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env"), quiet: true });
process.env.JWT_SECRET = process.env.JWT_SECRET || "kronos-trust-e2e-secret";
process.env.API_RATE_LIMIT_MAX = "10000";
process.env.ABUSE_RATE_LIMIT_MAX = "10000";
process.env.AUTH_RATE_LIMIT_MAX = "10000";

const { server } = require("../src/server");
const User = require("../src/modules/users/User");
const Post = require("../src/modules/posts/Post");
const Report = require("../src/modules/moderation/Report").Report || require("../src/modules/moderation/Report");

const mongoConfigured = Boolean(process.env.MONGODB_URI);
const tempDatabaseName = `kronos_e2e_${crypto.randomBytes(6).toString("hex")}`;
const PASSWORD = "KronosTrust123!";
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

async function register(displayName, role = "user") {
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
  if (role === "admin") {
    await User.findByIdAndUpdate(response.data.user.id, { role: "admin" });
  }
  return { id: response.data.user.id, token: response.data.token, username: response.data.user.username };
}

test.before(async () => {
  if (mongoConfigured) {
    await mongoose.connect(process.env.MONGODB_URI, { dbName: tempDatabaseName, serverSelectionTimeoutMS: 15000 });
    connected = true;
    await Promise.all([User.deleteMany({}), Post.deleteMany({}), Report.deleteMany({})]);
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

mongoTest("trust: el denunciante apela un reporte descartado y una apelación aceptada lo reabre", async () => {
  const reporter = await register("Denunciante");
  const author = await register("Autor");
  const admin = await register("Admina", "admin");

  const target = await request("/api/posts", {
    method: "POST",
    token: author.token,
    body: { content: "Publicación reportable" }
  });
  assert.strictEqual(target.status, 201, JSON.stringify(target.data));

  const report = await request("/api/moderation/reports", {
    method: "POST",
    token: reporter.token,
    body: { targetType: "post", targetId: target.data.post._id, reason: "spam", details: "Parece spam repetido" }
  });
  assert.strictEqual(report.status, 201, JSON.stringify(report.data));
  const reportId = report.data.report._id;

  // Sin resolver no se puede apelar.
  const early = await request(`/api/moderation/reports/${reportId}/appeal`, {
    method: "POST",
    token: reporter.token,
    body: { text: "Creo que esto debió atenderse" }
  });
  assert.strictEqual(early.status, 409, "solo reportes descartados se apelan");

  // La admina lo descarta.
  const dismissed = await request(`/api/moderation/reports/${reportId}`, {
    method: "PATCH",
    token: admin.token,
    body: { status: "dismissed", resolutionNote: "No cumple el criterio" }
  });
  assert.strictEqual(dismissed.status, 200);

  // El autor del contenido no puede apelar el reporte ajeno.
  const foreign = await request(`/api/moderation/reports/${reportId}/appeal`, {
    method: "POST",
    token: author.token,
    body: { text: "Texto suficientemente largo para validar" }
  });
  assert.strictEqual(foreign.status, 403, "solo el denunciante apela");

  // Apelación válida del denunciante.
  const appeal = await request(`/api/moderation/reports/${reportId}/appeal`, {
    method: "POST",
    token: reporter.token,
    body: { text: "Es la quinta vez que publica el mismo enlace, revisen el historial." }
  });
  assert.strictEqual(appeal.status, 200, JSON.stringify(appeal.data));
  assert.equal(appeal.data.report.appeal.status, "submitted");

  // No se apela dos veces.
  const repeat = await request(`/api/moderation/reports/${reportId}/appeal`, {
    method: "POST",
    token: reporter.token,
    body: { text: "Otra apelación más larga de diez caracteres" }
  });
  assert.strictEqual(repeat.status, 409);

  // Texto corto no pasa.
  const short = await request(`/api/moderation/reports/${reportId}/appeal`, {
    method: "POST",
    token: reporter.token,
    body: { text: "corta" }
  });
  assert.strictEqual(short.status, 400);

  // La admina acepta la apelación: el reporte vuelve a revisión.
  const accepted = await request(`/api/moderation/reports/${reportId}/appeal`, {
    method: "PATCH",
    token: admin.token,
    body: { status: "accepted" }
  });
  assert.strictEqual(accepted.status, 200, JSON.stringify(accepted.data));
  assert.equal(accepted.data.report.appeal.status, "accepted");
  assert.equal(accepted.data.report.status, "reviewing", "la apelación aceptada reabre el reporte");

  // Mis reportes muestran el estado de la apelación.
  const mine = await request("/api/moderation/reports", { token: reporter.token });
  const withAppeal = mine.data.reports.find((entry) => entry._id === reportId);
  assert.equal(withAppeal.appeal.status, "accepted");
  assert.match(withAppeal.appeal.text, /quinta vez/);
});

mongoTest("trust: la salud de comunidad es privada de moderadores", async () => {
  const reporter = await register("Denunciante");
  const author = await register("Autor");
  const admin = await register("Admina", "admin");

  const target = await request("/api/posts", {
    method: "POST",
    token: author.token,
    body: { content: "Otra publicación" }
  });
  await request("/api/moderation/reports", {
    method: "POST",
    token: reporter.token,
    body: { targetType: "post", targetId: target.data.post._id, reason: "harassment" }
  });

  const forbidden = await request("/api/moderation/health", { token: reporter.token });
  assert.strictEqual(forbidden.status, 403, "sin admin no hay salud de comunidad");

  const health = await request("/api/moderation/health", { token: admin.token });
  assert.strictEqual(health.status, 200, JSON.stringify(health.data));
  assert.equal(health.data.windowDays, 30);
  assert.equal(health.data.last30.byStatus.pending >= 1, true, "el reporte nuevo queda pendiente");
  assert.ok(health.data.byReason.some((entry) => entry.reason === "harassment"));
  assert.ok(Number.isFinite(health.data.queue.pending));
  assert.ok(health.data.appeals);
});
