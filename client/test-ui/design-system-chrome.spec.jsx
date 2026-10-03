import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import App from "../src/App";
import ThemeToggle from "../src/components/theme/ThemeToggle.jsx";
import { saveSession } from "../src/services/authStorage";

/**
 * KRONOS · «CROMO ESPEJO» — contrato del sistema de diseño vigente.
 *
 * Diseño propio del proyecto. Estas comprobaciones impiden que el
 * sistema se degrade en silencio:
 *
 * 1. La capa que manda es la última hoja importada en `main.jsx`.
 * 2. La paleta no tiene verde ni color de acento: el acento es el cromo.
 * 3. La firma del sistema (aro en vez de relleno) está declarada.
 * 4. Ningún estilo del cliente vuelve a introducir un verde dominante.
 * 5. El tema claro usa los tonos del laboratorio y se recuerda.
 * 6. El armazón es el de la referencia: barra superior, columna central y
 *    pestañas inferiores, con todas las secciones siempre alcanzables.
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

const here = dirname(fileURLToPath(import.meta.url));
const stylesDir = resolve(here, "../src/styles");

const read = (name) => readFileSync(resolve(stylesDir, name), "utf8");
const readFromClient = (rel) => readFileSync(resolve(here, "..", rel), "utf8");

const me = { _id: "user1", id: "user1", username: "example", displayName: "Example", bio: "", avatar: "" };
const jwt = `e30.${btoa(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 }))}.firma-de-prueba`;

// `App` monta su propio BrowserRouter: la URL se fija en el historial.
function renderAppAt(path) {
  window.history.replaceState(null, "", path);
  return render(<App />);
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  document.documentElement.removeAttribute("data-k-theme");
  saveSession(jwt, me, false);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  document.documentElement.removeAttribute("data-k-theme");
});

test("la última capa de estilo del cliente es kronos-chrome.css", () => {
  const main = readFromClient("src/main.jsx");
  const imports = [...main.matchAll(/import\s+"\.\/styles\/([^"]+)"/g)].map((m) => m[1]);

  expect(imports).toContain("kronos-chrome.css");
  expect(imports.at(-1)).toBe("kronos-chrome.css");
});

test("la paleta vigente es cromo y no tiene acento de color", () => {
  const css = read("kronos-chrome.css");

  // Superficies y tinta del sistema.
  expect(css).toMatch(/--k-bg:\s*#000000/);
  expect(css).toMatch(/--k-panel:\s*#060708/);
  expect(css).toMatch(/--k-text-soft:\s*#c6ccd4/);

  // Sin color de acento: el cromo es el acento.
  expect(css).toMatch(/--k-accent:\s*#ffffff/);
  expect(css).toMatch(/--k-blue:\s*#ffffff/);

  // Éxito en cromo; aviso y error conservan tono para ser legibles.
  expect(css).toMatch(/--k-success:\s*#eef2f7/);
  expect(css).toMatch(/--k-warning:\s*#e7c07b/);
  expect(css).toMatch(/--k-danger:\s*#e08b8b/);
});

test("la firma del sistema es el aro, no el relleno sólido", () => {
  const css = read("kronos-chrome.css");

  expect(css).toMatch(/--k-ring-chrome:\s*linear-gradient/);
  expect(css).toMatch(/--k-hollow:\s*linear-gradient/);
  // Botón primario: aro cromado con interior negro.
  expect(css).toMatch(/\.k-button-primary[\s\S]*?padding-box[\s\S]*?border-box/);
});

test("ninguna hoja de estilo del cliente reintroduce un verde dominante", () => {
  const sheets = [
    "aqua-theme.css",
    "chrome-minimal.css",
    "design-system.css",
    "design-tokens.css",
    "fan-nav.css",
    "flow.css",
    "interface-density.css",
    "kronos-chrome.css",
    "landing-void.css",
    "stories.css",
    "vertical.css"
  ];

  const hex = /#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b/g;
  const rgb = /rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})/g;
  const greenish = [];

  for (const sheet of sheets) {
    const css = read(sheet);

    for (const match of css.matchAll(hex)) {
      let value = match[1];
      if (value.length === 3) value = value.split("").map((c) => c + c).join("");
      const [r, g, b] = [0, 2, 4].map((i) => parseInt(value.slice(i, i + 2), 16));
      if (g > r + 18 && g > b + 18 && g > 90) greenish.push(`${sheet}: ${match[0]}`);
    }

    for (const match of css.matchAll(rgb)) {
      const [r, g, b] = match.slice(1, 4).map(Number);
      if (g > r + 18 && g > b + 18 && g > 90) greenish.push(`${sheet}: ${match[0]}`);
    }
  }

  expect(greenish).toEqual([]);
});

test("la marca del portón conserva su relieve cromado sin duplicar el texto", () => {
  const auth = readFromClient("src/features/auth/Auth.jsx");

  // Un solo nodo de texto: las capas del relieve son decorativas (CSS).
  expect(auth).toMatch(/<h1 className="brand-title" data-k-text="KRONOSPACE">KRONOSPACE<\/h1>/);

  const css = read("kronos-chrome.css");
  expect(css).toMatch(/\.brand-title\[data-k-text\]::before[\s\S]*?content:\s*attr\(data-k-text\)/);
  expect(css).toMatch(/\.brand-title\[data-k-text\]::after[\s\S]*?content:\s*attr\(data-k-text\)\s*!important/);
});

// ============================================================
// TEMA (claro / oscuro) y ARMAZÓN de la referencia
// ============================================================

test("el tema claro usa los tonos del laboratorio de diseño", () => {
  const css = read("kronos-chrome.css");
  const light = css.slice(css.indexOf('html[data-k-theme="light"] {'));
  const block = light.slice(0, light.indexOf("\n}"));

  // Tonos exactos del laboratorio (preview.css, bloque claro).
  expect(block).toMatch(/--k-bg:\s*#ffffff/);
  expect(block).toMatch(/--k-text:\s*#161a22/);
  expect(block).toMatch(/--k-muted:\s*#666d77/);
  expect(block).toMatch(/--k-border:\s*rgba\(22, 26, 34, 0\.14\)/);
  expect(block).toMatch(/--k-panel:\s*#f2f3f5/);

  // El cromo se invierte y el interior de los aros pasa a blanco.
  expect(block).toMatch(/--k-hollow:\s*linear-gradient\(180deg, #ffffff, #ffffff\)/);
  expect(block).toMatch(/--k-ring-chrome:\s*linear-gradient/);
});

test("el tema se aplica antes de renderizar y se guarda en el navegador", () => {
  const main = readFromClient("src/main.jsx");
  expect(main).toMatch(/applyTheme\(currentTheme\(\)\)/);

  const lib = readFromClient("src/lib/themePreference.js");
  expect(lib).toMatch(/kronos\.theme-preference/);
  expect(lib).toMatch(/data-k-theme|setAttribute\("data-k-theme"/);
});

test("Configuración ofrece las dos apariencias y el control de movimiento", () => {
  const settings = readFromClient("src/features/settings/Settings.jsx");
  expect(settings).toMatch(/<ThemeToggle \/>/);
  expect(settings).toMatch(/<MotionToggle \/>/);

  // Y el botón de 3D ya no está en la primera pantalla.
  const auth = readFromClient("src/features/auth/Auth.jsx");
  expect(auth).not.toMatch(/MotionToggle/);
});

test("el conmutador de tema aplica y recuerda la elección", async () => {
  document.documentElement.removeAttribute("data-k-theme");
  localStorage.removeItem("kronos.theme-preference");

  render(<ThemeToggle />);

  const group = screen.getByRole("group", { name: "Tema de la interfaz" });
  const light = within(group).getByRole("button", { name: "Claro" });
  const dark = within(group).getByRole("button", { name: "Oscuro" });
  expect(dark.getAttribute("aria-pressed")).toBe("true");

  fireEvent.click(light);
  expect(document.documentElement.getAttribute("data-k-theme")).toBe("light");
  expect(localStorage.getItem("kronos.theme-preference")).toBe("light");
  expect(light.getAttribute("aria-pressed")).toBe("true");

  fireEvent.click(dark);
  expect(document.documentElement.getAttribute("data-k-theme")).toBe("dark");
  expect(localStorage.getItem("kronos.theme-preference")).toBe("dark");

  document.documentElement.removeAttribute("data-k-theme");
});

test("el armazón es barra superior + pestañas inferiores, sin barra lateral", async () => {
  renderAppAt("/home");

  // La barra lateral se retiró: el armazón es el de la referencia.
  expect(await screen.findByLabelText("Contexto de navegación")).toBeTruthy();
  expect(document.querySelector(".k-navigation")).toBeNull();

  // Cinco destinos en la tira inferior, siempre visible.
  const tabs = screen.getByRole("navigation", { name: "Navegación social móvil" });
  expect(tabs.querySelectorAll("a")).toHaveLength(5);
  expect(tabs.querySelector('a[href="/create"]')).toBeTruthy();
  expect(tabs.querySelector('a[href="/profile"]')).toBeTruthy();

  // Y el índice accesible conserva TODAS las secciones fuera de la vista.
  const index = screen.getByRole("navigation", { name: "Todas las secciones" });
  expect(within(index).getByRole("link", { name: "Analítica" })).toBeTruthy();
  expect(within(index).getByRole("link", { name: "Cápsulas" })).toBeTruthy();

  // Los accesos de la barra superior (buscar, avisos, mensajes, secciones).
  const topbar = screen.getByLabelText("Contexto de navegación");
  expect(within(topbar).getByRole("button", { name: /Abrir búsqueda global/ })).toBeTruthy();
  expect(within(topbar).getByRole("link", { name: "Notificaciones" })).toBeTruthy();
  expect(within(topbar).getByRole("link", { name: "Mensajes" })).toBeTruthy();
  expect(within(topbar).getByRole("button", { name: "Abrir más secciones" })).toBeTruthy();

  // La marca vuelve a Inicio desde cualquier pantalla.
  expect(within(topbar).getByRole("link", { name: /Kronos Space · Inicio/i }).getAttribute("href")).toBe("/home");
});

test("Configuración muestra los dos controles de apariencia sin romperse", async () => {
  renderAppAt("/settings");

  // El grupo de tema y el conmutador de movimiento, con sus nombres reales.
  const theme = await screen.findByRole("group", { name: "Tema de la interfaz" });
  expect(within(theme).getByRole("button", { name: "Claro" })).toBeTruthy();
  expect(within(theme).getByRole("button", { name: "Oscuro" })).toBeTruthy();
  expect(screen.getByRole("button", { name: /Movimiento en bucle/i })).toBeTruthy();
});

test("la tira inferior es Inicio · Explorar · Crear · Kairos · Perfil, sin Mensajes", async () => {
  renderAppAt("/home");

  const tabs = await screen.findByRole("navigation", { name: "Navegación social móvil" });
  const labels = [...tabs.querySelectorAll(".k-navigation-copy strong")].map((node) => node.textContent);
  expect(labels).toEqual(["Inicio", "Explorar", "Crear", "Kairos", "Perfil"]);

  // Kairos entra en la tira; Mensajes pasa a los accesos superiores y al cajón.
  expect(tabs.querySelector('a[href="/kairos"]')).toBeTruthy();
  expect(tabs.querySelector('a[href="/messages"]')).toBeNull();
  const topbar = screen.getByLabelText("Contexto de navegación");
  expect(within(topbar).getByRole("link", { name: "Mensajes" })).toBeTruthy();
});
