const test = require("node:test");
const assert = require("node:assert/strict");

/**
 * P0-6 — límite de tasa de autenticación (`authLimiter`) con servidor HTTP real.
 * Límite de prueba: AUTH_RATE_LIMIT_MAX=4 (el de producción es 20 por defecto).
 * Las peticiones con cuerpo vacío se rechazan con 400 antes de tocar la base,
 * pero el limitador cuenta cada intento igual que un login real.
 */

process.env.JWT_SECRET = "kronos-p0-6-auth-ratelimit-secret";
process.env.API_RATE_LIMIT_MAX = "10000";
process.env.ABUSE_RATE_LIMIT_MAX = "10000";
process.env.AUTH_RATE_LIMIT_MAX = "4";
process.env.MEDIA_RATE_LIMIT_MAX = "10000";

const { server, io } = require("../src/server");

const LIMIT = 4;
let baseUrl;

test.before(async () => {
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
  await new Promise((resolve) => io.close(resolve));
  if (server.listening) await new Promise((resolve) => server.close(resolve));
});

function login(path = "/api/auth/login") {
  return fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({})
  });
}

test("authLimiter: las primeras peticiones pasan y exponen la política", async () => {
  for (let i = 0; i < LIMIT; i += 1) {
    const response = await login();
    assert.equal(response.status, 400, `intento ${i + 1} debe llegar al handler`);
    assert.match(response.headers.get("ratelimit-policy") || "", new RegExp(`q=${LIMIT}`));
  }
});

test("authLimiter: el intento que excede responde 429 JSON con Retry-After", async () => {
  const response = await login();
  assert.equal(response.status, 429, "la petición excedida no puede ser 400/200");
  assert.match(response.headers.get("content-type") || "", /application\/json/);
  const retryAfter = Number(response.headers.get("retry-after"));
  assert.ok(Number.isFinite(retryAfter) && retryAfter > 0, `Retry-After inválido: ${response.headers.get("retry-after")}`);
  const body = await response.json();
  assert.ok(body.error, "el 429 debe traer un mensaje de error");
});

test("authLimiter: la cabecera RateLimit indica cuota agotada", async () => {
  const response = await login();
  assert.equal(response.status, 429);
  assert.match(response.headers.get("ratelimit") || "", /r=0/);
});

test("authLimiter: no se evade cambiando mayúsculas, barra final ni query", async () => {
  for (const variant of ["/api/auth/LOGIN", "/api/auth/login/", "/api/auth/login?x=1"]) {
    const response = await login(variant);
    assert.equal(response.status, 429, `bypass con variante ${variant}`);
  }
});
