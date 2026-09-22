import axios from "axios";
import {
  clearSession,
  getToken,
  hasSessionHint,
  isSessionRemembered,
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
// A-1: `withCredentials` para que el navegador adjunte la cookie httpOnly
// del refresh en /api/auth/* (misma eTLD+1 en producción; mismo origen
// vía proxy de Vite en desarrollo).
export const api = axios.create({ baseURL: API_URL, timeout: 15000, headers: { "Content-Type": "application/json" }, withCredentials: true });
api.interceptors.request.use((config) => { const token = getToken(); if (token) config.headers.Authorization = `Bearer ${token}`; return config; });

// ---------------------------------------------------------------
// KRONOS-UI-007 — renovación automática de sesión
//
// 1. Antes de salir: si el access token ya expiró y existe refresh,
//    se renueva y la petición sale con el token nuevo.
// 2. Si el servidor responde 401, se intenta una sola renovación y se
//    reintenta la petición original. Un único `refreshPromise` evita
//    que varias peticiones simultáneas roten el refresh a la vez (lo
//    que el backend interpretaría como reutilización y cerraría la
//    familia completa).
// 3. Si la renovación falla, la sesión se limpia como antes y el error
//    se propaga para que la UI muestre el estado real.
// ---------------------------------------------------------------

const AUTH_ENDPOINTS_WITHOUT_RETRY = [
  "/auth/login",
  "/auth/register",
  "/auth/google",
  "/auth/refresh",
  "/auth/forgot-password",
  "/auth/reset-password"
];

let refreshPromise = null;
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
  // Sin hint no hubo sesión aquí: no se gasta un refresh inútil (y los
  // visitantes anónimos no generan un POST en cada arranque en frío).
  if (!getToken() && !hasSessionHint()) return null;

  if (!refreshPromise) {
    refreshPromise = axios
      .post(
        `${API_URL}/auth/refresh`,
        // La cookie la adjunta el navegador; `remember` solo indica la
        // longevidad deseada (persistente o de sesión).
        { remember: isSessionRemembered() },
        { timeout: 15000, headers: { "Content-Type": "application/json" }, withCredentials: true }
      )
      .then(({ data }) => {
        if (!data?.token) throw new Error("REFRESH_INVALID_RESPONSE");

        updateTokens(data.token, {
          expiresAt: data.expiresAt || "",
          refreshExpiresAt: data.refreshExpiresAt || ""
        });
        emit({ type: "refreshed", expiresAt: data.expiresAt || null });

        return data;
      })
      .catch((error) => {
        if (error.response?.status === 401) {
          clearSession(SESSION_CLEAR_REASONS.expired);
          emit({ type: "cleared", reason: SESSION_CLEAR_REASONS.expired });
        }

        return null;
      })
      .finally(() => {
        refreshPromise = null;
      });
  }

  return refreshPromise;
}

/** Renueva vía cookie httpOnly; usado por App antes de rutas. */
export async function renewSession() {
  if (!getToken() && !hasSessionHint()) return null;

  return refreshSession();
}

api.interceptors.request.use(async (config) => {
  if (!shouldAttemptRefresh(config)) return config;

  if (getToken() && !isTokenExpired()) return config;

  const refreshed = await refreshSession();

  if (refreshed?.token) {
    config.headers.Authorization = `Bearer ${refreshed.token}`;
  }

  return config;
});

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const status = error.response?.status;
    const config = error.config || {};

    if (
      status === 401 &&
      !config.__kronosRetried &&
      shouldAttemptRefresh(config)
    ) {
      const refreshed = await refreshSession();

      if (refreshed?.token) {
        config.__kronosRetried = true;
        config.headers = { ...(config.headers || {}), Authorization: `Bearer ${refreshed.token}` };

        return api.request(config);
      }
    }

    if (status === 401) {
      clearSession(SESSION_CLEAR_REASONS.unauthorized);
      emit({ type: "cleared", reason: SESSION_CLEAR_REASONS.unauthorized });
    }

    return Promise.reject(error);
  }
);
