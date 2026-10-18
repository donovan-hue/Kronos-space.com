const test = require("node:test");
const assert = require("node:assert");
const crypto = require("node:crypto");

/**
 * T06 — Idempotencia del apoyo.
 *
 * El defecto que esta prueba vigila: `POST /api/support/tip` creaba una
 * transacción por petición, así que un doble clic —o un reintento de red del
 * navegador— registraba DOS apoyos idénticos y notificaba dos veces al
 * creador. La corrección sigue el patrón que ya usaba la mensajería (021):
 * el cliente manda el identificador del intento y el servidor devuelve el
 * apoyo original en lugar de crear otro.
 *
 * Se comprueba contra MongoDB real, sin dobles:
 *
 *   1. con identificador, el reenvío NO duplica ni altera el historial,
 *   2. sin identificador, el comportamiento anterior sigue intacto
 *      (cada envío es un apoyo nuevo: nadie envió el mismo intento dos veces),
 *   3. la idempotencia vive en la relación: el mismo contador local del
 *      cliente con otro creador sí es un apoyo distinto.
 */
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env"), quiet: true });
process.env.JWT_SECRET = process.env.JWT_SECRET || "kronos-support-e2e-secret";
process.env.API_RATE_LIMIT_MAX = "10000";
process.env.ABUSE_RATE_LIMIT_MAX = "10000";
process.env.AUTH_RATE_LIMIT_MAX = "10000";

const { server } = require("../src/server");
const SupportTransaction = require("../src/modules/support/SupportTransaction");
const { assertE2ETarget } = require("./helpers/e2e-target-guard");
const { connectE2E, cleanupE2E, clearNewDocuments } = require("./helpers/e2e-database");

let mongoConfigured = Boolean(process.env.KRONOS_E2E_MONGODB_URI);
const tempDatabaseName = "test";

if (mongoConfigured) {
  mongoConfigured = assertE2ETarget({
    uri: process.env.KRONOS_E2E_MONGODB_URI,
    dbName: tempDatabaseName
  });
}

const PASSWORD = "KronosApoyo123!";
let baseUrl;
let connected = false;

function mongoTest(name, fn) {
  test(name, async (t) => {
    if (!mongoConfigured) return t.skip("Requiere KRONOS_E2E_MONGODB_URI real (base Atlas test).");
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
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined
  });
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
      username: `apoyo_${suffix}`,
      email: `apoyo.${suffix}@example.test`,
      password: PASSWORD,
      displayName
    }
  });
  assert.strictEqual(response.status, 201, JSON.stringify(response.data));
  return { id: response.data.user.id, token: response.data.token };
}

test.before(async () => {
  if (mongoConfigured) {
    await connectE2E();
    connected = true;
    await clearNewDocuments();
  }
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

test.beforeEach(async () => {
  if (connected) await clearNewDocuments();
});

test.after(async () => {
  if (server.listening) await new Promise((resolve) => server.close(resolve));
  if (connected) {
    await cleanupE2E();
  }
});

mongoTest("apoyo: el envío crea una transacción y queda en el historial", async () => {
  const creadora = await register("Creadora");
  const fans = await register("Fan");

  const enviado = await request("/api/support/tip", {
    method: "POST",
    token: fans.token,
    body: { creatorId: creadora.id, amount: 50, tier: "meteor", message: "Gracias", clientMessageId: "intento-1" }
  });

  assert.strictEqual(enviado.status, 201, JSON.stringify(enviado.data));
  assert.strictEqual(enviado.data.deduplicated, false, "un primer envío no es duplicado");
  assert.strictEqual(enviado.data.transaction.amount, 50);

  assert.strictEqual(await SupportTransaction.countDocuments({}), 1, "queda exactamente una transacción");

  const historial = await request("/api/support/history?role=sent", { token: fans.token });
  assert.strictEqual(historial.status, 200, JSON.stringify(historial.data));
  assert.strictEqual(historial.data.transactions.length, 1, "el historial refleja un solo apoyo");
  assert.strictEqual(historial.data.transactions[0].amount, 50);
});

mongoTest("apoyo: el reenvío con el mismo identificador no duplica", async () => {
  const creadora = await register("Creadora");
  const fans = await register("Fan");
  const cuerpo = { creatorId: creadora.id, amount: 10, tier: "stardust", clientMessageId: "intento-doble" };

  const primera = await request("/api/support/tip", { method: "POST", token: fans.token, body: cuerpo });
  assert.strictEqual(primera.status, 201, JSON.stringify(primera.data));

  // El doble clic: misma petición, mismo identificador.
  const segunda = await request("/api/support/tip", { method: "POST", token: fans.token, body: cuerpo });
  assert.strictEqual(segunda.status, 200, JSON.stringify(segunda.data));
  assert.strictEqual(segunda.data.deduplicated, true, "el servidor reconoce el reenvío");
  assert.strictEqual(
    String(segunda.data.transaction._id),
    String(primera.data.transaction._id),
    "devuelve la transacción original, no una nueva"
  );

  assert.strictEqual(await SupportTransaction.countDocuments({}), 1, "el reenvío no crea una segunda transacción");

  const historial = await request("/api/support/history?role=sent", { token: fans.token });
  assert.strictEqual(historial.data.transactions.length, 1, "el historial no muestra dos apoyos");
});

mongoTest("apoyo: sin identificador, cada envío es un apoyo nuevo", async () => {
  const creadora = await register("Creadora");
  const fans = await register("Fan");

  const primera = await request("/api/support/tip", {
    method: "POST",
    token: fans.token,
    body: { creatorId: creadora.id, amount: 10, tier: "stardust" }
  });
  const segunda = await request("/api/support/tip", {
    method: "POST",
    token: fans.token,
    body: { creatorId: creadora.id, amount: 10, tier: "stardust" }
  });

  assert.strictEqual(primera.status, 201, JSON.stringify(primera.data));
  assert.strictEqual(segunda.status, 201, JSON.stringify(segunda.data));
  assert.strictEqual(await SupportTransaction.countDocuments({}), 2, "sin identificador son dos apoyos distintos");
});

mongoTest("apoyo: el mismo identificador con otro creador sí es un apoyo distinto", async () => {
  const creadoraA = await register("Creadora A");
  const creadoraB = await register("Creadora B");
  const fans = await register("Fan");

  const paraA = await request("/api/support/tip", {
    method: "POST",
    token: fans.token,
    body: { creatorId: creadoraA.id, amount: 10, tier: "stardust", clientMessageId: "intento-compartido" }
  });
  const paraB = await request("/api/support/tip", {
    method: "POST",
    token: fans.token,
    body: { creatorId: creadoraB.id, amount: 10, tier: "stardust", clientMessageId: "intento-compartido" }
  });

  assert.strictEqual(paraA.status, 201, JSON.stringify(paraA.data));
  assert.strictEqual(paraB.status, 201, JSON.stringify(paraB.data));
  assert.strictEqual(await SupportTransaction.countDocuments({}), 2, "la idempotencia no mezcla destinatarios");
});

mongoTest("apoyo: las validaciones reales siguen en pie", async () => {
  const fans = await register("Fan");

  const aSiMismo = await request("/api/support/tip", {
    method: "POST",
    token: fans.token,
    body: { creatorId: fans.id, amount: 10, tier: "stardust" }
  });
  assert.strictEqual(aSiMismo.status, 400, JSON.stringify(aSiMismo.data));

  const cantidadInvalida = await request("/api/support/tip", {
    method: "POST",
    token: fans.token,
    body: { creatorId: fans.id, amount: 0, tier: "stardust" }
  });
  assert.strictEqual(cantidadInvalida.status, 400, JSON.stringify(cantidadInvalida.data));

  assert.strictEqual(await SupportTransaction.countDocuments({}), 0, "nada inválido llega a la base");
});
