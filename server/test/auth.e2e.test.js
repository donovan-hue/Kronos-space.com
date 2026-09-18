const test = require("node:test");
const assert = require("node:assert");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");

/**
 * KRONOS-AUDIT-002 — flujo de seguridad sobre HTTP real:
 * registro → login → navegación autenticada → sesión → logout real.
 *
 * Requiere `MONGODB_URI` apuntando a un MongoDB real (idealmente una
 * base dedicada de pruebas). NO usa base temporal ni datos fabricados:
 * sin `MONGODB_URI` las pruebas se reportan OMITIDAS con el motivo.
 *
 * Cubre el contrato existente de `main` (register/login/me/forgot) y lo
 * añadido por esta auditoría (session/logout/token con revocación).
 *
 * Los valores de entorno se leen al cargar `server.js`, por lo que deben
 * definirse antes del require.
 */
process.env.JWT_SECRET =
  process.env.JWT_SECRET || "kronos-audit-002-test-secret";
process.env.API_RATE_LIMIT_MAX = "10000";
process.env.ABUSE_RATE_LIMIT_MAX = "10000";
process.env.AUTH_RATE_LIMIT_MAX = "10000";

const { server, io } = require("../src/server");
const User = require("../src/modules/users/User");

const mongoConfigured = Boolean(process.env.MONGODB_URI);
const createdUserIds = [];

let baseUrl;

/**
 * Envuelve las pruebas que requieren MongoDB real. Sin MONGODB_URI se
 * omiten indicando el motivo; nunca se sustituyen por datos falsos.
 */
function mongoTest(name, fn) {
  test(name, async (t) => {
    if (!mongoConfigured) {
      t.skip(
        "Requiere MONGODB_URI real; no se usan datos en memoria"
      );

      return;
    }

    await fn(t);
  });
}

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

async function registerUser(overrides = {}) {
  const suffix = `${Date.now()}${Math.floor(Math.random() * 1000)}`;

  const response = await request("/api/auth/register", {
    method: "POST",
    body: {
      username: `kronos${suffix}`.slice(0, 30),
      email: `kronos${suffix}@example.com`,
      password: "KronosTest123!",
      displayName: "Kronos Test",
      ...overrides
    }
  });

  const id = response.data?.user?.id;

  if (id) createdUserIds.push(id);

  return response;
}

test.before(async () => {
  if (mongoConfigured) {
    await mongoose.connect(process.env.MONGODB_URI, {
      serverSelectionTimeoutMS: 10000
    });
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

  if (mongoose.connection.readyState === 1) {
    if (createdUserIds.length) {
      await User.deleteMany({ _id: { $in: createdUserIds } });

      const { SessionRevocation } = require("../src/modules/auth/session.service");

      await SessionRevocation.deleteMany({
        userId: { $in: createdUserIds }
      });
    }

    await mongoose.disconnect();
  }
});

mongoTest("registro real crea la cuenta y devuelve token", async () => {
  const { status, data } = await registerUser();

  assert.strictEqual(status, 201);
  assert.ok(data.token, "debe devolver token");
  assert.ok(data.user.id, "debe devolver id de usuario");
  assert.strictEqual(data.user.displayName, "Kronos Test");
  assert.strictEqual(
    data.user.passwordHash,
    undefined,
    "no debe exponer el hash"
  );

  const payload = jwt.verify(data.token, process.env.JWT_SECRET, {
    algorithms: ["HS256"]
  });

  assert.strictEqual(payload.id, data.user.id);
  assert.ok(payload.exp, "el token debe declarar expiración");
});

mongoTest("registro rechaza duplicados y datos inválidos", async () => {
  const created = await registerUser();
  const { username, email } = created.data.user;

  const duplicateUsername = await registerUser({ username });

  assert.strictEqual(duplicateUsername.status, 409);
  assert.match(
    duplicateUsername.data.error,
    /ya existe/i
  );

  const duplicateEmail = await registerUser({ email });

  assert.strictEqual(duplicateEmail.status, 409);

  const shortPassword = await registerUser({ password: "123" });

  assert.strictEqual(shortPassword.status, 400);

  const shortUsername = await registerUser({ username: "ab" });

  assert.strictEqual(shortUsername.status, 400);

  const badEmail = await registerUser({ email: "sin-arroba" });

  assert.strictEqual(badEmail.status, 400);

  const missing = await request("/api/auth/register", {
    method: "POST",
    body: { username: "sineverything" }
  });

  assert.strictEqual(missing.status, 400);
});

mongoTest("login real acepta credenciales válidas y normaliza el email", async () => {
  const created = await registerUser();
  const { email } = created.data.user;

  const login = await request("/api/auth/login", {
    method: "POST",
    body: {
      email: `  ${email.toUpperCase()}  `,
      password: "KronosTest123!"
    }
  });

  assert.strictEqual(login.status, 200);
  assert.ok(login.data.token);
  assert.strictEqual(login.data.user.email, email);
});

mongoTest("login no revela si el email existe", async () => {
  const created = await registerUser();

  const wrongPassword = await request("/api/auth/login", {
    method: "POST",
    body: {
      email: created.data.user.email,
      password: "ClaveIncorrecta123!"
    }
  });

  const unknownEmail = await request("/api/auth/login", {
    method: "POST",
    body: {
      email: `nadie${Date.now()}@example.com`,
      password: "KronosTest123!"
    }
  });

  assert.strictEqual(wrongPassword.status, 401);
  assert.strictEqual(unknownEmail.status, 401);
  assert.strictEqual(
    wrongPassword.data.error,
    unknownEmail.data.error
  );

  const incomplete = await request("/api/auth/login", {
    method: "POST",
    body: { email: created.data.user.email }
  });

  assert.strictEqual(incomplete.status, 400);
});

mongoTest("navegación autenticada: /auth/me y /users/me", async () => {
  const created = await registerUser();
  const token = created.data.token;

  const me = await request("/api/auth/me", { token });

  assert.strictEqual(me.status, 200);
  assert.strictEqual(me.data.user.username, created.data.user.username);

  const usersMe = await request("/api/users/me", { token });

  assert.strictEqual(usersMe.status, 200);
  assert.strictEqual(
    String(usersMe.data._id),
    String(created.data.user.id)
  );
});

mongoTest("sesión persistida: /auth/session valida expiración", async () => {
  const created = await registerUser();
  const token = created.data.token;

  const session = await request("/api/auth/session", { token });

  assert.strictEqual(session.status, 200);
  assert.strictEqual(session.data.valid, true);
  assert.strictEqual(
    session.data.user.username,
    created.data.user.username
  );
  assert.ok(session.data.expiresAt, "debe informar la expiración");

  const introspection = await request("/api/auth/token", {
    token
  });

  assert.strictEqual(introspection.status, 200);
  assert.strictEqual(introspection.data.valid, true);
  assert.strictEqual(introspection.data.revoked, false);
  assert.ok(introspection.data.tokenId, "debe identificar la sesión");
});

mongoTest("tokens ausente, malformado, ajeno o expirado se rechazan", async () => {
  const missing = await request("/api/auth/session");

  assert.strictEqual(missing.status, 401);

  const malformed = await request("/api/auth/session", {
    token: "esto-no-es-un-jwt"
  });

  assert.strictEqual(malformed.status, 401);
  assert.strictEqual(malformed.data.code, "TOKEN_INVALID");

  const forged = jwt.sign(
    { id: new mongoose.Types.ObjectId().toString() },
    "secreto-de-atacante",
    { algorithm: "HS256", expiresIn: "5m" }
  );

  const forgedResponse = await request("/api/auth/session", {
    token: forged
  });

  assert.strictEqual(forgedResponse.status, 401);
  assert.strictEqual(
    forgedResponse.data.code,
    "TOKEN_INVALID"
  );

  const created = await registerUser();

  const expired = jwt.sign(
    { id: String(created.data.user.id) },
    process.env.JWT_SECRET,
    { algorithm: "HS256", expiresIn: -60 }
  );

  const expiredResponse = await request("/api/auth/session", {
    token: expired
  });

  assert.strictEqual(expiredResponse.status, 401);
  assert.strictEqual(
    expiredResponse.data.code,
    "TOKEN_EXPIRED"
  );
});

mongoTest("logout real revoca el token en todas las rutas protegidas", async () => {
  const created = await registerUser();
  const token = created.data.token;

  const before = await request("/api/auth/session", { token });
  assert.strictEqual(before.status, 200);

  const logout = await request("/api/auth/logout", {
    method: "POST",
    token
  });

  assert.strictEqual(logout.status, 200);
  assert.strictEqual(logout.data.ok, true);
  assert.strictEqual(logout.data.revoked, true);

  for (const path of ["/api/auth/session", "/api/auth/me", "/api/users/me"]) {
    const replayed = await request(path, { token });

    assert.strictEqual(
      replayed.status,
      401,
      `${path} debe rechazar el token revocado`
    );
    assert.strictEqual(replayed.data.code, "TOKEN_REVOKED");
  }

  const introspection = await request("/api/auth/token", {
    token
  });

  assert.strictEqual(introspection.status, 401);

  // El logout de una sesión no invalida al usuario: puede volver a entrar.
  const relogin = await request("/api/auth/login", {
    method: "POST",
    body: {
      email: created.data.user.email,
      password: "KronosTest123!"
    }
  });

  assert.strictEqual(relogin.status, 200);
  assert.notStrictEqual(relogin.data.token, token);

  const newSession = await request("/api/auth/session", {
    token: relogin.data.token
  });

  assert.strictEqual(newSession.status, 200);
});

mongoTest("logout exige token válido", async () => {
  const response = await request("/api/auth/logout", {
    method: "POST"
  });

  assert.strictEqual(response.status, 401);
});

mongoTest("sesión de un usuario eliminado se rechaza", async () => {
  const created = await registerUser();

  await User.deleteOne({ _id: created.data.user.id });

  const session = await request("/api/auth/session", {
    token: created.data.token
  });

  assert.strictEqual(session.status, 401);
  assert.strictEqual(session.data.code, "USER_NOT_FOUND");
});

mongoTest("migra contraseñas legacy al esquema passwordHash", async () => {
  const suffix = `${Date.now()}`;
  const username = `legacy${suffix}`.slice(0, 30);
  const email = `legacy${suffix}@example.com`;
  const passwordHash = await bcrypt.hash("KronosTest123!", 10);

  const inserted = await User.collection.insertOne({
    username,
    email,
    password: passwordHash,
    displayName: "Legacy",
    createdAt: new Date(),
    updatedAt: new Date()
  });

  createdUserIds.push(inserted.insertedId);

  const login = await request("/api/auth/login", {
    method: "POST",
    body: { email, password: "KronosTest123!" }
  });

  assert.strictEqual(login.status, 200);

  const migrated = await User.collection.findOne({
    _id: inserted.insertedId
  });

  assert.ok(migrated.passwordHash, "debe migrar a passwordHash");
  assert.strictEqual(
    migrated.password,
    undefined,
    "debe eliminar el campo legacy"
  );
});

mongoTest("verificación de email: flujo completo con token hash y actualización", async () => {
  const suffix = `${Date.now()}`;
  const username = `verify${suffix}`.slice(0, 30);
  const email = `verify${suffix}@example.com`;
  const passwordHash = await bcrypt.hash("KronosTest123!", 10);

  const inserted = await User.collection.insertOne({
    username,
    email,
    passwordHash,
    displayName: "Verify User",
    emailVerified: false,
    createdAt: new Date(),
    updatedAt: new Date()
  });

  createdUserIds.push(inserted.insertedId);

  // 1. Solicitar verificación
  const reqVerify = await request("/api/auth/verify-email/request", {
    method: "POST",
    body: { email }
  });
  assert.strictEqual(reqVerify.status, 200);

  const userWithToken = await User.findById(inserted.insertedId).select("+emailVerificationTokenHash +emailVerificationExpiresAt");
  assert.ok(userWithToken.emailVerificationTokenHash, "debe generar hash del token");
  assert.ok(userWithToken.emailVerificationExpiresAt, "debe tener fecha de expiración");

  // 2. Intentar verificar con token inválido
  const failVerify = await request("/api/auth/verify-email", {
    method: "POST",
    body: { token: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef" }
  });
  assert.strictEqual(failVerify.status, 400);

  // 3. Simular verificación exitosa asignando un token conocido
  const crypto = require("crypto");
  const testToken = "testverificationtoken1234567890abcdef1234567890abcdef";
  const tokenHash = crypto.createHash("sha256").update(testToken).digest("hex");

  await User.updateOne(
    { _id: inserted.insertedId },
    { $set: { emailVerificationTokenHash: tokenHash, emailVerificationExpiresAt: new Date(Date.now() + 3600000) } }
  );

  const okVerify = await request("/api/auth/verify-email", {
    method: "POST",
    body: { token: testToken }
  });
  assert.strictEqual(okVerify.status, 200);
  assert.strictEqual(okVerify.data.emailVerified, true);

  const updatedUser = await User.findById(inserted.insertedId);
  assert.strictEqual(updatedUser.emailVerified, true);
});

