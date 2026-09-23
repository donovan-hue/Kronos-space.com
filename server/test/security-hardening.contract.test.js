const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const jwt = require("jsonwebtoken");

/**
 * KRONOS-SEC-HARDENING — pruebas de regresión de los endurecimientos:
 *
 *  1. `inputSanitizer` elimina operadores NoSQL y aplica de verdad a
 *     `req.query` / `req.params` (en Express 5 son accesores del prototipo y
 *     una asignación directa no tenía efecto).
 *  2. `POST /api/auth/verify-email/request` verifica la firma del JWT: un
 *     token sin firmar ya no identifica a otra cuenta.
 *  3. La API responde 404 en JSON, no la página HTML de Express.
 *
 * HTTP real sobre la app real (`src/server`). No requiere base de datos:
 * todos los casos cortan antes de cualquier consulta.
 */

const previousSecret = process.env.JWT_SECRET;
process.env.JWT_SECRET = "kronos-security-hardening-secret";
process.env.CLIENT_URL = "https://kronos-space.com";
process.env.API_RATE_LIMIT_MAX = "10000";
process.env.ABUSE_RATE_LIMIT_MAX = "10000";
process.env.AUTH_RATE_LIMIT_MAX = "10000";

const inputSanitizer = require("../src/middleware/inputSanitizer");
const { app, server, io } = require("../src/server");

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

async function request(path, { method = "GET", body, token } = {}) {
  const headers = {};

  if (body) headers["Content-Type"] = "application/json";
  if (token) headers.Authorization = `Bearer ${token}`;

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

  return { status: response.status, data, contentType: response.headers.get("content-type") };
}

test("sanitiza cuerpo, query y params: sin operadores NoSQL y sin claves anidadas", () => {
  const sanitized = inputSanitizer.sanitizeContainer({
    email: { $ne: null },
    password: { $gt: "" },
    text: "  con espacios  ",
    tags: [{ $ne: "x" }, "  hola  "],
    query: { ok: 1, "a.b": 2 },
    prototypePayload: JSON.parse('{"__proto__":{"polluted":true},"constructor":{"prototype":{"polluted":true}},"safe":"ok"}'),
    keep: {}
  });

  // Los objetos que solo tenían operadores se eliminan por completo: no queda
  // un `{}` que pase validaciones de "obligatorio" y llegue a Mongoose.
  assert.equal(sanitized.email, undefined);
  assert.equal(sanitized.password, undefined);
  assert.equal(sanitized.text, "con espacios");
  assert.deepEqual(sanitized.tags, ["hola"]);
  assert.deepEqual(sanitized.query, { ok: 1 });
  assert.deepEqual(sanitized.prototypePayload, { safe: "ok" });
  assert.equal({}.polluted, undefined, "no debe permitir contaminación del prototipo");
  // Un objeto legítimamente vacío se conserva tal cual.
  assert.deepEqual(sanitized.keep, {});
});

test("el saneado reemplaza de verdad req.query y req.params (Express 5)", async () => {
  const probe = express();
  probe.use(express.json());
  probe.use(inputSanitizer);
  // En la ruta, los params ya existen (ver nota del middleware), por eso el
  // saneado de parámetros se comprueba con el middleware a nivel de ruta.
  probe.get("/echo/:id", inputSanitizer, (req, res) => res.json({ query: req.query, params: req.params }));

  const probeServer = await new Promise((resolve) => {
    const instance = probe.listen(0, "127.0.0.1", () => resolve(instance));
  });

  try {
    const response = await fetch(
      `http://127.0.0.1:${probeServer.address().port}/echo/%20valor%20?email%5B%24ne%5D=null&plain=%20x%20&ok=1`
    );
    const data = await response.json();

    assert.equal(data.query.email, undefined, "la clave con operador $ no sobrevive en query");
    assert.equal(data.query.plain, "x", "la query sí se recorta");
    assert.equal(data.query.ok, "1");
    assert.equal(data.params.id, "valor", "los params también se sanean");
  } finally {
    await new Promise((resolve) => probeServer.close(resolve));
  }
});

test("login con operadores NoSQL responde 400 sin llegar a la base de datos", async () => {
  const response = await request("/api/auth/login", {
    method: "POST",
    body: { email: { $ne: null }, password: { $ne: null } }
  });

  assert.equal(response.status, 400, JSON.stringify(response.data));
  assert.match(response.data.error, /obligatorios/i);
});

test("verify-email/request rechaza un JWT sin firma válida (no puede tomar otra identidad)", async () => {
  const forged = jwt.sign(
    { id: "507f1f77bcf86cd799439011", username: "victima" },
    "secreto-que-no-es-el-de-kronos",
    { expiresIn: "1h" }
  );

  const response = await request("/api/auth/verify-email/request", {
    method: "POST",
    token: forged,
    body: {}
  });

  assert.equal(response.status, 401, JSON.stringify(response.data));
  assert.equal(response.data.code, "TOKEN_INVALID");
});

test("verify-email/request rechaza un token sin firmar (alg none)", async () => {
  const unsigned = [
    Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url"),
    Buffer.from(JSON.stringify({ id: "507f1f77bcf86cd799439011" })).toString("base64url"),
    ""
  ].join(".");

  const response = await request("/api/auth/verify-email/request", {
    method: "POST",
    token: unsigned,
    body: {}
  });

  assert.equal(response.status, 401, JSON.stringify(response.data));
});

test("verify-email/request sin sesión sigue aceptando el camino por email (validación previa)", async () => {
  const invalidEmail = await request("/api/auth/verify-email/request", {
    method: "POST",
    body: { email: "no-es-un-email" }
  });

  assert.equal(invalidEmail.status, 400);
  assert.equal(invalidEmail.data.error, "Email inválido");
});

test("una ruta inexistente de la API responde JSON, no HTML", async () => {
  const response = await request("/api/ruta-que-no-existe");

  assert.equal(response.status, 404);
  assert.match(response.contentType || "", /application\/json/);
  assert.equal(response.data.code, "NOT_FOUND");
});

test("el saneado está montado en la app real antes de las rutas", () => {
  const stack = app.router?.stack || app._router?.stack || [];
  const names = stack.map((layer) => layer.handle?.name).filter(Boolean);

  assert.ok(
    names.includes("inputSanitizer"),
    `inputSanitizer debe estar en la cadena real de middleware (vistos: ${names.slice(0, 12).join(", ")})`
  );
});
