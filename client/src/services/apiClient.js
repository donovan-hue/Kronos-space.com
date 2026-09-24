import axios from "axios";
import {
  clearSession,
  getRefreshToken,
  getSessionRevision,
  getToken,
  isTokenExpired,
  SESSION_CLEAR_REASONS,
  updateTokens
} from "./authStorage";
import { currentHostname, resolveApiUrl } from "./apiUrl";

// En desarrollo se usa /api relativo (proxy de vite.config.js). En los hosts
// estáticos de producción el /api relativo devuelve 405 en los POST, así que
// sin VITE_API_URL el cliente apunta al host real de la API. Nunca a
// localhost, que solo existe en la máquina de quien programa.
export const API_URL = resolveApiUrl({
  configured: import.meta.env.VITE_API_URL,
  hostname: currentHostname()
});
export const api = axios.create({ baseURL: API_URL, timeout: 15000, headers: { "Content-Type": "application/json" } });

// ---------------------------------------------------------------
// KRONOS-UI-007 — renovación automática de sesión
//
// 1. Antes de salir: si el access token ya expiró y existe refresh,
//    se renueva y la petición sale con el token nuevo.
// 2. Si el servidor responde 401, se intenta una sola renovación y se
//    reintenta la petición original. Una única renovación por sesión evita
//    que varias peticiones simultáneas roten el refresh a la vez (lo
//    que el backend interpretaría como reutilización y cerraría la
//    familia completa).
// 3. Solo un refresh rechazado con 401 invalida la sesión. Un fallo de
//    transporte/servidor se propaga sin borrar credenciales ni enviar la
//    operación con un token que no se pudo renovar.
// ---------------------------------------------------------------

const AUTH_ENDPOINTS_WITHOUT_RETRY = [
  "/auth/login",
  "/auth/register",
  "/auth/google",
  "/auth/refresh",
  "/auth/forgot-password",
  "/auth/reset-password"
];

let refreshFlight = null;
const sessionListeners = new Set();

/** Notifica cambios de sesión (renovada o cerrada) sin exponer tokens. */
export function subscribeToApiSession(listener) {
  if (typeof listener !== "function") return () => {};

  sessionListeners.add(listener);

  return () => sessionListeners.delete(listener);
}

function emit(event) {
  for (const listener of sessionListeners) {
    try {
      listener(event);
    } catch (error) {
      console.error("API_SESSION_LISTENER_ERROR:", error);
    }
  }
}

function urlOf(config = {}) {
  return `${config.url || ""}`;
}

function shouldAttemptRefresh(config = {}) {
  const url = urlOf(config);

  return !AUTH_ENDPOINTS_WITHOUT_RETRY.some((endpoint) => url.includes(endpoint));
}

async function refreshSession() {
  const refreshToken = getRefreshToken();
  const revision = getSessionRevision();
  if (!refreshToken) return null;

  if (refreshFlight?.revision === revision && refreshFlight.token === refreshToken) {
    return refreshFlight.promise;
  }

  const flight = { revision, token: refreshToken, promise: null };
  flight.promise = axios.post(
    `${API_URL}/auth/refresh`,
    { refreshToken },
    { timeout: 15000, headers: { "Content-Type": "application/json" } }
  )
    .then(({ data }) => {
      if (!data?.token) throw new Error("REFRESH_INVALID_RESPONSE");
      if (getSessionRevision() !== revision || getRefreshToken() !== refreshToken) return null;
      const persisted = updateTokens(data.token, data.refreshToken, data.expiresAt, data.refreshExpiresAt);
      if (!persisted) return null;
      emit({ type: "refreshed", expiresAt: data.expiresAt || null });
      return data;
    })
    .catch((error) => {
      if (error.code === "SESSION_STORAGE_UNAVAILABLE" && !getToken()) {
        // authStorage invalidó el par parcial; no notificar cierre de una
        // cuenta que haya iniciado sesión desde entonces.
        emit({ type: "cleared", reason: SESSION_CLEAR_REASONS.invalid });
        return null;
      } else if (error.response?.status === 401 && getSessionRevision() === revision && getRefreshToken() === refreshToken) {
        clearSession(SESSION_CLEAR_REASONS.expired);
        emit({ type: "cleared", reason: SESSION_CLEAR_REASONS.expired });
        return null;
      }
      if (getSessionRevision() !== revision || getRefreshToken() !== refreshToken) return null;
      // No confundir indisponibilidad o respuesta inválida con revocación.
      throw error;
    })
    .finally(() => {
      // La renovación vieja no debe retirar la nueva al terminar.
      if (refreshFlight === flight) refreshFlight = null;
    });
  refreshFlight = flight;
  return flight.promise;
}

function belongsToCurrentSession(config) {
  return config?.__kronosSessionRevision === getSessionRevision();
}

function sessionChanged(config) {
  // Cancelación local, no una respuesta exitosa vacía ni un logout de la
  // cuenta nueva. No implica que el backend haya revertido una operación.
  return new axios.CanceledError("La sesión de esta solicitud cambió.", config);
}

// Asociar fallos del transporte de refresh a la operación que los esperaba.
// No mutar el error compartido: puede haber varias solicitudes en espera.
async function refreshForRequest(config) {
  try {
    return await refreshSession();
  } catch (error) {
    if (!belongsToCurrentSession(config)) throw sessionChanged(config);
    throw axios.AxiosError.from(error, error.code, config);
  }
}

/** Renueva o devuelve null si terminó/cambió la sesión; otros fallos rechazan. */
export async function renewSession() {
  if (!getRefreshToken()) return null;

  return refreshSession();
}

api.interceptors.request.use(async (config) => {
  if (config.__kronosSessionRevision === undefined) {
    config.__kronosSessionRevision = getSessionRevision();
  }
  if (!belongsToCurrentSession(config)) throw sessionChanged(config);

  if (shouldAttemptRefresh(config) && (!getToken() || isTokenExpired())) {
    await refreshForRequest(config);
    if (!belongsToCurrentSession(config)) throw sessionChanged(config);
  }

  const token = getToken();
  // Capturar el token realmente enviado, no el que exista al recibir el 401.
  config.__kronosSentToken = token;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  else delete config.headers.Authorization;
  return config;
});

api.interceptors.response.use(
  (response) => {
    if (!belongsToCurrentSession(response.config)) throw sessionChanged(response.config);
    return response;
  },
  async (error) => {
    const status = error.response?.status;
    const config = error.config;
    if (config && !belongsToCurrentSession(config)) return Promise.reject(sessionChanged(config));
    if (!config || status !== 401) return Promise.reject(error);

    if (!config.__kronosRetried && shouldAttemptRefresh(config)) {
      // Otra petición de ESTA sesión puede haber renovado el access token
      // mientras llegaba el 401. Reutilizarlo sin volver a rotar refresh.
      const currentToken = getToken();
      let retryToken = currentToken && currentToken !== config.__kronosSentToken && !isTokenExpired()
        ? currentToken
        : "";
      if (!retryToken) {
        const refreshed = await refreshForRequest(config);
        if (!belongsToCurrentSession(config)) return Promise.reject(sessionChanged(config));
        retryToken = refreshed?.token || "";
      }
      if (retryToken) {
        config.__kronosRetried = true;
        return api.request(config);
      }
    }

    // Solo el rechazo irrecuperable de una solicitud de la sesión actual
    // puede cerrarla; nunca el 401 tardío de otra cuenta.
    clearSession(SESSION_CLEAR_REASONS.unauthorized);
    emit({ type: "cleared", reason: SESSION_CLEAR_REASONS.unauthorized });
    return Promise.reject(error);
  }
);
