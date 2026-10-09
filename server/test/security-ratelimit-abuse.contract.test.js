const test = require("node:test");
const assert = require("node:assert/strict");

/**
 * P0-6 — límite de abuso (`abuseLimiter`) y límite de media (`mediaLimiter`)
 * con servidor HTTP real. Límites de prueba: ABUSE_RATE_LIMIT_MAX=3,
 * MEDIA_RATE_LIMIT_MAX=3 (producción por defecto: 60 y 3000 / 15 min).
 *
 * - abuseLimiter es UNA instancia montada en varias rutas: el contador es compartido.
 * - /uploads consultaba la base (mediaAcl) sin límite; ahora pasa por mediaLimiter.
 */

process.env.JWT_SECRET = "kronos-p0-6-abuse-media-ratelimit-secret";
process.env.API_RATE_LIMIT_MAX = "10000";
process.env.ABUSE_RATE_LIMIT_MAX = "3";
process.env.AUTH_RATE_LIMIT_MAX = "10000";
process.env.MEDIA_RATE_LIMIT_MAX = "3";

const { server, io } = require("../src/server");

let baseUrl;

test.before(async () => {
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
  await new Promise((resolve) => io.close(resolve));
  if (server.listening) await new Promise((resolve) => server.close(resolve));
});

test("abuseLimiter: tras agotar la cuota, /api/posts responde 429 con política de abuso", async () => {
  const statuses = [];
  for (let i = 0; i < 3; i += 1) {
    const response = await fetch(`${baseUrl}/api/posts/feed`);
    statuses.push(response.status);
    assert.equal(response.status, 401, "dentro de cuota: handler (401 sin token)");
  }
  const blocked = await fetch(`${baseUrl}/api/posts/feed`);
  assert.equal(blocked.status, 429);
  assert.match(blocked.headers.get("ratelimit-policy") || "", /q=3/);
  assert.ok(Number(blocked.headers.get("retry-after")) > 0);
});

test("abuseLimiter: el contador es compartido entre rutas con el mismo limitador", async () => {
  const response = await fetch(`${baseUrl}/api/conversations`);
  assert.equal(response.status, 429, "otra ruta de abuso también debe estar bloqueada");
});

test("mediaLimiter: /uploads limita peticiones anónimas antes de consultar la base", async () => {
  const path = "/uploads/media/p0-6-no-existe.png";
  const seen = [];
  for (let i = 0; i < 3; i += 1) {
    const response = await fetch(`${baseUrl}${path}`);
    seen.push(response.status);
    assert.notEqual(response.status, 429, `dentro de cuota la petición ${i + 1} no debe ser 429`);
  }
  const blocked = await fetch(`${baseUrl}${path}`);
  assert.equal(blocked.status, 429, "la cuarta petición de media debe ser 429");
  assert.match(blocked.headers.get("content-type") || "", /application\/json/);
  assert.ok(Number(blocked.headers.get("retry-after")) > 0);
  const body = await blocked.json();
  assert.ok(body.error);
});

test("mediaLimiter: el bloqueo no se evade con otra ruta de /uploads", async () => {
  const response = await fetch(`${baseUrl}/uploads/avatars/p0-6.png`);
  assert.equal(response.status, 429);
});
