const test = require("node:test");
const assert = require("node:assert");
const mongoose = require("mongoose");

/**
 * KRONOS-AUTH-GOOGLE — comprobaciones HTTP que NO necesitan base de datos
 * ni una credencial real de Google: exposición de configuración pública,
 * validación de entrada y degradación limpia sin GOOGLE_CLIENT_ID.
 *
 * El Client ID se lee por petición (no al arrancar), así que se puede
 * activar y desactivar dentro del mismo proceso para cubrir ambos estados.
 */
process.env.JWT_SECRET =
  process.env.JWT_SECRET || "kronos-auth-google-test-secret";
process.env.API_RATE_LIMIT_MAX = "10000";
process.env.AUTH_RATE_LIMIT_MAX = "10000";
delete process.env.GOOGLE_CLIENT_ID;

const { server, io } = require("../src/server");

const TEST_CLIENT_ID = "test-kronos-client-id.apps.googleusercontent.com";

let baseUrl;

async function request(path, { method = "GET", body } = {}) {
  const headers = {};

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

test.before(async () => {
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

  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
});

test("sin GOOGLE_CLIENT_ID la configuración pública reporta desactivado", async () => {
  const response = await request("/api/auth/google/config");

  assert.strictEqual(response.status, 200);
  assert.strictEqual(response.data.enabled, false);
  assert.strictEqual(response.data.clientId, null);
});

test("POST /auth/google sin credential responde 400", async () => {
  const response = await request("/api/auth/google", {
    method: "POST",
    body: {}
  });

  assert.strictEqual(response.status, 400);
  assert.ok(String(response.data.error).length > 0);
});

test("POST /auth/google con credential pero sin configuración responde 503", async () => {
  const response = await request("/api/auth/google", {
    method: "POST",
    body: { credential: "una-credencial-cualquiera" }
  });

  assert.strictEqual(response.status, 503);
  assert.strictEqual(response.data.code, "GOOGLE_NOT_CONFIGURED");
});

test("con GOOGLE_CLIENT_ID la configuración pública expone el clientId", async () => {
  process.env.GOOGLE_CLIENT_ID = TEST_CLIENT_ID;

  try {
    const response = await request("/api/auth/google/config");

    assert.strictEqual(response.status, 200);
    assert.strictEqual(response.data.enabled, true);
    assert.strictEqual(response.data.clientId, TEST_CLIENT_ID);
  } finally {
    delete process.env.GOOGLE_CLIENT_ID;
  }
});

test("una credential que no es un ID token válido de Google se rechaza con 401", async () => {
  process.env.GOOGLE_CLIENT_ID = TEST_CLIENT_ID;

  try {
    const response = await request("/api/auth/google", {
      method: "POST",
      body: { credential: "esto-no-es-un-jwt-firmado-por-google" }
    });

    assert.strictEqual(response.status, 401);
    assert.strictEqual(response.data.code, "GOOGLE_TOKEN_INVALID");
  } finally {
    delete process.env.GOOGLE_CLIENT_ID;
  }
});
