import React from "react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import Notifications from "../src/features/notifications/Notifications";
import { api } from "../src/services/apiClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { createTestQueryClient } from "../src/app/queryClient";

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
  { _id: "n4", type: "follow", read: false, createdAt: new Date().toISOString(), actor: { _id: "u4", username: "dora" } },
  { _id: "n5", type: "save", read: false, createdAt: new Date().toISOString(), actor: { _id: "u5", username: "elena" } }
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
    <QueryClientProvider client={createTestQueryClient()}>
      <MemoryRouter initialEntries={["/notifications"]}>
        <Notifications />
      </MemoryRouter>
    </QueryClientProvider>
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

test("el filtro de guardados usa el tipo completo del catálogo", async () => {
  mount();
  await screen.findByText(/comenzó a seguirte/);

  fireEvent.click(screen.getByRole("button", { name: "Guardados" }));

  await waitFor(() => {
    const calls = api.get.mock.calls.filter(([url]) => url === "/notifications");
    expect(calls[calls.length - 1][1]?.params?.type).toBe("save");
  });

  expect(await screen.findByText(/guardó tu publicación/)).toBeTruthy();
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


test("las no leídas tienen texto, no solo un borde, y se actualiza tras marcar todas", async () => {
  api.patch.mockResolvedValue({ data: { ok: true } });
  mount();
  expect(await screen.findAllByText("Sin leer")).toHaveLength(4);
  fireEvent.click(screen.getByRole("button", { name: /Marcar todas/ }));
  await waitFor(() => expect(screen.queryAllByText("Sin leer")).toHaveLength(0));
  expect(screen.getAllByText("Leída")).toHaveLength(5);
});

test("destinos reales para post en string, cápsulas y perfiles canónicos", async () => {
  api.get.mockResolvedValue({ data: { notifications: [
    { ...items[1], post: "post-id" },
    { ...items[0], _id: "capsule-note", type: "capsule", post: null },
    items[3]
  ], unreadCount: 3, hasMore: false } });
  mount();
  expect((await screen.findByRole("link", { name: /comentó tu publicación/ })).getAttribute("href")).toBe("/post/post-id");
  expect(screen.getByRole("link", { name: /Se abrió una cápsula/ }).getAttribute("href")).toBe("/capsules");
  expect(screen.getByRole("link", { name: /comenzó a seguirte/ }).getAttribute("href")).toBe("/profile/dora");
});

// ---------------------------------------------------------------
// Bloque 1.1 — tipos nuevos, destino por `ref` y contador del shell.
// ---------------------------------------------------------------

test("los tipos nuevos tienen frase propia, no el genérico", async () => {
  api.get.mockResolvedValue({ data: { notifications: [
    { ...items[0], _id: "e1", type: "event", read: false },
    { ...items[0], _id: "s1", type: "story", read: false, ref: { kind: "story", id: "st1" } },
    { ...items[0], _id: "l1", type: "live", read: false, ref: { kind: "live", id: "rm1" } },
    { ...items[0], _id: "r1", type: "report", read: false, ref: { kind: "report", id: "rp1" } }
  ], unreadCount: 4, hasMore: false } });
  mount();
  expect(await screen.findByText(/confirmó su asistencia/)).toBeTruthy();
  expect(screen.getByText(/respondió a tu historia/)).toBeTruthy();
  expect(screen.getByText(/te invitó a una sala en vivo/)).toBeTruthy();
  expect(screen.getByText(/Tu reporte fue revisado/)).toBeTruthy();
  expect(screen.queryByText(/generó actividad en Kronos/)).toBeNull();
});

test("quien recibe una invitación a cápsula no lee que la cápsula se abrió", async () => {
  api.get.mockResolvedValue({ data: { notifications: [
    { ...items[0], _id: "c1", type: "capsule", read: false, ref: { kind: "capsule", id: "cap1" } },
    { ...items[0], _id: "c2", type: "capsule", read: false }
  ], unreadCount: 2, hasMore: false } });
  mount();
  expect(await screen.findByText(/te invitó a colaborar en una cápsula/)).toBeTruthy();
  expect(screen.getByText(/Se abrió una cápsula/)).toBeTruthy();
});

test("cada aviso sin publicación lleva al recurso que lo abrió, no al perfil del actor", async () => {
  api.get.mockResolvedValue({ data: { notifications: [
    { ...items[0], _id: "s1", type: "story", read: false, ref: { kind: "story", id: "st1" } },
    { ...items[0], _id: "l1", type: "live", read: false, ref: { kind: "live", id: "rm1" } },
    { ...items[0], _id: "r1", type: "report", read: false, ref: { kind: "report", id: "rp1" } }
  ], unreadCount: 3, hasMore: false } });
  mount();
  expect((await screen.findByRole("link", { name: /respondió a tu historia/ })).getAttribute("href")).toBe("/stories/archive");
  expect(screen.getByRole("link", { name: /te invitó a una sala en vivo/ }).getAttribute("href")).toBe("/live");
  expect(screen.getByRole("link", { name: /Tu reporte fue revisado/ }).getAttribute("href")).toBe("/moderation");
});

test("el filtro de moderación pide los dos tipos que la componen", async () => {
  mount();
  await screen.findByText(/comenzó a seguirte/);
  fireEvent.click(screen.getByRole("button", { name: "Moderación" }));
  await waitFor(() => {
    const calls = api.get.mock.calls.filter(([url]) => url === "/notifications");
    expect(calls[calls.length - 1][1]?.params?.type).toBe("moderation,report");
  });
});
