const test = require("node:test");
const assert = require("node:assert/strict");

/**
 * P0-6 — límite de tasa general de API (`apiLimiter` sobre `/api`) con servidor real.
 * Límite de prueba: API_RATE_LIMIT_MAX=5 (producción por defecto: 300 / 15 min).
 * El limitador va ANTES de la autenticación: un cliente anónimo que inunda la API
 * recibe 429 y no puede seguir sondeando endpoints.
 */

process.env.JWT_SECRET = "kronos-p0-6-api-ratelimit-secret";
process.env.API_RATE_LIMIT_MAX = "5";
process.env.ABUSE_RATE_LIMIT_MAX = "10000";
process.env.AUTH_RATE_LIMIT_MAX = "10000";
process.env.MEDIA_RATE_LIMIT_MAX = "10000";

const { server, io } = require("../src/server");

const LIMIT = 5;
let baseUrl;

test.before(async () => {
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
  await new Promise((resolve) => io.close(resolve));
  if (server.listening) await new Promise((resolve) => server.close(resolve));
});

test("apiLimiter: cabeceras RateLimit en respuestas dentro de cuota (draft-8)", async () => {
  const response = await fetch(`${baseUrl}/api/users/me`);
  assert.equal(response.status, 401, "dentro de cuota la respuesta es la del handler (401 sin token)");
  assert.match(response.headers.get("ratelimit-policy") || "", new RegExp(`q=${LIMIT}`));
  assert.match(response.headers.get("ratelimit") || "", /r=\d+/);
});

test("apiLimiter: agotar la cuota anónima responde 429 antes de la autenticación", async () => {
  let blockedAt = -1;
  for (let i = 1; i <= LIMIT + 3; i += 1) {
    const response = await fetch(`${baseUrl}/api/users/me`);
    if (response.status === 429) {
      blockedAt = i;
      assert.match(response.headers.get("content-type") || "", /application\/json/);
      assert.ok(Number(response.headers.get("retry-after")) > 0, "Retry-After obligatorio en 429");
      break;
    }
    assert.equal(response.status, 401);
  }
  // La primera prueba ya consumió 1 de las LIMIT peticiones permitidas:
  // el bloqueo llega en la iteración LIMIT de este bucle (petición total LIMIT + 1).
  assert.equal(blockedAt, LIMIT, "el 429 debe aparecer exactamente tras agotar la cuota");
});

test("apiLimiter: la cuota agotada sigue bloqueando otras rutas /api (sin reinicio)", async () => {
  const response = await fetch(`${baseUrl}/api/no-existe-p0-6`);
  assert.equal(response.status, 429, "una ruta desconocida no debe revelar 404 tras el límite");
});
