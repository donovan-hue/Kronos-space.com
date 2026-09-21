const test = require("node:test");
const assert = require("node:assert");
const crypto = require("node:crypto");
const mongoose = require("mongoose");

/**
 * CÁPSULAS DEL TIEMPO (Fase 5) — contratos con MongoDB real.
 * Verifica que el contenido no se pueda leer antes de tiempo, que la
 * apertura sea idempotente ante la carrera scheduler/lectura y que la
 * notificación de apertura llegue una única vez.
 */
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env"), quiet: true });
process.env.JWT_SECRET = process.env.JWT_SECRET || "kronos-capsules-e2e-secret";
process.env.CAPSULE_SECRET = process.env.CAPSULE_SECRET || "kronos-capsules-e2e-key";
process.env.API_RATE_LIMIT_MAX = "10000";
process.env.ABUSE_RATE_LIMIT_MAX = "10000";
process.env.AUTH_RATE_LIMIT_MAX = "10000";

const { server } = require("../src/server");
const User = require("../src/modules/users/User");
const Capsule = require("../src/modules/capsules/Capsule");
const CapsuleModel = require("../src/modules/capsules/Capsule");
const Notification = require("../src/modules/notifications/Notification");
const { decryptText } = require("../src/modules/capsules/capsule.crypto");
const { openDueCapsules } = require("../src/modules/capsules/capsules.routes");

const mongoConfigured = Boolean(process.env.MONGODB_URI);
const tempDatabaseName = `kronos_e2e_${crypto.randomBytes(6).toString("hex")}`;
const PASSWORD = "KronosCapsules123!";
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
    await Promise.all([User.deleteMany({}), Capsule.deleteMany({}), Notification.deleteMany({})]);
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

mongoTest("cápsulas: el contenido viaja cifrado y no se lee antes de abrirse", async () => {
  const owner = await register("Dueña");
  const stranger = await register("Curiosa");

  const created = await request("/api/capsules", {
    method: "POST",
    token: owner.token,
    body: {
      title: "Carta al 2030",
      opensAt: new Date(Date.now() + 3600_000).toISOString(),
      timezone: "America/Mexico_City",
      message: "Secreto del futuro: aún creemos en el tiempo"
    }
  });
  assert.strictEqual(created.status, 201, JSON.stringify(created.data));
  const capsule = created.data.capsule;
  assert.strictEqual(capsule.state, "draft");
  assert.strictEqual(capsule.messages[0].text, "Secreto del futuro: aún creemos en el tiempo");
  assert.ok(!JSON.stringify(capsule).includes("cipherText"));

  // En la base persistida no existe el texto plano.
  const raw = await CapsuleModel.findById(capsule._id).lean();
  assert.ok(!JSON.stringify(raw).includes("Secreto del futuro"), "el texto plano no puede estar en la base");
  assert.ok(raw.messages[0].cipherText.length > 0);

  const sealed = await request(`/api/capsules/${capsule._id}/seal`, { method: "POST", token: owner.token });
  assert.strictEqual(sealed.status, 200, JSON.stringify(sealed.data));
  assert.strictEqual(sealed.data.capsule.state, "scheduled");
  assert.deepEqual(sealed.data.capsule.messages, [], "sellada: sin mensajes en la respuesta");

  const asStranger = await request(`/api/capsules/${capsule._id}`, { token: stranger.token });
  assert.strictEqual(asStranger.status, 403, "una persona ajena no puede abrir la cápsula");

  const beforeOpen = await request(`/api/capsules/${capsule._id}`, { token: owner.token });
  assert.strictEqual(beforeOpen.status, 200);
  assert.strictEqual(beforeOpen.data.capsule.state, "scheduled");
  assert.deepEqual(beforeOpen.data.capsule.messages, [], "antes de tiempo: sin mensajes");
  assert.ok(beforeOpen.data.capsule.msUntilOpen > 0);
});

mongoTest("cápsulas: la apertura es idempotente y notifica una sola vez", async () => {
  const owner = await register("Dueña");
  const collaborator = await register("Colaboradora");

  const created = await request("/api/capsules", {
    method: "POST",
    token: owner.token,
    body: {
      title: "Cápsula compartida",
      opensAt: new Date(Date.now() + 60_000).toISOString(),
      message: "Mensaje de la dueña"
    }
  });
  assert.strictEqual(created.status, 201);
  const capsuleId = created.data.capsule._id;

  const invite = await request(`/api/capsules/${capsuleId}/invite`, {
    method: "POST",
    token: owner.token,
    body: { username: collaborator.username }
  });
  assert.strictEqual(invite.status, 200, JSON.stringify(invite.data));
  assert.strictEqual(invite.data.capsule.contributorsCount, 1);

  const contribution = await request(`/api/capsules/${capsuleId}/messages`, {
    method: "POST",
    token: collaborator.token,
    body: { text: "Aporte de la colaboradora" }
  });
  assert.strictEqual(contribution.status, 201, JSON.stringify(contribution.data));
  assert.strictEqual(contribution.data.capsule.messages.length, 2);

  const sealed = await request(`/api/capsules/${capsuleId}/seal`, { method: "POST", token: owner.token });
  assert.strictEqual(sealed.status, 200);
  const afterSealMessage = await request(`/api/capsules/${capsuleId}/messages`, {
    method: "POST",
    token: collaborator.token,
    body: { text: "ya no debería entrar" }
  });
  assert.strictEqual(afterSealMessage.status, 409, "sellada: no admite mensajes");

  // Simular que llegó la fecha (sin esperar: se ajusta la base).
  await CapsuleModel.updateOne({ _id: capsuleId }, { $set: { opensAt: new Date(Date.now() - 1000) } });

  // Carrera: scheduler y lectura perezosa a la vez.
  const [scheduled, lazy] = await Promise.all([
    openDueCapsules(),
    request(`/api/capsules/${capsuleId}`, { token: collaborator.token })
  ]);
  assert.strictEqual(lazy.status, 200);
  assert.strictEqual(lazy.data.capsule.state, "opened");
  const texts = lazy.data.capsule.messages.map((message) => message.text).sort();
  assert.deepEqual(texts, ["Aporte de la colaboradora", "Mensaje de la dueña"]);
  assert.ok(!JSON.stringify(lazy.data.capsule).includes("cipherText"));

  // Segunda pasada del scheduler: no duplica notificaciones ni estados.
  const second = await openDueCapsules();
  assert.strictEqual(second.length, 0, "nada nuevo que abrir");

  const ownerNotifications = await Notification.countDocuments({ recipient: owner.id, type: "capsule" });
  const collaboratorNotifications = await Notification.countDocuments({ recipient: collaborator.id, type: "capsule" });
  assert.strictEqual(ownerNotifications, 0, "la dueña no se auto-notifica");
  assert.strictEqual(collaboratorNotifications, 1, "la colaboradora recibe exactamente un aviso");

  const raw = await CapsuleModel.findById(capsuleId).lean();
  assert.strictEqual(decryptText(raw.messages[0]), "Mensaje de la dueña");
});

mongoTest("cápsulas: cancelar antes de abrir nunca revela el contenido", async () => {
  const owner = await register("Dueña");

  const created = await request("/api/capsules", {
    method: "POST",
    token: owner.token,
    body: {
      title: "Cápsula cancelada",
      opensAt: new Date(Date.now() + 3600_000).toISOString(),
      message: "Esto no debe leerse"
    }
  });
  assert.strictEqual(created.status, 201);
  const capsuleId = created.data.capsule._id;

  await request(`/api/capsules/${capsuleId}/seal`, { method: "POST", token: owner.token });
  const cancel = await request(`/api/capsules/${capsuleId}/cancel`, { method: "POST", token: owner.token });
  assert.strictEqual(cancel.status, 200, JSON.stringify(cancel.data));
  assert.strictEqual(cancel.data.capsule.state, "cancelled");
  assert.deepEqual(cancel.data.capsule.messages, []);

  // Aunque llegue la fecha, una cápsula cancelada no se abre.
  await CapsuleModel.updateOne({ _id: capsuleId }, { $set: { opensAt: new Date(Date.now() - 1000) } });
  await openDueCapsules();
  const still = await request(`/api/capsules/${capsuleId}`, { token: owner.token });
  assert.strictEqual(still.data.capsule.state, "cancelled");
  assert.deepEqual(still.data.capsule.messages, [], "cancelada: el contenido jamás se revela");

  const deleted = await request(`/api/capsules/${capsuleId}`, { method: "DELETE", token: owner.token });
  assert.strictEqual(deleted.status, 200);
  const gone = await request(`/api/capsules/${capsuleId}`, { token: owner.token });
  assert.strictEqual(gone.status, 404);
});

mongoTest("cápsulas: la lista solo muestra las propias y las colaboradas", async () => {
  const owner = await register("Dueña");
  const collaborator = await register("Colaboradora");
  const stranger = await register("Ajenа".replace("а", "a"));

  const mine = await request("/api/capsules", {
    method: "POST",
    token: owner.token,
    body: { title: "Mía", opensAt: new Date(Date.now() + 3600_000).toISOString(), message: "hola" }
  });
  assert.strictEqual(mine.status, 201);
  await request(`/api/capsules/${mine.data.capsule._id}/invite`, {
    method: "POST",
    token: owner.token,
    body: { username: collaborator.username }
  });

  const other = await request("/api/capsules", {
    method: "POST",
    token: stranger.token,
    body: { title: "Ajena", opensAt: new Date(Date.now() + 3600_000).toISOString(), message: "chau" }
  });
  assert.strictEqual(other.status, 201);

  const ownerList = await request("/api/capsules", { token: owner.token });
  assert.strictEqual(ownerList.data.capsules.length, 1);
  assert.strictEqual(ownerList.data.capsules[0].title, "Mía");

  const collaboratorList = await request("/api/capsules", { token: collaborator.token });
  assert.strictEqual(collaboratorList.data.capsules.length, 1);
  assert.strictEqual(collaboratorList.data.capsules[0].title, "Mía");
  assert.strictEqual(collaboratorList.data.capsules[0].mine, false);
});
