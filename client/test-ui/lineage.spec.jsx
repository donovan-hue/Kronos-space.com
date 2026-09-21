import React from "react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import PostCard from "../src/features/social/components/PostCard";
import CreatePost from "../src/features/social/CreatePost";
import * as postsService from "../src/services/postsService";
import * as aiService from "../src/services/aiService";
import * as draftsService from "../src/services/draftsService";
import * as circlesService from "../src/services/circlesService";
import * as orbitsService from "../src/services/orbitsService";

vi.mock("../src/services/postsService", () => ({
  createPost: vi.fn(),
  remixPost: vi.fn(),
  uploadMedia: vi.fn()
}));

vi.mock("../src/services/aiService", () => ({
  sendKairosMessage: vi.fn()
}));

vi.mock("../src/services/draftsService", () => ({
  createDraft: vi.fn(),
  deleteDraft: vi.fn(),
  getDrafts: vi.fn(),
  updateDraft: vi.fn()
}));

vi.mock("../src/services/circlesService", () => ({ getCircles: vi.fn() }));
vi.mock("../src/services/orbitsService", () => ({ getOrbits: vi.fn() }));

function basePost(overrides = {}) {
  return {
    _id: "post-1",
    author: { _id: "u1", username: "ana", displayName: "Ana" },
    content: "Obra original",
    media: { url: "/uploads/media/obra.jpg", type: "image", alt: "Obra" },
    mediaItems: [],
    comments: [],
    commentThreads: [],
    commentsCount: 0,
    createdAt: new Date().toISOString(),
    lineage: { derivedFrom: null, derivedFromAuthor: null, tool: "", aiGenerated: false },
    ...overrides
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  draftsService.getDrafts.mockResolvedValue([]);
  circlesService.getCircles.mockResolvedValue([]);
  orbitsService.getOrbits.mockResolvedValue([]);
  postsService.createPost.mockResolvedValue(basePost());
});

afterEach(() => cleanup());

test("el badge de remix muestra la atribución a la autora original", () => {
  render(
    <MemoryRouter>
      <PostCard post={basePost({
        content: "Mi versión",
        lineage: {
          derivedFrom: "post-0",
          derivedFromAuthor: { username: "ana", displayName: "Ana" },
          tool: "remix",
          aiGenerated: false
        }
      })} />
    </MemoryRouter>
  );

  const badge = screen.getByText("Remix", { exact: false });
  expect(badge).toBeTruthy();
  expect(screen.getByText("@ana")).toBeTruthy();
  expect(screen.getByRole("link", { name: "@ana" }).getAttribute("href")).toBe("/profile/ana");
  expect(screen.queryByText("Creado con IA")).toBeNull();
});

test("las publicaciones de Kairos muestran la etiqueta de IA", () => {
  render(
    <MemoryRouter>
      <PostCard post={basePost({
        lineage: { derivedFrom: null, derivedFromAuthor: null, tool: "kairos-image", aiGenerated: true }
      })} />
    </MemoryRouter>
  );

  expect(screen.getByText("Creado con IA")).toBeTruthy();
  expect(screen.queryByText(/Remix/)).toBeNull();
});

test("el menú ofrece remix con atribución solo cuando hay media", () => {
  const onRemix = vi.fn();
  const { rerender } = render(
    <MemoryRouter>
      <PostCard post={basePost()} onRemix={onRemix} />
    </MemoryRouter>
  );

  const summary = screen.getByLabelText("Más opciones de la publicación");
  fireEvent.click(summary);
  summary.closest("details").setAttribute("open", "");
  const remixButton = screen.getByRole("menuitem", { name: "Remix con atribución" });
  fireEvent.click(remixButton);
  expect(onRemix).toHaveBeenCalledWith("post-1");

  rerender(
    <MemoryRouter>
      <PostCard post={basePost({ media: { url: "", type: "" } })} onRemix={onRemix} />
    </MemoryRouter>
  );
  const summary2 = screen.getByLabelText("Más opciones de la publicación");
  fireEvent.click(summary2);
  summary2.closest("details").setAttribute("open", "");
  expect(screen.queryByRole("menuitem", { name: "Remix con atribución" })).toBeNull();
});

test("Kairos sugiere en el compositor y solo aplica con confirmación", async () => {
  aiService.sendKairosMessage.mockResolvedValue({ text: "Versión mejorada por Kairos" });

  render(
    <MemoryRouter>
      <CreatePost onCreated={vi.fn()} />
    </MemoryRouter>
  );

  const textarea = screen.getByLabelText("Contenido de la publicación");
  fireEvent.change(textarea, { target: { value: "borrador simple" } });
  fireEvent.click(screen.getByRole("button", { name: "Mejorar con Kairos" }));

  await waitFor(() => expect(aiService.sendKairosMessage).toHaveBeenCalledTimes(1));
  expect(String(aiService.sendKairosMessage.mock.calls[0][0].message)).toContain("borrador simple");
  expect(await screen.findByText("Versión mejorada por Kairos")).toBeTruthy();
  // Sin confirmación, el texto del usuario no cambia.
  expect(textarea.value).toBe("borrador simple");

  fireEvent.click(screen.getByRole("button", { name: "Usar esta versión" }));
  expect(textarea.value).toBe("Versión mejorada por Kairos");
  expect(screen.queryByRole("region", { name: "Sugerencia de Kairos" })).toBeNull();
});
