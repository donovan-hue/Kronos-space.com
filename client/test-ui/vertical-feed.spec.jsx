import React from "react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import VerticalFeed from "../src/features/social/vertical/VerticalFeed";
import * as postsService from "../src/services/postsService";
import * as authStorage from "../src/services/authStorage";
import { withQueryClient } from "./testUtils";

vi.mock("../src/services/postsService", () => ({
  getVerticalFeed: vi.fn(),
  likePost: vi.fn(),
  toggleSave: vi.fn()
}));

vi.mock("../src/services/authStorage", () => ({
  getUser: vi.fn()
}));

const ANA = { _id: "user-ana", username: "ana", displayName: "Ana", avatar: "" };

function videoPost(overrides = {}) {
  return {
    _id: "post-1",
    author: ANA,
    content: "Mi primer vertical",
    media: { url: "/uploads/media/vertical.mp4", type: "video", mimeType: "video/mp4", alt: "", posterUrl: "" },
    likesCount: 0,
    reactionsCount: 0,
    commentsCount: 2,
    saved: false,
    reaction: null,
    liked: false,
    createdAt: new Date().toISOString(),
    ...overrides
  };
}

function verticalPage(posts, hasMore = false) {
  return { posts, total: posts.length, page: 1, limit: 10, hasMore };
}

beforeEach(() => {
  vi.resetAllMocks();
  authStorage.getUser.mockReturnValue({ _id: "user-me", username: "donovan" });
  postsService.getVerticalFeed.mockResolvedValue(verticalPage([]));
  postsService.likePost.mockResolvedValue({ postId: "post-1", liked: true, likesCount: 1, reaction: "like" });
  postsService.toggleSave.mockResolvedValue({ postId: "post-1", saved: true, savedCount: 1 });
});

afterEach(() => cleanup());

test("el feed vertical muestra los videos con autor y acciones reales", async () => {
  postsService.getVerticalFeed.mockResolvedValue(verticalPage([
    videoPost(),
    videoPost({ _id: "post-2", content: "Otro video", commentsCount: 0, media: { url: "/uploads/media/otro.mp4", type: "video", alt: "Salto", posterUrl: "" } })
  ]));

  withQueryClient(
    <MemoryRouter>
      <VerticalFeed />
    </MemoryRouter>
  );

  expect(await screen.findByRole("feed", { name: "Videos verticales" })).toBeTruthy();
  expect(screen.getByLabelText("Mi primer vertical")).toBeTruthy();
  expect(screen.getByLabelText("Salto")).toBeTruthy();
  expect(screen.getAllByRole("link", { name: "Ana" }).length).toBe(2);
  expect(screen.getByRole("link", { name: "Comentarios. 2" })).toBeTruthy();
  expect(screen.getByText("1 de 2")).toBeTruthy();
});

test("reaccionar y guardar usan los endpoints reales y actualizan el estado", async () => {
  postsService.getVerticalFeed.mockResolvedValue(verticalPage([videoPost()]));

  withQueryClient(
    <MemoryRouter>
      <VerticalFeed />
    </MemoryRouter>
  );

  const likeButton = await screen.findByRole("button", { name: "Reaccionar. 0 reacciones" });
  fireEvent.click(likeButton);
  await waitFor(() => expect(postsService.likePost).toHaveBeenCalledWith("post-1"));
  expect(await screen.findByRole("button", { name: /Quitar reacción\. 1 reacci/ })).toBeTruthy();

  fireEvent.click(screen.getByRole("button", { name: "Guardar video" }));
  await waitFor(() => expect(postsService.toggleSave).toHaveBeenCalledWith("post-1"));
  expect(await screen.findByRole("button", { name: "Quitar de guardados" })).toBeTruthy();
});

test("el estado vacío explica la superficie y ofrece publicar", async () => {
  withQueryClient(
    <MemoryRouter>
      <VerticalFeed />
    </MemoryRouter>
  );

  expect(await screen.findByText(/Todavía no hay videos verticales en tu red/)).toBeTruthy();
  expect(screen.getByRole("link", { name: "Subir un video" })).toBeTruthy();
  expect(postsService.likePost).not.toHaveBeenCalled();
});

test("un error de red muestra el mensaje del servidor y permite reintentar", async () => {
  postsService.getVerticalFeed.mockRejectedValue({ response: { data: { error: "Error obteniendo el feed vertical" } } });

  withQueryClient(
    <MemoryRouter>
      <VerticalFeed />
    </MemoryRouter>
  );

  expect(await screen.findByRole("alert")).toBeTruthy();
  expect(screen.getByText("Error obteniendo el feed vertical")).toBeTruthy();

  postsService.getVerticalFeed.mockResolvedValue(verticalPage([videoPost()]));
  fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
  await waitFor(() => expect(postsService.getVerticalFeed.mock.calls.length).toBeGreaterThanOrEqual(2));
  expect(await screen.findByLabelText("Mi primer vertical")).toBeTruthy();
});
