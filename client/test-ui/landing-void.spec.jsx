import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
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
  await screen.findByRole("heading", { level: 1, name: "KRONOSPACE" });
  expect(container.querySelector("[data-clock-hand=\"minute\"]")).toBeTruthy();
  expect(container.querySelector("[data-orbit-ring=\"front\"]")).toBeTruthy();
  expect(container.querySelectorAll("[data-planet-front]")).toHaveLength(2);
  expect(container.querySelector(".k-mirror-wordmark svg text")).toBeTruthy();
  expect(container.querySelector(".k-void-liquid, .k-scene, img")).toBeNull();
});

test("el formulario real de acceso sigue vivo tras el rediseño", async () => {
  renderAt("/login");
  const [loginPill] = await screen.findAllByRole("button", { name: /Iniciar sesión/i });
  fireEvent.click(loginPill);
  await waitFor(() =>
    expect(document.getElementById("auth-email")).toBeTruthy()
  );
});

test("el conmutador de movimiento escribe la preferencia y la recuerda", async () => {
  renderAt("/login");
  const toggle = await screen.findByRole("button", { name: /Movimiento en bucle/i });
  // Sin SO que pida pausa, los bucles corren por defecto… pero sin
  // atributo en <html>: data-k-motion solo refleja decisiones EXPLÍCITAS.
  expect(toggle.getAttribute("aria-pressed")).toBe("true");
  expect(document.documentElement.getAttribute("data-k-motion")).toBeNull();

  fireEvent.click(toggle);
  expect(toggle.getAttribute("aria-pressed")).toBe("false");
  expect(document.documentElement.getAttribute("data-k-motion")).toBe("reduced");
  expect(localStorage.getItem("kronos.motion-preference")).toBe("reduced");

  fireEvent.click(toggle);
  expect(toggle.getAttribute("aria-pressed")).toBe("true");
  expect(document.documentElement.getAttribute("data-k-motion")).toBe("full");
  expect(localStorage.getItem("kronos.motion-preference")).toBe("full");
});
