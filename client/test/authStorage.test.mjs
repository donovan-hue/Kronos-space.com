import test from "node:test";
import assert from "node:assert";

import {
  clearSession,
  getRefreshTokenExpiresAt,
  getSession,
  getToken,
  getTokenExpiresAt,
  getUser,
  hasSession,
  hasSessionHint,
  isSessionRemembered,
  isTokenExpired,
  peekSession,
  saveSession,
  SESSION_CLEAR_REASONS,
  subscribeToSession,
  updateTokens,
  updateUser
} from "../src/services/authStorage.js";

/**
 * A-1 (cierre) — sesión del cliente con cookies httpOnly.
 *
 * - El access token vive SOLO en memoria: jamás en localStorage.
 * - El refresh token no existe en JS (cookie httpOnly del servidor).
 * - En storage solo hay datos no sensibles: usuario, preferencia
 *   "recordar", expiraciones (metadatos) y el hint de sesión.
 */

class MemoryStorage {
  constructor() {
    this.data = new Map();
  }

  getItem(key) {
    return this.data.has(key) ? this.data.get(key) : null;
  }

  setItem(key, value) {
    this.data.set(key, String(value));
  }

  removeItem(key) {
    this.data.delete(key);
  }

  keys() {
    return [...this.data.keys()];
  }

  get size() {
    return this.data.size;
  }
}

function encode(value) {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function makeToken(secondsFromNow = 3600) {
  return [
    encode({ alg: "HS256", typ: "JWT" }),
    encode({
      id: "507f1f77bcf86cd799439011",
      username: "kronos",
      exp: Math.floor(Date.now() / 1000) + secondsFromNow
    }),
    "firma-simulada"
  ].join(".");
}

function setupStorages() {
  globalThis.localStorage = new MemoryStorage();
  globalThis.sessionStorage = new MemoryStorage();
  // La memoria del módulo sobrevive entre tests del mismo archivo.
  clearSession();

  return {
    local: globalThis.localStorage,
    session: globalThis.sessionStorage
  };
}

const USER = {
  id: "507f1f77bcf86cd799439011",
  username: "kronos",
  email: "kronos@example.com",
  displayName: "Kronos"
};

function storedValues(storage) {
  return storage.keys().map((key) => storage.getItem(key));
}

test("el access token vive en memoria y nunca en los storages", () => {
  const { local, session } = setupStorages();
  const token = makeToken();

  saveSession(token, USER, true);

  assert.strictEqual(getToken(), token);
  assert.deepStrictEqual(getUser(), USER);
  assert.ok(!storedValues(local).includes(token), "localStorage sin token");
  assert.ok(!storedValues(session).includes(token), "sessionStorage sin token");
  assert.strictEqual(session.size, 0);
  assert.strictEqual(getSession().remember, true);
});

test("sin recordar, los datos quedan en sessionStorage y el token en memoria", () => {
  const { local, session } = setupStorages();
  const token = makeToken();

  saveSession(token, USER, false);

  assert.strictEqual(getToken(), token);
  assert.strictEqual(getUser().username, "kronos");
  assert.strictEqual(local.size, 0);
  assert.ok(session.getItem("kronos_user"), "usuario en sessionStorage");
  assert.ok(!storedValues(session).includes(token), "token no persistido");
  assert.strictEqual(hasSession(), true);
  assert.strictEqual(hasSessionHint(), true);
  assert.strictEqual(isSessionRemembered(), false);
  assert.strictEqual(getSession().remember, false);
});

test("los tokens heredados de versiones anteriores se purgan", () => {
  const { local, session } = setupStorages();

  local.setItem("kronos_token", "access-viejo");
  local.setItem("kronos_refresh_token", "krt_viejo");
  session.setItem("kronos_token", "access-viejo");

  saveSession(makeToken(), USER, true);

  assert.strictEqual(local.getItem("kronos_token"), null);
  assert.strictEqual(local.getItem("kronos_refresh_token"), null);
  assert.strictEqual(session.getItem("kronos_token"), null);
});

test("la expiración del JWT se detecta desde el token", () => {
  setupStorages();

  const valid = makeToken(600);
  saveSession(valid, USER, true);

  assert.strictEqual(isTokenExpired(valid), false);
  assert.ok(getTokenExpiresAt(valid) instanceof Date);
  assert.strictEqual(getSession().expiresAt !== null, true);

  const expired = makeToken(-60);

  assert.strictEqual(isTokenExpired(expired), true);
});

test("sin token en memoria se considera expirado (hay que renovar)", () => {
  setupStorages();

  assert.strictEqual(getToken(), "");
  assert.strictEqual(isTokenExpired(), true);
  assert.strictEqual(hasSession(), false);
});

test("un token malformado no tiene expiración legible", () => {
  setupStorages();

  saveSession("token-corrupto", USER, true);

  assert.strictEqual(getToken(), "token-corrupto");
  assert.strictEqual(isTokenExpired("token-corrupto"), false);
  assert.strictEqual(getTokenExpiresAt("token-corrupto"), null);
});

test("un usuario ilegible limpia la sesión en lugar de romper la app", () => {
  const { local } = setupStorages();

  saveSession(makeToken(), USER, true);
  local.setItem("kronos_user", "{json-roto");

  assert.strictEqual(getUser(), null);
  assert.strictEqual(getToken(), "");
  assert.strictEqual(hasSessionHint(), false);
});

test("peekSession no modifica el almacenamiento", () => {
  const { local } = setupStorages();
  const token = makeToken();

  saveSession(token, USER, true);
  const before = local.size;

  const peeked = peekSession();

  assert.strictEqual(peeked.token, token);
  assert.strictEqual(peeked.user.username, "kronos");
  assert.strictEqual(peeked.hasHint, true);
  assert.strictEqual(local.size, before);
});

test("clearSession vacía memoria y storages, y notifica el motivo", () => {
  const { local, session } = setupStorages();

  saveSession(makeToken(), USER, true);

  const reasons = [];
  const unsubscribe = subscribeToSession((event) => {
    if (event.type === "cleared") reasons.push(event.reason);
  });

  clearSession(SESSION_CLEAR_REASONS.logout);

  assert.strictEqual(local.size, 0);
  assert.strictEqual(session.size, 0);
  assert.strictEqual(getToken(), "");
  assert.deepStrictEqual(reasons, [
    SESSION_CLEAR_REASONS.logout
  ]);
  assert.strictEqual(getSession(), null);

  unsubscribe();
});

test("getSession expone metadatos pero jamás el refresh", () => {
  setupStorages();

  saveSession(makeToken(), USER, true, "", {
    refreshExpiresAt: "2026-10-22T00:00:00.000Z"
  });

  const session = getSession();

  assert.ok(!("refreshToken" in session), "sin refreshToken en la sesión");
  assert.strictEqual(session.refreshExpiresAt, "2026-10-22T00:00:00.000Z");
  assert.strictEqual(
    getRefreshTokenExpiresAt()?.toISOString(),
    "2026-10-22T00:00:00.000Z"
  );
});

test("updateTokens renueva el access en memoria y conserva la sesión", () => {
  setupStorages();

  saveSession(makeToken(60), USER, true);
  const renewed = updateTokens(makeToken(3600), {
    refreshExpiresAt: "2026-10-22T00:00:00.000Z"
  });

  assert.strictEqual(getToken(), renewed.token);
  assert.strictEqual(getUser().username, "kronos");
  assert.strictEqual(renewed.remember, true);
  assert.strictEqual(isTokenExpired(), false);
});

test("updateUser refresca el usuario sin perder el token", () => {
  setupStorages();

  const token = makeToken();

  saveSession(token, USER, true);
  updateUser({ ...USER, displayName: "Kronos Actualizado" });

  assert.strictEqual(getUser().displayName, "Kronos Actualizado");
  assert.strictEqual(getToken(), token);
});

test("saveSession conserva su firma original", () => {
  setupStorages();

  const token = makeToken();

  assert.ok(saveSession(token, USER));
  assert.ok(saveSession(token, USER, false));
  assert.strictEqual(getUser().username, "kronos");
});

test("los listeners pueden desuscribirse", () => {
  setupStorages();

  let calls = 0;
  const unsubscribe = subscribeToSession((event) => {
    if (event.type === "cleared") calls += 1;
  });

  clearSession(SESSION_CLEAR_REASONS.expired);
  assert.strictEqual(calls, 1);

  unsubscribe();
  clearSession(SESSION_CLEAR_REASONS.logout);
  assert.strictEqual(calls, 1);
});
