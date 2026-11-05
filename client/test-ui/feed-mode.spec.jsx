import React from "react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { createTestQueryClient } from "../src/app/queryClient";
import SocialPage from "../src/features/social/SocialPage";
import { api } from "../src/services/apiClient";
import FeedModeSwitch, { readStoredFeedMode, storeFeedMode } from "../src/features/social/components/FeedModeSwitch";

vi.mock("../src/services/socket", () => ({ getSocket: () => null, connectSocket: vi.fn(), disconnectSocket: vi.fn() }));

vi.mock("../src/services/apiClient", () => ({
  API_URL: "/api",
  api: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() }
}));

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  api.get.mockImplementation(async (url) => {
    if (url === "/users/me") return { data: { _id: "me", preferences: { feed: { interests: ["arte"] } } } };
    if (url === "/posts") return { data: { posts: [], hasMore: false, total: 0 } };
    if (url === "/stories") return { data: { groups: [] } };
    return { data: {} };
  });
});

afterEach(() => cleanup());

function mount() {
  return render(
    <QueryClientProvider client={createTestQueryClient()}>
      <MemoryRouter initialEntries={["/home"]}><SocialPage /></MemoryRouter>
    </QueryClientProvider>
  );
}

/**
 * El servidor aplicaba `preferences.feed.mode` desde hacía tiempo, pero el único
 * sitio donde se podía cambiar era Ajustes: desde el inicio no había conmutador.
 */
test("el inicio pide el feed con el modo elegido", async () => {
  mount();

  const siguiendo = await screen.findByRole("button", { name: "Siguiendo" });
  fireEvent.click(siguiendo);

  await waitFor(() => {
    const calls = api.get.mock.calls.filter(([url]) => url === "/posts");
    expect(calls[calls.length - 1][1].params.mode).toBe("following");
  });
});

test("el modo activo queda marcado y se recuerda en el navegador", async () => {
  mount();
  fireEvent.click(await screen.findByRole("button", { name: "Intereses" }));

  await waitFor(() => {
    expect(screen.getByRole("button", { name: "Intereses" }).getAttribute("aria-pressed")).toBe("true");
  });
  expect(window.localStorage.getItem("kronos.feed.mode")).toBe("interests");
});

test("el modo guardado se recupera al volver", () => {
  storeFeedMode("following");
  expect(readStoredFeedMode()).toBe("following");
  window.localStorage.setItem("kronos.feed.mode", "basura");
  expect(readStoredFeedMode()).toBe("latest");
});

test("«Siguiendo» sin nadie seguido lo explica en vez de dejar la lista vacía", async () => {
  mount();
  fireEvent.click(await screen.findByRole("button", { name: "Siguiendo" }));

  expect(await screen.findByText(/Aún no sigues a nadie/)).toBeTruthy();
});

test("el conmutador no cambia la preferencia guardada del perfil", async () => {
  mount();
  fireEvent.click(await screen.findByRole("button", { name: "Reciente" }));

  await waitFor(() => expect(api.get).toHaveBeenCalledWith("/posts", expect.anything()));
  expect(api.patch).not.toHaveBeenCalledWith("/users/me/preferences", expect.anything());
});

test("el conmutador marca el modo activo y avisa del cambio", () => {
  const onChange = vi.fn();
  render(<FeedModeSwitch mode="latest" onChange={onChange} />);

  fireEvent.click(screen.getByRole("button", { name: "Intereses" }));
  expect(onChange).toHaveBeenCalledWith("interests");
  expect(screen.getByRole("button", { name: "Reciente" }).getAttribute("aria-pressed")).toBe("true");
});
