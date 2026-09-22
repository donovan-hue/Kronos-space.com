const test = require("node:test");
const assert = require("node:assert/strict");

// El cableado HTTP (cookieParser + ruta) se verifica con la app real.
// Sin DB solo es alcanzable el caso "sin cookie" (401 sin tocar Mongo).
const previousSecret = process.env.JWT_SECRET;
process.env.JWT_SECRET = "refresh-cookie-wiring-test-secret";
const { app } = require("../src/server");

const {
  REFRESH_COOKIE_NAME,
  isSecureCookies,
  refreshCookieOptions,
  setRefreshCookie,
  clearRefreshCookie,
  getRefreshTokenFromRequest
} = require("../src/modules/auth/cookies");

function mockRes() {
  const calls = [];
  return {
    calls,
    cookie(name, value, options) {
      calls.push({ method: "cookie", name, value, options });
    },
    clearCookie(name, options) {
      calls.push({ method: "clearCookie", name, options });
    }
  };
}

test("la cookie del refresh es httpOnly, SameSite=Lax y acotada a /api/auth", () => {
  const res = mockRes();
  setRefreshCookie(res, "krt_secreto", "2026-10-22T00:00:00.000Z");

  assert.equal(res.calls.length, 1);
  const call = res.calls[0];
  assert.equal(call.name, REFRESH_COOKIE_NAME);
  assert.equal(call.value, "krt_secreto");
  assert.equal(call.options.httpOnly, true);
  assert.equal(call.options.sameSite, "lax");
  assert.equal(call.options.path, "/api/auth");
  assert.ok(call.options.expires instanceof Date);
});

test("Secure se activa en producción y respeta el override", () => {
  const prevEnv = process.env.NODE_ENV;
  const prevOverride = process.env.KRONOS_COOKIE_SECURE;

  try {
    delete process.env.KRONOS_COOKIE_SECURE;
    process.env.NODE_ENV = "production";
    assert.equal(isSecureCookies(), true);
    assert.equal(refreshCookieOptions().secure, true);

    process.env.NODE_ENV = "test";
    assert.equal(isSecureCookies(), false);

    process.env.KRONOS_COOKIE_SECURE = "1";
    assert.equal(isSecureCookies(), true);
    process.env.KRONOS_COOKIE_SECURE = "0";
    process.env.NODE_ENV = "production";
    assert.equal(isSecureCookies(), false);
  } finally {
    if (prevEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = prevEnv;
    if (prevOverride === undefined) delete process.env.KRONOS_COOKIE_SECURE;
    else process.env.KRONOS_COOKIE_SECURE = prevOverride;
  }
});

test("limpiar la cookie repite path/sameSite para que el navegador la borre", () => {
  const res = mockRes();
  clearRefreshCookie(res);

  assert.equal(res.calls.length, 1);
  const call = res.calls[0];
  assert.equal(call.method, "clearCookie");
  assert.equal(call.name, REFRESH_COOKIE_NAME);
  assert.equal(call.options.path, "/api/auth");
  assert.equal(call.options.sameSite, "lax");
  assert.equal(call.options.httpOnly, true);
});

test("el refresh se lee solo de la cookie", () => {
  assert.equal(
    getRefreshTokenFromRequest({ cookies: { [REFRESH_COOKIE_NAME]: "  krt_x " } }),
    "krt_x"
  );
  assert.equal(getRefreshTokenFromRequest({ cookies: {} }), "");
  assert.equal(getRefreshTokenFromRequest({}), "");
  // El cuerpo ya no es un canal: aunque traiga el campo, se ignora.
  assert.equal(
    getRefreshTokenFromRequest({ body: { refreshToken: "krt_body" } }),
    ""
  );
});

test("POST /api/auth/refresh sin cookie responde 401 JSON (cableado real)", async (t) => {
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));

  const base = `http://127.0.0.1:${server.address().port}`;
  const response = await fetch(`${base}/api/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({})
  });

  assert.equal(response.status, 401);
  const data = await response.json();
  assert.equal(data.code, "REFRESH_REQUIRED");
  assert.equal(response.headers.get("set-cookie"), null);

  if (previousSecret === undefined) delete process.env.JWT_SECRET;
  else process.env.JWT_SECRET = previousSecret;
});
