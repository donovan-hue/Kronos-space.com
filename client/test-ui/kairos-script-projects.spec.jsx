import React from "react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import ScriptProjects from "../src/features/script-ai/ScriptProjects";

vi.mock("../src/services/aiService", () => ({
  listScriptProjects: vi.fn(),
  getScriptProject: vi.fn(),
  deleteScriptProject: vi.fn(),
  exportScriptProject: vi.fn()
}));

vi.mock("../src/components/feedback/ConfirmProvider", () => ({
  useConfirm: () => vi.fn(async () => true)
}));

import * as ai from "../src/services/aiService";

const PROYECTO = {
  _id: "proj-1",
  title: "Ciudad de titanio",
  type: "video",
  genre: "general",
  format: "standard",
  durationMinutes: 5,
  result: "Guion completo del proyecto",
  structure: { title: "Ciudad de titanio", logline: "Una ciudad que despierta" },
  updatedAt: new Date("2026-11-01T10:00:00Z").toISOString()
};

beforeEach(() => {
  vi.clearAllMocks();
  ai.listScriptProjects.mockResolvedValue([PROYECTO]);
  ai.getScriptProject.mockResolvedValue(PROYECTO);
  ai.exportScriptProject.mockResolvedValue("guion exportado");
  ai.deleteScriptProject.mockResolvedValue({ deleted: true });
  // jsdom no implementa createObjectURL; la descarga solo necesita que exista.
  window.URL.createObjectURL = vi.fn(() => "blob:kronos");
  window.URL.revokeObjectURL = vi.fn();
  // jsdom no implementa la navegación del enlace de descarga; el clic se
  // intercepta para que la prueba mida la descarga y no un aviso de jsdom.
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
});

afterEach(() => cleanup());

test("lista los proyectos guardados con sus metadatos", async () => {
  render(<ScriptProjects onOpen={vi.fn()} />);

  expect(await screen.findByRole("heading", { name: "Proyectos de guion" })).toBeTruthy();
  expect(await screen.findByText("Ciudad de titanio")).toBeTruthy();
  expect(screen.getByText(/5 min/)).toBeTruthy();
  expect(screen.getByText("Guion completo del proyecto")).toBeTruthy();
});

test("sin proyectos invita a guardar uno en vez de dejar la sección vacía", async () => {
  ai.listScriptProjects.mockResolvedValue([]);
  render(<ScriptProjects onOpen={vi.fn()} />);

  expect(await screen.findByText("Todavía no hay proyectos guardados")).toBeTruthy();
});

test("abrir un proyecto carga su estructura en el editor", async () => {
  const onOpen = vi.fn();
  render(<ScriptProjects onOpen={onOpen} />);

  fireEvent.click(await screen.findByRole("button", { name: "Abrir" }));

  await waitFor(() => expect(ai.getScriptProject).toHaveBeenCalledWith("proj-1"));
  await waitFor(() => expect(onOpen).toHaveBeenCalledWith(PROYECTO));
});

test("exporta en txt y en json sin recargar la pantalla", async () => {
  render(<ScriptProjects onOpen={vi.fn()} />);

  fireEvent.click(await screen.findByRole("button", { name: "Exportar .txt" }));
  await waitFor(() => expect(ai.exportScriptProject).toHaveBeenCalledWith("proj-1", "txt"));
  expect(window.URL.createObjectURL).toHaveBeenCalled();

  fireEvent.click(screen.getByRole("button", { name: "Exportar .json" }));
  await waitFor(() => expect(ai.exportScriptProject).toHaveBeenCalledWith("proj-1", "json"));
});

test("eliminar pide confirmación y quita el proyecto de la lista", async () => {
  render(<ScriptProjects onOpen={vi.fn()} />);

  fireEvent.click(await screen.findByRole("button", { name: "Eliminar" }));

  await waitFor(() => expect(ai.deleteScriptProject).toHaveBeenCalledWith("proj-1"));
  await waitFor(() => expect(screen.queryByText("Ciudad de titanio")).toBeNull());
});

test("un fallo al listar se explica y se puede reintentar", async () => {
  ai.listScriptProjects
    .mockRejectedValueOnce({ response: { data: { error: "No se pudieron cargar los proyectos de guion." } } })
    .mockResolvedValueOnce([PROYECTO]);

  render(<ScriptProjects onOpen={vi.fn()} />);

  expect((await screen.findByRole("alert")).textContent).toContain(
    "No se pudieron cargar los proyectos de guion."
  );

  fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));

  expect(await screen.findByText("Ciudad de titanio")).toBeTruthy();
});
