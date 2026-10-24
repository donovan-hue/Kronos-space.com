import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import App from "../src/App";
import { saveSession } from "../src/services/authStorage";
import { NAV_GROUPS, NAV_ORDER, getCurrentSection } from "../src/navigation/model.jsx";
import { planSectionShift } from "../src/navigation/navTransition";

/**
 * KRONOS-NAV — la navegación connected al router real.
 *
 * 1. Ningún destino del modelo puede estar muerto: cada `to` debe tener
 *    un <Route> declarado en App.jsx (o ser una redirección alias).
 * 2. El eje de profundidad cubre todos los destinos sin duplicados.
 * 3. La coreografía direccional es pura y determinista (POP invierte;
 *    secciones hermanas = reposo).
 * 4. La navegación se lee de un vistazo: emoji + nombre, sin descripciones
 *    y sin marcos recargados.
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

test("cada destino del modelo tiene una ruta real en App.jsx (cero enlaces muertos)", () => {
  const appSource = readFileSync(resolve(here, "../src/App.jsx"), "utf8");
  const declared = new Set();
  for (const match of appSource.matchAll(/<Route\s+(?:[^>]*\s)?path="([^"]+)"/g)) {
    declared.add(match[1]);
  }
  // Las redirecciones-alias (Navigate replace a otra ruta) también son
  // destinos válidos del enrutador; aquí solo cuentan las rutas-base.
  const routeBases = new Set(
    [...declared].map((p) => (p === "*" ? "*" : p.split("/").slice(0, 2).join("/") || "/"))
  );

  for (const group of NAV_GROUPS) {
    for (const item of group.items) {
      const base = "/" + item.to.replace(/^\//, "").split("/")[0];
      expect(
        declared.has(item.to) || routeBases.has(base),
        `la ruta ${item.to} (${item.label}) no existe en el router`
      ).toBe(true);
    }
  }
});

test("el eje de profundidad cubre todos los destinos sin duplicados", () => {
  const all = NAV_GROUPS.flatMap((g) => g.items.map((i) => i.id));
  expect(NAV_ORDER.length).toBe(all.length);
  expect(new Set(NAV_ORDER).size).toBe(all.length);
  for (const id of all) expect(NAV_ORDER).toContain(id);
});

test("ningún destino queda sin emoji: el emoji ES la marca", () => {
  for (const group of NAV_GROUPS) {
    for (const item of group.items) {
      expect(typeof item.emoji, `${item.label} sin emoji`).toBe("string");
      expect(item.emoji.length, `${item.label} con emoji vacío`).toBeGreaterThan(0);
      for (const child of item.children || []) {
        expect(typeof child.emoji, `${child.label} sin emoji`).toBe("string");
        expect(child.emoji.length).toBeGreaterThan(0);
      }
    }
  }
});

test("la navegación no muestra descripciones: solo emoji y nombre", async () => {
  renderAppAt("/home");

  const nav = await screen.findByRole("navigation", { name: /Navegación social móvil/i });
  // La barra móvil no tiene ninguna descripción: ni <small> ni texto auxiliar.
  expect(nav.querySelectorAll("small")).toHaveLength(0);
  expect(nav.textContent).not.toMatch(/Tu feed|Crea con Kairos|Personas y publicaciones/);

  // La barra lateral tampoco las muestra.
  const lateral = screen.getByRole("complementary", { name: /Navegación principal/i });
  expect(lateral.querySelectorAll("small")).toHaveLength(0);
});

test("la barra lateral reparte los destinos en varios grupos legibles", async () => {
  renderAppAt("/home");

  const lateral = screen.getByRole("complementary", { name: /Navegación principal/i });
  const grupos = within(lateral).getAllByRole("heading", { level: 2 });
  expect(grupos.length).toBeGreaterThanOrEqual(3);
  // Ningún grupo debe Concentration toda la lista: el más largo no pasa de 8.
  for (const grupo of grupos) {
    const enlaces = grupo.parentElement.querySelectorAll("a.k-navigation-item").length;
    expect(enlaces, `el grupo ${grupo.textContent} está apretado`).toBeLessThanOrEqual(8);
  }
});

test("planSectionShift: dirección, POP y reposo", () => {
  const a = NAV_ORDER[0];
  const b = NAV_ORDER[2];
  const forward = planSectionShift(a, b, "PUSH");
  expect(forward.enterX).toBeGreaterThan(0);
  expect(forward.exitX).toBeLessThan(0);

  const back = planSectionShift(b, a, "POP");
  expect(back.enterX).toBeGreaterThan(0); // invertir PUSH hacia afuera = volver por la derecha

  expect(planSectionShift("home", "home", "PUSH")).toEqual({
    enterX: 0,
    enterScale: 1,
    exitX: 0
  });
  expect(planSectionShift("post", "settings", "PUSH")).toEqual({
    enterX: 0,
    enterScale: 1,
    exitX: 0
  });
});

test("getCurrentSection reconoce la pantalla de publicación individual", () => {
  expect(getCurrentSection("/post/abc123")).toBe("post");
  expect(getCurrentSection("/conversations/grupo7")).toBe("groups");
});
