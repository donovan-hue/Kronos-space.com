import React from "react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import StoriesBar from "../src/features/social/stories/StoriesBar";
import StoryCreator from "../src/features/social/stories/StoryCreator";
import StoryArchive from "../src/features/social/stories/StoryArchive";
import * as storiesService from "../src/services/storiesService";
import * as postsService from "../src/services/postsService";
import * as circlesService from "../src/services/circlesService";
import * as authStorage from "../src/services/authStorage";

vi.mock("../src/services/storiesService", () => ({
  createStory: vi.fn(),
  deleteStory: vi.fn(),
  getMyStoryArchive: vi.fn(),
  getStoryReplies: vi.fn(),
  getStoryTray: vi.fn(),
  getStoryViewers: vi.fn(),
  markStoryViewed: vi.fn(),
  replyToStory: vi.fn()
}));

vi.mock("../src/services/postsService", () => ({
  uploadMedia: vi.fn()
}));

vi.mock("../src/services/circlesService", () => ({
  getCircles: vi.fn()
}));

vi.mock("../src/services/authStorage", () => ({
  getUser: vi.fn()
}));

const ME = { _id: "user-me", username: "donovan", displayName: "Donovan", avatar: "" };
const ANA = { _id: "user-ana", username: "ana", displayName: "Ana", avatar: "" };

function story(overrides = {}) {
  return {
    _id: "story-1",
    author: ANA,
    media: { url: "/uploads/media/ana.jpg", type: "image", mimeType: "image/jpeg", alt: "Playa" },
    caption: "Verano",
    audience: { type: "public" },
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 3600000).toISOString(),
    isActive: true,
    viewsCount: 0,
    repliesCount: 0,
    viewed: false,
    mine: false,
    ...overrides
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  authStorage.getUser.mockReturnValue(ME);
  storiesService.getStoryTray.mockResolvedValue([]);
  storiesService.getMyStoryArchive.mockResolvedValue([]);
  storiesService.markStoryViewed.mockResolvedValue({ viewed: true, viewsCount: 1 });
  storiesService.getStoryReplies.mockResolvedValue([]);
  storiesService.getStoryViewers.mockResolvedValue([]);
  storiesService.replyToStory.mockResolvedValue({ repliesCount: 1 });
  storiesService.createStory.mockResolvedValue(story({ mine: true, author: ME }));
  storiesService.deleteStory.mockResolvedValue({ deleted: true });
  postsService.uploadMedia.mockResolvedValue({ url: "/uploads/media/subida.jpg", type: "image", mimeType: "image/jpeg", size: 900 });
  circlesService.getCircles.mockResolvedValue([{ _id: "circle-1", name: "Equipo" }]);
});

afterEach(() => cleanup());

test("la bandeja muestra la historia propia y las de quien sigo, con anillo si hay sin ver", async () => {
  storiesService.getStoryTray.mockResolvedValue([
    { author: ME, stories: [story({ _id: "own-1", mine: true, author: ME, viewed: true })], hasUnseen: false, latestAt: new Date().toISOString() },
    { author: ANA, stories: [story({ _id: "ana-1" })], hasUnseen: true, latestAt: new Date().toISOString() }
  ]);

  render(
    <MemoryRouter>
      <StoriesBar />
    </MemoryRouter>
  );

  expect(await screen.findByRole("button", { name: "Tu historia" })).toBeTruthy();
  const anaTile = screen.getByRole("button", { name: "Historias de Ana" });
  expect(anaTile.querySelector(".k-story-ring").className).toContain("is-unseen");
  expect(screen.getByRole("link", { name: "Archivo de historias" })).toBeTruthy();
});

test("el visor marca la historia como vista, navega y responde en privado", async () => {
  const anaStory = story({ _id: "ana-1" });
  storiesService.getStoryTray.mockResolvedValue([
    { author: ANA, stories: [anaStory, story({ _id: "ana-2", caption: "Segunda" })], hasUnseen: true, latestAt: new Date().toISOString() }
  ]);

  render(
    <MemoryRouter>
      <StoriesBar />
    </MemoryRouter>
  );

  fireEvent.click(await screen.findByRole("button", { name: "Historias de Ana" }));

  await waitFor(() => expect(storiesService.markStoryViewed).toHaveBeenCalledWith("ana-1"));
  expect(await screen.findByRole("dialog", { name: "Historia de Ana" })).toBeTruthy();
  expect(screen.getByAltText("Playa")).toBeTruthy();
  expect(screen.getByText("Verano")).toBeTruthy();

  // Navegación manual entre historias del mismo autor.
  fireEvent.click(screen.getByRole("button", { name: "Siguiente historia" }));
  expect(await screen.findByText("Segunda")).toBeTruthy();

  // Respuesta privada.
  fireEvent.change(screen.getByLabelText("Responder a ana"), { target: { value: "¡Qué bonita foto!" } });
  fireEvent.click(screen.getByRole("button", { name: "Responder" }));
  await waitFor(() => expect(storiesService.replyToStory).toHaveBeenCalledWith("ana-2", "¡Qué bonita foto!"));
  expect(await screen.findByText("Respuesta enviada.")).toBeTruthy();
});

test("el visor del autor muestra actividad, carga respuestas y elimina con confirmación", async () => {
  const own = story({ _id: "own-1", mine: true, author: ME, viewed: true, viewsCount: 3, repliesCount: 1 });
  storiesService.getStoryTray.mockResolvedValue([
    { author: ME, stories: [own], hasUnseen: false, latestAt: new Date().toISOString() }
  ]);
  storiesService.getStoryReplies.mockResolvedValue([
    { user: ANA, text: "Me encanta", createdAt: new Date().toISOString() }
  ]);
  storiesService.getStoryViewers.mockResolvedValue([
    { _id: ANA._id, username: "ana", displayName: "Ana", avatar: "", viewedAt: new Date().toISOString() }
  ]);

  render(
    <MemoryRouter>
      <StoriesBar />
    </MemoryRouter>
  );

  fireEvent.click(await screen.findByRole("button", { name: "Tu historia" }));
  expect(await screen.findByRole("dialog", { name: "Historia de Donovan" })).toBeTruthy();
  expect(screen.queryByLabelText("Responder a donovan")).toBeNull();

  fireEvent.click(screen.getByRole("button", { name: "3 vistas · 1 respuesta" }));
  expect(await screen.findByText("Me encanta")).toBeTruthy();
  // "Ana" aparece como autora de la respuesta y como espectadora.
  expect((await screen.findAllByText("Ana")).length).toBeGreaterThanOrEqual(2);

  fireEvent.click(screen.getByRole("button", { name: "Eliminar historia" }));
  fireEvent.click(await screen.findByRole("button", { name: "Sí, eliminar" }));
  await waitFor(() => expect(storiesService.deleteStory).toHaveBeenCalledWith("own-1"));
});

test("el creador sube la media real y publica con audiencia de círculo", async () => {
  render(
    <MemoryRouter>
      <StoryCreator open onClose={vi.fn()} onCreated={vi.fn()} />
    </MemoryRouter>
  );

  const file = new File(["imagen"], "historia.jpg", { type: "image/jpeg" });
  fireEvent.change(screen.getByLabelText("Imagen o video de la historia"), { target: { files: [file] } });

  fireEvent.change(screen.getByLabelText("Texto alternativo", { exact: false }), { target: { value: "Un atardecer" } });
  fireEvent.change(screen.getByLabelText("Texto de la historia", { exact: false }), { target: { value: "Buenas noches" } });
  fireEvent.change(screen.getByLabelText("Audiencia de la historia"), { target: { value: "circle" } });
  fireEvent.change(await screen.findByLabelText("Círculo de la historia"), { target: { value: "circle-1" } });

  fireEvent.click(screen.getByRole("button", { name: "Publicar historia" }));

  await waitFor(() => expect(postsService.uploadMedia).toHaveBeenCalledWith(file));
  await waitFor(() =>
    expect(storiesService.createStory).toHaveBeenCalledWith({
      media: { url: "/uploads/media/subida.jpg", type: "image", mimeType: "image/jpeg", size: 900, alt: "Un atardecer" },
      caption: "Buenas noches",
      audience: { type: "circle", circleId: "circle-1" }
    })
  );
});

test("el creador exige archivo y no publica sin él", async () => {
  render(
    <MemoryRouter>
      <StoryCreator open onClose={vi.fn()} onCreated={vi.fn()} />
    </MemoryRouter>
  );

  fireEvent.click(screen.getByRole("button", { name: "Publicar historia" }));
  expect(await screen.findByText("Elige una imagen o un video para tu historia.")).toBeTruthy();
  expect(postsService.uploadMedia).not.toHaveBeenCalled();
});

test("el archivo personal lista activas y expiradas, y elimina con confirmación", async () => {
  storiesService.getMyStoryArchive.mockResolvedValue([
    story({ _id: "a-1", mine: true, author: ME, isActive: true, viewsCount: 2, repliesCount: 1 }),
    story({ _id: "a-2", mine: true, author: ME, isActive: false, viewed: true, viewsCount: 5 })
  ]);

  render(
    <MemoryRouter>
      <StoryArchive />
    </MemoryRouter>
  );

  expect(await screen.findByText("2 historias · 1 activa. Las expiradas solo las ves tú.")).toBeTruthy();
  expect(screen.getByText("Activa")).toBeTruthy();
  expect(screen.getByText("Expirada")).toBeTruthy();

  fireEvent.click(screen.getAllByRole("button", { name: /^Eliminar historia del/ })[0]);
  fireEvent.click(await screen.findByRole("button", { name: "Sí, eliminar" }));
  await waitFor(() => expect(storiesService.deleteStory).toHaveBeenCalledWith("a-1"));
  expect(await screen.findByText("1 historia. Las expiradas solo las ves tú.")).toBeTruthy();
});
