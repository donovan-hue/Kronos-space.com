import React from "react";
import { beforeEach, afterEach, expect, test, vi } from "vitest";
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import Profile from "../src/features/users/Profile";
import UserSearch from "../src/features/users/UserSearch";
import { api } from "../src/services/apiClient";
import ProfilePrivacy from "../src/features/settings/ProfilePrivacy";
import useProfileActivity from "../src/features/users/hooks/useProfileActivity";
import * as posts from "../src/services/postsService";
import * as users from "../src/services/usersService";
import { getSession, saveSession } from "../src/services/authStorage";
import { QueryClientProvider } from "@tanstack/react-query";
import { createTestQueryClient } from "../src/app/queryClient";

vi.mock("../src/services/postsService", () => ({
  getUserPosts: vi.fn(), getSavedPosts: vi.fn(), likePost: vi.fn(), deletePost: vi.fn(), updatePost: vi.fn(), toggleSave: vi.fn(), repostPost: vi.fn()
}));
vi.mock("../src/services/usersService", () => ({
  getMe: vi.fn(), getUserById: vi.fn(), getUserByUsername: vi.fn(), toggleFollow: vi.fn(), searchGlobal: vi.fn(), updateProfile: vi.fn(), uploadAvatar: vi.fn(), updateProfilePrivacy: vi.fn()
}));
vi.mock("../src/services/apiClient", () => ({ API_URL: "/api", api: { get: vi.fn(), post: vi.fn() } }));
const me = { _id: "owner", id: "owner", username: "example", displayName: "Example", bio: "Bio", avatar: "" };
const privacy = { showBio: true, showFollowCounts: true, discoverable: true };
const post = id => ({ _id: id, content: `Content ${id}`, author: me, comments: [], saved: true });
const token = `e30.${btoa(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 }))}.test`;
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };

beforeEach(() => {
  vi.resetAllMocks(); localStorage.clear(); sessionStorage.clear();
  saveSession(token, me, false);
  users.getMe.mockResolvedValue(me);
  users.getUserById.mockResolvedValue({ ...me, _id: "other", username: "other", bio: "", followersCount: null, followingCount: null });
  users.getUserByUsername.mockResolvedValue({ ...me, _id: "other", username: "other", bio: "", followersCount: null, followingCount: null });
  users.searchGlobal.mockResolvedValue({ users: [], posts: [], totals: {}, hasMore: {} });
  posts.getUserPosts.mockResolvedValue({ posts: [], total: 0, hasMore: false });
  posts.getSavedPosts.mockResolvedValue({ posts: [], total: 0, hasMore: false });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
function mountProfile(path = "/profile") {
  return render(<QueryClientProvider client={createTestQueryClient()}><MemoryRouter initialEntries={[path]}><Routes>
    <Route path="/profile" element={<Profile />} /><Route path="/profile/:username" element={<Profile />} /><Route path="/users/:id" element={<Profile />} />
  </Routes></MemoryRouter></QueryClientProvider>);
}

test("perfil propio presenta cuatro pestañas y filtra publicaciones originales", async () => {
  mountProfile();
  expect(await screen.findByRole("tab", { name: /Guardados/ })).toBeTruthy();
  expect(screen.getAllByRole("tab")).toHaveLength(4);
  await waitFor(() => expect(posts.getUserPosts).toHaveBeenCalledWith("owner", { page: 1, limit: 20, tab: "posts" }));
  fireEvent.click(screen.getByRole("tab", { name: "Imágenes" }));
  await waitFor(() => expect(posts.getUserPosts).toHaveBeenLastCalledWith("owner", { page: 1, limit: 20, tab: "media" }));
  expect(await screen.findByText("Todavía no hay imágenes en este perfil.")).toBeTruthy();
  fireEvent.click(screen.getByRole("tab", { name: "Republicaciones" }));
  await waitFor(() => expect(posts.getUserPosts).toHaveBeenLastCalledWith("owner", { page: 1, limit: 20, tab: "reposts" }));
});

test("perfil ajeno no expone pestaña guardados ni contadores ocultos", async () => {
  mountProfile("/users/other");
  await screen.findByRole("tab", { name: "Publicaciones" });
  expect(screen.queryByRole("tab", { name: /Guardados/ })).toBeNull();
  expect(screen.queryByText(/seguidores/)).toBeNull();
  expect(posts.getSavedPosts).not.toHaveBeenCalled();
  expect(screen.queryByRole("button", { name: "Guardar cambios" })).toBeNull();
});

test("ruta por ID propio conserva edición y pestaña privada", async () => {
  mountProfile("/users/owner");
  expect(await screen.findByRole("tab", { name: /Guardados/ })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Editar perfil" }));
  expect(screen.getByRole("button", { name: "Guardar cambios" })).toBeTruthy();
  expect(users.getUserById).not.toHaveBeenCalled();
});

test("teclado cambia pestañas con foco y aria-selected", async () => {
  mountProfile();
  const tab = await screen.findByRole("tab", { name: "Publicaciones" });
  tab.focus(); fireEvent.keyDown(tab, { key: "ArrowRight" });
  const media = screen.getByRole("tab", { name: "Imágenes" });
  expect(media.getAttribute("aria-selected")).toBe("true"); expect(document.activeElement).toBe(media);
  fireEvent.keyDown(media, { key: "End" });
  const saved = screen.getByRole("tab", { name: /Guardados/ });
  expect(document.activeElement).toBe(saved);
  await waitFor(() => expect(posts.getSavedPosts).toHaveBeenCalledWith({ page: 1, limit: 20 }));
});

test("quitar un guardado lo elimina de la pestaña privada", async () => {
  posts.getSavedPosts.mockResolvedValue({ posts: [post("saved")], total: 1, hasMore: false });
  posts.toggleSave.mockResolvedValue({ saved: false, savedCount: 0 });
  mountProfile();
  fireEvent.click(await screen.findByRole("tab", { name: /Guardados/ }));
  await screen.findByText("Content saved");
  fireEvent.click(screen.getByRole("button", { name: "Guardado" }));
  await waitFor(() => expect(screen.queryByText("Content saved")).toBeNull());
});

test("paginación del perfil deduplica sin reiniciar la pestaña", async () => {
  posts.getUserPosts.mockResolvedValueOnce({ posts: [post("1")], total: 2, hasMore: true })
    .mockResolvedValueOnce({ posts: [post("1"), post("2"), post("2")], total: 2, hasMore: false });
  const wrapper = ({ children }) => <QueryClientProvider client={createTestQueryClient()}>{children}</QueryClientProvider>;
  const { result } = renderHook(() => useProfileActivity("owner", "media", true), { wrapper });
  await waitFor(() => expect(result.current.postsLoading).toBe(false));
  await act(async () => { await result.current.loadMore(); });
  expect(result.current.posts.map(p => p._id)).toEqual(["1", "2"]);
  expect(result.current.page).toBe(2);
  expect(posts.getUserPosts.mock.calls.map(([, args]) => args.tab)).toEqual(["media", "media"]);
});

test("respuestas de pestaña anterior no sustituyen la actual", async () => {
  const old = deferred();
  posts.getUserPosts.mockImplementation((id, options) => options.tab === "posts" ? old.promise : Promise.resolve({ posts: [post("image")], hasMore: false }));
  const wrapper = ({ children }) => <QueryClientProvider client={createTestQueryClient()}>{children}</QueryClientProvider>;
  const { result, rerender } = renderHook(({ tab }) => useProfileActivity("owner", tab, true), { wrapper, initialProps: { tab: "posts" } });
  rerender({ tab: "media" });
  await waitFor(() => expect(result.current.posts[0]?._id).toBe("image"));
  await act(async () => { old.resolve({ posts: [post("stale")], hasMore: true }); });
  expect(result.current.posts[0]._id).toBe("image");
});

test("hook rechaza guardados en perfil ajeno y permite reintentar carga fallida", async () => {
  const wrapper = ({ children }) => <QueryClientProvider client={createTestQueryClient()}>{children}</QueryClientProvider>;
  const hidden = renderHook(() => useProfileActivity("other", "saved", false), { wrapper });
  expect(posts.getSavedPosts).not.toHaveBeenCalled(); hidden.unmount();
  posts.getUserPosts.mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce({ posts: [post("retry")], hasMore: false });
  const { result } = renderHook(() => useProfileActivity("owner", "posts", true), { wrapper });
  await waitFor(() => expect(result.current.postsError).toContain("No se pudo"));
  await act(async () => { await result.current.refresh(); });
  expect(result.current.postsError).toBe(""); expect(result.current.posts[0]._id).toBe("retry");
});

test("privacidad conserva sesión y usa opciones persistidas; no promete cuenta privada", async () => {
  users.getMe.mockResolvedValue({ ...me, profilePrivacy: privacy });
  users.updateProfilePrivacy.mockResolvedValue({ ...privacy, showBio: false });
  const original = getSession();
  render(<ProfilePrivacy />);
  const checkbox = await screen.findByRole("checkbox", { name: /Mostrar mi biografía/ });
  expect(checkbox.checked).toBe(true);
  fireEvent.click(checkbox); fireEvent.click(screen.getByRole("button", { name: "Guardar privacidad" }));
  await screen.findByText("Privacidad del perfil guardada.");
  expect(users.updateProfilePrivacy).toHaveBeenCalledWith({ ...privacy, showBio: false });
  expect(getSession()).toEqual({ ...original, user: { ...me, profilePrivacy: { ...privacy, showBio: false } } });
  expect(screen.getByText(/no hacen privadas tus publicaciones/)).toBeTruthy();
  cleanup();
  users.getMe.mockResolvedValue({ ...me, profilePrivacy: { ...privacy, showBio: false } });
  render(<ProfilePrivacy />);
  expect((await screen.findByRole("checkbox", { name: /Mostrar mi biografía/ })).checked).toBe(false);
});

test("fallo al guardar conserva selección sin fingir éxito", async () => {
  users.updateProfilePrivacy.mockRejectedValue(new Error("offline"));
  render(<ProfilePrivacy />);
  const checkbox = await screen.findByRole("checkbox", { name: /Aparecer en la búsqueda/ });
  fireEvent.click(checkbox); fireEvent.click(screen.getByRole("button", { name: "Guardar privacidad" }));
  await screen.findByRole("alert");
  expect(checkbox.checked).toBe(false);
  expect(screen.queryByText("Privacidad del perfil guardada.")).toBeNull();
  expect(screen.getByRole("button", { name: "Guardar privacidad" }).disabled).toBe(false);
});


test("buscador no convierte contadores privados en ceros al seguir", async () => {
  users.searchGlobal.mockResolvedValue({
    users: [{ _id: "other", username: "other", displayName: "Other", followersCount: null, bio: "" }],
    posts: [], totals: { users: 1, posts: 0 }, hasMore: {}
  });
  users.toggleFollow.mockResolvedValue({ following: true });
  render(<QueryClientProvider client={createTestQueryClient()}><MemoryRouter><UserSearch /></MemoryRouter></QueryClientProvider>);
  fireEvent.change(screen.getByRole("searchbox"), { target: { value: "other" } });
  fireEvent.click(screen.getByRole("button", { name: "Buscar" }));
  fireEvent.click(await screen.findByRole("button", { name: "Seguir" }));
  await screen.findByRole("button", { name: "Dejar de seguir" });
  expect(screen.queryByText(/seguidores/)).toBeNull();
});

test("perfil por username ajeno consulta por username directamente", async () => {
  mountProfile("/profile/other");
  await screen.findByRole("tab", { name: "Publicaciones" });
  expect(users.getUserByUsername).toHaveBeenCalledWith("other");
  expect(screen.queryByRole("tab", { name: /Guardados/ })).toBeNull();
});

test("perfil por username propio reconoce sesión y habilita edición", async () => {
  mountProfile("/profile/example");
  expect(await screen.findByRole("tab", { name: /Guardados/ })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Editar perfil" }));
  expect(screen.getByRole("button", { name: "Guardar cambios" })).toBeTruthy();
  expect(users.getMe).toHaveBeenCalled();
  expect(users.getUserByUsername).not.toHaveBeenCalled();
});

