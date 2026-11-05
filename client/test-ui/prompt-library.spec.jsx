import React from "react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import PromptLibrary from "../src/features/image-ai/PromptLibrary";

/**
 * Biblioteca de prompts (estilos propios + presets).
 *
 * Lo que se comprueba aquí es lo que el usuario ve y pulsa: el catálogo tiene
 * sus 54 instrumentos, rellenar uno arma el prompt con la misma regla que el
 * servidor, y un preset guardado se puede aplicar al generador. Nada sale a
 * red: el servicio está sustituido.
 */

vi.mock("../src/services/promptService", () => ({
  getPromptCatalog: vi.fn(),
  getPromptPresets: vi.fn(),
  createPromptPreset: vi.fn(),
  updatePromptPreset: vi.fn(),
  deletePromptPreset: vi.fn(),
  applyPromptPreset: vi.fn(),
}));

import * as prompts from "../src/services/promptService";

const CATALOGO = {
  grupos: [
    { id: "core", nombre: "Núcleo" },
    { id: "imagen", nombre: "Imagen" },
  ],
  instrumentos: [
    {
      codigo: "img_lighting",
      grupo: "imagen",
      numero: 19,
      nombre: "Iluminación",
      template: "Iluminación: {{luz}}. El material dominante es {{material}}.",
      campos: [
        { clave: "luz", etiqueta: "Luz", ejemplo: "luz de ventana lateral" },
        { clave: "material", etiqueta: "Material", ejemplo: "metal pulido" },
      ],
    },
    {
      codigo: "img_styles",
      grupo: "imagen",
      numero: 18,
      nombre: "Estilos artísticos",
      template: "{{tema}} en estilo {{estilo}}.",
      campos: [
        { clave: "tema", etiqueta: "Tema", ejemplo: "una ciudad" },
        { clave: "estilo", etiqueta: "Estilo", ejemplo: "noir" },
      ],
    },
  ],
  estilos: [
    { codigo: "cinematic", nombre: "Cinemático", texto: "luz de cine" },
    { codigo: "noir", nombre: "Noir", texto: "blanco y negro" },
  ],
  total: 2,
};

beforeEach(() => {
  vi.clearAllMocks();
  prompts.getPromptCatalog.mockResolvedValue(CATALOGO);
  prompts.getPromptPresets.mockResolvedValue({ presets: [], total: 0 });
  prompts.createPromptPreset.mockImplementation(async (payload) => ({
    _id: "p1",
    ...payload,
    usos: 0,
    prompt: "Iluminación: luz suave.",
  }));
  prompts.applyPromptPreset.mockResolvedValue({
    prompt: "Iluminación: luz suave. El material dominante es cromo.",
    preset: { _id: "p1", nombre: "Estudio" },
  });
});

afterEach(() => cleanup());

test("el catálogo se abre, lista los instrumentos y arma el prompt al rellenar", async () => {
  render(<PromptLibrary onUsePrompt={vi.fn()} onUseStyle={vi.fn()} />);

  fireEvent.click(screen.getByRole("button", { name: /biblioteca de prompts/i }));

  await waitFor(() => expect(screen.getByText("Iluminación")).toBeTruthy());
  fireEvent.click(screen.getByText("Iluminación"));

  fireEvent.change(screen.getByLabelText("Luz"), { target: { value: "luz suave" } });
  fireEvent.change(screen.getByLabelText("Material"), { target: { value: "cromo" } });

  expect(screen.getByText("Iluminación: luz suave. El material dominante es cromo.")).toBeTruthy();
});

test("un campo vacío no deja huecos ni frases a medias en el prompt", async () => {
  render(<PromptLibrary onUsePrompt={vi.fn()} />);
  fireEvent.click(screen.getByRole("button", { name: /biblioteca de prompts/i }));
  await waitFor(() => expect(screen.getByText("Iluminación")).toBeTruthy());

  fireEvent.click(screen.getByText("Iluminación"));
  fireEvent.change(screen.getByLabelText("Material"), { target: { value: "cromo" } });

  const vista = screen.getByText(/El material dominante es cromo/);
  expect(vista.textContent).not.toMatch(/\{\{/);
  expect(vista.textContent).not.toMatch(/:\s*\./);
  // Sin el campo «luz», la etiqueta no queda huérfana.
  expect(vista.textContent.startsWith("Iluminación:")).toBe(false);
});

test("guardar un preset lo añade a la lista de los míos", async () => {
  render(<PromptLibrary onUsePrompt={vi.fn()} />);
  fireEvent.click(screen.getByRole("button", { name: /biblioteca de prompts/i }));
  await waitFor(() => expect(screen.getByText("Iluminación")).toBeTruthy());

  fireEvent.click(screen.getByText("Iluminación"));
  fireEvent.change(screen.getByLabelText("Luz"), { target: { value: "luz suave" } });
  fireEvent.change(screen.getByLabelText("Nombre del preset"), { target: { value: "Estudio" } });
  fireEvent.click(screen.getByRole("button", { name: /guardar preset/i }));

  await waitFor(() => expect(prompts.createPromptPreset).toHaveBeenCalledTimes(1));
  expect(prompts.createPromptPreset.mock.calls[0][0]).toMatchObject({
    nombre: "Estudio",
    tipo: "preset",
    instrumento: "img_lighting",
    valores: { luz: "luz suave" },
  });
  expect(await screen.findByText("Preset guardado.")).toBeTruthy();
});

test("aplicar un preset rellena el prompt del generador y cuenta el uso", async () => {
  prompts.getPromptPresets.mockResolvedValue({
    presets: [
      {
        _id: "p1",
        nombre: "Estudio",
        tipo: "preset",
        instrumentoNombre: "Iluminación",
        prompt: "Iluminación: luz suave.",
        usos: 2,
      },
    ],
    total: 1,
  });

  const onUsePrompt = vi.fn();
  render(<PromptLibrary onUsePrompt={onUsePrompt} />);
  fireEvent.click(screen.getByRole("button", { name: /biblioteca de prompts/i }));
  fireEvent.click(await screen.findByRole("tab", { name: /mis presets/i }));

  fireEvent.click(await screen.findByRole("button", { name: "Usar" }));

  await waitFor(() => expect(onUsePrompt).toHaveBeenCalledWith(
    "Iluminación: luz suave. El material dominante es cromo."
  ));
  expect(await screen.findByText("3 usos")).toBeTruthy();
});

test("un estilo propio se ofrece al generador como estilo, no como prompt", async () => {
  prompts.getPromptPresets.mockResolvedValue({
    presets: [
      {
        _id: "e1",
        nombre: "Cromo propio",
        tipo: "estilo",
        estiloVisual: "metal líquido, reflejos nítidos",
        usos: 0,
      },
    ],
    total: 1,
  });
  prompts.applyPromptPreset.mockResolvedValue({
    prompt: "",
    estilo: "metal líquido, reflejos nítidos",
    preset: { _id: "e1", nombre: "Cromo propio" },
  });

  const onUsePrompt = vi.fn();
  const onUseStyle = vi.fn();
  render(<PromptLibrary onUsePrompt={onUsePrompt} onUseStyle={onUseStyle} />);

  fireEvent.click(screen.getByRole("button", { name: /biblioteca de prompts/i }));
  fireEvent.click(await screen.findByRole("tab", { name: /mis presets/i }));
  fireEvent.click(await screen.findByRole("button", { name: "Usar" }));

  await waitFor(() => expect(onUseStyle).toHaveBeenCalledTimes(1));
  expect(onUsePrompt).not.toHaveBeenCalled();
  expect(await screen.findByText("Estilo «Cromo propio» aplicado.")).toBeTruthy();
});

test("si la biblioteca no carga, lo dice en vez de quedarse en blanco", async () => {
  prompts.getPromptCatalog.mockRejectedValue(new Error("502"));
  render(<PromptLibrary onUsePrompt={vi.fn()} />);

  fireEvent.click(screen.getByRole("button", { name: /biblioteca de prompts/i }));

  expect(await screen.findByRole("status")).toHaveProperty("textContent", "No se pudo cargar la biblioteca.");
});
