import { afterEach, expect, test, vi } from "vitest";
import { cleanup, screen, waitFor } from "@testing-library/react";

/**
 * Humo de la demo local: monta la entrada real `demo/main.jsx` con su API en
 * memoria y comprueba que las tres pantallas llegan a pintar contenido.
 * No sustituye a mirarla en el navegador; detecta errores de arranque.
 */

afterEach(() => {
  cleanup();
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

test("la demo arranca, lista proyectos y abre una plantilla", async () => {
  document.body.innerHTML = '<div id="root"></div>';
  window.location.hash = "#/projects";
  await import("../demo/main.jsx");

  expect(await screen.findByRole("heading", { name: "Proyectos" }, { timeout: 4000 })).toBeTruthy();
  expect(await screen.findByRole("heading", { name: "Lanzamiento de la app" }, { timeout: 4000 })).toBeTruthy();
  expect(screen.getByText("3", { selector: ".k-projects-summary strong" })).toBeTruthy();

  window.location.hash = "#/projects/plantillas";
  await waitFor(
    () => expect(screen.getByRole("heading", { name: "Plantillas de formato" })).toBeTruthy(),
    { timeout: 4000 }
  );
  expect(screen.getAllByRole("link", { name: "Crear proyecto con esta plantilla" })).toHaveLength(4);
});
