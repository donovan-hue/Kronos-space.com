import { io } from "socket.io-client";
import { API_URL } from "./apiClient";

const SOCKET_URL = API_URL.replace(/\/api\/?$/, "");

let socket = null;
let connectedToken = "";
const authErrorListeners = new Set();

/**
 * Suscripción a errores de autenticación del socket (token inválido,
 * expirado o revocado). El reintento infinito ante AUTH_* se corta aquí:
 * reintentar para siempre con un token muerto solo drena batería y carga
 * al backend; App decide si renueva la sesión o cierra.
 */
export function onSocketAuthError(listener) {
  if (typeof listener !== "function") return () => {};
  authErrorListeners.add(listener);
  return () => authErrorListeners.delete(listener);
}

function notifyAuthError(error) {
  for (const listener of authErrorListeners) {
    try {
      listener(error);
    } catch (listenerError) {
      console.error("SOCKET_AUTH_LISTENER_ERROR:", listenerError);
    }
  }
}

function isAuthError(error) {
  return Boolean(error && /^AUTH_/i.test(String(error.message || "")));
}

export function connectSocket(token) {
  if (!token) return null;
  if (socket && connectedToken === token) return socket;
  if (socket) socket.disconnect();

  connectedToken = token;
  socket = io(SOCKET_URL, {
    auth: { token },
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 15_000
  });

  socket.on("connect_error", (error) => {
    if (!isAuthError(error)) return;
    // Token muerto: parar la reconexión y escalar a la app (una vez).
    try {
      socket?.disconnect();
    } catch {
      // Desconectar nunca debe romper el flujo de sesión.
    }
    notifyAuthError(error);
  });

  return socket;
}

/**
 * Re-autentica el socket tras renovar el access token. Sin esto, el socket
 * seguía usando el token viejo hasta recargar la página.
 */
export function updateSocketToken(token) {
  if (!token) return null;
  if (socket && connectedToken === token) {
    if (!socket.connected) {
      try {
        socket.auth = { token };
        socket.connect();
      } catch {
        return connectSocket(token);
      }
    }
    return socket;
  }
  return connectSocket(token);
}

export function getSocket() {
  return socket;
}

export function disconnectSocket() {
  if (socket) {
    try {
      socket.removeAllListeners("connect_error");
      socket.disconnect();
    } catch {
      // Desconectar es best-effort.
    }
  }
  socket = null;
  connectedToken = "";
}
