import React from "react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import CreatePost from "../src/features/social/CreatePost";
import * as drafts from "../src/services/draftsService";
import * as circles from "../src/services/circlesService";
import * as orbits from "../src/services/orbitsService";

vi.mock("../src/services/postsService", () => ({
  createPost: vi.fn(),
  uploadMedia: vi.fn()
}));

// `CreatePost` también pide círculos y órbitas para los selectores de
// audiencia. Antes no se simulaban: cada montaje lanzaba dos peticiones
// reales que jsdom no puede servir y ensuciaban la salida con
// `AggregateError`. La prueba pasaba porque el componente mostraba su
// estado vacío ante el fallo de red, no porque se hubiera comprobado.
vi.mock("../src/services/circlesService", () => ({
  getCircles: vi.fn()
}));

vi.mock("../src/services/orbitsService", () => ({
  getOrbits: vi.fn()
}));

vi.mock("../src/services/draftsService", () => ({
  createDraft: vi.fn(),
  deleteDraft: vi.fn(),
  getDrafts: vi.fn(),
  updateDraft: vi.fn()
}));

const DRAFT = {
  _id: "draft-1",
  content: "Texto guardado",
  media: { url: "", type: "", alt: "" },
  mediaItems: [],
  updatedAt: "2026-09-20T12:00:00.000Z"
};

beforeEach(() => {
  vi.resetAllMocks();
  drafts.getDrafts.mockResolvedValue({ drafts: [], hasMore: false });
  drafts.createDraft.mockResolvedValue({ ...DRAFT, content: "Texto nuevo" });
  drafts.updateDraft.mockResolvedValue(DRAFT);
  drafts.deleteDraft.mockResolvedValue({ ok: true });
  circles.getCircles.mockResolvedValue({ circles: [] });
  orbits.getOrbits.mockResolvedValue({ orbits: [] });
});

afterEach(() => cleanup());

function mount() {
  return render(<MemoryRouter><CreatePost /></MemoryRouter>);
}

test("Bloque 14 espera la confirmación del servicio antes de anunciar el borrador guardado", async () => {
  let finishSave;
  drafts.createDraft.mockImplementationOnce(() => new Promise(resolve => { finishSave = resolve; }));
  mount();

  expect(await screen.findByText("No tienes borradores guardados.")).toBeTruthy();
  fireEvent.change(screen.getByRole("textbox", { name: "Contenido de la publicación" }), {
    target: { value: "Texto para guardar" }
  });
  fireEvent.click(screen.getByRole("button", { name: "Guardar borrador" }));

  await waitFor(() => expect(drafts.createDraft).toHaveBeenCalledWith(expect.objectContaining({ content: "Texto para guardar" })));
  expect(screen.queryByRole("status")).toBeNull();
  expect(screen.getByRole("button", { name: "Guardando..." }).disabled).toBe(true);
  // El servicio puede haber sido invocado sin que su respuesta haya llegado.
  await act(async () => { finishSave({ ...DRAFT, content: "Texto para guardar" }); });
  expect((await screen.findByRole("status")).textContent).toContain("Borrador guardado");
  expect(screen.getByRole("button", { name: "Actualizar borrador" }).disabled).toBe(false);
});

test("Bloque 14 reanuda y elimina borradores mediante el servicio simulado", async () => {
  drafts.getDrafts.mockResolvedValue({ drafts: [DRAFT], hasMore: false });
  mount();

  const openDraft = await screen.findByRole("button", { name: /Texto guardado/ });
  fireEvent.click(openDraft);
  expect(screen.getByRole("textbox", { name: "Contenido de la publicación" }).value).toBe("Texto guardado");

  fireEvent.click(screen.getByRole("button", { name: "Eliminar borrador" }));
  await waitFor(() => expect(drafts.deleteDraft).toHaveBeenCalledWith("draft-1"));
  expect(await screen.findByText("No tienes borradores guardados.")).toBeTruthy();
});


test("Bloque 14 conserva el texto y no anuncia éxito si guardar falla", async () => {
  let failSave;
  drafts.createDraft.mockImplementationOnce(() => new Promise((resolve, reject) => { failSave = reject; }));
  mount();
  await screen.findByText("No tienes borradores guardados.");
  fireEvent.change(screen.getByRole("textbox", { name: "Contenido de la publicación" }), {
    target: { value: "Texto sin guardar" }
  });
  fireEvent.click(screen.getByRole("button", { name: "Guardar borrador" }));
  await waitFor(() => expect(drafts.createDraft).toHaveBeenCalledTimes(1));
  expect(screen.getByRole("button", { name: "Guardando..." }).disabled).toBe(true);
  expect(screen.queryByRole("status")).toBeNull();
  await act(async () => { failSave({ response: { status: 503, data: { error: "Servicio temporalmente no disponible" } } }); });
  expect((await screen.findByRole("alert")).textContent).toContain("Servicio temporalmente no disponible");
  expect(screen.queryByRole("status")).toBeNull();
  expect(screen.getByRole("textbox", { name: "Contenido de la publicación" }).value).toBe("Texto sin guardar");
  expect(screen.getByRole("button", { name: "Guardar borrador" }).disabled).toBe(false);
});
