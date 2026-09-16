const test = require("node:test");
const assert = require("node:assert");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");

/**
 * KRONOS-AUDIT-002 — comprobaciones HTTP que NO necesitan base de datos:
 * montaje de las rutas de sesión, cadena del middleware de autenticación
 * y validación de entrada. No se fabrican usuarios ni tokens de sesión.
 */
process.env.JWT_SECRET =
  process.env.JWT_SECRET || "kronos-audit-002-routes-secret";
process.env.API_RATE_LIMIT_MAX = "10000";
process.env.AUTH_RATE_LIMIT_MAX = "10000";

const { server, io } = require("../src/server");

let baseUrl;

async function request(path, { method = "GET", token, body } = {}) {
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

test("las rutas de sesión están montadas y exigen token", async () => {
  const session = await request("/api/auth/session");
  assert.strictEqual(session.status, 401);

  const logout = await request("/api/auth/logout", {
    method: "POST"
  });
  assert.strictEqual(logout.status, 401);

  const introspection = await request("/api/auth/token");
  assert.strictEqual(introspection.status, 401);
});

test("un token malformado se rechaza sin tocar la base de datos", async () => {
  for (const path of [
    "/api/auth/session",
    "/api/auth/token",
    "/api/auth/me",
    "/api/users/me"
  ]) {
    const response = await request(path, {
      token: "esto-no-es-un-jwt"
    });

    assert.strictEqual(response.status, 401, path);
    assert.strictEqual(response.data.code, "TOKEN_INVALID", path);
  }
});

test("un token firmado con otro secreto se rechaza", async () => {
  const forged = jwt.sign(
    { id: new mongoose.Types.ObjectId().toString() },
    "secreto-de-atacante",
    { algorithm: "HS256", expiresIn: "5m" }
  );

  const response = await request("/api/auth/session", {
    token: forged
  });

  assert.strictEqual(response.status, 401);
  assert.strictEqual(response.data.code, "TOKEN_INVALID");
});

test("un token expirado se rechaza con TOKEN_EXPIRED", async () => {
  const expired = jwt.sign(
    { id: new mongoose.Types.ObjectId().toString() },
    process.env.JWT_SECRET,
    { algorithm: "HS256", expiresIn: -60 }
  );

  const response = await request("/api/auth/session", {
    token: expired
  });

  assert.strictEqual(response.status, 401);
  assert.strictEqual(response.data.code, "TOKEN_EXPIRED");
});

test("login y registro siguen validando la entrada", async () => {
  const login = await request("/api/auth/login", {
    method: "POST",
    body: { email: "alguien@example.com" }
  });

  assert.strictEqual(login.status, 400);

  const register = await request("/api/auth/register", {
    method: "POST",
    body: { username: "solo" }
  });

  assert.strictEqual(register.status, 400);
});

test("GET /api/auth/session no consume el límite estricto de login", async () => {
  // El limitador de credenciales solo cubre login/register: si el
  // montaje de sesión estuviera detrás, estas peticiones agotarían el
  // presupuesto de 20 intentos por ventana.
  const responses = await Promise.all(
    Array.from({ length: 25 }, () =>
      request("/api/auth/session")
    )
  );

  for (const response of responses) {
    assert.strictEqual(response.status, 401);
    assert.notStrictEqual(response.status, 429);
  }
});
