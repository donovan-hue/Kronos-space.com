import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { basename, dirname, resolve } from "node:path";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import App from "../src/App";
import { saveSession, clearSession } from "../src/services/authStorage";
import { resolvePostAuthRedirect } from "../src/features/auth/Auth";

/**
 * KRONOS-UIX-AUDIT — regresiones de la auditoría UX/UI.
 *
 * 1. Ningún CSS cargado debe volver a ocultar la navegación actual con
 *    `display:none !important` (dejó al shell sin sidebar y sin barra móvil).
 * 2. «Analítica» debe dibujar su icono en el FanNav (ICONS.analytics).
 * 3. El MenuDrawer es un diálogo accesible: abre desde el hamburguesa,
 *    muestra todas las secciones y Escape lo cierra (portal + overlay).
 * 4. Las rutas desconocidas con sesión muestran una pantalla 404 real.
 * 5. Login con sesión caducada/deep link devuelve al destino original.
 * 6. resolvePostAuthRedirect rechaza rutas externas (open redirect).
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

vi.mock("../src/services/supportService", () => ({
  sendCreatorTip: vi.fn(async () => ({ success: true }))
}));



const here = dirname(fileURLToPath(import.meta.url));
const me = { _id: "user1", id: "user1", username: "example", displayName: "Example", bio: "", avatar: "" };
const jwt = `e30.${btoa(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 }))}.firma-de-prueba`;

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

test("ningún CSS cargado oculta la navegación actual con display:none !important", () => {
  // Se revisan los archivos que main.jsx carga de verdad. Hoy el diseño es
  // una sola hoja (src/styles/kronos.css): antes esta prueba leía archivos
  // que ya no se importaban, así que no protegía nada.
  const main = readFileSync(resolve(here, "../src/main.jsx"), "utf8");
  const hojas = new Set();
  function cargar(hoja) {
    if (hojas.has(hoja)) return;
    hojas.add(hoja);
    const css = readFileSync(hoja, "utf8");
    for (const [, sub] of css.matchAll(/@import\s+['"](\.[^'"]+\.css)['"]/g)) {
      cargar(resolve(hoja, "..", sub));
    }
  }
  for (const [, sub] of main.matchAll(/import\s+"(\.\/[^"]+\.css)"/g)) {
    cargar(resolve(here, "../src", sub));
  }
  // Motor + vocabulario + producto: el producto es una sola hoja.
  expect([...hojas].map((h) => basename(h)).sort()).toEqual([
    "app.css",
    "design-tokens.css",
    "kronos.css",
    "tailwind.css",
  ]);

  const offenders = [];
  for (const hoja of hojas) {
    const css = readFileSync(resolve(here, hoja), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    for (const [, selector, cuerpo] of css.matchAll(/([^{}]+)\{([^}]*display:\s*none\s*!important[^}]*)\}/g)) {
      if (/\.k-navigation\b|\.k-mobile-navigation\b/.test(selector)) offenders.push(`${hoja}: ${selector.trim()}`);
    }
  }
  expect(offenders).toEqual([]);
});

test("«Analítica» en el FanNav se representa con un emoji, no con un SVG", async () => {
  renderAppAt("/home");
  const link = await screen.findByRole("link", { name: /Analítica/i });
  const icono = link.querySelector(".k-navigation-icon");
  expect(icono).toBeTruthy();
  expect(icono.textContent.trim()).toBe("📊");
  expect(link.querySelector("svg")).toBeNull();
});

test("el menú de secciones abre como diálogo accesible y cierra con Escape", async () => {
  renderAppAt("/home");
  const [openButton] = await screen.findAllByRole("button", { name: "Abrir más secciones" });
  fireEvent.click(openButton);

  const drawer = await screen.findByRole("dialog", { name: /Secciones/i });
  for (const label of ["Inicio", "Explorar", "Crear", "Mensajes", "Perfil"]) {
    expect(within(drawer).queryByRole("link", { name: label, exact: true })).toBeNull();
  }
  expect(within(drawer).getByRole("link", { name: /Generador de Guiones/i })).toBeTruthy();

  fireEvent.keyDown(document.activeElement || drawer, { key: "Escape" });
  await waitFor(() => expect(screen.queryByRole("dialog", { name: /Secciones/i })).toBeNull());
});

test("una ruta inexistente con sesión muestra la pantalla 404 en lugar de redirigir en silencio", async () => {
  renderAppAt("/esta-pagina-no-existe");
  expect(await screen.findByRole("heading", { name: "Esta página no existe" })).toBeTruthy();
  expect(screen.getByText("/esta-pagina-no-existe")).toBeTruthy();
  expect(screen.getByRole("link", { name: /Volver al inicio/i })).toBeTruthy();
});

test("tras iniciar sesión desde un deep link, la app vuelve al destino original", async () => {
  clearSession();
  const { api } = await import("../src/services/apiClient");
  api.post = vi.fn(async () => ({ data: { token: jwt, user: me } }));

  renderAppAt("/saved");

  // ProtectedRoute lleva al login conservando `state.from`.
  await screen.findByLabelText("Correo");

  fireEvent.change(screen.getByLabelText("Correo"), { target: { value: "me@kronos.space" } });
  fireEvent.change(screen.getByLabelText("Contraseña"), { target: { value: "secret1234" } });

  const form = document.querySelector("form");
  expect(form).toBeTruthy();
  fireEvent.submit(form);

  // La prueba clave es el destino: se vuelve a /saved (no a /home). El
  // contenido del feed puede seguir cargando, así que se comprueba la URL
  // y que el shell de la app autenticada está presente.
  await waitFor(() => expect(window.location.pathname).toBe("/saved"));
  expect((await screen.findAllByRole("button", { name: "Abrir más secciones" })).length > 0).toBe(true);
});

test("resolvePostAuthRedirect: solo rutas internas y nunca de autenticación", () => {
  expect(resolvePostAuthRedirect({ pathname: "/settings", search: "?tab=1" })).toBe("/settings?tab=1");
  expect(resolvePostAuthRedirect({ pathname: "/login" })).toBe("/home");
  expect(resolvePostAuthRedirect({ pathname: "//evil.com/x" })).toBe("/home");
  expect(resolvePostAuthRedirect({ pathname: "https://evil.com" })).toBe("/home");
  expect(resolvePostAuthRedirect(undefined)).toBe("/home");
});
