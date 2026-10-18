const test = require("node:test");
const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");

/**
 * P0-6 — controles de seguridad de producción, sin base de datos.
 *
 * Servidor HTTP REAL (`src/server.js`) con cabeceras, CORS y verificación JWT
 * reales. Los rechazos se resuelven antes de consultar la base (jwt.verify
 * falla o no hay token), por eso esta batería corre también en `npm test`.
 * Los límites de tasa se configuran en sus propios archivos
 * `security-ratelimit-*.contract.test.js` para no interferir entre sí.
 */

const SECRET = "kronos-p0-6-controls-secret";
process.env.JWT_SECRET = SECRET;
process.env.CLIENT_URL = "https://kronos-space.com,https://app.kronos-space.com";
process.env.API_RATE_LIMIT_MAX = "10000";
process.env.ABUSE_RATE_LIMIT_MAX = "10000";
process.env.AUTH_RATE_LIMIT_MAX = "10000";
process.env.MEDIA_RATE_LIMIT_MAX = "10000";

const { server, io } = require("../src/server");

const VALID_ID = "65f000000000000000000001";
let baseUrl;

test.before(async () => {
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
  await new Promise((resolve) => io.close(resolve));
  if (server.listening) await new Promise((resolve) => server.close(resolve));
});

async function get(path, headers = {}) {
  const response = await fetch(`${baseUrl}${path}`, { headers });
  const text = await response.text();
  let data = null;
  try {
    data = JSON.parse(text);
  } catch {
    data = null;
  }
  return { status: response.status, headers: response.headers, data, text };
}

function bearer(token) {
  return { Authorization: `Bearer ${token}` };
}

// ---------------------------------------------------------------
// Helmet
// ---------------------------------------------------------------
test("Helmet: cabeceras de seguridad activas y X-Powered-By oculta", async () => {
  const res = await get("/api/users/me");
  assert.equal(res.headers.get("x-content-type-options"), "nosniff");
  assert.ok(res.headers.get("x-frame-options"), "X-Frame-Options ausente");
  assert.ok(res.headers.get("strict-transport-security"), "HSTS ausente");
  assert.ok(res.headers.get("content-security-policy"), "CSP ausente");
  assert.equal(res.headers.get("x-powered-by"), null, "X-Powered-By expone la pila");
});

// ---------------------------------------------------------------
// CORS
// ---------------------------------------------------------------
test("CORS: origen permitido recibe ACAO y credenciales", async () => {
  const res = await get("/api/users/me", { Origin: "https://kronos-space.com" });
  assert.equal(res.headers.get("access-control-allow-origin"), "https://kronos-space.com");
  assert.equal(res.headers.get("access-control-allow-credentials"), "true");
});

test("CORS: origen NO permitido no recibe ACAO (ni comodín ni eco)", async () => {
  const res = await get("/api/users/me", { Origin: "https://evil.example" });
  assert.equal(res.headers.get("access-control-allow-origin"), null);
  assert.notEqual(res.headers.get("access-control-allow-origin"), "*");
});

test("CORS: preflight desde origen ajeno no concede método ni origen", async () => {
  const response = await fetch(`${baseUrl}/api/users/me`, {
    method: "OPTIONS",
    headers: {
      Origin: "https://evil.example",
      "Access-Control-Request-Method": "DELETE"
    }
  });
  assert.equal(response.headers.get("access-control-allow-origin"), null);
  assert.equal(response.headers.get("access-control-allow-methods"), null);
});

test("CORS: preflight desde origen permitido sí se concede", async () => {
  const response = await fetch(`${baseUrl}/api/users/me`, {
    method: "OPTIONS",
    headers: {
      Origin: "https://app.kronos-space.com",
      "Access-Control-Request-Method": "PATCH"
    }
  });
  assert.equal(response.headers.get("access-control-allow-origin"), "https://app.kronos-space.com");
  assert.match(response.headers.get("access-control-allow-methods") || "", /PATCH/);
});

// ---------------------------------------------------------------
// Sin autorización / JWT / sesión (rechazo antes de la base)
// ---------------------------------------------------------------
test("Sin token en ruta protegida: 401 JSON, no 200", async () => {
  const res = await get("/api/users/me");
  assert.equal(res.status, 401);
  assert.match(res.headers.get("content-type") || "", /application\/json/);
  assert.equal(res.data.error, "Token requerido");
});

test("Esquema distinto de Bearer (Basic) se rechaza", async () => {
  const res = await get("/api/users/me", { Authorization: "Basic dXNlcjpwYXNz" });
  assert.equal(res.status, 401);
});

test("Token vacío tras Bearer se rechaza", async () => {
  const res = await get("/api/users/me", { Authorization: "Bearer    " });
  assert.equal(res.status, 401);
});

test("Token malformado se rechaza sin filtrar detalles internos", async () => {
  const res = await get("/api/users/me", bearer("no.es.un.jwt"));
  assert.equal(res.status, 401);
  assert.ok(!/secret|stack|jsonwebtoken|JsonWebTokenError/i.test(res.text), "respuesta filtra detalles");
});

test("Token firmado con otro secreto se rechaza", async () => {
  const forged = jwt.sign({ id: VALID_ID }, "secreto-del-atacante", { algorithm: "HS256" });
  const res = await get("/api/users/me", bearer(forged));
  assert.equal(res.status, 401);
});

test("Token expirado (firma válida) se rechaza", async () => {
  const expired = jwt.sign(
    { id: VALID_ID, exp: Math.floor(Date.now() / 1000) - 3600 },
    SECRET,
    { algorithm: "HS256" }
  );
  const res = await get("/api/users/me", bearer(expired));
  assert.equal(res.status, 401);
});

test("Token alg=none (sin firma) se rechaza", async () => {
  const header = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(JSON.stringify({ id: VALID_ID })).toString("base64url");
  const res = await get("/api/users/me", bearer(`${header}.${payload}.`));
  assert.equal(res.status, 401);
});

test("Token con firma válida pero sin id de usuario se rechaza", async () => {
  const noId = jwt.sign({ role: "admin" }, SECRET, { algorithm: "HS256" });
  const res = await get("/api/users/me", bearer(noId));
  assert.equal(res.status, 401);
});

test("Token con id no string (inyección de objeto) se rechaza", async () => {
  const objectId = jwt.sign({ id: { $ne: null } }, SECRET, { algorithm: "HS256" });
  const res = await get("/api/users/me", bearer(objectId));
  assert.equal(res.status, 401);
});

test("Ruta de IA sin token: 401 antes del límite de IA", async () => {
  const aiResponse = await fetch(`${baseUrl}/api/ai/scripts/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt: "x" })
  });
  assert.equal(aiResponse.status, 401);
});

test("Respuestas 404 de API desconocida son JSON (sin HTML ni stack)", async () => {
  const res = await get("/api/no-existe-p0-6");
  assert.equal(res.status, 404);
  assert.match(res.headers.get("content-type") || "", /application\/json/);
  assert.ok(!/<html|at .*\.js:\d+/i.test(res.text));
});
