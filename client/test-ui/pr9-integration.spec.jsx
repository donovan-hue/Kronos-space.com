import React from "react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import useFeed from "../src/features/social/hooks/useFeed";
import SocialPage from "../src/features/social/SocialPage";
import Comments from "../src/features/social/Comments";
import CreatePost from "../src/features/social/CreatePost";
import PostMedia from "../src/features/social/components/PostMedia";
import Profile from "../src/features/users/Profile";
import App from "../src/App";
import * as posts from "../src/services/postsService";
import * as users from "../src/services/usersService";
import { api } from "../src/services/apiClient";
import { clearSession, getSession, getUser, saveSession, subscribeToSession } from "../src/services/authStorage";
import { QueryClientProvider } from "@tanstack/react-query";
import { createTestQueryClient, } from "../src/app/queryClient";

vi.mock("../src/services/postsService", () => ({
  getFeed: vi.fn(), getPost: vi.fn(), getUserPosts: vi.fn(), getSavedPosts: vi.fn(),
  createPost: vi.fn(), uploadMedia: vi.fn(), createComment: vi.fn(), deleteComment: vi.fn(),
  likePost: vi.fn(), toggleSave: vi.fn(), repostPost: vi.fn(), updatePost: vi.fn(), deletePost: vi.fn()
}));
vi.mock("../src/services/usersService", () => ({
  getMe: vi.fn(), getUserById: vi.fn(), updateProfile: vi.fn(), uploadAvatar: vi.fn(), toggleFollow: vi.fn()
}));
vi.mock("../src/services/apiClient", () => ({
  API_URL: "/api",
  api: { get: vi.fn(), post: vi.fn(), interceptors: { response: { use: vi.fn(), eject: vi.fn() } } }
}));
vi.mock("../src/services/socket", () => ({ connectSocket: vi.fn(), disconnectSocket: vi.fn(), getSocket: vi.fn() }));

const me = { _id: "user1", id: "user1", username: "example", displayName: "Example", bio: "", avatar: "" };
const post = (id, content) => ({ _id: id, content, author: me, likesCount: 0, savedCount: 0, comments: [] });
const jwt = `e30.${btoa(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 }))}.test-signature`;
const mount = component => {
  const queryClient = createTestQueryClient();
  return render(<QueryClientProvider client={queryClient}><MemoryRouter>{component}</MemoryRouter></QueryClientProvider>);
};

beforeEach(() => {
  vi.resetAllMocks();
  localStorage.clear(); sessionStorage.clear();
  saveSession(jwt, me, false);
  posts.getFeed.mockResolvedValue({ posts: [], hasMore: false, total: 0 });
  posts.getUserPosts.mockResolvedValue({ posts: [], hasMore: false, total: 0 });
  posts.getSavedPosts.mockResolvedValue({ posts: [], hasMore: false });
  users.getMe.mockResolvedValue(me);
  api.get.mockImplementation(async path => ({ data: path === "/auth/me" ? { user: me } : { notifications: [], unreadCount: 0 } }));
  api.post.mockResolvedValue({ data: {} });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

test("feed conserva página 2, deduplica y no recarga página 1 al cambiar hasMore", async () => {
  posts.getFeed.mockResolvedValueOnce({ posts: [post("1", "Primera")], hasMore: true, total: 2 })
    .mockResolvedValueOnce({ posts: [post("1", "Primera"), post("2", "Segunda"), post("2", "Segunda")], hasMore: false, total: 2 });
  const wrapper = ({ children }) => <QueryClientProvider client={createTestQueryClient()}>{children}</QueryClientProvider>;
  const { result } = renderHook(() => useFeed(), { wrapper });
  await waitFor(() => expect(result.current.loading).toBe(false));
  await act(async () => { await result.current.loadMore(); });
  expect(result.current.posts.map(p => p._id)).toEqual(["1", "2"]);
  expect(result.current.page).toBe(2);
  expect(result.current.hasMore).toBe(false);
  expect(posts.getFeed.mock.calls.map(([args]) => args.page)).toEqual([1, 2]);
});

test("respuesta vieja de cargar más no pisa un refresh", async () => {
  posts.getFeed.mockResolvedValueOnce({ posts: [post("1", "Vieja")], hasMore: true });
  const wrapper = ({ children }) => <QueryClientProvider client={createTestQueryClient()}>{children}</QueryClientProvider>;
  const { result } = renderHook(() => useFeed(), { wrapper });
  await waitFor(() => expect(result.current.loading).toBe(false));
  let resolveMore;
  posts.getFeed.mockImplementationOnce(() => new Promise(resolve => { resolveMore = resolve; }));
  let more;
  act(() => { more = result.current.loadMore(); });
  posts.getFeed.mockResolvedValueOnce({ posts: [post("3", "Nueva")], hasMore: false });
  await act(async () => { await result.current.refresh(); });
  await act(async () => { resolveMore({ posts: [post("2", "Obsoleta")], hasMore: true }); await more; });
  expect(result.current.posts.map(p => p._id)).toEqual(["3"]);
  expect(result.current.hasMore).toBe(false);
});

test("feed muestra acciones sociales y revierte like rechazado", async () => {
  posts.getFeed.mockResolvedValue({ posts: [post("1", "Una publicación")], hasMore: false });
  posts.likePost.mockRejectedValue({ response: { data: { error: "No autorizado" } } });
  mount(<SocialPage />);
  const like = await screen.findByRole("button", { name: "Reaccionar. 0 reacciones" });
  expect(screen.getByRole("button", { name: "Comentar. 0 comentarios" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Compartir publicación" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Guardar publicación" })).toBeTruthy();
  expect(screen.queryByRole("menuitem", { name: "Repost" })).toBeNull();
  fireEvent.click(like);
  await screen.findByRole("alert");
  expect(screen.getByRole("button", { name: "Reaccionar. 0 reacciones" })).toBeTruthy();
});

test("composer mantiene creación mediante servicio y notifica al feed", async () => {
  const created = post("new", "Hola comunidad");
  posts.createPost.mockResolvedValue(created);
  const onCreated = vi.fn();
  mount(<CreatePost onCreated={onCreated} />);
  fireEvent.change(screen.getByRole("textbox"), { target: { value: " Hola comunidad " } });
  fireEvent.click(screen.getByRole("button", { name: "Publicar" }));
  await waitFor(() => expect(onCreated).toHaveBeenCalledWith(created));
  expect(posts.createPost).toHaveBeenCalledWith("Hola comunidad", { media: null, mediaItems: [], alt: "" });
});

test("composer permite publicar una imagen sin texto", async () => {
  const originalCreateObjectURL = URL.createObjectURL;
  const originalRevokeObjectURL = URL.revokeObjectURL;
  Object.defineProperty(URL, "createObjectURL", { configurable: true, value: vi.fn(() => "blob:preview") });
  Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: vi.fn() });

  try {
    const uploaded = { url: "/uploads/media/image.png", type: "image", mimeType: "image/png", size: 128, alt: "" };
    const created = { ...post("image-only", ""), media: uploaded, mediaItems: [uploaded] };
    posts.uploadMedia.mockResolvedValue(uploaded);
    posts.createPost.mockResolvedValue(created);
    const onCreated = vi.fn();

    mount(<CreatePost onCreated={onCreated} />);
    const file = new File([new Uint8Array([137, 80, 78, 71])], "image.png", { type: "image/png" });
    fireEvent.change(screen.getByLabelText("Seleccionar imagen o video"), { target: { files: [file] } });
    fireEvent.click(await screen.findByRole("button", { name: "Usar original" }));

    const publish = screen.getByRole("button", { name: "Publicar" });
    expect(publish.disabled).toBe(false);
    fireEvent.click(publish);

    await waitFor(() => expect(onCreated).toHaveBeenCalledWith(created));
    expect(posts.uploadMedia).toHaveBeenCalledWith(file);
    expect(posts.createPost).toHaveBeenCalledWith("", { media: uploaded, mediaItems: [uploaded], alt: "" });
  } finally {
    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: originalCreateObjectURL });
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: originalRevokeObjectURL });
  }
});

test("composer publica carrusel de varias imágenes con mediaItems", async () => {
  const originalCreateObjectURL = URL.createObjectURL;
  const originalRevokeObjectURL = URL.revokeObjectURL;
  Object.defineProperty(URL, "createObjectURL", { configurable: true, value: vi.fn((file) => `blob:${file.name}`) });
  Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: vi.fn() });

  try {
    const first = { url: "/uploads/media/one.png", type: "image", mimeType: "image/png", size: 101, alt: "Uno" };
    const second = { url: "/uploads/media/two.webp", type: "image", mimeType: "image/webp", size: 202, alt: "Dos" };
    const created = { ...post("carousel", ""), media: first, mediaItems: [first, second] };
    posts.uploadMedia.mockResolvedValueOnce(first).mockResolvedValueOnce(second);
    posts.createPost.mockResolvedValue(created);
    const onCreated = vi.fn();

    mount(<CreatePost onCreated={onCreated} />);
    const files = [
      new File([new Uint8Array([137, 80, 78, 71])], "one.png", { type: "image/png" }),
      new File([new Uint8Array([82, 73, 70, 70])], "two.webp", { type: "image/webp" })
    ];
    fireEvent.change(screen.getByLabelText("Seleccionar imagen o video"), { target: { files } });
    expect(await screen.findByText("Carrusel · 2/4 imágenes")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Texto alternativo 1"), { target: { value: "Uno" } });
    fireEvent.change(screen.getByLabelText("Texto alternativo 2"), { target: { value: "Dos" } });
    fireEvent.click(screen.getByRole("button", { name: "Publicar" }));

    await waitFor(() => expect(onCreated).toHaveBeenCalledWith(created));
    expect(posts.uploadMedia).toHaveBeenNthCalledWith(1, files[0]);
    expect(posts.uploadMedia).toHaveBeenNthCalledWith(2, files[1]);
    expect(posts.createPost).toHaveBeenCalledWith("", { media: first, mediaItems: [first, second], alt: "" });
  } finally {
    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: originalCreateObjectURL });
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: originalRevokeObjectURL });
  }
});

test("PostMedia permite navegar un carrusel normalizado", () => {
  mount(
    <PostMedia
      media={{ url: "/uploads/media/legacy.png", type: "image", alt: "Legacy" }}
      mediaItems={[
        { url: "/uploads/media/one.png", type: "image", alt: "Uno" },
        { url: "/uploads/media/two.png", type: "image", alt: "Dos" }
      ]}
      content="Carrusel"
    />
  );
  expect(screen.getByAltText("Uno")).toBeTruthy();
  expect(screen.getByText("1/2")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Imagen siguiente" }));
  expect(screen.getByAltText("Dos")).toBeTruthy();
  expect(screen.getByText("2/2")).toBeTruthy();
});

test("comentarios usan servicio centralizado y actualizan la publicación", async () => {
  const updated = post("1", "Publicación");
  posts.createComment.mockResolvedValue(updated);
  const onCommentCreated = vi.fn();
  mount(<Comments postId="1" onCommentCreated={onCommentCreated} />);
  fireEvent.change(screen.getByRole("textbox"), { target: { value: "Comentario de prueba" } });
  fireEvent.submit(screen.getByRole("textbox").closest("form"));
  await waitFor(() => expect(onCommentCreated).toHaveBeenCalledWith(updated));
  expect(posts.createComment).toHaveBeenCalledWith("1", "Comentario de prueba");
});

test.each([false, true])("editar perfil conserva token, expiración y remember=%s", async remember => {
  saveSession(jwt, me, remember);
  const before = getSession();
  const changed = { ...me, displayName: "Nombre actualizado" };
  users.updateProfile.mockResolvedValue(changed);
  const events = vi.fn();
  const unsubscribe = subscribeToSession(events);
  try {
    mount(<Profile />);
    fireEvent.click(await screen.findByRole("button", { name: "Editar perfil" }));
    fireEvent.change(await screen.findByLabelText("Nombre"), { target: { value: changed.displayName } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));
    await waitFor(() => expect(getUser().displayName).toBe(changed.displayName));
    expect(getSession()).toEqual({ ...before, user: changed });
    expect(events).not.toHaveBeenCalled();
  } finally { unsubscribe(); }
});

test("App combina /saved con hidratación de sesión de main", async () => {
  window.history.replaceState(null, "", "/saved");
  render(<App />);
  await waitFor(() => expect(posts.getSavedPosts).toHaveBeenCalled());
  expect(api.get).toHaveBeenCalledWith("/auth/me");
  expect(getSession().remember).toBe(false);
});

test("App mantiene acceso directo al restablecimiento con token query", async () => {
  clearSession();
  window.history.replaceState(null, "", "/reset-password?token=fictional-test-token");
  render(<App />);
  expect(await screen.findByRole("heading", { name: "Nueva contraseña" })).toBeTruthy();
  expect(api.get).not.toHaveBeenCalledWith("/auth/me");
});

test("imágenes subidas resuelven contra la API, no el frontend estático", async () => {
  const { mediaUrl } = await import("../src/services/mediaUrl");
  expect(mediaUrl("/uploads/media/example.png", "https://api.example.com/api", "https://example.com"))
    .toBe("https://api.example.com/uploads/media/example.png");
  expect(mediaUrl("/uploads/avatars/example.png", "/api", "http://localhost:3000"))
    .toBe("http://localhost:3000/uploads/avatars/example.png");
  expect(mediaUrl("https://cdn.example.com/photo.png")).toBe("https://cdn.example.com/photo.png");
});
