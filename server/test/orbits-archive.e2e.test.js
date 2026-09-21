const test = require("node:test");
const assert = require("node:assert");
const crypto = require("node:crypto");
const mongoose = require("mongoose");

/**
 * FASE 4 (restos) — archivo de órbitas y paquete de bienvenida, con
 * MongoDB real: lo vencido queda en archivo legible para participantes
 * y la bienvenida viaja al unirse.
 */
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env"), quiet: true });
process.env.JWT_SECRET = process.env.JWT_SECRET || "kronos-orbits-archive-e2e-secret";
process.env.API_RATE_LIMIT_MAX = "10000";
process.env.ABUSE_RATE_LIMIT_MAX = "10000";
process.env.AUTH_RATE_LIMIT_MAX = "10000";

const { server } = require("../src/server");
const User = require("../src/modules/users/User");
const Orbit = require("../src/modules/orbits/Orbit");

const mongoConfigured = Boolean(process.env.MONGODB_URI);
const tempDatabaseName = `kronos_e2e_${crypto.randomBytes(6).toString("hex")}`;
const PASSWORD = "KronosOrbit123!";
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

test.before(async () => {
  if (mongoConfigured) {
    await mongoose.connect(process.env.MONGODB_URI, { dbName: tempDatabaseName, serverSelectionTimeoutMS: 15000 });
    connected = true;
    await Promise.all([User.deleteMany({}), Orbit.deleteMany({})]);
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

mongoTest("archivo: lo vencido queda legible para participantes y oculto para extraños", async () => {
  const owner = await register("Dueña");
  const member = await register("Miembra");
  const stranger = await register("Extraña");

  // Órbita ya vencida (creada directamente en la base).
  const expired = await Orbit.create({
    name: "Semana de astrofoto",
    slug: "semana-astrofoto-e2e",
    description: "Una semana de cielo profundo",
    visibility: "public",
    expiresAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
    owner: owner.id,
    members: [
      { user: owner.id, role: "owner" },
      { user: member.id, role: "member" }
    ]
  });

  // No aparece en las activas de nadie.
  const activeForOwner = await request("/api/orbits", { token: owner.token });
  assert.strictEqual(activeForOwner.status, 200);
  assert.equal(activeForOwner.data.orbits.every((orbit) => orbit._id !== String(expired._id)), true, "la vencida no se lista como activa");

  // Archivo: para la dueña y la miembra; la extraña no la ve.
  const archiveOwner = await request("/api/orbits/archived", { token: owner.token });
  assert.strictEqual(archiveOwner.status, 200);
  assert.equal(archiveOwner.data.orbits.some((orbit) => orbit._id === String(expired._id)), true, "la dueña ve su órbita vencida");
  assert.equal(archiveOwner.data.orbits[0].active, false);

  const archiveMember = await request("/api/orbits/archived", { token: member.token });
  assert.equal(archiveMember.data.orbits.some((orbit) => orbit._id === String(expired._id)), true, "la miembra ve la órbita vencida");

  const archiveStranger = await request("/api/orbits/archived", { token: stranger.token });
  assert.equal(archiveStranger.data.orbits.length, 0, "la extraña no ve el archivo ajeno");

  // Detalle: legible para participantes, 404 para extraños, sin unirse.
  const detail = await request(`/api/orbits/${expired._id}`, { token: member.token });
  assert.strictEqual(detail.status, 200);
  assert.equal(detail.data.orbit.active, false);

  const detailStranger = await request(`/api/orbits/${expired._id}`, { token: stranger.token });
  assert.strictEqual(detailStranger.status, 404, "el archivo no es público");

  const joinExpired = await request(`/api/orbits/${expired._id}/join`, { method: "POST", token: stranger.token });
  assert.strictEqual(joinExpired.status, 404, "nadie se une a una órbita vencida");
});

mongoTest("bienvenida: el paquete se guarda y aparece al unirse", async () => {
  const owner = await register("Anfitriona");
  const guest = await register("Invitada");

  const welcome = "Bienvenida a la órbita: preséntate en el feed y revisa las reglas.";
  const created = await request("/api/orbits", {
    method: "POST",
    token: owner.token,
    body: {
      name: "Órbita con bienvenida",
      description: "Con paquete de bienvenida",
      visibility: "public",
      welcomeMessage: welcome
    }
  });
  assert.strictEqual(created.status, 201, JSON.stringify(created.data));
  assert.equal(created.data.orbit.welcomeMessage, welcome);
  const orbitId = created.data.orbit._id;

  // La invitada se une y recibe la bienvenida en la respuesta.
  const joined = await request(`/api/orbits/${orbitId}/join`, { method: "POST", token: guest.token });
  assert.strictEqual(joined.status, 200, JSON.stringify(joined.data));
  assert.equal(joined.data.orbit.joined, true);
  assert.equal(joined.data.orbit.welcomeMessage, welcome, "la bienvenida viaja al unirse");

  // Se puede editar y acota a 1000.
  const updated = await request(`/api/orbits/${orbitId}`, {
    method: "PATCH",
    token: owner.token,
    body: { welcomeMessage: "Nueva bienvenida más corta." }
  });
  assert.strictEqual(updated.status, 200);
  assert.equal(updated.data.orbit.welcomeMessage, "Nueva bienvenida más corta.");

  const tooLong = await request(`/api/orbits/${orbitId}`, {
    method: "PATCH",
    token: owner.token,
    body: { welcomeMessage: "x".repeat(1001) }
  });
  assert.strictEqual(tooLong.status, 400, "la bienvenida no puede superar 1000 caracteres");
});
