import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import App from "../src/App";
import { saveSession } from "../src/services/authStorage";
import * as storiesService from "../src/services/storiesService";

/**
 * NAVEGACIÓN REAL — se renderiza `<App />` (el router verdadero de la
 * aplicación) en la URL indicada. Así se comprueba que cada enlace de la
 * interfaz tenga una ruta declarada en lugar de caer en el comodín `*`,
 * que redirige a /home sin avisar.
 */

vi.mock("../src/services/apiClient", () => ({
  API_URL: "/api",
  api: {
    get: vi.fn(async (path) => ({
      data: path === "/auth/me" ? { user: null } : { flags: {}, notifications: [], unreadCount: 0 }
    })),
    post: vi.fn(async () => ({ data: {} })),
    interceptors: { response: { use: vi.fn(), eject: vi.fn() } }
  },
  // App se suscribe al ciclo de vida de la sesión: el doble debe exponer la
  // misma superficie real del módulo (devuelve la función de desuscripción).
  subscribeToApiSession: vi.fn(() => () => {}),
  renewSession: vi.fn(async () => null)
}));

vi.mock("../src/services/socket", () => ({
  connectSocket: vi.fn(),
  disconnectSocket: vi.fn(),
  getSocket: vi.fn()
}));

vi.mock("../src/services/storiesService", () => ({
  getStoryTray: vi.fn(async () => []),
  getMyStoryArchive: vi.fn(async () => []),
  deleteStory: vi.fn(async () => ({ deleted: true })),
  createStory: vi.fn(),
  viewStory: vi.fn(),
  replyToStory: vi.fn(),
  getStoryViews: vi.fn(),
  getStoryReplies: vi.fn()
}));

const me = { _id: "user1", id: "user1", username: "example", displayName: "Example", bio: "", avatar: "" };
const jwt = `e30.${btoa(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 }))}.firma-de-prueba`;

// `App` monta su propio BrowserRouter: se renderiza solo y la URL se fija en
// el historial de jsdom, igual que hace un usuario que abre el enlace.
function renderAppAt(path) {
  window.history.replaceState(null, "", path);
  return render(<App />);
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  saveSession(jwt, me, false);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

test("/stories/archive abre el archivo de historias y consulta su API", async () => {
  renderAppAt("/stories/archive");

  expect(await screen.findByRole("heading", { name: "Tu archivo" })).toBeTruthy();
  expect(storiesService.getMyStoryArchive).toHaveBeenCalled();
});

test("la ruta declarada no se pierde en el comodín de redirección", async () => {
  renderAppAt("/stories/archive");

  await screen.findByRole("heading", { name: "Tu archivo" });

  // El comodín `path="*"` redirige a /home. Si /stories/archive cayera ahí,
  // se vería el feed en lugar del archivo dentro del layout de la app.
  expect(screen.getByRole("banner", { name: "Contexto de navegación" })).toBeTruthy();
  expect(screen.queryByRole("heading", { name: "Tu archivo" })).toBeTruthy();
});
