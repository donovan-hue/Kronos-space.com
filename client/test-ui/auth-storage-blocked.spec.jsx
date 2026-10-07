import { afterEach, beforeEach, expect, test, vi } from "vitest";
import axios from "axios";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import App from "../src/App";
import { api } from "../src/services/apiClient";
import {
  clearSession,
  getRefreshToken,
  getSession,
  getToken,
  getUser,
  saveSession
} from "../src/services/authStorage";

/**
 * KRONOS-AUDIT-002 (almacenamiento bloqueado) — la aplicación no se rompe
 * cuando el navegador deniega el acceso al almacén de la sesión.
 *
 * Se ejecutan los módulos reales (authStorage, apiClient con sus
 * interceptores, App y su router). Lo único sustituido es el transporte HTTP
 * —jsdom no tiene servidor— y Socket.IO, que en jsdom no puede completar el
 * handshake. Los fallos de almacenamiento se inyectan con la misma forma que
 * usa el navegador: DOMException SecurityError al leer y QuotaExceededError
 * al escribir.
 */

vi.mock("../src/services/socket", () => ({
  connectSocket: vi.fn(),
  disconnectSocket: vi.fn(),
  getSocket: vi.fn()
}));

vi.mock("../src/services/usersService", () => ({
  updatePreferences: vi.fn(),
  searchUsers: vi.fn(),
  toggleFollow: vi.fn(),
  // El servicio real es `async function getMe()`: SIEMPRE devuelve una promesa.
  // Un `vi.fn()` pelado devolvía undefined y provocaba una excepción no
  // capturada al montar el feed (`undefined.then`), que vitest marcaba como
  // fallo del run. Un doble que no respeta el contrato del servicio no vale.
  getMe: vi.fn(async () => ({ _id: "owner", preferences: { feed: { interests: [] } } }))
}));

vi.mock("../src/services/orbitsService", () => ({
  getOrbits: vi.fn(),
  joinOrbit: vi.fn()
}));

import { updatePreferences, searchUsers } from "../src/services/usersService";
import { getOrbits } from "../src/services/orbitsService";

const me = {
  _id: "user1",
  id: "user1",
  username: "example",
  email: "example@kronos.space",
  emailVerified: true,
  displayName: "Example",
  avatar: "",
  cover: "",
  bio: "",
  role: "user"
};

const jwt = (expiresInSeconds) =>
  `e30.${btoa(JSON.stringify({ id: "user1", exp: Math.floor(Date.now() / 1000) + expiresInSeconds }))}.firma-de-prueba`;

const securityError = () => new DOMException("Access is denied for this document.", "SecurityError");
const quotaError = () => new DOMException("The quota has been exceeded.", "QuotaExceededError");

/** Bloquea el acceso a un almacén entero, como hace el navegador al denegarlo. */
function blockAccess(storageName) {
  Object.defineProperty(window, storageName, {
    configurable: true,
    get() { throw securityError(); }
  });
}

function restoreAccess(storageName, storage) {
  Object.defineProperty(window, storageName, { configurable: true, writable: true, value: storage });
}

const realLocalStorage = window.localStorage;
const realSessionStorage = window.sessionStorage;
const realSetItem = Storage.prototype.setItem;
const realRemoveItem = Storage.prototype.removeItem;

/** Bloquea solo el borrado, dejando leer y escribir (política del navegador). */
function blockRemoval() {
  Storage.prototype.removeItem = () => { throw securityError(); };
}

/** Bloquea toda la escritura (cuota agotada / modo privado). */
function blockWrites() {
  Storage.prototype.setItem = () => { throw quotaError(); };
}

/** Valor físico de una clave, sin la invalidación defensiva del módulo. */
const rawItem = (store, key) => {
  try { return store.getItem(key); } catch { return "BLOQUEADO"; }
};

/**
 * Transporte HTTP programable. `handler(url, config, intento)` devuelve
 * `{ status, data }`; los 4xx se rechazan con la forma de axios que consumen
 * los interceptores.
 */
function stubTransport(handler) {
  const originalInstanceAdapter = api.defaults.adapter;
  const originalGlobalAdapter = axios.defaults.adapter;
  const calls = [];

  const adapter = async (config) => {
    const url = `${config.url || ""}`;
    calls.push(url);
    const { status, data } = handler(url, config, calls.length);
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

  api.defaults.adapter = adapter;
  axios.defaults.adapter = adapter;

  return {
    calls,
    restore() {
      api.defaults.adapter = originalInstanceAdapter;
      axios.defaults.adapter = originalGlobalAdapter;
    }
  };
}

let transport = { calls: [], restore() {} };

/** Respuestas por defecto: la app monta el feed en cuanto entra a /home. */
function defaultHandler(overrides = {}) {
  return (url) => {
    for (const [fragment, response] of Object.entries(overrides)) {
      if (url.includes(fragment)) return response;
    }
    if (url.includes("/auth/google/config")) return { status: 200, data: { enabled: false } };
    if (url.includes("/auth/me")) return { status: 200, data: { user: me } };
    if (url.includes("/auth/login")) {
      return {
        status: 200,
        data: {
          token: jwt(3600),
          expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
          refreshToken: "refresh-inicial",
          refreshExpiresAt: new Date(Date.now() + 86_400_000).toISOString(),
          user: me
        }
      };
    }
    return {
      status: 200,
      data: { user: me, posts: [], flags: {}, stories: [], circles: [], orbits: [], items: [], users: [], sessions: [], notifications: [], unreadCount: 0 }
    };
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  sessionStorage.clear();
  window.history.replaceState(null, "", "/home");
  updatePreferences.mockResolvedValue({});
  searchUsers.mockResolvedValue({ users: [] });
  getOrbits.mockResolvedValue([]);
  if (typeof window !== "undefined") localStorage.clear();
});

afterEach(() => {
  transport.restore();
  Storage.prototype.setItem = realSetItem;
  Storage.prototype.removeItem = realRemoveItem;
  restoreAccess("localStorage", realLocalStorage);
  restoreAccess("sessionStorage", realSessionStorage);
  cleanup();
  clearSession();
});

// ---------------------------------------------------------------
// Sesión inexistente / almacenamiento denegado
// ---------------------------------------------------------------

test("sin sesión y con los dos almacenes denegados, la app abre el login sin romperse", async () => {
  transport = stubTransport(defaultHandler());
  blockAccess("localStorage");
  blockAccess("sessionStorage");

  render(<App />);

  await waitFor(() => expect(window.location.pathname).toBe("/login"));
  expect(await screen.findByRole("button", { name: "Iniciar sesión" })).toBeTruthy();
  expect(getToken()).toBe("");
  expect(getSession()).toBeNull();
  expect(transport.calls.some((url) => url.includes("/auth/me"))).toBe(false);
});

test("con el almacén denegado, iniciar sesión avisa y no deja nada guardado", async () => {
  transport = stubTransport(defaultHandler());
  blockAccess("localStorage");
  blockAccess("sessionStorage");

  render(<App />);
  fireEvent.click(await screen.findByRole("button", { name: "Iniciar sesión" }));
  fireEvent.change(screen.getByLabelText("Correo electrónico"), { target: { value: me.email } });
  fireEvent.change(screen.getByLabelText("Contraseña"), { target: { value: "contrasena-larga" } });
  fireEvent.click(screen.getByRole("button", { name: "Iniciar sesión" }));

  expect(await screen.findByText(/No se pudo guardar la sesión en este navegador/i)).toBeTruthy();

  // Sigue en el login, sin sesión, sin bucle de renovación y con el formulario utilizable.
  expect(window.location.pathname).toBe("/login");
  expect(getSession()).toBeNull();
  expect(getToken()).toBe("");
  expect(getUser()).toBeNull();
  expect(transport.calls.filter((url) => url.includes("/auth/refresh"))).toHaveLength(0);
  expect(screen.getByLabelText("Contraseña")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Iniciar sesión" })).toBeTruthy();
});

test("con localStorage denegado pero sessionStorage disponible, se puede entrar sin recordar", async () => {
  transport = stubTransport(defaultHandler());
  blockAccess("localStorage");

  render(<App />);
  fireEvent.click(await screen.findByRole("button", { name: "Iniciar sesión" }));
  fireEvent.change(screen.getByLabelText("Correo electrónico"), { target: { value: me.email } });
  fireEvent.change(screen.getByLabelText("Contraseña"), { target: { value: "contrasena-larga" } });
  fireEvent.click(screen.getByLabelText("Recordar sesión")); // se desmarca
  fireEvent.click(screen.getByRole("button", { name: "Iniciar sesión" }));

  await waitFor(() => expect(window.location.pathname).toBe("/home"));
  expect(realSessionStorage.getItem("kronos_token")).toBe(getToken());
  expect(realSessionStorage.getItem("kronos_session_remember")).toBe("false");
  expect(getSession()?.remember).toBe(false);
});

// ---------------------------------------------------------------
// Eliminación bloqueada (logout)
// ---------------------------------------------------------------

test("con el borrado bloqueado, cerrar sesión no deja tokens utilizables en el navegador", async () => {
  transport = stubTransport(defaultHandler());
  saveSession(jwt(3600), me, true, "", { token: "refresh-vivo" });
  window.history.replaceState(null, "", "/settings");

  render(<App />);
  const logout = await screen.findByRole("button", { name: "Cerrar sesión" });

  blockRemoval();
  fireEvent.click(logout);

  await waitFor(() => expect(window.location.pathname).toBe("/login"));

  for (const key of ["kronos_token", "kronos_user", "kronos_refresh_token"]) {
    expect(rawItem(realLocalStorage, key)).toBeFalsy();
  }
  expect(getToken()).toBe("");
  expect(getSession()).toBeNull();
  expect(rawItem(realLocalStorage, "kronos_token")).not.toBe(jwt(3600));
});

// ---------------------------------------------------------------
// Escritura bloqueada (renovación de sesión)
// ---------------------------------------------------------------

test("si la renovación no puede persistirse, la sesión se cierra una sola vez y sin excepciones", async () => {
  let refreshCalls = 0;
  transport = stubTransport((url) => {
    if (url.includes("/auth/refresh")) {
      refreshCalls += 1;
      return {
        status: 200,
        data: {
          token: jwt(3600),
          expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
          refreshToken: "refresh-rotado",
          refreshExpiresAt: new Date(Date.now() + 86_400_000).toISOString()
        }
      };
    }
    return defaultHandler()(url);
  });

  // Sesión vencida con refresh vigente: la hidratación intentará renovar.
  saveSession(jwt(-60), me, true, "", { token: "refresh-vigente" });
  window.history.replaceState(null, "", "/home");

  blockWrites();
  render(<App />);

  await waitFor(() => expect(window.location.pathname).toBe("/login"), { timeout: 4000 });
  expect(refreshCalls).toBe(1);
  expect(getToken()).toBe("");
  expect(getRefreshToken()).toBe("");
  expect(rawItem(realLocalStorage, "kronos_token")).toBeFalsy();
  expect(getSession()).toBeNull();
});

// ---------------------------------------------------------------
// Escritura bloqueada durante el onboarding (caché del usuario)
// ---------------------------------------------------------------

test("completar el onboarding con la escritura bloqueada no produce rechazo no manejado", async () => {
  const rejections = [];
  const onRejection = (reason) => rejections.push(reason);
  process.on("unhandledRejection", onRejection);

  transport = stubTransport(defaultHandler());
  saveSession(jwt(3600), me, true);
  window.history.replaceState(null, "", "/onboarding");

  try {
    render(<App />);
    await screen.findByRole("heading", { name: /Hola,/ });

    blockWrites();
    fireEvent.click(screen.getByRole("button", { name: "Saltar" }));

    await waitFor(() => expect(updatePreferences).toHaveBeenCalled());
    // Deja pasar el ciclo de microtareas donde aparecería el rechazo.
    await new Promise((resolve) => setTimeout(resolve, 30));

    expect(rejections).toEqual([]);
    // La sesión sigue viva: fallar la caché local del usuario no cierra sesión.
    expect(getToken()).toBeTruthy();
    expect(getSession()).not.toBeNull();
  } finally {
    process.off("unhandledRejection", onRejection);
  }
});
