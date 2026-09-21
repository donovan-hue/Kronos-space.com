import React from "react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import CreatePost from "../src/features/social/CreatePost";
import * as drafts from "../src/services/draftsService";

vi.mock("../src/services/postsService", () => ({
  createPost: vi.fn(),
  uploadMedia: vi.fn()
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
});

afterEach(() => cleanup());

function mount() {
  return render(<MemoryRouter><CreatePost /></MemoryRouter>);
}

test("Bloque 14 muestra borradores persistidos y guarda mediante el servicio real", async () => {
  mount();

  expect(await screen.findByText("No tienes borradores guardados.")).toBeTruthy();
  fireEvent.change(screen.getByRole("textbox", { name: "Contenido de la publicación" }), {
    target: { value: "Texto para guardar" }
  });
  fireEvent.click(screen.getByRole("button", { name: "Guardar borrador" }));

  await waitFor(() => expect(drafts.createDraft).toHaveBeenCalledWith(expect.objectContaining({ content: "Texto para guardar" })));
  expect(screen.getByRole("status").textContent).toContain("Borrador guardado");
});

test("Bloque 14 reanuda y elimina borradores mediante endpoints separados", async () => {
  drafts.getDrafts.mockResolvedValue({ drafts: [DRAFT], hasMore: false });
  mount();

  const openDraft = await screen.findByRole("button", { name: /Texto guardado/ });
  fireEvent.click(openDraft);
  expect(screen.getByRole("textbox", { name: "Contenido de la publicación" }).value).toBe("Texto guardado");

  fireEvent.click(screen.getByRole("button", { name: "Eliminar borrador" }));
  await waitFor(() => expect(drafts.deleteDraft).toHaveBeenCalledWith("draft-1"));
});
