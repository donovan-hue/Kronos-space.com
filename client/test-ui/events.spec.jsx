import React from "react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import CreatePost from "../src/features/social/CreatePost";
import PostCard from "../src/features/social/components/PostCard";
import * as posts from "../src/services/postsService";
import * as drafts from "../src/services/draftsService";

vi.mock("../src/services/postsService", () => ({
  createPost: vi.fn(),
  uploadMedia: vi.fn(),
  rsvpEvent: vi.fn()
}));

vi.mock("../src/services/draftsService", () => ({
  createDraft: vi.fn(),
  deleteDraft: vi.fn(),
  getDrafts: vi.fn(),
  updateDraft: vi.fn()
}));

vi.mock("../src/services/circlesService", () => ({ getCircles: vi.fn(() => Promise.resolve([])) }));
vi.mock("../src/services/orbitsService", () => ({ getOrbits: vi.fn(() => Promise.resolve([])) }));

const EVENT = {
  title: "Sesión de comunidad",
  description: "Conversación mensual",
  startsAt: "2099-05-01T18:00:00.000Z",
  endsAt: "2099-05-01T19:00:00.000Z",
  timezone: "America/Mexico_City",
  locationType: "online",
  location: "https://meet.example.test",
  interestedCount: 2,
  goingCount: 1,
  response: null,
  status: "upcoming"
};

beforeEach(() => {
  vi.resetAllMocks();
  drafts.getDrafts.mockResolvedValue({ drafts: [], hasMore: false });
  drafts.createDraft.mockResolvedValue({ _id: "draft-1", content: "", event: null, media: {}, mediaItems: [] });
  posts.createPost.mockResolvedValue({ _id: "post-1", event: EVENT });
  posts.rsvpEvent.mockResolvedValue({ _id: "post-1", event: { ...EVENT, response: "going", goingCount: 2 } });
});

afterEach(() => cleanup());

test("composer publica un evento con fecha y modalidad", async () => {
  render(<MemoryRouter><CreatePost /></MemoryRouter>);

  fireEvent.click(screen.getByRole("button", { name: "Añadir evento" }));
  fireEvent.change(screen.getByLabelText("Título del evento"), { target: { value: "Sesión de comunidad" } });
  fireEvent.change(screen.getByLabelText("Descripción"), { target: { value: "Conversación mensual" } });
  fireEvent.click(screen.getByRole("button", { name: "Publicar" }));

  await waitFor(() => expect(posts.createPost).toHaveBeenCalledWith("", expect.objectContaining({
    event: expect.objectContaining({
      title: "Sesión de comunidad",
      description: "Conversación mensual",
      startsAt: expect.any(String),
      locationType: "online"
    })
  })));
});

test("PostCard permite responder y actualizar el RSVP del evento", async () => {
  render(
    <MemoryRouter>
      <PostCard
        post={{
          _id: "post-1",
          content: "Agenda",
          author: { username: "kronos", displayName: "Kronos" },
          comments: [],
          event: EVENT
        }}
      />
    </MemoryRouter>
  );

  expect(screen.getByText("Sesión de comunidad")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: /Voy/ }));
  await waitFor(() => expect(posts.rsvpEvent).toHaveBeenCalledWith("post-1", "going"));
  expect((await screen.findByRole("button", { name: /Voy/ })).getAttribute("aria-pressed")).toBe("true");
});
