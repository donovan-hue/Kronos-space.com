/**
 * KRONOS-AUDIT-002 — sesión del cliente + A-1 (cierre, cookies httpOnly).
 *
 * Modelo de almacenamiento:
 * - Access token: SOLO en memoria del módulo. Nunca toca localStorage/
 *   sessionStorage, así que un XSS no puede exfiltrar credenciales
 *   persistentes. Se pierde al recargar: es lo esperado, la sesión se
 *   rehidrata con el refresh (ver abajo).
 * - Refresh token: el cliente web NUNCA lo ve. Vive en la cookie
 *   `httpOnly` + `SameSite=Lax` que pone el servidor y el navegador la
 *   adjunta solo a `/api/auth/*`. JS no puede leerla ni robarla.
 * - Usuario, preferencia "recordar" y metadatos de expiración (no son
 *   credenciales): en localStorage (recordar) o sessionStorage (no).
 * - `HINT_KEY`: marca no sensible ("aquí hubo sesión") para saber si
 *   vale la pena intentar una renovación silenciosa al arrancar. Evita
 *   un POST /auth/refresh inútil en cada visita anónima.
 *
 * Migración: si un despliegue anterior dejó tokens en los storages, se
 * purgan al guardar o limpiar la sesión (claves LEGACY_*).
 */

const USER_KEY = "kronos_user";
const EXPIRES_KEY = "kronos_session_expires_at";
const REMEMBER_KEY = "kronos_session_remember";
const REFRESH_EXPIRES_KEY = "kronos_refresh_expires_at";
const HINT_KEY = "kronos_session_hint";

// Claves de versiones anteriores que SÍ guardaban tokens en storage.
// Ya no se escriben: solo se borran al migrar.
const LEGACY_TOKEN_KEYS = ["kronos_token", "kronos_refresh_token"];

// El access token vive únicamente aquí. Al recargar la página se pierde
// y la sesión se rehidrata vía cookie (refresh silencioso).
let memoryToken = "";

const listeners = new Set();

export const SESSION_CLEAR_REASONS = {
  manual: "manual",
  logout: "logout",
  expired: "expired",
  invalid: "invalid",
  unauthorized: "unauthorized"
};

function getStorage(kind) {
  try {
    const storage =
      kind === "session"
        ? globalThis.sessionStorage
        : globalThis.localStorage;

    if (!storage) return null;

    storage.getItem(USER_KEY);

    return storage;
  } catch {
    return null;
  }
}

function readStored(key) {
  const local = getStorage("local");
  const session = getStorage("session");
  const localValue = local ? local.getItem(key) : null;

  return localValue || (session ? session.getItem(key) : null);
}

/** Storage que contiene la sesión (el que tenga usuario o hint). */
function sessionStorageOf() {
  for (const storage of [getStorage("local"), getStorage("session")]) {
    if (
      storage &&
      (storage.getItem(USER_KEY) || storage.getItem(HINT_KEY))
    ) {
      return storage;
    }
  }

  return null;
}

function purgeLegacyTokens() {
  for (const storage of [getStorage("local"), getStorage("session")]) {
    if (!storage) continue;

    for (const key of LEGACY_TOKEN_KEYS) {
      try {
        storage.removeItem(key);
      } catch {
        /* almacenamiento no disponible: nada que purgar */
      }
    }
  }
}

function emit(event) {
  for (const listener of listeners) {
    try {
      listener(event);
    } catch (error) {
      console.error("SESSION_LISTENER_ERROR:", error);
    }
  }
}

export function decodeTokenPayload(token) {
  if (typeof token !== "string") return null;

  const parts = token.split(".");

  if (parts.length !== 3) return null;

  try {
    const normalized = parts[1]
      .replace(/-/g, "+")
      .replace(/_/g, "/");

    const padded = normalized.padEnd(
      Math.ceil(normalized.length / 4) * 4,
      "="
    );

    const decoded =
      typeof globalThis.atob === "function"
        ? globalThis.atob(padded)
        : Buffer.from(padded, "base64").toString("binary");

    return JSON.parse(decoded);
  } catch {
    return null;
  }
}

export function getTokenExpiresAt(token = memoryToken) {
  if (!token) return null;

  const payload = decodeTokenPayload(token);

  if (payload && typeof payload.exp === "number") {
    return new Date(payload.exp * 1000);
  }

  const stored = readStored(EXPIRES_KEY);
  const date = stored ? new Date(stored) : null;

  return date && !Number.isNaN(date.getTime()) ? date : null;
}

export function isTokenExpired(token = memoryToken) {
  if (!token) return true;

  const expiresAt = getTokenExpiresAt(token);

  if (!expiresAt) return false;

  return expiresAt.getTime() <= Date.now();
}

// ---------------------------------------------------------------
// Contrato de sesión
// ---------------------------------------------------------------

/** Access token vigente en esta pestaña (memoria) o "". */
export function getToken() {
  return memoryToken || "";
}

export function getUser() {
  try {
    const raw = readStored(USER_KEY);

    return raw ? JSON.parse(raw) : null;
  } catch {
    clearSession();

    return null;
  }
}

export function saveSession(
  token,
  user,
  remember = true,
  expiresAt = "",
  refresh = null
) {
  clearSession(SESSION_CLEAR_REASONS.manual);

  memoryToken = typeof token === "string" ? token : "";

  const storage = remember ? getStorage("local") : getStorage("session");

  if (storage) {
    storage.setItem(USER_KEY, JSON.stringify(user));
    storage.setItem(REMEMBER_KEY, String(Boolean(remember)));
    storage.setItem(HINT_KEY, "1");

    const resolved = expiresAt
      ? new Date(expiresAt)
      : getTokenExpiresAt(memoryToken);

    if (resolved && !Number.isNaN(resolved.getTime())) {
      storage.setItem(EXPIRES_KEY, resolved.toISOString());
    }

    // Solo metadato (no credencial): el valor del refresh nunca llega a JS.
    const refreshExpiresAt =
      refresh && typeof refresh === "object" && refresh.refreshExpiresAt
        ? new Date(refresh.refreshExpiresAt)
        : null;

    if (refreshExpiresAt && !Number.isNaN(refreshExpiresAt.getTime())) {
      storage.setItem(REFRESH_EXPIRES_KEY, refreshExpiresAt.toISOString());
    }
  }

  return getSession();
}

export function clearSession(reason = SESSION_CLEAR_REASONS.manual) {
  memoryToken = "";

  for (const storage of [
    getStorage("local"),
    getStorage("session")
  ]) {
    if (!storage) continue;

    storage.removeItem(USER_KEY);
    storage.removeItem(EXPIRES_KEY);
    storage.removeItem(REMEMBER_KEY);
    storage.removeItem(REFRESH_EXPIRES_KEY);
    storage.removeItem(HINT_KEY);
  }

  purgeLegacyTokens();

  emit({ type: "cleared", reason, session: null });
}

/** Lectura sin efectos secundarios, para hidratar el estado inicial. */
export function peekSession() {
  const raw = readStored(USER_KEY);
  let user = null;

  try {
    const parsed = raw ? JSON.parse(raw) : null;

    user = parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    user = null;
  }

  return { token: memoryToken || "", user, hasHint: hasSessionHint() };
}

/** Hay access token usable en esta pestaña ahora mismo. */
export function hasSession() {
  return Boolean(memoryToken);
}

/**
 * Marca no sensible de "aquí hubo sesión". Tras recargar, la memoria
 * está vacía pero el hint dice si vale la pena intentar el refresh
 * silencioso (la cookie, si existe, la adjunta el navegador).
 */
export function hasSessionHint() {
  return readStored(HINT_KEY) === "1";
}

/** Preferencia "recordar" guardada (para pedir cookie persistente o no). */
export function isSessionRemembered() {
  return readStored(REMEMBER_KEY) !== "false";
}

/** Expiración del refresh (metadato, no credencial), si se conoce. */
export function getRefreshTokenExpiresAt() {
  const stored = readStored(REFRESH_EXPIRES_KEY);
  const date = stored ? new Date(stored) : null;

  return date && !Number.isNaN(date.getTime()) ? date : null;
}

/**
 * Guarda el par renovado conservando el resto de la sesión (usuario y
 * preferencia de "recordar"). No emite `cleared`: la sesión sigue viva.
 * El refresh nuevo lo deja el servidor en la cookie; aquí solo se
 * actualiza el access (memoria) y los metadatos.
 */
export function updateTokens(token, options = {}, expiresAt = "") {
  if (!token || typeof token !== "string") return null;

  memoryToken = token;

  const storage = sessionStorageOf();

  if (!storage) return getSession();

  const resolved =
    options && typeof options === "object" && options.expiresAt
      ? new Date(options.expiresAt)
      : expiresAt
        ? new Date(expiresAt)
        : getTokenExpiresAt(token);

  if (resolved && !Number.isNaN(resolved.getTime())) {
    storage.setItem(EXPIRES_KEY, resolved.toISOString());
  }

  const refreshExpiresAt =
    options && typeof options === "object" && options.refreshExpiresAt
      ? new Date(options.refreshExpiresAt)
      : null;

  if (refreshExpiresAt && !Number.isNaN(refreshExpiresAt.getTime())) {
    storage.setItem(REFRESH_EXPIRES_KEY, refreshExpiresAt.toISOString());
  }

  return getSession();
}

export function getSession() {
  const token = getToken();

  if (!token) return null;

  const expiresAt = getTokenExpiresAt(token);

  return {
    token,
    user: getUser(),
    expiresAt: expiresAt ? expiresAt.toISOString() : null,
    remember: isSessionRemembered(),
    refreshExpiresAt: (() => {
      const date = getRefreshTokenExpiresAt();

      return date ? date.toISOString() : null;
    })()
  };
}

/** Refresca los datos del usuario conservando el token. */
export function updateUser(user) {
  if (!user || typeof user !== "object") return null;

  const storage = sessionStorageOf();

  if (storage) {
    storage.setItem(USER_KEY, JSON.stringify(user));
  }

  return user;
}

export function subscribeToSession(listener) {
  if (typeof listener !== "function") {
    return () => {};
  }

  listeners.add(listener);

  return () => listeners.delete(listener);
}
