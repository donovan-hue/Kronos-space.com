import React from "react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClientProvider } from "@tanstack/react-query";
import MediaViewer from "../src/components/media/MediaViewer";
import PostMedia from "../src/features/social/components/PostMedia";
import Profile from "../src/features/users/Profile";
import { createTestQueryClient } from "../src/app/queryClient";
import { saveSession } from "../src/services/authStorage";
import * as posts from "../src/services/postsService";
import * as users from "../src/services/usersService";

vi.mock("../src/services/postsService", () => ({
  getUserPosts: vi.fn(), getSavedPosts: vi.fn(), likePost: vi.fn(), deletePost: vi.fn(),
  updatePost: vi.fn(), toggleSave: vi.fn(), repostPost: vi.fn()
}));
vi.mock("../src/services/usersService", () => ({
  getMe: vi.fn(), getUserById: vi.fn(), getUserByUsername: vi.fn(), toggleFollow: vi.fn(),
  searchGlobal: vi.fn(), updateProfile: vi.fn(), uploadAvatar: vi.fn(), updateProfilePrivacy: vi.fn()
}));
vi.mock("../src/services/apiClient", () => ({ API_URL: "/api", api: { get: vi.fn(), post: vi.fn() } }));

const fotos = [
  { url: "/uploads/uno.jpg", type: "image", alt: "Primera" },
  { url: "/uploads/dos.jpg", type: "image", alt: "Segunda" }
];

const me = { _id: "owner", id: "owner", username: "example", displayName: "Example", bio: "Bio", avatar: "" };
const token = `e30.${btoa(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 }))}.test`;

beforeEach(() => {
  vi.resetAllMocks();
  localStorage.clear();
  sessionStorage.clear();
  saveSession(token, me, false);
  users.getMe.mockResolvedValue(me);
  posts.getUserPosts.mockResolvedValue({ posts: [], total: 0, hasMore: false });
  posts.getSavedPosts.mockResolvedValue({ posts: [], total: 0, hasMore: false });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function montaPerfil() {
  return render(
    <QueryClientProvider client={createTestQueryClient()}>
      <MemoryRouter initialEntries={["/profile"]}>
        <Routes>
          <Route path="/profile" element={<Profile />} />
          <Route path="/create/post" element={<p>Compositor</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("visor de medios a pantalla completa", () => {
  test("abre con contador y navega con las flechas del teclado", () => {
    const onIndexChange = vi.fn();
    const { rerender } = render(
      <MediaViewer open items={fotos} index={0} onIndexChange={onIndexChange} onClose={() => {}} />
    );

    expect(screen.getByRole("dialog", { name: "Visor de medios" })).toBeTruthy();
    expect(screen.getByText("1 / 2")).toBeTruthy();

    fireEvent.keyDown(document, { key: "ArrowRight" });
    expect(onIndexChange).toHaveBeenCalledWith(1);

    rerender(<MediaViewer open items={fotos} index={1} onIndexChange={onIndexChange} onClose={() => {}} />);
    expect(screen.getByText("2 / 2")).toBeTruthy();

    fireEvent.keyDown(document, { key: "ArrowLeft" });
    expect(onIndexChange).toHaveBeenCalledWith(0);
  });

  test("cierra con Escape, con el botón y con el fondo", () => {
    const onClose = vi.fn();
    render(<MediaViewer open items={fotos} index={0} onClose={onClose} />);

    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Cerrar visor" }));
    expect(onClose).toHaveBeenCalledTimes(2);

    fireEvent.click(screen.getByRole("dialog", { name: "Visor de medios" }));
    expect(onClose).toHaveBeenCalledTimes(3);
  });

  test("las flechas de la barra cambian de medio", () => {
    const onIndexChange = vi.fn();
    render(<MediaViewer open items={fotos} index={0} onIndexChange={onIndexChange} onClose={() => {}} />);

    fireEvent.click(screen.getByRole("button", { name: "Siguiente" }));
    expect(onIndexChange).toHaveBeenCalledWith(1);

    fireEvent.click(screen.getByRole("button", { name: "Anterior" }));
    expect(onIndexChange).toHaveBeenCalledWith(1);
  });

  test("cerrado no pinta nada y sin medios no abre", () => {
    const { rerender } = render(<MediaViewer open={false} items={fotos} onClose={() => {}} />);
    expect(screen.queryByRole("dialog")).toBeNull();

    rerender(<MediaViewer open items={[]} onClose={() => {}} />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

describe("medios de la publicación", () => {
  test("la foto se abre a pantalla completa y se cierra", () => {
    render(<PostMedia media={{ url: "/uploads/foto.jpg", type: "image" }} content="Una foto" />);
    expect(screen.queryByRole("dialog")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /Ver en pantalla completa/ }));
    expect(screen.getByRole("dialog", { name: "Visor de medios" })).toBeTruthy();
    expect(screen.getByRole("img", { name: "Una foto" })).toBeTruthy();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  test("el video se abre con su botón de expandir", () => {
    render(<PostMedia media={{ url: "/uploads/clip.mp4", type: "video" }} />);

    fireEvent.click(screen.getByRole("button", { name: "Ver video en pantalla completa" }));
    expect(screen.getByRole("dialog", { name: "Visor de medios" })).toBeTruthy();
  });
});

describe("rejilla de medios del perfil", () => {
  test("los mosaicos abren el visor y el perfil propio ofrece publicar", async () => {
    posts.getUserPosts.mockResolvedValue({
      posts: [{
        _id: "p1",
        content: "foto del muro",
        author: me,
        comments: [],
        media: { url: "/uploads/foto.jpg", type: "image" }
      }],
      total: 1,
      hasMore: false
    });

    montaPerfil();

    fireEvent.click(await screen.findByRole("tab", { name: "Imágenes" }));

    const mosaico = await screen.findByRole("button", { name: "Ver foto 1 en pantalla completa" });
    expect(screen.getByRole("link", { name: "Publicar una foto o un video" }).getAttribute("href")).toBe("/create/post");

    fireEvent.click(mosaico);
    expect(screen.getByRole("dialog", { name: "Fotos del perfil" })).toBeTruthy();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
