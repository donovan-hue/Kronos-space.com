import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import App from "../src/App";

/** Portada maestra: espejo vectorial, reloj local y planeta orbital.
 * No hay nudo de fondo ni se empaqueta la imagen de referencia.
 * El formulario y el conmutador conservan sus contratos. */

vi.mock("../src/services/apiClient", () => ({
  API_URL: "/api",
  api: {
    get: vi.fn(async (path) => ({
      data: path === "/auth/me" ? { user: null } : { flags: {}, notifications: [], unreadCount: 0 }
    })),
    post: vi.fn(async () => ({ data: {} })),
    interceptors: { response: { use: vi.fn(), eject: vi.fn() } }
  },
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

function renderAt(path) {
  window.history.replaceState(null, "", path);
  return render(<App />);
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  document.documentElement.removeAttribute("data-k-motion");
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  document.documentElement.removeAttribute("data-k-motion");
});

test("la portada maestra: reloj cromado y planeta, sin nudo ni imagen", async () => {
  const { container } = renderAt("/login");
  await screen.findByRole("heading", { level: 1, name: "KRONOS-SPACE" });
  expect(container.querySelector(".subtitle").textContent).toBe("Tu tiempo Tu espacio Tu dominio");
  expect(container.querySelector("[data-clock-hand=\"minute\"]")).toBeTruthy();
  expect(container.querySelector("[data-orbit-ring=\"front\"]")).toBeTruthy();
  expect(container.querySelectorAll("[data-planet-front]")).toHaveLength(2);
  // Verifica las letras dibujadas, no sólo el nombre accesible.
  expect(container.querySelector(".k-mirror-wordmark svg text:last-child").textContent).toBe("KRONOS-SPACE");
  expect(container.querySelector(".k-void-liquid, .k-scene, img")).toBeNull();
});

test("el formulario aparece directamente; la portada se puede contemplar y reabrir", async () => {
  renderAt("/login");
  expect(await screen.findByLabelText("Correo")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Iniciar sesión" })).toBeTruthy();

  fireEvent.click(screen.getByRole("button", { name: "Volver" }));
  expect(screen.queryByLabelText("Correo")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Iniciar sesión" }));
  expect(screen.getByLabelText("Correo")).toBeTruthy();
});
