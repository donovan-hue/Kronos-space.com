import React from "react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import useFeed from "../src/features/social/hooks/useFeed";
import SocialPage from "../src/features/social/SocialPage";
import Comments from "../src/features/social/Comments";
import CreatePost from "../src/features/social/CreatePost";
import Profile from "../src/features/users/Profile";
import App from "../src/App";
import * as posts from "../src/services/postsService";
import * as users from "../src/services/usersService";
import { api } from "../src/services/apiClient";
import { clearSession, getSession, getUser, saveSession, subscribeToSession } from "../src/services/authStorage";

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
const mount = component => render(<MemoryRouter>{component}</MemoryRouter>);

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
  const { result } = renderHook(() => useFeed());
  await waitFor(() => expect(result.current.loading).toBe(false));
  await act(async () => { await result.current.loadMore(); });
  expect(result.current.posts.map(p => p._id)).toEqual(["1", "2"]);
  expect(result.current.page).toBe(2);
  expect(result.current.hasMore).toBe(false);
  expect(posts.getFeed.mock.calls.map(([args]) => args.page)).toEqual([1, 2]);
});

test("respuesta vieja de cargar más no pisa un refresh", async () => {
  posts.getFeed.mockResolvedValueOnce({ posts: [post("1", "Vieja")], hasMore: true });
  const { result } = renderHook(() => useFeed());
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
  const like = await screen.findByRole("button", { name: "Like · 0" });
  expect(screen.getByRole("button", { name: "Guardar" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Repost" })).toBeTruthy();
  fireEvent.click(like);
  await screen.findByRole("alert");
  expect(screen.getByRole("button", { name: "Like · 0" })).toBeTruthy();
});

test("composer mantiene creación mediante servicio y notifica al feed", async () => {
  const created = post("new", "Hola comunidad");
  posts.createPost.mockResolvedValue(created);
  const onCreated = vi.fn();
  mount(<CreatePost onCreated={onCreated} />);
  fireEvent.change(screen.getByRole("textbox"), { target: { value: " Hola comunidad " } });
  fireEvent.click(screen.getByRole("button", { name: "Publicar" }));
  await waitFor(() => expect(onCreated).toHaveBeenCalledWith(created));
  expect(posts.createPost).toHaveBeenCalledWith("Hola comunidad", { media: null, alt: "" });
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
