import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import App from "../src/App";
import { SHORTCUTS } from "../src/components/shortcuts/ShortcutsModal.jsx";
import { AYUDA_ENLACES, AYUDA_PANTALLAS, AYUDA_SECCIONES } from "../src/features/help/ayuda";
import { NAV_GROUPS } from "../src/navigation/model.jsx";
import * as statusService from "../src/services/statusService";

/**
 * CENTRO DE AYUDA PÚBLICO (`/ayuda`).
 *
 * Lo que sella esta suite es lo que hace útil una ayuda: que no mienta y que no
 * esté vacía. Corre sobre el router real, sin sesión, y vigila cuatro cosas:
 *
 *   1. La ruta se monta sin cuenta y no redirige al acceso.
 *   2. Ninguna sección sale cascarón y ningún destino del modelo de navegación
 *      se queda sin explicar: la lista se genera desde `NAV_GROUPS`, así que el
 *      día que aparezca un destino nuevo esta suite lo exige documentado.
 *   3. El índice no tiene anclas muertas y los enlaces del pie se siguen de
 *      verdad (se navega, no se compara una cadena).
 *   4. El texto no promete un cobro que no existe y no esconde los límites.
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
  statusService.getServiceHealth.mockResolvedValue({ status: "ok", checks: [] });
});

afterEach(() => cleanup());

test("/ayuda se monta sin sesión y no cae en el acceso", async () => {
  renderAppAt("/ayuda");

  expect(await screen.findByRole("heading", { level: 1, name: "Centro de ayuda" })).toBeTruthy();
  // La prueba de que no rebotó al acceso es doble: la ruta sigue siendo /ayuda y
  // en la pantalla no hay formulario (el acceso siempre tiene uno).
  expect(screen.queryByRole("form")).toBeNull();
  expect(window.location.pathname).toBe("/ayuda");
});

test("ninguna sección sale cascarón: dos párrafos largos por sección, sin relleno", async () => {
  renderAppAt("/ayuda");
  await screen.findByRole("heading", { level: 1, name: "Centro de ayuda" });

  expect(AYUDA_SECCIONES.length).toBeGreaterThanOrEqual(6);

  for (const seccion of AYUDA_SECCIONES) {
    const raiz = document.getElementById(seccion.id);
    expect(raiz, `falta la sección #${seccion.id}`).toBeTruthy();
    expect(raiz.querySelector("h2")?.textContent).toBe(seccion.titulo);

    const parrafos = [...raiz.querySelectorAll("p")];
    expect(parrafos.length, `${seccion.id}: sin párrafos`).toBeGreaterThanOrEqual(2);
    for (const parrafo of parrafos) {
      expect(parrafo.textContent.trim().length, `${seccion.id}: párrafo de relleno`).toBeGreaterThan(80);
      expect(/lorem|más opciones pronto|próximamente/i.test(parrafo.textContent), `${seccion.id}: texto de relleno`).toBe(false);
    }
  }
});

test("todo destino del modelo de navegación está explicado en la ayuda", async () => {
  renderAppAt("/ayuda");
  const titulo = await screen.findByRole("heading", { name: "Qué hay en cada pantalla" });
  const bloque = titulo.closest("section");

  const destinos = NAV_GROUPS.flatMap((grupo) => grupo.items);
  expect(destinos.length).toBeGreaterThanOrEqual(17);

  const etiquetas = [...bloque.querySelectorAll("strong")].map((nodo) => nodo.textContent.trim());
  for (const item of destinos) {
    expect(AYUDA_PANTALLAS[item.id], `sin texto para el destino «${item.id}»`).toBeTruthy();
    expect(
      etiquetas.some((etiqueta) => etiqueta.endsWith(item.label)),
      `${item.label} no aparece en la lista de pantallas`
    ).toBe(true);
    expect(bloque.textContent).toContain(AYUDA_PANTALLAS[item.id]);
  }

  // El hueco visible no puede existir: si faltara texto se vería el aviso.
  expect(bloque.textContent).not.toContain("Aún sin explicar en este centro.");

  // Las ocho herramientas de Kairos viajan con su destino, listas en su línea.
  const kairos = destinos.find((item) => item.id === "kairos");
  expect(kairos.children).toHaveLength(8);
  const linea = [...bloque.querySelectorAll("p")]
    .map((parrafo) => parrafo.textContent)
    .find((texto) => texto.startsWith("Herramientas:"));
  expect(linea, "falta la línea de herramientas de Kairos").toBeTruthy();
  for (const hijo of kairos.children) {
    expect(linea).toContain(hijo.label);
  }
});

test("el índice ancla a secciones que existen y el pie enlaza rutas públicas vivas", async () => {
  renderAppAt("/ayuda");
  const indice = await screen.findByRole("navigation", { name: "Índice del centro de ayuda" });

  const anclas = within(indice).getAllByRole("link");
  expect(anclas.length).toBe(AYUDA_SECCIONES.length + 2);
  for (const enlace of anclas) {
    const destino = enlace.getAttribute("href");
    expect(destino.startsWith("#"), `el índice no debe sacar de la página: ${destino}`).toBe(true);
    expect(document.querySelector(destino), `ancla muerta ${destino}`).toBeTruthy();
  }

  // Un enlace del pie se sigue de verdad: la página de estado responde sin sesión.
  fireEvent.click(await screen.findByRole("link", { name: "Estado del servicio" }));
  await waitFor(() => expect(statusService.getServiceHealth).toHaveBeenCalled());
  expect(window.location.pathname).toBe("/estado");
});

test("la tabla de atajos es la del panel, no una copia que se desincroniza", async () => {
  renderAppAt("/ayuda");
  const titulo = await screen.findByRole("heading", { name: "Atajos de teclado" });
  const lista = titulo.closest("section").querySelector(".k-shortcuts-list");
  const teclas = [...lista.querySelectorAll("kbd")].map((kbd) => kbd.textContent);

  expect(teclas).toEqual(SHORTCUTS.map((atajo) => atajo.key));
  expect(teclas.length).toBeGreaterThanOrEqual(5);
});

test("la ayuda no promete un cobro ni esconde los límites declarados", async () => {
  renderAppAt("/ayuda");
  const raiz = await screen.findByRole("heading", { level: 1, name: "Centro de ayuda" });
  const texto = raiz.closest("main").textContent;

  expect(texto).toContain("no hay pasarela de pago");
  expect(texto).toContain("simbólicos");
  expect(/\b(comprar|checkout|tarjeta de crédito|método de pago|precio|suscripción)\b/i.test(texto)).toBe(false);

  // Los límites van escritos, no suavizados.
  expect(texto).toContain("un solo idioma");
  expect(texto).toContain("una sola instancia");
  expect(texto).toContain("empiezan vacíos");
  expect(texto).toContain("no hay servidor de retransmisión");
});

test("el acceso del sitio enlaza al centro de ayuda (quien no tiene cuenta es quien tiene dudas)", async () => {
  renderAppAt("/login");
  const enlace = await screen.findByRole("link", { name: "Ayuda" });

  fireEvent.click(enlace);
  await waitFor(() => expect(window.location.pathname).toBe("/ayuda"));
  expect(await screen.findByRole("heading", { level: 1, name: "Centro de ayuda" })).toBeTruthy();
  expect(AYUDA_ENLACES.length).toBeGreaterThanOrEqual(4);
});
