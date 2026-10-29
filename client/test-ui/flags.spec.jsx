import React from "react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import TabBar from "../src/components/navigation/TabBar";
import MenuDrawer from "../src/components/navigation/MenuDrawer";
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

// Los destinos que una bandera enciende o apaga se listan en el menú de
// secciones; la barra inferior fija los cinco del modelo y no depende de ellos.
function Menu() {
  return (
    <MemoryRouter initialEntries={["/home"]}>
      <MenuDrawer isOpen onClose={() => {}} />
    </MemoryRouter>
  );
}

test("con todos los flags encendidos el menú muestra las funciones nuevas", async () => {
  flagsService.getFeatureFlags.mockResolvedValue({
    aiComposer: true, capsules: true, pulse: true, vertical: true, analytics: true, archive: true
  });

  render(<Menu />);

  expect(await screen.findByRole("link", { name: /Pulso/ })).toBeTruthy();
  expect(screen.getByRole("link", { name: /Cápsulas/ })).toBeTruthy();
  expect(screen.getByRole("link", { name: /Analítica/ })).toBeTruthy();
});

test("un flag apagado oculta su función sin romper el resto", async () => {
  flagsService.getFeatureFlags.mockResolvedValue({
    aiComposer: true, capsules: false, pulse: false, vertical: true, analytics: true, archive: true
  });

  render(<Menu />);

  await waitFor(() => expect(screen.queryByRole("link", { name: /Pulso/ })).toBeNull());
  expect(screen.queryByRole("link", { name: /Cápsulas/ })).toBeNull();
  expect(screen.getByRole("link", { name: /Analítica/ })).toBeTruthy();
});

test("la barra inferior conserva sus cinco destinos aunque se apaguen funciones", async () => {
  flagsService.getFeatureFlags.mockResolvedValue({
    aiComposer: true, capsules: false, pulse: false, vertical: true, analytics: true, archive: true
  });

  render(
    <MemoryRouter initialEntries={["/home"]}>
      <TabBar />
    </MemoryRouter>
  );

  const barra = await screen.findByRole("navigation", { name: "Navegación principal" });
  expect(barra.querySelectorAll("a")).toHaveLength(5);
});

test("si el servidor de flags no responde, todo queda visible", async () => {
  flagsService.getFeatureFlags.mockRejectedValue(new Error("flags offline"));

  render(<Menu />);

  expect(await screen.findByRole("link", { name: /Pulso/ })).toBeTruthy();
  expect(screen.getByRole("link", { name: /Cápsulas/ })).toBeTruthy();
});
