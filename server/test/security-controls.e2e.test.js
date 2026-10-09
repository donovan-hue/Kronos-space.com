const test = require("node:test");
const assert = require("node:assert");
const crypto = require("crypto");

/**
 * P0-6 — controles de seguridad de producción con servidor REAL y MongoDB REAL.
 *
 * Sin dobles: registro, login, logout, JWT, límites y propiedad se verifican
 * contra la base temporal. Los límites de prueba son valores explícitos
 * (AUTH=8, IA=10 fijo en código) y no relajan producción.
 *
 * Cubre: límite de IA (10 / 15 min), límite de auth que también bloquea
 * credenciales válidas, IDOR/BOLA entre dos usuarios reales (scripts, vídeos,
 * borradores, cápsulas, conversaciones), revocación de sesión por logout,
 * acceso admin de un usuario normal y ausencia de fuga por enumeración.
 */
require("dotenv").config({
  path: require("path").join(__dirname, "..", ".env"),
  quiet: true
});

process.env.JWT_SECRET = process.env.JWT_SECRET || "kronos-p0-6-security-controls-e2e";
process.env.API_RATE_LIMIT_MAX = "10000";
process.env.ABUSE_RATE_LIMIT_MAX = "10000";
process.env.MEDIA_RATE_LIMIT_MAX = "10000";
process.env.AUTH_RATE_LIMIT_MAX = "8";

const { server, io } = require("../src/server");
const Script = require("../src/modules/script-ai/Script");
const VideoGeneration = require("../src/modules/video-ai/VideoGeneration");
const Conversation = require("../src/modules/conversations/Conversation");
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

const PASSWORD = "KronosP06Secure!";
const MISSING_OBJECT_ID = "65f0000000000000000000ff";
let baseUrl;
let dbConnected = false;

function mongoTest(name, fn) {
  test(name, async (t) => {
    if (!mongoConfigured) {
      t.skip("Requiere KRONOS_E2E_MONGODB_URI real (base Atlas test).");
      return;
    }
    await fn(t);
  });
}

async function request(path, { method = "GET", token, body, headers = {} } = {}) {
  const finalHeaders = { ...headers };
  if (body) finalHeaders["Content-Type"] = "application/json";
  if (token) finalHeaders.Authorization = `Bearer ${token}`;

  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: finalHeaders,
    body: body ? JSON.stringify(body) : undefined
  });

  let data = null;
  try {
    data = await response.json();
  } catch {
    data = null;
  }

  return { status: response.status, data, headers: response.headers };
}

async function registerUser(label) {
  const suffix = crypto.randomBytes(5).toString("hex");
  const email = `p06.${label}.${suffix}@example.com`;
  const { status, data } = await request("/api/auth/register", {
    method: "POST",
    body: {
      username: `p06_${label}_${suffix}`.slice(0, 30),
      email,
      password: PASSWORD,
      displayName: `P06 ${label}`
    }
  });

  assert.strictEqual(status, 201, JSON.stringify(data));

  return {
    id: data.user.id,
    email,
    username: data.user.username,
    token: data.token,
    refreshToken: data.refreshToken
  };
}

test.before(async () => {
  if (mongoConfigured) {
    await connectE2E();
    dbConnected = true;
    await clearNewDocuments();
  }

  await new Promise((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });

  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
  await new Promise((resolve) => io.close(resolve));

  if (server.listening) {
    await new Promise((resolve) => server.close(resolve));
  }

  if (dbConnected) {
    await cleanupE2E();
  }
});

// ---------------------------------------------------------------
// Usuarios reales A (dueña) y B (atacante)
// ---------------------------------------------------------------
let owner;
let attacker;

mongoTest("P0-6 preparación: se registran dos usuarios reales", async () => {
  owner = await registerUser("owner");
  attacker = await registerUser("attacker");
  assert.notStrictEqual(owner.id, attacker.id);
});

// ---------------------------------------------------------------
// Límite de IA: 10 peticiones por 15 min, la undécima responde 429
// ---------------------------------------------------------------
mongoTest("límite de IA: las 10 primeras llegan al handler y la 11.ª responde 429", async () => {
  const headers = { Authorization: `Bearer ${owner.token}` };

  // Cuerpo inválido: el handler rechaza ANTES de llamar al proveedor externo.
  for (let i = 1; i <= 10; i += 1) {
    const response = await request("/api/ai/scripts/generate", {
      method: "POST",
      headers,
      body: { prompt: "   " }
    });
    assert.strictEqual(response.status, 400, `intento ${i} debe ser 400 del handler, no 429`);
  }

  const blocked = await request("/api/ai/scripts/generate", {
    method: "POST",
    headers,
    body: { prompt: "   " }
  });
  assert.strictEqual(blocked.status, 429, "la undécima petición de IA debe ser 429");
  assert.match(blocked.data.error, /Límite de uso de IA/);
  assert.ok(Number(blocked.headers.get("retry-after")) > 0);
});

mongoTest("límite de IA: una petición anónima recibe 401 y no consume cuota", async () => {
  const response = await request("/api/ai/scripts/generate", {
    method: "POST",
    body: { prompt: "x" }
  });
  assert.strictEqual(response.status, 401);
});

// ---------------------------------------------------------------
// IDOR / BOLA entre dos usuarios reales
// ---------------------------------------------------------------
let ownerScriptId;
let ownerVideoId;
let ownerDraftId;
let ownerCapsuleId;
let ownerConversationId;

mongoTest("IDOR: borradores de otra usuaria no se editan ni borran (403) y no cambian", async () => {
  const created = await request("/api/drafts", {
    method: "POST",
    token: owner.token,
    body: { content: "Borrador privado de la dueña", audience: "private" }
  });
  assert.strictEqual(created.status, 201, JSON.stringify(created.data));
  ownerDraftId = created.data.draft._id;

  const patch = await request(`/api/drafts/${ownerDraftId}`, {
    method: "PATCH",
    token: attacker.token,
    body: { content: "sobrescrito por el atacante" }
  });
  assert.strictEqual(patch.status, 403, "editar borrador ajeno debe ser 403");

  const del = await request(`/api/drafts/${ownerDraftId}`, { method: "DELETE", token: attacker.token });
  assert.strictEqual(del.status, 403, "borrar borrador ajeno debe ser 403");

  const list = await request("/api/drafts", { token: owner.token });
  const stillThere = list.data.drafts.find((d) => d._id === ownerDraftId);
  assert.ok(stillThere, "el borrador de la dueña sigue existiendo");
  assert.strictEqual(stillThere.content, "Borrador privado de la dueña", "el contenido no se alteró");
});

mongoTest("IDOR: script ajeno es 404 y no se ejecuta ni borra; la respuesta no revela existencia", async () => {
  const script = await Script.create({ user: owner.id, prompt: "guion privado", type: "video" });
  ownerScriptId = String(script._id);

  const foreignRead = await request(`/api/ai/scripts/${ownerScriptId}`, { token: attacker.token });
  const missingRead = await request(`/api/ai/scripts/${MISSING_OBJECT_ID}`, { token: attacker.token });
  assert.strictEqual(foreignRead.status, 404);
  assert.strictEqual(foreignRead.status, missingRead.status, "ajeno y existente-inexistente deben ser iguales");
  assert.deepStrictEqual(foreignRead.data, missingRead.data, "el cuerpo no debe servir de oráculo");

  const foreignDelete = await request(`/api/ai/scripts/${ownerScriptId}`, {
    method: "DELETE",
    token: attacker.token
  });
  assert.strictEqual(foreignDelete.status, 404);
  assert.ok(await Script.findById(ownerScriptId).lean(), "el guion de la dueña sigue en la base");
});

mongoTest("IDOR: generación de vídeo ajena es 404 y no se borra", async () => {
  const generation = await VideoGeneration.create({ user: owner.id, prompt: "vídeo privado" });
  ownerVideoId = String(generation._id);

  const read = await request(`/api/ai/videos/${ownerVideoId}`, { token: attacker.token });
  assert.strictEqual(read.status, 404);

  const del = await request(`/api/ai/videos/${ownerVideoId}`, { method: "DELETE", token: attacker.token });
  assert.strictEqual(del.status, 404);
  assert.ok(await VideoGeneration.findById(ownerVideoId).lean(), "la generación sigue en la base");
});

mongoTest("IDOR: cápsula privada de la dueña no es visible para un tercero", async () => {
  const created = await request("/api/capsules", {
    method: "POST",
    token: owner.token,
    body: {
      title: "Cápsula privada P0-6",
      opensAt: new Date(Date.now() + 3600_000).toISOString(),
      timezone: "America/Mexico_City",
      message: "Secreto P0-6"
    }
  });
  assert.strictEqual(created.status, 201, JSON.stringify(created.data));
  ownerCapsuleId = created.data.capsule.id || created.data.capsule._id;

  const read = await request(`/api/capsules/${ownerCapsuleId}`, { token: attacker.token });
  assert.ok(read.status === 403 || read.status === 404, `esperado 403/404, recibido ${read.status}`);
  assert.ok(!JSON.stringify(read.data || {}).includes("Secreto P0-6"), "el contenido no debe filtrarse");
});

mongoTest("IDOR: conversación creada por otra usuaria no se borra (403)", async () => {
  const created = await request("/api/conversations", {
    method: "POST",
    token: owner.token,
    body: { name: "Privada P0-6", memberIds: [attacker.id] }
  });
  assert.strictEqual(created.status, 201, JSON.stringify(created.data));
  ownerConversationId = created.data.conversation._id || created.data.conversation.id;

  const del = await request(`/api/conversations/${ownerConversationId}`, {
    method: "DELETE",
    token: attacker.token
  });
  assert.strictEqual(del.status, 403, "solo quien creó la conversación puede borrarla");

  const stillInDb = await Conversation.findById(ownerConversationId).lean();
  assert.ok(stillInDb, "la conversación sigue existiendo en la base tras el intento ajeno");
});

// ---------------------------------------------------------------
// Acceso sin autorización a zona admin
// ---------------------------------------------------------------
mongoTest("acceso admin: usuario normal con JWT válido recibe 403, no datos", async () => {
  const response = await request("/api/admin/overview", { token: attacker.token });
  assert.strictEqual(response.status, 403, `recibido ${response.status}`);
  assert.ok(response.data && response.data.error, "el 403 debe ser JSON con error");
});

mongoTest("acceso admin: sin token recibe 401", async () => {
  const response = await request("/api/admin/overview");
  assert.strictEqual(response.status, 401);
});

// ---------------------------------------------------------------
// Revocación de sesión: logout invalida el JWT
// ---------------------------------------------------------------
mongoTest("sesión: tras logout el JWT anterior queda rechazado con 401", async () => {
  const user = await registerUser("logout");

  const before = await request("/api/users/me", { token: user.token });
  assert.strictEqual(before.status, 200, "antes de logout el token funciona");

  const logout = await request("/api/auth/logout", { method: "POST", token: user.token, body: {} });
  assert.ok(logout.status === 200 || logout.status === 204, `logout recibido ${logout.status}`);

  const after = await request("/api/users/me", { token: user.token });
  assert.strictEqual(after.status, 401, "el token revocado no puede seguir usándose");
});

// ---------------------------------------------------------------
// Límite de auth: también bloquea credenciales VÁLIDAS (sin bypass)
// Va al final: consume la cuota de /api/auth del proceso.
// ---------------------------------------------------------------
mongoTest("límite de auth: al agotar la cuota, credenciales válidas también reciben 429", async () => {
  let blockedAt = -1;
  for (let i = 1; i <= 12; i += 1) {
    const response = await request("/api/auth/login", {
      method: "POST",
      body: { email: owner.email, password: "contraseña-incorrecta-p06" }
    });
    assert.notStrictEqual(response.status, 200, "una contraseña incorrecta nunca puede ser 200");
    if (response.status === 429) {
      blockedAt = i;
      break;
    }
  }
  assert.ok(blockedAt > 0, "debe aparecer 429 dentro de la cuota de prueba");

  const valid = await request("/api/auth/login", {
    method: "POST",
    body: { email: owner.email, password: PASSWORD }
  });
  assert.strictEqual(valid.status, 429, "con la cuota agotada, el login válido no puede saltarse el límite");
  assert.match(valid.headers.get("ratelimit-policy") || "", /q=8/);
});

