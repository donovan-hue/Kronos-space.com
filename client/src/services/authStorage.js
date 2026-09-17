/**
 * KRONOS-AUDIT-002 — sesión del cliente.
 *
 * Se conserva intacto el contrato existente:
 *   getToken() / getUser() / saveSession(token, user, remember) / clearSession()
 *
 * Se agrega lo que faltaba para manejar el JWT de verdad:
 * expiración, lectura sin efectos, refresco del usuario, motivo de
 * limpieza y notificación de cambios de sesión.
 */

const TOKEN_KEY = "kronos_token";
const USER_KEY = "kronos_user";
const EXPIRES_KEY = "kronos_session_expires_at";
const REMEMBER_KEY = "kronos_session_remember";
const REFRESH_KEY = "kronos_refresh_token";
const REFRESH_EXPIRES_KEY = "kronos_refresh_expires_at";

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

    storage.getItem(TOKEN_KEY);

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

export function getTokenExpiresAt(token = readStored(TOKEN_KEY)) {
  if (!token) return null;

  const payload = decodeTokenPayload(token);

  if (payload && typeof payload.exp === "number") {
    return new Date(payload.exp * 1000);
  }

  const stored = readStored(EXPIRES_KEY);
  const date = stored ? new Date(stored) : null;

  return date && !Number.isNaN(date.getTime()) ? date : null;
}

export function isTokenExpired(token = readStored(TOKEN_KEY)) {
  const expiresAt = getTokenExpiresAt(token);

  if (!expiresAt) return false;

  return expiresAt.getTime() <= Date.now();
}

// ---------------------------------------------------------------
// Contrato existente (sin cambios de comportamiento)
// ---------------------------------------------------------------

export function getToken() { return localStorage.getItem(TOKEN_KEY) || sessionStorage.getItem(TOKEN_KEY) || ""; }
export function getUser() { try { const raw = localStorage.getItem(USER_KEY) || sessionStorage.getItem(USER_KEY); return raw ? JSON.parse(raw) : null; } catch { clearSession(); return null; } }
export function saveSession(
  token,
  user,
  remember = true,
  expiresAt = "",
  refresh = null
) {
  clearSession();

  const storage = remember ? localStorage : sessionStorage;

  storage.setItem(TOKEN_KEY, token);
  storage.setItem(USER_KEY, JSON.stringify(user));
  storage.setItem(REMEMBER_KEY, String(Boolean(remember)));

  const resolved = expiresAt
    ? new Date(expiresAt)
    : getTokenExpiresAt(token);

  if (resolved && !Number.isNaN(resolved.getTime())) {
    storage.setItem(EXPIRES_KEY, resolved.toISOString());
  }

  // KRONOS-UI-007 — refresh token con rotación. Es un dato de sesión
  // más: se guarda y se borra con ella, nunca se registra en consola.
  const refreshToken =
    typeof refresh === "string"
      ? refresh
      : refresh && typeof refresh.token === "string"
        ? refresh.token
        : "";

  if (refreshToken) {
    storage.setItem(REFRESH_KEY, refreshToken);

    const refreshExpiresAt =
      refresh && typeof refresh === "object" && refresh.expiresAt
        ? new Date(refresh.expiresAt)
        : null;

    if (refreshExpiresAt && !Number.isNaN(refreshExpiresAt.getTime())) {
      storage.setItem(REFRESH_EXPIRES_KEY, refreshExpiresAt.toISOString());
    }
  }

  return getSession();
}
export function clearSession(reason = SESSION_CLEAR_REASONS.manual) {
  for (const storage of [
    getStorage("local"),
    getStorage("session")
  ]) {
    if (!storage) continue;

    storage.removeItem(TOKEN_KEY);
    storage.removeItem(USER_KEY);
    storage.removeItem(EXPIRES_KEY);
    storage.removeItem(REMEMBER_KEY);
    storage.removeItem(REFRESH_KEY);
    storage.removeItem(REFRESH_EXPIRES_KEY);
  }

  emit({ type: "cleared", reason, session: null });
}

// ---------------------------------------------------------------
// Añadidos para el manejo real de la sesión (KRONOS-AUDIT-002)
// ---------------------------------------------------------------

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

  return { token: readStored(TOKEN_KEY) || "", user };
}

export function hasSession() {
  return Boolean(getToken());
}

/** Refresh token vigente, si existe (KRONOS-UI-007). */
export function getRefreshToken() {
  return readStored(REFRESH_KEY) || "";
}

export function getRefreshTokenExpiresAt() {
  const stored = readStored(REFRESH_EXPIRES_KEY);
  const date = stored ? new Date(stored) : null;

  return date && !Number.isNaN(date.getTime()) ? date : null;
}

export function hasRefreshToken() {
  const token = getRefreshToken();

  if (!token) return false;

  const expiresAt = getRefreshTokenExpiresAt();

  return !expiresAt || expiresAt.getTime() > Date.now();
}

/**
 * Guarda el par renovado conservando el resto de la sesión (usuario y
 * preferencia de "recordar"). No emite `cleared`: la sesión sigue viva.
 */
export function updateTokens(token, refreshToken = "", expiresAt = "") {
  if (!token) return null;

  // Se escribe en el mismo storage que ya tiene la sesión (recordar o no
  // recordar), para no partir la sesión en dos lugares.
  const storage = [getStorage("local"), getStorage("session")].find(
    (candidate) => candidate && candidate.getItem(TOKEN_KEY)
  );

  if (!storage) return null;

  storage.setItem(TOKEN_KEY, token);

  const resolved = expiresAt ? new Date(expiresAt) : getTokenExpiresAt(token);

  if (resolved && !Number.isNaN(resolved.getTime())) {
    storage.setItem(EXPIRES_KEY, resolved.toISOString());
  }

  if (refreshToken) {
    storage.setItem(
      REFRESH_KEY,
      typeof refreshToken === "string" ? refreshToken : refreshToken.token || ""
    );
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
    remember: readStored(REMEMBER_KEY) === "true",
    refreshToken: getRefreshToken(),
    refreshExpiresAt: (() => {
      const date = getRefreshTokenExpiresAt();

      return date ? date.toISOString() : null;
    })()
  };
}

/** Refresca los datos del usuario conservando el token. */
export function updateUser(user) {
  if (!user || typeof user !== "object") return null;

  for (const storage of [
    getStorage("local"),
    getStorage("session")
  ]) {
    if (storage && storage.getItem(TOKEN_KEY)) {
      storage.setItem(USER_KEY, JSON.stringify(user));
    }
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
