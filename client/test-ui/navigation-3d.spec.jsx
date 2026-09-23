import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import App from "../src/App";
import { saveSession } from "../src/services/authStorage";
import { NAV_GROUPS, NAV_ORDER, getCurrentSection } from "../src/navigation/model.jsx";
import { planSectionShift } from "../src/navigation/navTransition";
import { orbitFrame } from "../src/navigation/orbitMotion";

/**
 * KRONOS-NAV3D — navegación espacial conectada al router real.
 *
 * 1. Ningún destino del modelo puede estar muerto: cada `to` debe tener
 *    un <Route> declarado en App.jsx (o ser una redirección alias).
 * 2. El mapa orbital abre como diálogo, lista TODOS los destinos del
 *    modelo con sus rutas reales y marca la sección actual.
 * 3. Teclado completo: flechas recorren los nodos; el cierre devuelve el
 *    foco al trigger (contrato de Radix Dialog).
 * 4. La coreografía direccional es pura y determinista (POP invierte;
 *    secciones hermanas = reposo; zoom del mapa amplifica la entrada).
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

test("el mapa orbital abre desde el topbar con todos los destinos reales", async () => {
  renderAppAt("/home");

  const trigger = await screen.findByRole("button", { name: /mapa orbital/i });
  fireEvent.click(trigger);

  const dialog = await screen.findByRole("dialog", { name: /Mapa orbital de navegación/i });

  for (const group of NAV_GROUPS) {
    for (const item of group.items) {
      const link = within(dialog).getByRole("link", { name: new RegExp(item.label, "i") });
      expect(link.getAttribute("href")).toBe(item.to);
    }
  }

  // Orientación: la sección actual está marcada sobre su propio nodo.
  const homeLink = within(dialog).getByRole("link", { name: /Inicio/i });
  expect(homeLink.getAttribute("aria-current")).toBe("page");

  // Y el centro del escenario dice dónde estás.
  const coreLabel = dialog.querySelector(".k-orbit-core-label");
  expect(coreLabel?.textContent).toBe("Inicio");
});

test("las flechas recorren los nodos y Escape devuelve el foco al trigger", async () => {
  renderAppAt("/home");

  const trigger = await screen.findByRole("button", { name: /mapa orbital/i });
  // jsdom no enfoca con click: se enfoca a mano, como en un navegador real
  // donde el foco del trigger es la ancla de restauración de Radix.
  trigger.focus();
  fireEvent.click(trigger);
  const dialog = await screen.findByRole("dialog", { name: /Mapa orbital de navegación/i });

  // Foco inicial en el primer nodo; una flecha debe moverlo a otro nodo.
  const nodes = [...dialog.querySelectorAll("[data-orbit-node]")];
  nodes[0].focus();
  fireEvent.keyDown(dialog, { key: "ArrowRight" });
  await waitFor(() =>
    expect(document.activeElement?.dataset?.orbitNode).toBe(nodes[1].dataset.orbitNode)
  );

  fireEvent.keyDown(dialog, { key: "ArrowLeft" });
  await waitFor(() =>
    expect(document.activeElement?.dataset?.orbitNode).toBe(nodes[0].dataset.orbitNode)
  );

  fireEvent.keyDown(document.activeElement, { key: "Escape" });
  await waitFor(() =>
    expect(screen.queryByRole("dialog", { name: /Mapa orbital de navegación/i })).toBeNull()
  );
  // Radix restaura el foco en quien abrió el diálogo (lo hace en el
  // siguiente frame: es asincrónico por diseño).
  await waitFor(() => expect(document.activeElement).toBe(trigger));
});

test("elegir un nodo navega por el router real y cierra el mapa", async () => {
  renderAppAt("/home");

  const trigger = await screen.findByRole("button", { name: /mapa orbital/i });
  fireEvent.click(trigger);
  const dialog = await screen.findByRole("dialog", { name: /Mapa orbital de navegación/i });

  fireEvent.click(within(dialog).getByRole("link", { name: /Cápsulas/i }));

  await waitFor(() => expect(window.location.pathname).toBe("/capsules"));
  expect(screen.queryByRole("dialog", { name: /Mapa orbital de navegación/i })).toBeNull();
});

test("la tecla G abre y cierra el mapa sin robar la escritura en inputs", async () => {
  renderAppAt("/home");
  await screen.findByRole("button", { name: /mapa orbital/i });

  fireEvent.keyDown(window, { key: "g" });
  expect(await screen.findByRole("dialog", { name: /Mapa orbital de navegación/i })).toBeTruthy();

  fireEvent.keyDown(window, { key: "g" });
  await waitFor(() =>
    expect(screen.queryByRole("dialog", { name: /Mapa orbital de navegación/i })).toBeNull()
  );
});

test("orbitFrame: el bucle rota sobre la elipse y conserva la fórmula de z", () => {
  // Reposo: la composición inicial no se mueve en t=0.
  const rest = orbitFrame({ x: 1, y: 0, ring: 0 }, 0);
  expect(rest.x).toBe("1.0000");
  expect(rest.y).toBe("0.0000");
  expect(rest.z).toBe(400);

  // Un cuarto del periodo del anillo núcleo lleva el punto (1,0) a (0,1):
  // la rotación es rígida (conserva el radio) y el frente pinta delante.
  const quarterMs = (2 * Math.PI) / 0.000242 / 4;
  const quarter = orbitFrame({ x: 1, y: 0, ring: 0 }, quarterMs);
  expect(Number(quarter.x)).toBeCloseTo(0, 2);
  expect(Number(quarter.y)).toBeCloseTo(1, 2);
  expect(quarter.z).toBe(800);

  // El anillo de en medio gira en sentido contrario (engranajes del mapa).
  const contra = orbitFrame({ x: 1, y: 0, ring: 1 }, 4000);
  expect(Number(contra.y)).toBeLessThan(0);
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

  const zoom = planSectionShift("home", "home", "REPLACE", { zoom: true });
  expect(zoom.enterScale).toBeLessThan(1);
});

test("getCurrentSection reconoce la pantalla de publicación individual", () => {
  expect(getCurrentSection("/post/abc123")).toBe("post");
  expect(getCurrentSection("/orbits/orb7")).toBe("orbits");
});
