import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import VerticalFeed from "../src/features/social/vertical/VerticalFeed";
import CreatePost from "../src/features/social/CreatePost";
import * as postsService from "../src/services/postsService";
import * as authStorage from "../src/services/authStorage";
import { withQueryClient } from "./testUtils";

vi.mock("../src/services/postsService", () => ({
  getVerticalFeed: vi.fn(),
  likePost: vi.fn(),
  toggleSave: vi.fn(),
  createPost: vi.fn()
}));

vi.mock("../src/services/authStorage", () => ({
  getUser: vi.fn()
}));

describe("Bloque E — Video real: transcodificación, reproductor adaptativo y subtítulos", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authStorage.getUser.mockReturnValue({
      _id: "user-123",
      username: "cineasta",
      displayName: "Ana Cineasta"
    });

    postsService.getVerticalFeed.mockResolvedValue({
      posts: [
        {
          _id: "post-vid-1",
          content: "Video astronómico en 4K",
          author: { _id: "user-123", username: "cineasta", displayName: "Ana Cineasta" },
          media: {
            url: "/uploads/media/video-space.mp4",
            type: "video",
            variants: [
              { resolution: "1080p", url: "/uploads/media/video-space-1080.mp4" },
              { resolution: "720p", url: "/uploads/media/video-space-720.mp4" },
              { resolution: "480p", url: "/uploads/media/video-space-480.mp4" }
            ],
            subtitles: [
              { lang: "es-MX", label: "Español (México)", approved: true, vttContent: "Observando la nebulosa" }
            ]
          },
          likesCount: 12,
          commentsCount: 3,
          saved: false
        }
      ],
      total: 1,
      page: 1,
      limit: 10,
      hasMore: false
    });
  });

  afterEach(() => {
    cleanup();
  });

  it("el reproductor vertical muestra botones de calidad (⚙) y subtítulos (CC)", async () => {
    withQueryClient(
      <MemoryRouter>
        <VerticalFeed />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText("Video astronómico en 4K")).toBeDefined();
    });

    const qualityBtn = screen.getByTitle("Calidad: auto");
    const ccBtn = screen.getByTitle("Subtítulos (CC)");

    expect(qualityBtn).toBeDefined();
    expect(ccBtn).toBeDefined();
  });

  it("el selector de calidad permite cambiar entre 1080p, 720p, 480p y Automática", async () => {
    withQueryClient(
      <MemoryRouter>
        <VerticalFeed />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByTitle("Calidad: auto")).toBeDefined();
    });

    const qualityBtn = screen.getByTitle("Calidad: auto");
    fireEvent.click(qualityBtn);

    // Menú desplegado
    expect(screen.getByText("CALIDAD")).toBeDefined();
    expect(screen.getByText("1080p")).toBeDefined();
    expect(screen.getByText("720p")).toBeDefined();
    expect(screen.getByText("480p")).toBeDefined();

    // Seleccionar 720p
    fireEvent.click(screen.getByText("720p"));
    await waitFor(() => {
      expect(screen.getByTitle("Calidad: 720p")).toBeDefined();
    });
  });

  it("el botón de subtítulos activa el overlay de subtítulos (CC)", async () => {
    withQueryClient(
      <MemoryRouter>
        <VerticalFeed />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByTitle("Subtítulos (CC)")).toBeDefined();
    });

    const ccBtn = screen.getByTitle("Subtítulos (CC)");
    fireEvent.click(ccBtn);

    await waitFor(() => {
      expect(screen.getByText("Observando la nebulosa")).toBeDefined();
    });
  });

  it("CreatePost incluye controles de publicación de video", () => {
    withQueryClient(
      <MemoryRouter>
        <CreatePost />
      </MemoryRouter>
    );

    expect(screen.getByPlaceholderText("Escribe una idea, una observación o una pregunta...")).toBeDefined();
    expect(screen.getByLabelText("Seleccionar imagen o video")).toBeDefined();
  });
});
