import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClientProvider } from "@tanstack/react-query";

import ProjectsPage from "../src/features/projects/ProjectsPage";
import ProjectBoard from "../src/features/projects/ProjectBoard";
import TemplatesPage from "../src/features/projects/TemplatesPage";
import { ToastProvider } from "../src/components/feedback/ToastProvider";
import { ConfirmProvider } from "../src/components/feedback/ConfirmProvider";
import { createTestQueryClient } from "../src/app/queryClient";
import * as servicio from "../src/services/projectsService";

vi.mock("../src/services/projectsService", () => ({
  getProjects: vi.fn(),
  createProject: vi.fn(),
  getProject: vi.fn(),
  updateProject: vi.fn(),
  deleteProject: vi.fn(),
  createProjectVersion: vi.fn(),
  deleteProjectVersion: vi.fn()
}));

const proyecto = (extra = {}) => ({
  _id: "p1",
  title: "Reel de lanzamiento",
  brief: "Presentar la pieza",
  format: "reel",
  scenes: [
    { _id: "s1", order: 0, title: "Gancho", script: "Abre con la pregunta", mediaUrl: "", mediaType: "" },
    { _id: "s2", order: 1, title: "Cierre", script: "Llama a la acción", mediaUrl: "", mediaType: "" }
  ],
  musicTitle: "",
  musicUrl: "",
  versions: [],
  versionsCount: 0,
  createdAt: "2026-01-01T10:00:00.000Z",
  updatedAt: "2026-01-02T10:00:00.000Z",
  ...extra
});

const version = (_id, label, guion) => ({
  _id,
  label,
  createdAt: "2026-01-03T10:00:00.000Z",
  scenesCount: guion.length,
  snapshot: {
    label,
    title: "Reel de lanzamiento",
    format: "reel",
    scenes: guion.map((texto, index) => ({ order: index, title: `Escena ${index + 1}`, script: texto, mediaUrl: "", mediaType: "" }))
  }
});

function montar(ui, ruta = "/projects") {
  return render(
    <QueryClientProvider client={createTestQueryClient()}>
      <ToastProvider>
        <ConfirmProvider>
          <MemoryRouter initialEntries={[ruta]}>{ui}</MemoryRouter>
        </ConfirmProvider>
      </ToastProvider>
    </QueryClientProvider>
  );
}

const pagina = (
  <Routes>
    <Route path="/projects" element={<ProjectsPage />} />
    <Route path="/projects/plantillas" element={<TemplatesPage />} />
    <Route path="/projects/:projectId" element={<ProjectBoard />} />
    <Route path="/projects/:projectId/destino" element={<p>Tablero abierto</p>} />
  </Routes>
);

beforeEach(() => {
  vi.resetAllMocks();
  servicio.getProjects.mockResolvedValue([proyecto()]);
  servicio.getProject.mockResolvedValue(
    proyecto({
      versions: [version("v1", "Primera", ["Abre con la pregunta", "Llama a la acción"]), version("v2", "Segunda", ["Abre con otra pregunta", "Llama a la acción"])],
      versionsCount: 2
    })
  );
  servicio.createProject.mockResolvedValue(proyecto({ _id: "nuevo" }));
  servicio.updateProject.mockResolvedValue(proyecto());
  servicio.createProjectVersion.mockResolvedValue({ version: version("v3", "Tercera", []) });
});

afterEach(() => cleanup());

test("la lista muestra los proyectos, su formato y su resumen", async () => {
  montar(pagina);
  expect(await screen.findByRole("heading", { name: "Reel de lanzamiento" })).toBeTruthy();
  expect(screen.getAllByText("Reel 9:16").length).toBeGreaterThan(0);
  expect(screen.getByText("2 escenas")).toBeTruthy();
  expect(screen.getByRole("link", { name: /Reel de lanzamiento/ }).getAttribute("href")).toBe("/projects/p1");
});

test("crear un proyecto avisa, refresca la lista y abre su tablero", async () => {
  montar(pagina);
  await screen.findByRole("heading", { name: "Reel de lanzamiento" });
  fireEvent.change(screen.getByLabelText("Nombre"), { target: { value: "Portada de marzo" } });
  fireEvent.click(screen.getByRole("button", { name: "Crear proyecto" }));
  await waitFor(() => expect(servicio.createProject).toHaveBeenCalledWith(expect.objectContaining({ title: "Portada de marzo" })));
  expect(await screen.findByText("Proyecto creado.")).toBeTruthy();
});

test("sin nombre no se crea nada y se explica por qué", async () => {
  montar(pagina);
  await screen.findByRole("heading", { name: "Reel de lanzamiento" });
  fireEvent.click(screen.getByRole("button", { name: "Crear proyecto" }));
  expect(await screen.findByRole("alert")).toBeTruthy();
  expect(screen.getByRole("alert").textContent).toContain("Ponle un nombre");
  expect(servicio.createProject).not.toHaveBeenCalled();
});

test("el tablero guarda el guion con el orden de las escenas", async () => {
  montar(pagina, "/projects/p1");
  await screen.findByDisplayValue("Reel de lanzamiento");
  fireEvent.change(screen.getByLabelText("Guion de la escena 1"), { target: { value: "Nuevo gancho" } });
  fireEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));
  await waitFor(() => expect(servicio.updateProject).toHaveBeenCalled());
  const [, enviado] = servicio.updateProject.mock.calls[0];
  expect(enviado.scenes[0]).toMatchObject({ order: 0, title: "Gancho", script: "Nuevo gancho" });
  expect(enviado.scenes[1]).toMatchObject({ order: 1, title: "Cierre" });
});

test("añadir una escena la coloca al final y renombra los campos", async () => {
  montar(pagina, "/projects/p1");
  await screen.findByDisplayValue("Reel de lanzamiento");
  fireEvent.click(screen.getByRole("button", { name: "Añadir escena" }));
  await screen.findByLabelText("Título de la escena 3");
  fireEvent.change(screen.getByLabelText("Título de la escena 3"), { target: { value: "Remate" } });
  fireEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));
  await waitFor(() => expect(servicio.updateProject).toHaveBeenCalled());
  const [, enviado] = servicio.updateProject.mock.calls[0];
  expect(enviado.scenes).toHaveLength(3);
  expect(enviado.scenes.map((escena) => escena.order)).toEqual([0, 1, 2]);
  expect(enviado.scenes[2].title).toBe("Remate");
});

test("subir una escena la intercambia con la anterior", async () => {
  montar(pagina, "/projects/p1");
  await screen.findByDisplayValue("Reel de lanzamiento");
  fireEvent.click(screen.getAllByRole("button", { name: "Subir escena" })[1]);
  fireEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));
  await waitFor(() => expect(servicio.updateProject).toHaveBeenCalled());
  const [, enviado] = servicio.updateProject.mock.calls[0];
  expect(enviado.scenes.map((escena) => escena.title)).toEqual(["Cierre", "Gancho"]);
});

test("quitar una escena la saca del envío sin tocar las demás", async () => {
  montar(pagina, "/projects/p1");
  await screen.findByDisplayValue("Reel de lanzamiento");
  fireEvent.click(screen.getAllByRole("button", { name: "Quitar escena" })[0]);
  fireEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));
  await waitFor(() => expect(servicio.updateProject).toHaveBeenCalled());
  const [, enviado] = servicio.updateProject.mock.calls[0];
  expect(enviado.scenes.map((escena) => escena.title)).toEqual(["Cierre"]);
});

test("las versiones se comparan escena por escena y marcan lo que cambió", async () => {
  montar(pagina, "/projects/p1?tab=versiones");
  expect(await screen.findByRole("heading", { name: "Comparar versiones" })).toBeTruthy();
  fireEvent.change(screen.getByLabelText("Versión A"), { target: { value: "v1" } });
  fireEvent.change(screen.getByLabelText("Versión B"), { target: { value: "v2" } });
  expect((await screen.findByRole("status")).textContent).toContain("1 escena(s) distintas");
  expect(screen.getByText("Abre con otra pregunta")).toBeTruthy();
  expect(document.querySelectorAll(".k-compare-row.is-changed")).toHaveLength(1);
});

test("guardar una versión congela con la etiqueta escrita", async () => {
  montar(pagina, "/projects/p1?tab=versiones");
  await screen.findByRole("heading", { name: "Guardar una versión" });
  fireEvent.change(screen.getByLabelText(/Etiqueta/), { target: { value: "Corte final" } });
  fireEvent.click(screen.getByRole("button", { name: "Guardar versión" }));
  await waitFor(() => expect(servicio.createProjectVersion).toHaveBeenCalledWith("p1", "Corte final"));
});

test("las tres pestañas existen y la pestaña activa se anuncia", async () => {
  montar(pagina, "/projects/p1");
  await screen.findByDisplayValue("Reel de lanzamiento");
  const tabs = screen.getAllByRole("tab").map((tab) => tab.textContent);
  expect(tabs).toEqual(["Guion y escenas", "Música", "Versiones"]);
  expect(screen.getByRole("tab", { name: "Guion y escenas" }).getAttribute("aria-selected")).toBe("true");
  fireEvent.click(screen.getByRole("tab", { name: "Música" }));
  expect(screen.getByRole("tab", { name: "Música" }).getAttribute("aria-selected")).toBe("true");
  expect(screen.getByRole("heading", { name: "Música de la pieza" })).toBeTruthy();
});

test("las plantillas ofrecen los tres formatos y crean el proyecto prellenado", async () => {
  servicio.getProjects.mockResolvedValue([]);
  montar(pagina, "/projects/plantillas");
  expect(screen.getByRole("heading", { name: "Plantillas de formato" })).toBeTruthy();
  const enlaces = screen.getAllByRole("link", { name: "Crear proyecto con esta plantilla" });
  expect(enlaces.length).toBe(3);
  expect(enlaces.map((enlace) => enlace.getAttribute("href"))).toEqual([
    "/projects?plantilla=reel",
    "/projects?plantilla=cuadrado",
    "/projects?plantilla=portada"
  ]);
  expect(screen.getByText("9:16")).toBeTruthy();
  expect(screen.getByText("1:1")).toBeTruthy();
  expect(screen.getByText("16:9")).toBeTruthy();
});

test("abrir una plantilla prellena el formulario y crea el proyecto con sus escenas", async () => {
  servicio.getProjects.mockResolvedValue([]);
  montar(pagina, "/projects?plantilla=reel");
  const crear = await screen.findByRole("button", { name: /Crear con/ });
  expect(screen.getByLabelText("Formato").value).toBe("reel");
  fireEvent.click(crear);
  await waitFor(() => expect(servicio.createProject).toHaveBeenCalled());
  const enviado = servicio.createProject.mock.calls[0][0];
  expect(enviado.format).toBe("reel");
  expect(enviado.scenes).toHaveLength(5);
});
