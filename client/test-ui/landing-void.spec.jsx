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

test("el formulario real de acceso sigue vivo tras el rediseño", async () => {
  renderAt("/login");
  const [loginPill] = await screen.findAllByRole("button", { name: /Iniciar sesión/i });
  fireEvent.click(loginPill);
  await waitFor(() =>
    expect(document.getElementById("auth-email")).toBeTruthy()
  );
});
