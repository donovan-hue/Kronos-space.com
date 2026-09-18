import React from "react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import Notifications from "../src/features/notifications/Notifications";
import { api } from "../src/services/apiClient";

vi.mock("../src/services/socket", () => ({
  getSocket: () => null
}));

vi.mock("../src/services/apiClient", () => ({
  API_URL: "/api",
  api: {
    get: vi.fn(),
    patch: vi.fn()
  }
}));

const items = [
  { _id: "n1", type: "like", read: false, createdAt: new Date().toISOString(), actor: { _id: "u1", username: "ana" } },
  { _id: "n2", type: "comment", read: false, createdAt: new Date().toISOString(), actor: { _id: "u2", username: "bruno" }, post: { _id: "p1", content: "x" } },
  { _id: "n3", type: "repost", read: true, createdAt: new Date().toISOString(), actor: { _id: "u3", username: "carla" } },
  { _id: "n4", type: "follow", read: false, createdAt: new Date().toISOString(), actor: { _id: "u4", username: "dora" } }
];

function mockList(hasMore = false) {
  api.get.mockImplementation(async (url, { params } = {}) => {
    let list = items;
    if (params?.type) {
      const wanted = String(params.type).split(",");
      list = items.filter((item) => wanted.includes(item.type));
    }
    const limit = params?.limit || 30;
    const page = params?.page || 1;
    const start = (page - 1) * limit;
    const slice = list.slice(start, start + limit);
    return {
      data: {
        notifications: slice,
        unreadCount: items.filter((item) => !item.read).length,
        page,
        limit,
        total: list.length,
        hasMore
      }
    };
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockList();
});

afterEach(() => cleanup());

function mount() {
  return render(
    <MemoryRouter initialEntries={["/notifications"]}>
      <Notifications />
    </MemoryRouter>
  );
}

test("muestra el catálogo completo con su frase", async () => {
  mount();
  expect(await screen.findByText(/comenzó a seguirte/)).toBeTruthy();
  expect(screen.getByText(/comentó tu publicación/)).toBeTruthy();
  expect(screen.getByText(/republicó tu publicación/)).toBeTruthy();
  expect(screen.getByText(/indica que le gusta|indicó que le gusta/)).toBeTruthy();
});

test("el filtro por tipo pide al backend ese tipo", async () => {
  mockList(false);
  mount();
  await screen.findByText(/comenzó a seguirte/);

  fireEvent.click(screen.getByRole("button", { name: "Comentarios" }));

  await waitFor(() => {
    const calls = api.get.mock.calls.filter(([url]) => url === "/notifications");
    expect(calls.length).toBeGreaterThanOrEqual(2);
    expect(calls[calls.length - 1][1]?.params?.type).toBe("comment");
  });

  expect(await screen.findByText(/comentó tu publicación/)).toBeTruthy();
  expect(screen.queryByText(/comenzó a seguirte/)).toBeNull();
});

test("cargar más pide la siguiente página y no duplica", async () => {
  mockList(true);
  mount();
  await screen.findByText(/comenzó a seguirte/);

  const loadMore = await screen.findByRole("button", { name: /Cargar más/ });
  fireEvent.click(loadMore);

  await waitFor(() => {
    const calls = api.get.mock.calls.filter(([url]) => url === "/notifications");
    const last = calls[calls.length - 1][1]?.params;
    expect(last.page).toBe(2);
  });

  expect(api.get).toHaveBeenCalledTimes(2);
});

test("marcar todas como leídas llama al endpoint", async () => {
  api.patch.mockResolvedValue({ data: { ok: true } });
  mount();
  await screen.findByText(/comenzó a seguirte/);

  fireEvent.click(screen.getByRole("button", { name: /Marcar todas/ }));

  await waitFor(() => {
    expect(api.patch).toHaveBeenCalledWith("/notifications/read-all");
  });
});
