import test from "node:test";
import assert from "node:assert";

import {
  clearSession,
  getSession,
  getRefreshToken,
  getRefreshTokenExpiresAt,
  hasRefreshToken,
  updateTokens,
  getToken,
  getTokenExpiresAt,
  getUser,
  hasSession,
  isTokenExpired,
  peekSession,
  saveSession,
  SESSION_CLEAR_REASONS,
  subscribeToSession,
  updateUser
} from "../src/services/authStorage.js";

/**
 * KRONOS-AUDIT-002 — persistencia de sesión en el cliente.
 *
 * Cubre el contrato existente (recordar sesión con localStorage o
 * sessionStorage) y lo añadido: expiración del JWT, lectura sin efectos,
 * refresco del usuario y notificación de limpieza con motivo.
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

test("guarda la sesión persistente en localStorage", () => {
  const { local, session } = setupStorages();
  const token = makeToken();

  saveSession(token, USER, true);

  assert.strictEqual(getToken(), token);
  assert.deepStrictEqual(getUser(), USER);
  assert.strictEqual(local.getItem("kronos_token"), token);
  assert.strictEqual(session.size, 0);
  assert.strictEqual(getSession().remember, true);
});

test("sin recordar sesión el token queda en sessionStorage y sigue disponible", () => {
  const { local, session } = setupStorages();
  const token = makeToken();

  saveSession(token, USER, false);

  assert.strictEqual(
    getToken(),
    token,
    "las rutas protegidas deben leer sessionStorage"
  );
  assert.strictEqual(getUser().username, "kronos");
  assert.strictEqual(local.size, 0);
  assert.strictEqual(session.getItem("kronos_token"), token);
  assert.strictEqual(hasSession(), true);
  assert.strictEqual(getSession().remember, false);
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
  assert.strictEqual(local.getItem("kronos_token"), null);
});

test("peekSession no modifica el almacenamiento", () => {
  const { local } = setupStorages();
  const token = makeToken();

  saveSession(token, USER, true);

  const peeked = peekSession();

  assert.strictEqual(peeked.token, token);
  assert.strictEqual(peeked.user.username, "kronos");
  assert.strictEqual(local.getItem("kronos_token"), token);
});

test("clearSession elimina ambos storages y notifica el motivo", () => {
  const { local, session } = setupStorages();

  local.setItem("kronos_token", makeToken());
  local.setItem("kronos_user", JSON.stringify(USER));
  session.setItem("kronos_token", makeToken());
  session.setItem("kronos_user", JSON.stringify(USER));

  const reasons = [];
  const unsubscribe = subscribeToSession((event) => {
    if (event.type === "cleared") reasons.push(event.reason);
  });

  clearSession(SESSION_CLEAR_REASONS.logout);

  assert.strictEqual(local.size, 0);
  assert.strictEqual(session.size, 0);
  assert.deepStrictEqual(reasons, [
    SESSION_CLEAR_REASONS.logout
  ]);
  assert.strictEqual(getSession(), null);

  unsubscribe();
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

// Dobles de Storage solo para inyectar fallos del navegador. No son auth
// ni persistencia de producción y no prueban integración con MongoDB.
test("un getter localStorage bloqueado no impide leer una sesión temporal válida", () => {
  const { session } = setupStorages();
  const token = makeToken();
  saveSession(token, USER, false);
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    get() { throw new Error("SecurityError"); }
  });
  try {
    assert.equal(getToken(), token);
    assert.deepEqual(getUser(), USER);
    assert.equal(peekSession().token, token);
    assert.doesNotThrow(() => clearSession());
    assert.equal(session.size, 0);
  } finally {
    Object.defineProperty(globalThis, "localStorage", { configurable: true, writable: true, value: new MemoryStorage() });
  }
});

test("lectura bloqueada de ambos storages devuelve ausencia de sesión sin excepción", () => {
  const { local, session } = setupStorages();
  for (const storage of [local, session]) storage.getItem = () => { throw new Error("SecurityError"); };
  assert.equal(getToken(), "");
  assert.equal(getUser(), null);
  assert.equal(getSession(), null);
  assert.deepEqual(peekSession(), { token: "", user: null });
});

test("no anuncia persistencia ni cambia recordar sesión si el storage elegido falla", () => {
  const { local, session } = setupStorages();
  local.setItem = () => { throw new Error("QuotaExceededError"); };
  assert.throws(() => saveSession(makeToken(), USER, true), { code: "SESSION_STORAGE_UNAVAILABLE" });
  assert.equal(getSession(), null);
  assert.equal(session.size, 0, "no mover silenciosamente la sesión a sessionStorage");
});

test("un guardado parcial revierte token y usuario sin ocultar el error", () => {
  const { local } = setupStorages();
  const write = local.setItem.bind(local);
  local.setItem = (key, value) => {
    if (key === "kronos_refresh_token") throw new Error("QuotaExceededError");
    write(key, value);
  };
  assert.throws(() => saveSession(makeToken(), USER, true, "", { token: "refresh-fixture" }), { code: "SESSION_STORAGE_UNAVAILABLE" });
  assert.equal(local.size, 0);
  assert.equal(getToken(), "");
});

test("logout no lanza aunque removeItem falle y no reutiliza la sesión en esta ejecución", () => {
  const { local } = setupStorages();
  saveSession(makeToken(), USER);
  local.removeItem = () => { throw new Error("SecurityError"); };
  let emitted = 0;
  const unsubscribe = subscribeToSession(() => { emitted += 1; });
  try {
    assert.doesNotThrow(() => clearSession(SESSION_CLEAR_REASONS.logout));
    assert.equal(getToken(), "");
    assert.equal(getUser(), null);
    assert.equal(getRefreshToken(), "");
    assert.equal(emitted, 1);
  } finally { unsubscribe(); }
});

test("el guardado acepta refreshExpiresAt del contrato de Auth y expiresAt histórico", () => {
  setupStorages();
  const expires = new Date(Date.now() + 86_400_000).toISOString();
  for (const refresh of [{ token: "refresh-fixture", refreshExpiresAt: expires }, { token: "refresh-fixture", expiresAt: expires }]) {
    saveSession(makeToken(), USER, false, "", refresh);
    assert.equal(getRefreshTokenExpiresAt().toISOString(), expires);
  }
});

test("la rotación conserva storage/usuario y actualiza expiración del refresh", () => {
  const { local } = setupStorages();
  saveSession(makeToken(), USER, false, "", { token: "refresh-before" });
  const token = makeToken(7200);
  const expires = new Date(Date.now() + 172_800_000).toISOString();
  const session = updateTokens(token, "refresh-after", "", expires);
  assert.equal(session.token, token);
  assert.equal(session.remember, false);
  assert.deepEqual(session.user, USER);
  assert.equal(getRefreshToken(), "refresh-after");
  assert.equal(getRefreshTokenExpiresAt().toISOString(), expires);
  assert.equal(local.size, 0);
});

test("rotación parcialmente fallida invalida ambos tokens y emite cierre, no éxito", () => {
  const { local } = setupStorages();
  saveSession(makeToken(), USER, true, "", { token: "refresh-before" });
  const write = local.setItem.bind(local);
  local.setItem = (key, value) => {
    if (key === "kronos_refresh_token") throw new Error("QuotaExceededError");
    write(key, value);
  };
  const reasons = [];
  const off = subscribeToSession(event => reasons.push(event.reason));
  try {
    assert.throws(() => updateTokens(makeToken(7200), "refresh-after"), { code: "SESSION_STORAGE_UNAVAILABLE" });
    assert.equal(getSession(), null);
    assert.equal(getRefreshToken(), "");
    assert.deepEqual(reasons, [SESSION_CLEAR_REASONS.invalid]);
  } finally { off(); }
});

test("updateUser propaga fallo de persistencia y no devuelve éxito falso", () => {
  const { local } = setupStorages();
  saveSession(makeToken(), USER);
  local.setItem = () => { throw new Error("QuotaExceededError"); };
  assert.throws(() => updateUser({ ...USER, displayName: "nuevo" }), { code: "SESSION_STORAGE_UNAVAILABLE" });
  assert.deepEqual(getUser(), USER);
});

// ---------------------------------------------------------------
// KRONOS-AUDIT-002 (almacenamiento bloqueado) — el navegador puede
// denegar el acceso al almacén (SecurityError), agotar la cuota
// (QuotaExceededError) o aceptar el borrado sin efecto. Ninguna de esas
// situaciones puede romper la aplicación ni dejar una sesión reutilizable.
// Los dobles de Storage solo inyectan esos fallos: la lógica que se
// audita es la de producción.
// ---------------------------------------------------------------

const SESSION_KEYS = [
  "kronos_token",
  "kronos_user",
  "kronos_session_expires_at",
  "kronos_session_remember",
  "kronos_refresh_token",
  "kronos_refresh_expires_at"
];

/** Valor físico de una clave, sin la invalidación defensiva del módulo. */
function rawItem(storage, key) {
  return storage.getItem(key);
}

/** Carga una instancia nueva del módulo: equivale a recargar el navegador. */
async function reloadModule() {
  const url = `../src/services/authStorage.js?recarga=${Date.now()}-${Math.random()}`;
  return import(url);
}

test("almacenamiento disponible: el ciclo completo sigue siendo el de siempre", () => {
  const { local, session } = setupStorages();
  const token = makeToken();

  saveSession(token, USER, true, "", { token: "refresh-1" });
  assert.equal(local.getItem("kronos_token"), token);
  assert.equal(session.size, 0);

  updateUser({ ...USER, displayName: "Actualizado" });
  assert.equal(getUser().displayName, "Actualizado");

  updateTokens(makeToken(7200), "refresh-2");
  assert.equal(getRefreshToken(), "refresh-2");

  clearSession(SESSION_CLEAR_REASONS.logout);
  assert.equal(local.size, 0, "con el almacén sano se borra de verdad");
  assert.equal(getSession(), null);
});

test("lectura bloqueada: la sesión se reporta ausente y la app no lanza", () => {
  const { local, session } = setupStorages();
  for (const storage of [local, session]) {
    storage.getItem = () => { throw new DOMException("denegado", "SecurityError"); };
  }

  assert.doesNotThrow(() => {
    assert.equal(getToken(), "");
    assert.equal(getUser(), null);
    assert.equal(getSession(), null);
    assert.equal(hasSession(), false);
    assert.equal(hasRefreshToken(), false);
    assert.equal(isTokenExpired(), false);
    assert.deepEqual(peekSession(), { token: "", user: null });
  });
});

test("escritura bloqueada: falla en voz alta, sin sesión parcial ni excepción distinta", () => {
  const { local, session } = setupStorages();
  local.setItem = () => { throw new DOMException("cuota", "QuotaExceededError"); };

  assert.throws(
    () => saveSession(makeToken(), USER, true),
    (error) => error.code === "SESSION_STORAGE_UNAVAILABLE" && /permisos de almacenamiento/.test(error.message)
  );
  assert.equal(getSession(), null);
  assert.equal(local.size, 0);
  assert.equal(session.size, 0, "no se mueve la sesión a otro almacén sin pedirlo");
});

test("borrado bloqueado: no queda ningún valor utilizable ni al recargar", async () => {
  const { local } = setupStorages();
  saveSession(makeToken(), USER, true, "", { token: "refresh-1" });
  assert.ok(local.getItem("kronos_token"));

  // El navegador deja de permitir el borrado (política del sitio).
  local.removeItem = () => { throw new DOMException("denegado", "SecurityError"); };

  assert.doesNotThrow(() => clearSession(SESSION_CLEAR_REASONS.logout));
  assert.equal(getToken(), "");
  assert.equal(getUser(), null);
  assert.equal(getRefreshToken(), "");

  for (const key of SESSION_KEYS) {
    const value = rawItem(local, key);
    assert.ok(
      value === null || value === "",
      `${key} conserva un valor utilizable tras el logout: ${JSON.stringify(value)}`
    );
  }

  // Recarga real del navegador: instancia nueva del módulo, mismo almacén.
  const reloaded = await reloadModule();
  assert.equal(reloaded.getToken(), "", "la sesión no debe reaparecer al recargar");
  assert.equal(reloaded.getUser(), null);
  assert.equal(reloaded.getSession(), null);
  assert.equal(reloaded.hasRefreshToken(), false);
  assert.deepEqual(reloaded.peekSession(), { token: "", user: null });

  // Y el navegador vuelve a permitir el ciclo normal: se puede iniciar sesión otra vez.
  const restored = new MemoryStorage();
  for (const [key, value] of local.data) restored.data.set(key, value);
  Object.defineProperty(globalThis, "localStorage", { configurable: true, writable: true, value: restored });
  assert.ok(saveSession(makeToken(), USER, true), "un login posterior debe funcionar");
  assert.equal(getUser().username, "kronos");
});

test("borrado bloqueado: el guardado de una sesión nueva no se aborta por un campo sin valor", () => {
  const { local } = setupStorages();
  local.removeItem = () => { throw new DOMException("denegado", "SecurityError"); };

  // refresh sin fecha de expiración: el contrato pide dejar esa clave vacía.
  const session = saveSession(makeToken(), USER, true, "", { token: "refresh-sin-fecha" });

  assert.ok(session, "el guardado debe completarse");
  assert.equal(session.token, getToken());
  assert.equal(getRefreshToken(), "refresh-sin-fecha");
  assert.equal(getRefreshTokenExpiresAt(), null);
  assert.ok(
    !local.getItem("kronos_refresh_expires_at"),
    "la clave queda neutralizada (ausente o vacía, nunca con un valor)"
  );

  // Rotación de tokens con el mismo bloqueo activo.
  const rotated = updateTokens(makeToken(7200), "refresh-rotado", "", "");
  assert.ok(rotated);
  assert.equal(getRefreshToken(), "refresh-rotado");
});

test("borrado bloqueado parcialmente: ninguna clave sobrevive con valor", () => {
  const { local, session } = setupStorages();
  saveSession(makeToken(), USER, true, "", { token: "refresh-1" });
  session.setItem("kronos_token", makeToken());

  const remove = local.removeItem.bind(local);
  local.removeItem = (key) => {
    if (key === "kronos_token" || key === "kronos_user") throw new DOMException("denegado", "SecurityError");
    remove(key);
  };

  clearSession(SESSION_CLEAR_REASONS.expired);

  for (const key of SESSION_KEYS) {
    assert.ok(!rawItem(local, key), `${key} sobrevivió al cierre`);
    assert.ok(!rawItem(session, key), `${key} sobrevivió al cierre en el otro almacén`);
  }
});

test("escritura y borrado bloqueados a la vez: no se anuncia un borrado que no ocurrió", () => {
  const { local } = setupStorages();
  saveSession(makeToken(), USER, true);
  local.removeItem = () => { throw new DOMException("denegado", "SecurityError"); };
  local.setItem = () => { throw new DOMException("cuota", "QuotaExceededError"); };

  assert.doesNotThrow(() => clearSession(SESSION_CLEAR_REASONS.logout));
  assert.equal(getToken(), "", "la lectura de la sesión queda invalidada en esta ejecución");
  assert.ok(rawItem(local, "kronos_token"), "sin escritura posible el dato físico permanece: lo reportamos, no lo ocultamos");

  // El módulo no puede saber si sigue ahí: lo trata como ausente en lugar de
  // devolver un token que el navegador retiene. Se documenta como limitación.
  assert.equal(peekSession().token, "");
});

test("sesión inexistente: todas las operaciones son seguras y no crean nada", () => {
  const { local, session } = setupStorages();

  assert.equal(getToken(), "");
  assert.equal(getUser(), null);
  assert.equal(getSession(), null);
  assert.equal(peekSession().token, "");
  assert.equal(isTokenExpired(), false);

  assert.doesNotThrow(() => clearSession(SESSION_CLEAR_REASONS.manual));
  assert.equal(updateUser({ ...USER }), null, "sin sesión no hay usuario que refrescar");
  assert.equal(updateTokens(makeToken()), null, "sin sesión no hay tokens que rotar");
  assert.equal(local.size, 0);
  assert.equal(session.size, 0);
});

test("sesión inválida: se limpia sola y no deja datos a medias", async () => {
  const { local } = setupStorages();
  saveSession(makeToken(), USER, true);

  // Estado corrupto 1: usuario ilegible.
  local.setItem("kronos_user", "{json-roto");
  assert.equal(getUser(), null);
  assert.equal(getToken(), "", "un usuario corrupto cierra la sesión completa");
  assert.equal(getSession(), null);

  // Estado corrupto 2: token con forma inválida.
  saveSession("token-corrupto", USER, true);
  assert.equal(getToken(), "token-corrupto");
  assert.equal(getTokenExpiresAt(), null);
  assert.doesNotThrow(() => isTokenExpired());
  assert.equal(isTokenExpired(), false, "sin expiración legible no se inventa una expiración");

  // Estado corrupto 3: JSON válido que no es un usuario.
  saveSession(makeToken(), USER, true);
  local.setItem("kronos_user", JSON.stringify("usuario-como-texto"));
  assert.equal(getUser(), null);
  assert.equal(getToken(), "");
  assert.equal(peekSession().user, null);

  const reloaded = await reloadModule();
  assert.equal(reloaded.getSession(), null, "tras recargar tampoco hay sesión utilizable");
});
