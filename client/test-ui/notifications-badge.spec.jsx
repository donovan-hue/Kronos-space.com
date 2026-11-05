import React from "react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { createTestQueryClient } from "../src/app/queryClient";
import AppLayout from "../src/layouts/AppLayout";
import { api } from "../src/services/apiClient";
import * as socket from "../src/services/socket";

vi.mock("../src/services/socket", () => ({
  getSocket: vi.fn(() => null),
  connectSocket: vi.fn(),
  disconnectSocket: vi.fn(),
}));

vi.mock("../src/services/apiClient", () => ({
  API_URL: "/api",
  api: { get: vi.fn(), patch: vi.fn() },
}));

beforeEach(() => {
  vi.clearAllMocks();
  socket.getSocket.mockReturnValue(null);
});

afterEach(() => cleanup());

function mount() {
  render(
    <QueryClientProvider client={createTestQueryClient()}>
      <MemoryRouter initialEntries={["/home"]}>
        <Routes>
          <Route element={<AppLayout />}>
            <Route path="/home" element={<h1>Inicio</h1>} />
          </Route>
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

/**
 * El contador vivía solo DENTRO de la pantalla de notificaciones: la campana
 * de la barra superior no avisaba de nada. Se pide una sola cifra y se pinta
 * sobre el glifo, con la etiqueta accesible actualizada.
 */
test("la campana muestra las no leídas y lo dice también en la etiqueta", async () => {
  api.get.mockResolvedValue({ data: { notifications: [], unreadCount: 7 } });
  mount();

  const campana = await screen.findByRole("link", { name: /Notificaciones · 7 sin leer/ });
  expect(campana).toBeTruthy();
  await waitFor(() => expect(campana.querySelector(".k-topbar-badge").textContent).toBe("7"));
});

test("sin no leídas la campana no lleva adorno ni cifra en la etiqueta", async () => {
  api.get.mockResolvedValue({ data: { notifications: [], unreadCount: 0 } });
  mount();

  const campana = await screen.findByRole("link", { name: "Notificaciones" });
  expect(campana.querySelector(".k-topbar-badge")).toBeNull();
});

test("el contador no se dispara en cada montaje: una sola consulta de cifra", async () => {
  api.get.mockResolvedValue({ data: { notifications: [], unreadCount: 3 } });
  mount();

  await screen.findByRole("link", { name: /3 sin leer/ });
  const cifras = api.get.mock.calls.filter(
    ([url, config]) => url === "/notifications" && config?.params?.limit === 1
  );
  expect(cifras).toHaveLength(1);
});
