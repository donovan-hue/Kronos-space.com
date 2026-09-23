import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import App from "../src/App";

/**
 * KRONOS-VOID — la portada rediseñada:
 * 1. El reloj/orbita antiguos fueron RETIRADOS del diseño; en su lugar,
 *    el sistema orbital en bucle (decorativo, aria-hidden) acompaña a la
 *    marca. El formulario y sus rutas siguen intactos (no destructivo).
 * 2. El conmutador de movimiento es un botón REAL: persiste la
 *    preferencia y la refleja en <html data-k-motion>, que es la llave
 *    de todos los bloques prefers-reduced-motion del sitio.
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

test("la portada 'cromo vivo': logotipo original + bucle líquido, sin órbitas", async () => {
  const { container } = renderAt("/login");
  await screen.findByRole("heading", { level: 1, name: "KRONOSPACE" });
  // El logotipo KRONOSPACE original está de vuelta (reloj + esfera), vivo.
  expect(container.querySelector(".logo-icon .clock-circle .hand-minute")).toBeTruthy();
  expect(container.querySelector(".logo-icon .orbit .sphere")).toBeTruthy();
  // El sistema de órbitas/planetas quedó ELIMINADO del diseño:
  expect(container.querySelector(".k-void-orbits")).toBeNull();
  // El lenguaje nuevo es el bucle de metal líquido (fallback CSS del 3D).
  const liquid = container.querySelector(".k-void-liquid");
  expect(liquid).toBeTruthy();
  expect(liquid.getAttribute("aria-hidden")).toBe("true");
  // Y la escena 3D "chrome-loop" se monta como fondo (con su wrapper).
  expect(container.querySelector(".k-scene")).toBeTruthy();
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
