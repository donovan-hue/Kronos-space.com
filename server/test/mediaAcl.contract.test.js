const test = require("node:test");
const assert = require("node:assert");

/**
 * Contrato del middleware mediaAcl.
 *
 * Verifica la lógica de decisión del ACL sin necesidad de base de datos
 * ni servidor HTTP: prueba las funciones internas y la estructura del
 * middleware con mocks controlados.
 *
 * Los escenarios que requieren MongoDB (media con auth, posts, etc.)
 * se verifican en los tests E2E con base de datos real.
 */

const { COOKIE_NAME, setMediaAuthCookie, clearMediaAuthCookie, readMediaAuth } = require("../src/middleware/mediaAuth");

/* ------------------------------------------------------------------ */
/* mediaAuth — cookie y lectura                                       */
/* ------------------------------------------------------------------ */

test("setMediaAuthCookie produce una cookie con los atributos de seguridad correctos", () => {
  const headers = [];
  const res = { append(name, value) { headers.push({ name, value }); } };
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

  setMediaAuthCookie(res, "jwt-de-prueba", expiresAt);

  assert.strictEqual(headers.length, 1);
  const cookie = headers[0].value;
  assert.match(cookie, new RegExp(`^${COOKIE_NAME}=`));
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Lax/);
  assert.match(cookie, /Path=\//);
  assert.match(cookie, /Max-Age=\d+/);
  // Sin NODE_ENV=production no debe llevar Secure
  assert.doesNotMatch(cookie, /Secure/);
});

test("setMediaAuthCookie añade Secure en producción", () => {
  const previous = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";

  const headers = [];
  const res = { append(name, value) { headers.push({ name, value }); } };
  setMediaAuthCookie(res, "jwt-test", new Date(Date.now() + 60000));
  const cookie = headers[0].value;

  assert.match(cookie, /Secure/);
  process.env.NODE_ENV = previous;
});

test("clearMediaAuthCookie establece Max-Age=0", () => {
  const headers = [];
  const res = { append(name, value) { headers.push({ name, value }); } };
  clearMediaAuthCookie(res);
  const cookie = headers[0].value;
  assert.match(cookie, /Max-Age=0/);
});

test("readMediaAuth devuelve null sin cookie", async () => {
  const req = { get() { return ""; } };
  const result = await readMediaAuth(req);
  assert.strictEqual(result, null);
});

test("readMediaAuth devuelve null con cookie JWT inválida", async () => {
  const req = { get() { return `${COOKIE_NAME}=garbage-not-jwt`; } };
  const result = await readMediaAuth(req);
  assert.strictEqual(result, null);
});

/* ------------------------------------------------------------------ */
/* mediaAcl — rutas públicas (avatars/covers)                        */
/* ------------------------------------------------------------------ */

test("mediaAcl: /uploads/avatars/... pasa sin autenticación", async () => {
  const { mediaAcl } = require("../src/middleware/mediaAcl");
  let nextCalled = false;
  let statusCode = null;

  const req = {
    baseUrl: "/uploads",
    path: "/avatars/123-abc.jpg",
    get() { return ""; }
  };
  const res = {
    locals: {},
    setHeader() {},
    status(code) { statusCode = code; return this; },
    end() {}
  };
  const next = () => { nextCalled = true; };

  await mediaAcl(req, res, next);
  assert.strictEqual(nextCalled, true);
  assert.strictEqual(statusCode, null);
  assert.strictEqual(res.locals.mediaCacheControl, "public, max-age=604800");
});

test("mediaAcl: /uploads/covers/... pasa sin autenticación", async () => {
  const { mediaAcl } = require("../src/middleware/mediaAcl");
  let nextCalled = false;

  const req = {
    baseUrl: "/uploads",
    path: "/covers/456-def.png",
    get() { return ""; }
  };
  const res = {
    locals: {},
    setHeader() {},
    status() { return this; },
    end() {}
  };
  const next = () => { nextCalled = true; };

  await mediaAcl(req, res, next);
  assert.strictEqual(nextCalled, true);
});

/* ------------------------------------------------------------------ */
/* mediaAcl — rutas desconocidas → 404                                */
/* ------------------------------------------------------------------ */

test("mediaAcl: ruta no reconocida bajo /uploads/ → 404", async () => {
  const { mediaAcl } = require("../src/middleware/mediaAcl");
  let statusCode = null;
  let nextCalled = false;

  const req = {
    baseUrl: "/uploads",
    path: "/desconocido/archivo.jpg",
    get() { return ""; }
  };
  const res = {
    locals: {},
    setHeader() {},
    status(code) { statusCode = code; return this; },
    end() {}
  };
  const next = () => { nextCalled = true; };

  await mediaAcl(req, res, next);
  assert.strictEqual(statusCode, 404);
  assert.strictEqual(nextCalled, false);
  assert.strictEqual(res.locals.mediaCacheControl, "private, no-store");
});

/* ------------------------------------------------------------------ */
/* mediaAcl — Vary: Cookie en todas las respuestas                    */
/* ------------------------------------------------------------------ */

test("mediaAcl: establece Vary: Cookie en rutas desconocidas (deny)", async () => {
  const { mediaAcl } = require("../src/middleware/mediaAcl");
  const varyHeaders = [];

  const req = {
    baseUrl: "/uploads",
    path: "/desconocido/archivo.jpg",
    get() { return ""; }
  };
  const res = {
    locals: {},
    setHeader(name, value) { if (name === "Vary") varyHeaders.push(value); },
    status() { return this; },
    end() {}
  };

  await mediaAcl(req, res, () => {});
  assert.ok(varyHeaders.includes("Cookie"), "Vary: Cookie debe estar en la respuesta de denegación");
});

test("mediaAcl: establece Vary: Cookie en rutas públicas (avatars)", async () => {
  const { mediaAcl } = require("../src/middleware/mediaAcl");
  const varyHeaders = [];

  const req = {
    baseUrl: "/uploads",
    path: "/avatars/123-abc.jpg",
    get() { return ""; }
  };
  const res = {
    locals: {},
    setHeader(name, value) { if (name === "Vary") varyHeaders.push(value); },
    status() { return this; },
    end() {}
  };

  await mediaAcl(req, res, () => {});
  assert.ok(varyHeaders.includes("Cookie"), "Vary: Cookie debe estar incluso para avatares públicos");
});
