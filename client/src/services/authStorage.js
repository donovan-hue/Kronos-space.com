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
// Generación local de sesión: logout y saveSession (que limpia primero)
// invalidan trabajo asíncrono previo. Rotar tokens no cambia la identidad.
let sessionRevision = 0;
export function getSessionRevision() { return sessionRevision; }

export const SESSION_CLEAR_REASONS = {
  manual: "manual",
  logout: "logout",
  expired: "expired",
  invalid: "invalid",
  unauthorized: "unauthorized"
};

// Invalidación defensiva por instancia de Storage, no una sesión en memoria.
// Si el navegador impide borrar, no volvemos a usar esos datos en esta carga
// y `dropKey` neutraliza además la clave en el almacén (sobrescritura vacía)
// cuando la escritura sí está permitida, para que la sesión no reaparezca al
// recargar. Si el navegador bloquea también la escritura, no hay forma de
// borrar nada desde aquí: la revocación del backend sigue siendo necesaria
// para invalidar credenciales que el navegador retenga.
const invalidatedStorages = new WeakSet();
const SESSION_KEYS = [TOKEN_KEY, USER_KEY, EXPIRES_KEY, REMEMBER_KEY, REFRESH_KEY, REFRESH_EXPIRES_KEY];

function getStorage(kind) {
  try {
    return (kind === "session" ? globalThis.sessionStorage : globalThis.localStorage) || null;
  } catch {
    return null;
  }
}

function readItem(storage, key) {
  if (!storage || invalidatedStorages.has(storage)) return null;
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
}

function readStored(key) {
  return readItem(getStorage("local"), key) || readItem(getStorage("session"), key);
}

/**
 * Lectura cruda para verificar lo que el navegador aceptó guardar: no
 * consulta la lista de storages invalidados (esa lista protege las lecturas
 * de la sesión). `readable: false` distingue "no se pudo leer" de "está
 * vacío", que son cosas distintas al decidir si un borrado funcionó.
 */
function tryReadItem(storage, key) {
  try {
    return { readable: true, value: storage.getItem(key) };
  } catch {
    return { readable: false, value: null };
  }
}

/**
 * KRONOS-AUDIT-002 (almacenamiento bloqueado) — deja una clave sin valor
 * utilizable aunque el navegador no permita borrar.
 *
 * `removeItem` puede lanzar (SecurityError con el almacenamiento bloqueado)
 * o aceptarse sin efecto en algunos modos privados. Si tras el borrado la
 * clave conserva valor, se sobrescribe con cadena vacía: todos los lectores
 * de este módulo tratan "" como ausencia (`readStored` combina con `||`,
 * `getUser` no analiza cadenas vacías), así que la sesión no revive al
 * recargar y no queda un token utilizable en el navegador.
 *
 * Devuelve true solo cuando quedó confirmada vacía o ausente; false si el
 * navegador tampoco permitió escribir, para no anunciar éxito sin prueba.
 */
function dropKey(storage, key) {
  if (!storage) return true;

  let removalFailed = false;
  try {
    storage.removeItem(key);
  } catch {
    removalFailed = true;
  }

  const afterRemoval = tryReadItem(storage, key);
  if (afterRemoval.readable && !afterRemoval.value) return true;
  // El navegador aceptó el borrado y no se puede leer para confirmarlo.
  if (!afterRemoval.readable && !removalFailed) return true;

  try {
    storage.setItem(key, "");
  } catch {
    return false;
  }

  const afterOverwrite = tryReadItem(storage, key);
  return afterOverwrite.readable ? !afterOverwrite.value : false;
}

function storageError(cause) {
  const error = new Error("No se pudo guardar la sesión en este navegador. Revisa los permisos de almacenamiento.", { cause });
  error.code = "SESSION_STORAGE_UNAVAILABLE";
  return error;
}

function clearStorage(storage) {
  if (!storage) return;
  invalidatedStorages.add(storage);
  for (const key of SESSION_KEYS) {
    // Seguir con las demás claves y el otro storage; nunca conservar una
    // sesión utilizable en esta carga por un error de limpieza. Si el
    // borrado está bloqueado, dropKey la deja sin valor utilizable.
    dropKey(storage, key);
  }
}

function activeStorage() {
  return [getStorage("local"), getStorage("session")].find(storage => readItem(storage, TOKEN_KEY));
}

function writeSessionFields(storage, fields) {
  try {
    if (!storage) throw new Error("Storage unavailable");
    for (const [key, value] of Object.entries(fields)) {
      if (value === null) {
        // Campo "sin valor" (p. ej. refresh token ausente). Con el borrado
        // bloqueado no se aborta un guardado que sí puede completarse: la
        // clave se neutraliza con dropKey y esa es su verificación.
        if (!dropKey(storage, key)) throw new Error("Storage delete not persisted");
        continue;
      }
      storage.setItem(key, value);
    }
    // No anunciar éxito si no se puede recuperar lo persistido.
    for (const [key, value] of Object.entries(fields)) {
      if (value === null) continue;
      if (storage.getItem(key) !== value) throw new Error("Storage write not persisted");
    }
    invalidatedStorages.delete(storage);
  } catch (cause) {
    clearSession(SESSION_CLEAR_REASONS.invalid);
    throw storageError(cause);
  }
}

function isoDate(value) {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? date.toISOString() : null;
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

export function getToken() { return readStored(TOKEN_KEY) || ""; }

/**
 * Usuario persistido, o null si el almacén no es legible o su contenido no
 * es un usuario. Un valor válido en JSON pero que no es un objeto (cadena,
 * número, booleano) es un estado corrupto —no una identidad— y se trata
 * igual que el JSON ilegible: se cierra la sesión para no dejar datos a
 * medias. `peekSession` aplica la misma comprobación sin efectos.
 */
export function getUser() {
  try {
    const raw = readStored(USER_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    if (parsed === null) return null;
    if (typeof parsed !== "object" || Array.isArray(parsed)) {
      clearSession();
      return null;
    }
    return parsed;
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
  // Serializar antes de tocar la sesión anterior; no persistir un par a medias.
  const userValue = JSON.stringify(user);
  const refreshToken = typeof refresh === "string" ? refresh : refresh?.token || "";
  const refreshExpiresAt = refresh && typeof refresh === "object"
    ? refresh.refreshExpiresAt || refresh.expiresAt
    : "";
  const resolved = expiresAt ? isoDate(expiresAt) : isoDate(getTokenExpiresAt(token));

  clearSession();
  // Respetar recordar/no recordar. No cambiar de storage silenciosamente ni
  // usar un fallback en memoria cuando la persistencia real no esté disponible.
  writeSessionFields(getStorage(remember ? "local" : "session"), {
    [TOKEN_KEY]: token,
    [USER_KEY]: userValue,
    [REMEMBER_KEY]: String(Boolean(remember)),
    [EXPIRES_KEY]: resolved,
    [REFRESH_KEY]: refreshToken || null,
    [REFRESH_EXPIRES_KEY]: refreshToken ? isoDate(refreshExpiresAt) : null
  });
  return getSession();
}
export function clearSession(reason = SESSION_CLEAR_REASONS.manual) {
  sessionRevision += 1;
  clearStorage(getStorage("local"));
  clearStorage(getStorage("session"));
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
export function updateTokens(token, refreshToken = "", expiresAt = "", refreshExpiresAt = "") {
  if (!token) return null;
  const storage = activeStorage();
  if (!storage) return null;

  const fields = {
    [TOKEN_KEY]: token,
    [EXPIRES_KEY]: expiresAt ? isoDate(expiresAt) : isoDate(getTokenExpiresAt(token))
  };
  if (refreshToken) {
    const value = typeof refreshToken === "string" ? refreshToken : refreshToken.token || "";
    fields[REFRESH_KEY] = value || null;
    fields[REFRESH_EXPIRES_KEY] = isoDate(refreshExpiresAt || refreshToken.refreshExpiresAt || refreshToken.expiresAt);
  }
  writeSessionFields(storage, fields);
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
  const storage = activeStorage();
  if (!storage) return null;
  try {
    const value = JSON.stringify(user);
    storage.setItem(USER_KEY, value);
    if (storage.getItem(USER_KEY) !== value) throw new Error("Storage write not persisted");
  } catch (cause) {
    throw storageError(cause);
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
