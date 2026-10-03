import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import App from "../src/App";

/**
 * KRONOS-VOID — la portada rediseñada:
 * 1. El reloj/orbita antiguos fueron RETIRADOS del diseño; en su lugar,
 *    el sistema orbital en bucle (decorativo, aria-hidden) acompaña a la
 *    marca. El formulario y sus rutas siguen intactos (no destructivo).
 * 2. El conmutador de movimiento YA NO se muestra aquí: el botón de 3D se
 *    retiró de la primera pantalla y el control vive ahora en Configuración
 *    (design-system-chrome.spec.js), con la misma preferencia persistida en
 *    <html data-k-motion>.
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

test("el botón de 3D/movimiento se retiró de la primera pantalla", async () => {
  renderAt("/login");
  await screen.findByRole("heading", { level: 1, name: "KRONOSPACE" });

  // El conmutador ya no vive en el portón: se movió a Configuración
  // (ver design-system-chrome.spec.js). Aquí solo se comprueba que la
  // portada queda limpia y que la preferencia del sistema sigue vigente
  // sin ese botón: data-k-motion solo refleja decisiones EXPLÍCITAS.
  expect(screen.queryByRole("button", { name: /Movimiento en bucle/i })).toBeNull();
  expect(document.querySelector(".k-motion-toggle")).toBeNull();
  expect(document.documentElement.getAttribute("data-k-motion")).toBeNull();
});
