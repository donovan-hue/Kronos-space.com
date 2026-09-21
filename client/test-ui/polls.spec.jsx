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
  votePoll: vi.fn()
}));

vi.mock("../src/services/draftsService", () => ({
  createDraft: vi.fn(),
  deleteDraft: vi.fn(),
  getDrafts: vi.fn(),
  updateDraft: vi.fn()
}));

vi.mock("../src/services/circlesService", () => ({ getCircles: vi.fn(() => Promise.resolve([])) }));
vi.mock("../src/services/orbitsService", () => ({ getOrbits: vi.fn(() => Promise.resolve([])) }));

const POLL = {
  question: "¿Qué formato prefieres?",
  options: [
    { _id: "option-a", text: "Texto", votes: 2, percentage: 67 },
    { _id: "option-b", text: "Video", votes: 1, percentage: 33 }
  ],
  totalVotes: 3,
  selectedOptionId: null,
  closesAt: null,
  closed: false
};

beforeEach(() => {
  vi.resetAllMocks();
  drafts.getDrafts.mockResolvedValue({ drafts: [], hasMore: false });
  drafts.createDraft.mockResolvedValue({ _id: "draft-1", content: "", poll: null, media: {}, mediaItems: [] });
  posts.createPost.mockResolvedValue({ _id: "post-1", poll: POLL });
  posts.votePoll.mockResolvedValue({ _id: "post-1", poll: { ...POLL, selectedOptionId: "option-b" } });
});

afterEach(() => cleanup());

test("composer publica una encuesta como parte del contrato de publicación", async () => {
  render(<MemoryRouter><CreatePost /></MemoryRouter>);

  fireEvent.click(screen.getByRole("button", { name: "Añadir encuesta" }));
  fireEvent.change(screen.getByLabelText("Pregunta"), { target: { value: "¿Qué formato prefieres?" } });
  fireEvent.change(screen.getByPlaceholderText("Opción 1"), { target: { value: "Texto" } });
  fireEvent.change(screen.getByPlaceholderText("Opción 2"), { target: { value: "Video" } });
  fireEvent.click(screen.getByRole("button", { name: "Publicar" }));

  await waitFor(() => expect(posts.createPost).toHaveBeenCalledWith("", expect.objectContaining({
    poll: { question: "¿Qué formato prefieres?", options: ["Texto", "Video"] }
  })));
});

test("PostCard muestra resultados y permite cambiar el voto de la encuesta", async () => {
  render(
    <MemoryRouter>
      <PostCard
        post={{
          _id: "post-1",
          content: "Encuesta",
          author: { username: "kronos", displayName: "Kronos" },
          comments: [],
          poll: POLL
        }}
      />
    </MemoryRouter>
  );

  expect(screen.getByText("¿Qué formato prefieres?")).toBeTruthy();
  expect(screen.getByRole("button", { name: /Video/ }).textContent).toContain("33%");
  fireEvent.click(screen.getByRole("button", { name: /Video/ }));

  await waitFor(() => expect(posts.votePoll).toHaveBeenCalledWith("post-1", "option-b"));
  expect((await screen.findByRole("button", { name: /Video/ })).getAttribute("aria-pressed")).toBe("true");
});
