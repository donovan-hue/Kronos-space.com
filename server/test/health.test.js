const test = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");

/**
 * KRONOS-AUDIT-004 — el health check se comprueba de verdad.
 *
 * La versión anterior de este archivo construía un objeto `healthResponse`
 * dentro de la propia prueba y le hacía `assert.strictEqual` contra sí mismo.
 * No importaba `src/server`, no abría ningún puerto y no llamaba a ningún
 * manejador: pasaba siempre, incluso con el endpoint roto. Se sustituye por
 * HTTP real contra la app real.
 *
 * El caso "conectado" no finge una base de datos: define el `readyState` de
 * la conexión de Mongoose (la única señal que lee el manejador) para poder
 * comprobar la rama 200 de forma determinista. No se escribe ni se lee
 * ningún documento.
 */

const previousSecret = process.env.JWT_SECRET;
process.env.JWT_SECRET = "kronos-health-test-secret";
process.env.CLIENT_URL = "https://kronos-space.com";
process.env.API_RATE_LIMIT_MAX = "10000";
process.env.ABUSE_RATE_LIMIT_MAX = "10000";
process.env.AUTH_RATE_LIMIT_MAX = "10000";

const { server, io } = require("../src/server");

let baseUrl;

test.before(async () => {
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
  await new Promise((resolve) => io.close(resolve));

  if (server.listening) {
    await new Promise((resolve) => server.close(resolve));
  }

  if (previousSecret === undefined) delete process.env.JWT_SECRET;
  else process.env.JWT_SECRET = previousSecret;
});

async function getHealth(path) {
  const response = await fetch(`${baseUrl}${path}`);
  let data = null;

  try {
    data = await response.json();
  } catch {
    data = null;
  }

  return { status: response.status, data, contentType: response.headers.get("content-type") };
}

/** Fuerza la señal de conexión que lee el manejador y la restaura después. */
async function withDatabaseReady(readyState, fn) {
  const descriptor = Object.getOwnPropertyDescriptor(mongoose.connection, "readyState");

  Object.defineProperty(mongoose.connection, "readyState", {
    value: readyState,
    configurable: true,
    writable: true
  });

  try {
    // `await` es obligatorio: el manejador se ejecuta cuando Express atiende
    // la petición, así que restaurar el descriptor antes de que la respuesta
    // llegue dejaría la prueba midiendo el estado real, no el forzado.
    return await fn();
  } finally {
    if (descriptor) Object.defineProperty(mongoose.connection, "readyState", descriptor);
    else delete mongoose.connection.readyState;
  }
}

test("health responde 503 y JSON real cuando la base de datos no está conectada", async () => {
  const { status, data, contentType } = await withDatabaseReady(0, () => getHealth("/health"));

  assert.equal(status, 503);
  assert.match(contentType, /application\/json/);
  assert.equal(data.ok, false);
  assert.equal(data.service, "kronos-space");
  assert.equal(data.database, "disconnected");
  assert.equal(data.realtime, true);
  assert.ok(!Number.isNaN(Date.parse(data.timestamp)), "timestamp debe ser una fecha ISO válida");
});

test("/api/health expone el mismo contrato que /health", async () => {
  const [root, api] = await withDatabaseReady(0, () =>
    Promise.all([getHealth("/health"), getHealth("/api/health")])
  );

  assert.equal(api.status, root.status);
  assert.equal(api.data.ok, root.data.ok);
  assert.equal(api.data.database, root.data.database);
  assert.equal(api.data.service, root.data.service);
});

test("health responde 200 y confirmado cuando la conexión está lista", async () => {
  const { status, data } = await withDatabaseReady(1, () => getHealth("/health"));

  assert.equal(status, 200);
  assert.equal(data.ok, true);
  assert.equal(data.database, "connected");
});

test("health nunca filtra detalles internos de la conexión", async () => {
  const { data } = await withDatabaseReady(0, () => getHealth("/health"));

  const serialized = JSON.stringify(data);

  assert.deepEqual(
    Object.keys(data).sort(),
    ["database", "ok", "realtime", "service", "timestamp"],
    "el contrato de health no debe crecer con datos internos"
  );
  assert.ok(!/mongodb(\+srv)?:\/\//i.test(serialized), "no debe aparecer una cadena de conexión");
  assert.ok(!/password|secret|token|uri/i.test(serialized), "no debe aparecer ninguna credencial");
});
