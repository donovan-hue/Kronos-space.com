import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import App from "../src/App";
import { LEGAL_DOCS, LEGAL_LINKS, VERSION_LEGAL, legalDoc } from "../src/features/legal/legalDocuments";
import * as statusService from "../src/services/statusService";

/**
 * PÁGINAS PÚBLICAS DE DERECHO Y ESTADO.
 *
 * Antes de este bloque, la aplicación no tenía ninguna página que un visitante
 * pudiera leer sin cuenta: el comodín `*` mandaba a `/login` absolutamente
 * todo. Las tres rutas legales y `/estado` existen para que eso deje de ser
 * cierto, y esta suite sella las dos cosas que lo garantizan:
 *
 *   1. Que la ruta se monta SIN sesión (no cae en el login).
 *   2. Que el documento no es un cascarón: secciones con contenido real y una
 *      sola versión fechada para los tres.
 */

vi.mock("../src/services/apiClient", () => ({
  API_URL: "/api",
  api: {
    get: vi.fn(async () => ({ data: {} })),
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
  deleteStory: vi.fn(),
  createStory: vi.fn(),
  viewStory: vi.fn(),
  replyToStory: vi.fn(),
  getStoryViews: vi.fn(),
  getStoryReplies: vi.fn()
}));

vi.mock("../src/services/statusService", () => ({
  getServiceHealth: vi.fn()
}));

function renderAppAt(path) {
  window.history.replaceState(null, "", path);
  return render(<App />);
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  vi.clearAllMocks();
  statusService.getServiceHealth.mockResolvedValue({
    reachable: true,
    ok: true,
    status: 200,
    database: "connected",
    realtime: true,
    build: { commitShort: "abc1234", branch: "main" },
    startedAt: "2026-10-29T10:00:00.000Z"
  });
});

afterEach(() => {
  cleanup();
});

test.each([
  ["/terminos", "Términos del servicio"],
  ["/privacidad", "Aviso de privacidad"],
  ["/cookies", "Cookies y almacenamiento local"],
  ["/estado", "Estado del servicio"]
])("%s se abre sin sesión y no redirige al acceso", async (ruta, titulo) => {
  renderAppAt(ruta);

  expect(await screen.findByRole("heading", { name: titulo })).toBeTruthy();
  expect(screen.queryByRole("heading", { name: /KRONOS-SPACE/i })).toBeNull();
});

test("el acceso enlaza los documentos legales y el estado", async () => {
  renderAppAt("/login");

  await screen.findByRole("heading", { name: /KRONOS-SPACE|tu tiempo/i });

  const enlaces = await screen.findAllByRole("link");
  const destinos = new Set(enlaces.map((enlace) => enlace.getAttribute("href")));

  for (const { slug, label } of LEGAL_LINKS) {
    expect(enlaces.some((enlace) => enlace.textContent === label), `falta el enlace a ${label}`).toBe(true);
    expect(destinos.has(`/${slug}`), `${label} no apunta a /${slug}`).toBe(true);
  }

  expect(destinos.has("/estado"), "falta el enlace al estado del servicio").toBe(true);
});

test("los tres documentos declaran el mismo tratamiento de datos", () => {
  expect(Object.keys(LEGAL_DOCS).sort()).toEqual(["cookies", "privacidad", "terminos"]);

  for (const { slug } of LEGAL_LINKS) {
    const doc = legalDoc(slug);
    expect(doc, `${slug} no está en el catálogo`).toBeTruthy();
    expect(doc.sections.length, `${slug} sin secciones`).toBeGreaterThan(2);

    for (const seccion of doc.sections) {
      expect(seccion.heading.trim().length, `${slug}: sección sin título`).toBeGreaterThan(2);
      const lineas = [...(seccion.paragraphs || []), ...(seccion.list || [])];
      expect(lineas.length, `${slug}/${seccion.heading} vacía`).toBeGreaterThan(0);
      for (const linea of lineas) {
        expect(linea.trim().length, `${slug}/${seccion.heading} con línea vacía`).toBeGreaterThan(20);
      }
    }
  }
});

test("la versión legal está fechada en ISO", () => {
  expect(VERSION_LEGAL).toMatch(/^\d{4}-\d{2}-\d{2}$/);
});

test("el aviso de privacidad nombra la cookie real y ninguna inventada", () => {
  const texto = JSON.stringify(legalDoc("privacidad")) + JSON.stringify(legalDoc("cookies"));

  expect(texto).toContain("kronos_media_token");
  expect(texto).toContain("kronos_refresh_token");
  expect(texto).not.toContain("_ga");
  expect(texto).not.toContain("googletagmanager");
});

test("estado consulta el endpoint de salud y lo refleja", async () => {
  renderAppAt("/estado");

  expect(await screen.findByText("Funcionando")).toBeTruthy();
  await waitFor(() => expect(statusService.getServiceHealth).toHaveBeenCalled());
  expect(await screen.findByText("connected")).toBeTruthy();
  expect(screen.getByText("activo")).toBeTruthy();
  expect(screen.getByText("abc1234")).toBeTruthy();
});

test("una API caída se dice como sin respuesta, no como funcionando", async () => {
  statusService.getServiceHealth.mockResolvedValue({ reachable: false, ok: false, status: 0, database: "sin respuesta", realtime: false });
  renderAppAt("/estado");

  expect(await screen.findByText("Sin respuesta")).toBeTruthy();
  expect(screen.queryByText("responde")).toBeNull();
  expect(screen.queryByText("Funcionando")).toBeNull();
});

test("el estado degradado se anuncia como degradado", async () => {
  statusService.getServiceHealth.mockResolvedValue({
    reachable: true, ok: false, status: 503, database: "disconnected", realtime: false, build: null, startedAt: null
  });
  renderAppAt("/estado");

  expect(await screen.findByText("Servicio degradado")).toBeTruthy();
  expect(screen.getByText("disconnected")).toBeTruthy();
  expect(screen.getByText("no confirmado")).toBeTruthy();
});

test("el botón de comprobar vuelve a consultar", async () => {
  renderAppAt("/estado");
  await screen.findByText("Funcionando");

  fireEvent.click(screen.getByRole("button", { name: "Volver a comprobar" }));

  await waitFor(() => expect(statusService.getServiceHealth.mock.calls.length).toBeGreaterThanOrEqual(2));
});
