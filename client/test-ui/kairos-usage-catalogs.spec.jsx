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
  publicarPista: vi.fn(),
  actualizarPista: vi.fn(),
  eliminarPista: vi.fn()
}));

vi.mock("../src/services/voiceService", () => ({
  obtenerVoces: vi.fn(),
  registrarVoz: vi.fn(),
  actualizarVoz: vi.fn(),
  eliminarVoz: vi.fn()
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

/* ============================================================
   Cuota visible y administración completa del catálogo
   ============================================================ */

test("con cuota, el consumo se lee como «N de M» y dice cuánto queda", async () => {
  ai.getAiUsage.mockResolvedValueOnce({
    desde: "2026-11-01T00:00:00.000Z",
    capacidades: [
      { capability: "image", units: 7, unit: "imágenes", operaciones: 7, errores: 0, cuota: 10, restante: 3, agotada: false },
      { capability: "chat", units: 12, unit: "mensajes", operaciones: 12, errores: 0, cuota: null, restante: null, agotada: false }
    ]
  });

  montar(<AiUsagePanel />);

  expect(await screen.findByText(/de 10/)).toBeTruthy();
  expect(screen.getByText(/quedan 3/)).toBeTruthy();
  // Sin cuota declarada no se inventa un techo.
  expect(screen.queryByText(/de 12/)).toBeNull();
});

test("una capacidad agotada se marca y no se disfraza de consumo normal", async () => {
  ai.getAiUsage.mockResolvedValueOnce({
    desde: "2026-11-01T00:00:00.000Z",
    capacidades: [
      { capability: "video", units: 5, unit: "videos", operaciones: 5, errores: 0, cuota: 5, restante: 0, agotada: true }
    ]
  });

  montar(<AiUsagePanel />);

  expect(await screen.findByText(/límite del mes alcanzado/)).toBeTruthy();
  expect(screen.queryByText(/quedan 0/)).toBeNull();
});

test("editar una pista manda solo los campos corregibles", async () => {
  musica.obtenerCatalogoMusica.mockResolvedValue({
    pistas: [{
      _id: "pista-1", titulo: "Toma vieja", autor: "Estudio", duracion: 30,
      etiquetas: ["calma"], licencia: "CC0", url: "/uploads/music/a.mp3", publicada: true
    }],
    motivo: ""
  });
  musica.actualizarPista.mockResolvedValue({ _id: "pista-1", titulo: "Toma corregida" });

  montar(<CatalogAdmin />);

  fireEvent.click(await screen.findByRole("button", { name: "Editar" }));
  const titulo = await screen.findByDisplayValue("Toma vieja");
  fireEvent.change(titulo, { target: { value: "Toma corregida" } });
  fireEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));

  await waitFor(() => expect(musica.actualizarPista).toHaveBeenCalledTimes(1));
  const [id, cambios] = musica.actualizarPista.mock.calls[0];
  expect(id).toBe("pista-1");
  expect(cambios.titulo).toBe("Toma corregida");
  // El archivo no se sustituye editando: eso sería otra pista.
  expect(cambios).not.toHaveProperty("url");
  expect(cambios).not.toHaveProperty("audio");
});

test("retirar pide confirmación y distingue archivo borrado de archivo conservado", async () => {
  musica.obtenerCatalogoMusica.mockResolvedValue({
    pistas: [{ _id: "pista-2", titulo: "Ruido", autor: "", duracion: 0, etiquetas: [], licencia: "", url: "/uploads/music/b.mp3", publicada: true }],
    motivo: ""
  });
  musica.eliminarPista.mockResolvedValue({ eliminada: true, archivoBorrado: false });
  const confirmar = vi.spyOn(window, "confirm").mockReturnValue(true);

  montar(<CatalogAdmin />);

  fireEvent.click(await screen.findByRole("button", { name: "Retirar" }));

  await waitFor(() => expect(musica.eliminarPista).toHaveBeenCalledWith("pista-2"));
  expect(confirmar).toHaveBeenCalled();
  // Si algo más usa el archivo, se conserva y se dice: no se finge un borrado.
  expect(await screen.findByText(/El archivo se conserva porque algo más lo usa/)).toBeTruthy();
  confirmar.mockRestore();
});

test("cancelar la confirmación no retira nada", async () => {
  musica.obtenerCatalogoMusica.mockResolvedValue({
    pistas: [{ _id: "pista-3", titulo: "Ruido", autor: "", duracion: 0, etiquetas: [], licencia: "", url: "/uploads/music/c.mp3", publicada: true }],
    motivo: ""
  });
  const confirmar = vi.spyOn(window, "confirm").mockReturnValue(false);

  montar(<CatalogAdmin />);

  fireEvent.click(await screen.findByRole("button", { name: "Retirar" }));
  expect(musica.eliminarPista).not.toHaveBeenCalled();
  confirmar.mockRestore();
});
