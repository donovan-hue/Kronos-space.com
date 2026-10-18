const test = require("node:test");
const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");
const { io: socketClient } = require("socket.io-client");

// Transporte real y composición real; ninguna prueba accede a MongoDB.
process.env.JWT_SECRET = "kronos-composition-contract-only";
process.env.CLIENT_URL = "https://kronos-space.com";
process.env.API_RATE_LIMIT_MAX = "10000";
process.env.ABUSE_RATE_LIMIT_MAX = "10000";
process.env.AUTH_RATE_LIMIT_MAX = "1";
const { server, io } = require("../src/server");
assert.equal(server.listening, false, "importar la composición no debe abrir puertos");
let baseUrl;

test.before(async () => {
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});
test.after(async () => {
  await new Promise((resolve) => io.close(resolve));
  if (server.listening) await new Promise((resolve) => server.close(resolve));
});

for (const path of [
  "/api/posts", "/api/conversations", "/api/voices", "/api/kairos/capacidades",
  "/api/ai/images/history", "/api/auth/session", "/api/users/me"
]) {
  test(`el registro modular conserva la autenticación de GET ${path}`, async () => {
    const response = await fetch(`${baseUrl}${path}`);
    assert.equal(response.status, 401, "no debe ser 404 ni saltarse la autenticación");
    assert.match(response.headers.get("content-type"), /application\/json/);
    assert.equal(typeof (await response.json()).error, "string");
  });
}

test("el ciclo de sesión no consume ni hereda el presupuesto de credenciales", async () => {
  const login = () => fetch(`${baseUrl}/api/auth/login`, {
    method: "POST", headers: { "content-type": "application/json" }, body: "{}"
  });
  assert.equal((await login()).status, 400);
  assert.equal((await login()).status, 429, "el limitador sigue activo en el módulo de credenciales");
  assert.equal((await fetch(`${baseUrl}/api/auth/session`)).status, 401,
    "la ruta de sesión debe responder por su autenticación, no por el limitador de login");
});

for (const [name, token, expected] of [
  ["sin credenciales", undefined, "AUTH_REQUIRED"],
  ["firma ajena", jwt.sign({ id: "user" }, "another-secret"), "AUTH_INVALID"],
  ["JWT expirado", jwt.sign({ id: "user" }, process.env.JWT_SECRET, { expiresIn: -1 }), "AUTH_INVALID"],
  ["algoritmo no permitido", jwt.sign({ id: "user" }, process.env.JWT_SECRET, { algorithm: "HS384" }), "AUTH_INVALID"]
]) {
  test(`Socket.IO modular rechaza ${name} antes de consultar la base`, { timeout: 5000 }, async () => {
    const socket = socketClient(baseUrl, {
      autoConnect: false, forceNew: true, reconnection: false, transports: ["websocket"],
      auth: token ? { token } : {}
    });
    try {
      const error = await new Promise((resolve, reject) => {
        socket.once("connect_error", resolve);
        socket.once("connect", () => reject(new Error("Se aceptó un socket no autorizado")));
        socket.connect();
      });
      assert.equal(error.message, expected);
      assert.equal(socket.connected, false);
    } finally {
      socket.disconnect();
    }
  });
}
