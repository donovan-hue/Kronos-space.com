import React from "react";
import { beforeEach, afterEach, expect, test, vi } from "vitest";
import { QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { createTestQueryClient } from "../src/app/queryClient";
import { queryKeys } from "../src/services/queryKeys";
import {
  flattenPostPages,
  prependPostToFeed,
  removePostEverywhere,
  removePostFromSavedLists,
  updatePostEverywhere,
} from "../src/features/social/postLists";
import useFeed from "../src/features/social/hooks/useFeed";
import useNotifications from "../src/features/notifications/useNotifications";
import UserSearch from "../src/features/users/UserSearch";
import * as posts from "../src/services/postsService";
import * as users from "../src/services/usersService";
import { api } from "../src/services/apiClient";

vi.mock("../src/services/postsService", () => ({
  getFeed: vi.fn(),
}));
vi.mock("../src/services/usersService", () => ({
  searchGlobal: vi.fn(),
  toggleFollow: vi.fn(),
}));
vi.mock("../src/services/socket", () => ({
  getSocket: vi.fn(() => null),
}));
vi.mock("../src/services/apiClient", () => ({
  API_URL: "/api",
  api: { get: vi.fn(), patch: vi.fn() },
}));

const post = (id, liked = false) => ({
  _id: id,
  content: `Post ${id}`,
  author: { _id: "u1", username: "luna" },
  liked,
  likesCount: liked ? 1 : 0,
  saved: false,
  savedCount: 0,
});

beforeEach(() => {
  vi.resetAllMocks();
});
afterEach(() => cleanup());

function hookSetup() {
  const queryClient = createTestQueryClient();
  const wrapper = ({ children }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return { queryClient, wrapper };
}

test("postLists: updatePostEverywhere sincroniza feed, guardados y detalle", () => {
  const { queryClient } = hookSetup();

  queryClient.setQueryData(queryKeys.posts.feed, {
    pages: [{ posts: [post("1"), post("2")], hasMore: false, total: 2 }],
    pageParams: [1],
  });
  queryClient.setQueryData(queryKeys.posts.saved, {
    pages: [{ posts: [post("1")], hasMore: false }],
    pageParams: [1],
  });
  queryClient.setQueryData(queryKeys.post("1"), post("1"));

  act(() => {
    updatePostEverywhere(queryClient, "1", (current) => ({
      ...current,
      liked: true,
      likesCount: (current.likesCount || 0) + 1,
    }));
  });

  const feedPosts = flattenPostPages(
    queryClient.getQueryData(queryKeys.posts.feed).pages
  );
  expect(feedPosts.find((p) => p._id === "1").liked).toBe(true);
  expect(feedPosts.find((p) => p._id === "2").liked).toBe(false);
  expect(
    flattenPostPages(queryClient.getQueryData(queryKeys.posts.saved).pages)[0]
      .liked
  ).toBe(true);
  expect(queryClient.getQueryData(queryKeys.post("1")).liked).toBe(true);
});

test("postLists: quitar un guardado solo afecta listas de guardados", () => {
  const { queryClient } = hookSetup();

  queryClient.setQueryData(queryKeys.posts.feed, {
    pages: [{ posts: [post("1")], hasMore: false }],
    pageParams: [1],
  });
  queryClient.setQueryData(queryKeys.posts.saved, {
    pages: [{ posts: [post("1")], hasMore: false }],
    pageParams: [1],
  });
  queryClient.setQueryData(queryKeys.posts.user("me", "saved"), {
    pages: [{ posts: [post("1")], hasMore: false, totalPosts: 1 }],
    pageParams: [1],
  });

  act(() => {
    removePostFromSavedLists(queryClient, "1");
  });

  expect(
    flattenPostPages(queryClient.getQueryData(queryKeys.posts.saved).pages)
  ).toHaveLength(0);
  expect(
    flattenPostPages(
      queryClient.getQueryData(queryKeys.posts.user("me", "saved")).pages
    )
  ).toHaveLength(0);
  // El post sigue en el feed: dejar de guardar no elimina la publicación.
  expect(
    flattenPostPages(queryClient.getQueryData(queryKeys.posts.feed).pages)
  ).toHaveLength(1);
});

test("postLists: removePostEverywhere limpia listas y detalle", () => {
  const { queryClient } = hookSetup();

  queryClient.setQueryData(queryKeys.posts.feed, {
    pages: [{ posts: [post("1"), post("2")], hasMore: false }],
    pageParams: [1],
  });
  queryClient.setQueryData(queryKeys.post("1"), post("1"));

  act(() => {
    removePostEverywhere(queryClient, "1");
  });

  expect(
    flattenPostPages(queryClient.getQueryData(queryKeys.posts.feed).pages).map(
      (p) => p._id
    )
  ).toEqual(["2"]);
  expect(queryClient.getQueryData(queryKeys.post("1"))).toBeUndefined();
});

test("useFeed: prependPost antepone sin duplicar y refresca desde el caché", async () => {
  posts.getFeed.mockResolvedValue({ posts: [post("1")], hasMore: false, total: 1 });
  const { queryClient, wrapper } = hookSetup();

  const { result } = renderHook(() => useFeed(), { wrapper });
  await waitFor(() => expect(result.current.loading).toBe(false));

  act(() => {
    prependPostToFeed(queryClient, post("new"));
    prependPostToFeed(queryClient, post("1"));
  });

  expect(result.current.posts.map((p) => p._id)).toEqual(["new", "1"]);
});

test("useNotifications: socket antepone en vivo, marcar actualiza el contador", async () => {
  const listeners = {};
  const fakeSocket = {
    on: (event, handler) => { listeners[event] = handler; },
    off: (event) => { delete listeners[event]; },
  };
  const { getSocket } = await import("../src/services/socket");
  getSocket.mockReturnValue(fakeSocket);

  api.get.mockResolvedValue({
    data: {
      notifications: [
        { _id: "n1", type: "like", read: false, createdAt: new Date().toISOString(), actor: { username: "ana" } },
      ],
      unreadCount: 1,
      hasMore: false,
    },
  });
  api.patch.mockResolvedValue({ data: { ok: true } });

  const { wrapper } = hookSetup();
  const { result } = renderHook(() => useNotifications(""), { wrapper });

  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(result.current.unread).toBe(1);

  // Socket: llega una notificación en vivo → entra al caché sin refetch.
  await act(async () => {
    listeners["notification:new"]({ _id: "n2", type: "follow", read: false, actor: { username: "bruno" } });
  });
  expect(result.current.items.map((item) => item._id)).toEqual(["n2", "n1"]);
  expect(result.current.unread).toBe(2);
  expect(api.get).toHaveBeenCalledTimes(1);

  // Marcar leída: caché + contador, sin refetch.
  await act(async () => {
    await result.current.mark("n1");
  });
  expect(result.current.items.find((item) => item._id === "n1").read).toBe(true);
  expect(result.current.unread).toBe(1);
  expect(api.get).toHaveBeenCalledTimes(1);

  // Marcar todas.
  await act(async () => {
    await result.current.markAll();
  });
  expect(result.current.unread).toBe(0);
  expect(api.patch).toHaveBeenCalledWith("/notifications/read-all");
});

test("UserSearch: la misma búsqueda se sirve del caché sin repetir la petición", async () => {
  users.searchGlobal.mockResolvedValue({
    users: [{ _id: "u-1", username: "luna", displayName: "Luna", followersCount: null }],
    posts: [],
    totals: { users: 1 },
    hasMore: {},
  });

  render(
    <QueryClientProvider client={createTestQueryClient()}>
      <MemoryRouter>
        <UserSearch />
      </MemoryRouter>
    </QueryClientProvider>
  );

  const input = screen.getByRole("searchbox");
  const button = screen.getByRole("button", { name: "Buscar" });

  fireEvent.change(input, { target: { value: "kronos" } });
  fireEvent.click(button);
  expect(await screen.findByText("Luna")).toBeTruthy();
  expect(users.searchGlobal).toHaveBeenCalledTimes(1);

  // Navegar fuera y volver a buscar lo mismo: no hay nueva petición.
  fireEvent.change(input, { target: { value: "otro" } });
  fireEvent.click(button);
  await waitFor(() => expect(users.searchGlobal).toHaveBeenCalledTimes(2));

  fireEvent.change(input, { target: { value: "kronos" } });
  fireEvent.click(button);
  await waitFor(() => expect(screen.getByText("Luna")).toBeTruthy());
  expect(users.searchGlobal).toHaveBeenCalledTimes(2);
});
