import React from "react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import FanNav from "../src/components/FanNav";
import * as flagsService from "../src/services/flagsService";

vi.mock("../src/services/flagsService", () => ({
  getFeatureFlags: vi.fn(),
  DEFAULT_FLAGS: {
    aiComposer: true,
    capsules: true,
    pulse: true,
    vertical: true,
    analytics: true,
    archive: true
  }
}));

beforeEach(() => {
  vi.resetAllMocks();
});

afterEach(() => cleanup());

test("con todos los flags encendidos el abanico muestra las funciones nuevas", async () => {
  flagsService.getFeatureFlags.mockResolvedValue({
    aiComposer: true, capsules: true, pulse: true, vertical: true, analytics: true, archive: true
  });

  render(
    <MemoryRouter initialEntries={["/home"]}>
      <FanNav />
    </MemoryRouter>
  );

  expect(await screen.findByRole("link", { name: /Pulso/ })).toBeTruthy();
  expect(screen.getByRole("link", { name: /Cápsulas/ })).toBeTruthy();
  expect(screen.getByRole("link", { name: /Analítica/ })).toBeTruthy();
});

test("un flag apagado oculta su función sin romper el resto", async () => {
  flagsService.getFeatureFlags.mockResolvedValue({
    aiComposer: true, capsules: false, pulse: false, vertical: true, analytics: true, archive: true
  });

  render(
    <MemoryRouter initialEntries={["/home"]}>
      <FanNav />
    </MemoryRouter>
  );

  await waitFor(() => expect(screen.queryByRole("link", { name: /Pulso/ })).toBeNull());
  expect(screen.queryByRole("link", { name: /Cápsulas/ })).toBeNull();
  expect(screen.getByRole("link", { name: /Analítica/ })).toBeTruthy();
  expect(screen.getAllByRole("link", { name: /Inicio/ }).length).toBeGreaterThan(0);
  // El móvil no depende de flags: sus cinco destinos fijos siguen.
  const mobile = screen.getByRole("navigation", { name: "Navegación social móvil" });
  expect(mobile.querySelectorAll("a")).toHaveLength(5);
});

test("si el servidor de flags no responde, todo queda visible", async () => {
  flagsService.getFeatureFlags.mockRejectedValue(new Error("flags offline"));

  render(
    <MemoryRouter initialEntries={["/home"]}>
      <FanNav />
    </MemoryRouter>
  );

  expect(await screen.findByRole("link", { name: /Pulso/ })).toBeTruthy();
  expect(screen.getByRole("link", { name: /Cápsulas/ })).toBeTruthy();
});
