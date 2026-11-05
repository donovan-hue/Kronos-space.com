import React from "react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { createTestQueryClient } from "../src/app/queryClient";
import AiUsagePanel from "../src/features/ai/AiUsagePanel";
import CatalogAdmin from "../src/features/admin/CatalogAdmin";

vi.mock("../src/services/aiService", () => ({
  getAiUsage: vi.fn()
}));

vi.mock("../src/services/musicService", () => ({
  obtenerCatalogoMusica: vi.fn(),
  publicarPista: vi.fn()
}));

vi.mock("../src/services/voiceService", () => ({
  obtenerVoces: vi.fn(),
  registrarVoz: vi.fn()
}));

import * as ai from "../src/services/aiService";
import * as musica from "../src/services/musicService";
import * as voces from "../src/services/voiceService";

function montar(ui) {
  return render(
    <QueryClientProvider client={createTestQueryClient()}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  ai.getAiUsage.mockResolvedValue({
    desde: "2026-11-01T00:00:00.000Z",
    capacidades: [
      { capability: "chat", units: 12, unit: "mensajes", operaciones: 12, errores: 0 },
      { capability: "image", units: 7, unit: "imágenes", operaciones: 5, errores: 2 },
      { capability: "video", units: 0, unit: "videos", operaciones: 0, errores: 0 },
      { capability: "script", units: 3, unit: "guiones", operaciones: 3, errores: 0 },
      { capability: "voice", units: 1500, unit: "caracteres", operaciones: 2, errores: 0 }
    ]
  });
  musica.obtenerCatalogoMusica.mockResolvedValue({ pistas: [], motivo: "" });
  voces.obtenerVoces.mockResolvedValue({ voces: [], motivo: "" });
});

afterEach(() => cleanup());

test("el consumo se muestra por capacidad y en su propia unidad", async () => {
  montar(<AiUsagePanel />);

  expect(await screen.findByRole("heading", { name: "Consumo de IA" })).toBeTruthy();
  expect(await screen.findByText("Chat")).toBeTruthy();
  expect(screen.getByText("mensajes")).toBeTruthy();
  expect(screen.getByText("caracteres")).toBeTruthy();
  expect(screen.getByText("1,500")).toBeTruthy();
  // Los errores se separan del consumo real.
  expect(screen.getByText(/2 con error/)).toBeTruthy();
});

test("si el consumo no se puede leer, se explica y se puede reintentar", async () => {
  ai.getAiUsage
    .mockRejectedValueOnce({ response: { data: { error: "No se pudo leer el consumo de IA" } } })
    .mockResolvedValueOnce({ desde: "", capacidades: [] });

  montar(<AiUsagePanel />);

  expect((await screen.findByRole("alert")).textContent).toContain("No se pudo leer el consumo de IA");
  fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
  await waitFor(() => expect(ai.getAiUsage).toHaveBeenCalledTimes(2));
});

test("la administración publica una pista con su archivo y sus datos", async () => {
  musica.publicarPista.mockResolvedValue({ titulo: "Lluvia de titanio" });
  montar(<CatalogAdmin />);

  const archivo = new File(["audio"], "pista.mp3", { type: "audio/mpeg" });
  fireEvent.change(screen.getByLabelText(/Archivo de audio/), { target: { files: [archivo] } });
  fireEvent.change(screen.getByLabelText("Título"), { target: { value: "Lluvia de titanio" } });
  fireEvent.change(screen.getByLabelText("Autor"), { target: { value: "Kronos" } });
  fireEvent.click(screen.getByRole("button", { name: "Publicar pista" }));

  await waitFor(() => expect(musica.publicarPista).toHaveBeenCalled());
  expect(musica.publicarPista.mock.calls[0][0]).toMatchObject({
    titulo: "Lluvia de titanio",
    autor: "Kronos",
    publicada: true
  });
  expect(await screen.findByRole("status")).toHaveProperty(
    "textContent",
    "Pista «Lluvia de titanio» publicada en el catálogo."
  );
});

test("publicar sin archivo se rechaza antes de llamar al servidor", async () => {
  montar(<CatalogAdmin />);

  fireEvent.change(screen.getByLabelText("Título"), { target: { value: "Sin audio" } });
  fireEvent.click(screen.getByRole("button", { name: "Publicar pista" }));

  expect((await screen.findByRole("alert")).textContent).toContain("Elige un archivo de audio");
  expect(musica.publicarPista).not.toHaveBeenCalled();
});

test("una voz de catálogo exige modelo y no manda archivo", async () => {
  voces.registrarVoz.mockResolvedValue({ nombre: "Kore" });
  montar(<CatalogAdmin />);

  fireEvent.change(screen.getByLabelText("Nombre"), { target: { value: "Kore" } });
  fireEvent.click(screen.getByRole("button", { name: "Registrar voz" }));

  expect((await screen.findByRole("alert")).textContent).toContain("necesita el modelo");

  fireEvent.change(screen.getByLabelText(/Modelo del proveedor/), {
    target: { value: "google/gemini-2.5-flash-preview-tts" }
  });
  fireEvent.click(screen.getByRole("button", { name: "Registrar voz" }));

  await waitFor(() => expect(voces.registrarVoz).toHaveBeenCalled());
  expect(voces.registrarVoz.mock.calls[0][0]).toMatchObject({
    nombre: "Kore",
    tipo: "catalogo",
    modelo: "google/gemini-2.5-flash-preview-tts"
  });
  expect(voces.registrarVoz.mock.calls[0][0].archivo).toBeNull();
});

test("el catálogo vacío dice que hay que publicar, no se queda en blanco", async () => {
  montar(<CatalogAdmin />);

  expect(
    await screen.findByText("Los catálogos están vacíos. Publica la primera pista o registra la primera voz arriba.")
  ).toBeTruthy();
});
