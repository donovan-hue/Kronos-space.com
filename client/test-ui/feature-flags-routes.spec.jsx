import React from "react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import FeatureRoute from "../src/routes/FeatureRoute";
import { getFeatureFlags, resetFeatureFlagsCache } from "../src/services/flagsService";
import { api } from "../src/services/apiClient";

vi.mock("../src/services/apiClient", () => ({
  api: { get: vi.fn() }
}));

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
  resetFeatureFlagsCache();
});

/**
 * El servidor responde 404 `FEATURE_DISABLED` cuando el flag está apagado.
 * Estos casos fijan que el cliente NO contradiga esa decisión: un enlace
 * guardado a una función apagada muestra una pantalla honesta en lugar de
 * montar la pantalla y comerse el 404.
 */
function Montado({ flag, flags }) {
  return (
    <MemoryRouter initialEntries={["/pulse"]}>
      <FeatureRoute flag={flag} flags={flags}>
        <p>pantalla real</p>
      </FeatureRoute>
    </MemoryRouter>
  );
}

describe("guarda de rutas por feature flag", () => {
  test("flag encendido monta la pantalla", () => {
    render(<Montado flag="pulse" flags={{ pulse: true }} />);
    expect(screen.getByText("pantalla real")).toBeTruthy();
  });

  test("flag apagado explica que la función está apagada y ofrece volver", () => {
    render(<Montado flag="pulse" flags={{ pulse: false }} />);
    expect(screen.queryByText("pantalla real")).toBeNull();
    expect(screen.getByRole("heading", { name: /Función no disponible/ })).toBeTruthy();
    expect(screen.getByRole("link", { name: /Volver a Inicio/ }).getAttribute("href")).toBe("/home");
  });

  test("mientras llegan los flags no se esconde nada", () => {
    render(<Montado flag="pulse" flags={null} />);
    expect(screen.getByText("pantalla real")).toBeTruthy();
  });

  test("la promesa de flags se comparte y no se repite por cada montaje", async () => {
    api.get.mockResolvedValue({ data: { flags: { pulse: false } } });

    const [uno, dos, tres] = await Promise.all([
      getFeatureFlags(),
      getFeatureFlags(),
      getFeatureFlags()
    ]);

    expect(api.get).toHaveBeenCalledTimes(1);
    expect(uno).toBe(dos);
    expect(tres.pulse).toBe(false);
  });

  test("si la red falla queda todo encendido y se reintenta después", async () => {
    api.get.mockRejectedValueOnce(new Error("sin red"));
    const caido = await getFeatureFlags();
    expect(caido.pulse).toBe(true);

    // Un fallo no se cachea: la siguiente vista vuelve a preguntar.
    api.get.mockResolvedValue({ data: { flags: { pulse: false } } });
    const reintento = await getFeatureFlags();
    expect(api.get).toHaveBeenCalledTimes(2);
    expect(reintento.pulse).toBe(false);
  });
});
