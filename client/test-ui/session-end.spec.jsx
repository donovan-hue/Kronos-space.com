import { afterEach, beforeEach, expect, test, vi } from "vitest";
import axios from "axios";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import App from "../src/App";
import { api } from "../src/services/apiClient";
import { getSession, saveSession } from "../src/services/authStorage";
import { disconnectSocket } from "../src/services/socket";

/**
 * KRONOS-PROD-001 — fin de sesión decidido por la capa de API.
 *
 * Se ejecutan los módulos reales: los interceptores de `services/apiClient.js`
 * (renovación con refresh y limpieza ante un 401 irrecuperable), el
 * almacenamiento de sesión y el router de `App`. Lo único que se sustituye es
 * el transporte HTTP (el adaptador de axios), porque jsdom no tiene un
 * servidor al que hablar; la lógica que se audita es la del cliente.
 *
 * Socket.IO también se sustituye: en jsdom no hay handshake posible y lo que
 * se comprueba aquí es que la interfaz lo desconecta al cerrar la sesión.
 */

vi.mock("../src/services/socket", () => ({
  connectSocket: vi.fn(),
  disconnectSocket: vi.fn(),
  getSocket: vi.fn()
}));

const me = {
  _id: "user1",
  id: "user1",
  username: "example",
  displayName: "Example",
  bio: "",
  avatar: ""
};

const jwt = (expiresInSeconds) =>
  `e30.${btoa(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + expiresInSeconds }))}.firma-de-prueba`;

/**
 * Instala un transporte HTTP programable. `handler(url, config)` devuelve el
 * estado y el cuerpo; los 4xx/5xx se rechazan con la misma forma de error que
 * produce axios (`error.response.status`, `error.config`), que es lo que
 * consumen los interceptores.
 */
function stubTransport(handler) {
  const originalInstanceAdapter = api.defaults.adapter;
  const originalGlobalAdapter = axios.defaults.adapter;

  const adapter = async (config) => {
    const { status, data } = handler(config.url || "", config);
    const response = { data, status, statusText: "", headers: {}, config };

    if (status >= 400) {
      const error = new Error(`Request failed with status code ${status}`);
      error.isAxiosError = true;
      error.config = config;
      error.response = response;
      throw error;
    }

    return response;
  };

  // apiClient renueva el refresh con el axios GLOBAL (`axios.post`), así que
  // el transporte hay que sustituirlo en los dos sitios para que la prueba
  // recorra la cadena real completa.
  api.defaults.adapter = adapter;
  axios.defaults.adapter = adapter;

  return () => {
    api.defaults.adapter = originalInstanceAdapter;
    axios.defaults.adapter = originalGlobalAdapter;
  };
}

let restoreTransport = () => {};

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  window.history.replaceState(null, "", "/home");
});

afterEach(() => {
  restoreTransport();
  restoreTransport = () => {};
  cleanup();
  vi.clearAllMocks();
});

function mountApp() {
  return render(<App />);
}

test("un 401 irrecuperable durante la navegación cierra la sesión y vuelve a /login", async () => {
  saveSession(jwt(3600), me, false); // sin refresh token: la renovación es imposible

  let feedFails = false;
  let notificationsCalls = 0;

  restoreTransport = stubTransport((url) => {
    if (url.includes("/auth/me")) return { status: 200, data: { user: me } };
    if (url.includes("/notifications")) {
      notificationsCalls += 1;
      return feedFails
        ? { status: 401, data: { error: "Token inválido", code: "TOKEN_INVALID" } }
        : { status: 200, data: { notifications: [], unreadCount: 0 } };
    }
    if (url.includes("/flags")) return { status: 200, data: { flags: {} } };
    return { status: 200, data: { posts: [], hasMore: false, total: 0, notifications: [], unreadCount: 0 } };
  });

  const { container } = mountApp();

  // La sesión hidrata y el usuario entra a la zona protegida.
  await waitFor(() => expect(window.location.pathname).toBe("/home"));

  // Ahora el servidor deja de aceptar el token (revocado o expirado) y el
  // usuario navega: es el caso real que dejaba la interfaz colgada.
  feedFails = true;

  const notificationsLink = container.querySelector('a[href="/notifications"]');
  expect(notificationsLink).toBeTruthy();

  fireEvent.click(notificationsLink);

  await waitFor(
    () => {
      expect(window.location.pathname).toBe("/login");
    },
    { timeout: 4000 }
  );

  await waitFor(() => expect(screen.getByText(/Tu sesión terminó/i)).toBeTruthy());

  expect(getSession()).toBeNull();
  expect(notificationsCalls).toBeGreaterThan(0);
  expect(disconnectSocket).toHaveBeenCalled();
});

test("un 401 recuperable renueva el refresh y NO cierra la sesión", async () => {
  saveSession(jwt(3600), me, false, "", {
    token: "krt_refresh-de-prueba",
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
  });

  let notificationsCalls = 0;
  const renewedJwt = jwt(7200);

  restoreTransport = stubTransport((url) => {
    if (url.includes("/auth/me")) return { status: 200, data: { user: me } };
    if (url.includes("/auth/refresh")) {
      return {
        status: 200,
        data: {
          token: renewedJwt,
          refreshToken: "krt_refresh-rotado",
          expiresAt: new Date(Date.now() + 7200 * 1000).toISOString()
        }
      };
    }
    if (url.includes("/notifications")) {
      notificationsCalls += 1;
      // El primer intento se rechaza; el reintento con el token nuevo pasa.
      return notificationsCalls === 1
        ? { status: 401, data: { error: "Token expirado", code: "TOKEN_EXPIRED" } }
        : { status: 200, data: { notifications: [], unreadCount: 0 } };
    }
    if (url.includes("/flags")) return { status: 200, data: { flags: {} } };
    return { status: 200, data: { posts: [], hasMore: false, total: 0, notifications: [], unreadCount: 0 } };
  });

  const { container } = mountApp();

  await waitFor(() => expect(window.location.pathname).toBe("/home"));

  const notificationsLink = container.querySelector('a[href="/notifications"]');
  expect(notificationsLink).toBeTruthy();

  fireEvent.click(notificationsLink);

  await waitFor(() => expect(notificationsCalls).toBeGreaterThan(1), { timeout: 4000 });

  // La sesión sigue viva y con el par renovado: no hay logout ni aviso.
  expect(window.location.pathname).not.toBe("/login");
  expect(screen.queryByText(/Tu sesión terminó/i)).toBeNull();
  expect(getSession()?.token).toBe(renewedJwt);
});
