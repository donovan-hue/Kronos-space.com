import React from "react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { createTestQueryClient } from "../src/app/queryClient";
import ImageGenerator from "../src/features/image-ai/ImageGenerator";

vi.mock("../src/services/aiService", () => ({
  generateImage: vi.fn(),
  getImageHistory: vi.fn()
}));

vi.mock("../src/services/promptService", () => ({
  getPromptCatalog: vi.fn(),
  getPromptPresets: vi.fn(),
  createPromptPreset: vi.fn(),
  updatePromptPreset: vi.fn(),
  deletePromptPreset: vi.fn(),
  applyPromptPreset: vi.fn()
}));

import * as ai from "../src/services/aiService";
import * as prompts from "../src/services/promptService";

beforeEach(() => {
  vi.clearAllMocks();
  ai.getImageHistory.mockResolvedValue({ generations: [] });
  prompts.getPromptCatalog.mockResolvedValue({
    grupos: [],
    instrumentos: [],
    estilos: [
      { codigo: "cinematic", nombre: "Cinemático", texto: "luz de cine" },
      { codigo: "noir", nombre: "Noir", texto: "blanco y negro" }
    ],
    total: 0
  });
  prompts.getPromptPresets.mockResolvedValue({ presets: [], total: 0 });
});

afterEach(() => cleanup());

function mount(state = undefined) {
  return render(
    <QueryClientProvider client={createTestQueryClient()}>
      <MemoryRouter initialEntries={[{ pathname: "/kairos/image", state }]}>
        <ImageGenerator />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

async function enviar(prompt = "Ciudad de titanio") {
  fireEvent.change(screen.getByLabelText("Prompt"), { target: { value: prompt } });
  fireEvent.click(screen.getByRole("button", { name: "Generar imagen" }));
}

test("el formulario ofrece encuadre y variaciones, con los valores por defecto del servidor", async () => {
  ai.generateImage.mockResolvedValue({ url: "/uploads/media/a.png", urls: ["/uploads/media/a.png"] });
  mount();

  expect(screen.getByLabelText("Encuadre")).toBeTruthy();
  expect(screen.getByLabelText("Variaciones")).toBeTruthy();
  expect(screen.getByRole("option", { name: /Historia · 9:16/ })).toBeTruthy();

  await enviar();

  await waitFor(() =>
    expect(ai.generateImage).toHaveBeenCalledWith({
      prompt: "Ciudad de titanio",
      negativePrompt: "",
      style: "cinematic",
      aspectRatio: "1:1",
      variations: 1
    })
  );
});

test("un encuadre y varias variaciones viajan al servicio tal cual", async () => {
  ai.generateImage.mockResolvedValue({
    url: "/uploads/media/1.png",
    urls: ["/uploads/media/1.png", "/uploads/media/2.png", "/uploads/media/3.png"]
  });
  mount();

  fireEvent.change(screen.getByLabelText("Encuadre"), { target: { value: "9:16" } });
  fireEvent.change(screen.getByLabelText("Variaciones"), { target: { value: "3" } });
  await enviar("Retrato vertical");

  await waitFor(() =>
    expect(ai.generateImage).toHaveBeenCalledWith(
      expect.objectContaining({ aspectRatio: "9:16", variations: 3 })
    )
  );
  expect(await screen.findByRole("status")).toHaveProperty("textContent", "3 variaciones listas.");
});

test("las variaciones devueltas se pueden elegir y la activa se marca", async () => {
  ai.generateImage.mockResolvedValue({
    url: "/uploads/media/1.png",
    urls: ["/uploads/media/1.png", "/uploads/media/2.png"]
  });
  mount();

  await enviar();

  const segunda = await screen.findByRole("listitem", { name: "Variación 2" });
  const primera = screen.getByRole("listitem", { name: "Variación 1" });
  expect(primera.getAttribute("aria-pressed")).toBe("true");
  expect(segunda.getAttribute("aria-pressed")).toBe("false");

  fireEvent.click(segunda);

  expect(screen.getByRole("listitem", { name: "Variación 2" }).getAttribute("aria-pressed")).toBe("true");
  expect(screen.getByRole("listitem", { name: "Variación 1" }).getAttribute("aria-pressed")).toBe("false");
});

test("si el modelo solo devuelve una, se dice en vez de fingir varias", async () => {
  ai.generateImage.mockResolvedValue({
    url: "/uploads/media/1.png",
    urls: ["/uploads/media/1.png"],
    message: "El modelo solo devolvió 1 de 3 variaciones."
  });
  mount();

  fireEvent.change(screen.getByLabelText("Variaciones"), { target: { value: "3" } });
  await enviar();

  expect(await screen.findByRole("status")).toHaveProperty(
    "textContent",
    "El modelo solo devolvió 1 de 3 variaciones."
  );
  expect(screen.queryByRole("listitem", { name: "Variación 2" })).toBeNull();
});

test("reutilizar una generación del historial restaura encuadre y variaciones", async () => {
  ai.getImageHistory.mockResolvedValue({
    generations: [
      {
        _id: "gen-1",
        prompt: "Torre de cobre",
        negativePrompt: "texto",
        style: "editorial",
        aspectRatio: "16:9",
        variations: 2,
        variants: ["/uploads/media/1.png", "/uploads/media/2.png"],
        imageUrl: "/uploads/media/1.png",
        createdAt: new Date().toISOString()
      }
    ]
  });
  mount();

  fireEvent.click(await screen.findByAltText("Torre de cobre"));

  expect(screen.getByLabelText("Encuadre").value).toBe("16:9");
  expect(screen.getByLabelText("Variaciones").value).toBe("2");
  expect(screen.getByLabelText("Estilo").value).toBe("editorial");
  expect(screen.getByLabelText("Prompt").value).toBe("Torre de cobre");
  expect(screen.getByRole("listitem", { name: "Variación 2" })).toBeTruthy();
});

/**
 * Estilos propios en el generador (bloque 2.2).
 *
 * El estilo de fábrica viaja como código; el propio viaja como `estiloId` y
 * el servidor resuelve la descripción. El cliente nunca manda el texto del
 * estilo: si lo hiciera, `style` volvería a ser una puerta abierta.
 */
test("aplicar un estilo propio manda su id al generar", async () => {
  prompts.getPromptPresets.mockResolvedValue({
    presets: [{ _id: "e1", nombre: "Cromo propio", tipo: "estilo", estiloVisual: "metal líquido", usos: 0 }],
    total: 1
  });
  prompts.applyPromptPreset.mockResolvedValue({
    prompt: "",
    estilo: "metal líquido",
    preset: { _id: "e1", nombre: "Cromo propio" }
  });
  ai.generateImage.mockResolvedValue({ url: "/uploads/media/a.png", urls: ["/uploads/media/a.png"] });

  mount();

  fireEvent.click(screen.getByRole("button", { name: /biblioteca de prompts/i }));
  fireEvent.click(await screen.findByRole("tab", { name: /mis presets/i }));
  fireEvent.click(await screen.findByRole("button", { name: "Usar" }));

  await waitFor(() => expect(screen.getByText(/Estilo propio:/)).toBeTruthy());

  await enviar("Ciudad con cromo");

  await waitFor(() => expect(ai.generateImage).toHaveBeenCalledTimes(1));
  const enviado = ai.generateImage.mock.calls[0][0];
  expect(enviado.estiloId).toBe("e1");
  // Y el texto del estilo no viaja: solo el id.
  expect(JSON.stringify(enviado)).not.toContain("metal líquido");
});

test("quitar el estilo propio lo saca del envío", async () => {
  prompts.getPromptPresets.mockResolvedValue({
    presets: [{ _id: "e1", nombre: "Cromo propio", tipo: "estilo", estiloVisual: "metal líquido", usos: 0 }],
    total: 1
  });
  prompts.applyPromptPreset.mockResolvedValue({ prompt: "", estilo: "metal líquido" });
  ai.generateImage.mockResolvedValue({ url: "/uploads/media/a.png", urls: ["/uploads/media/a.png"] });

  mount();

  fireEvent.click(screen.getByRole("button", { name: /biblioteca de prompts/i }));
  fireEvent.click(await screen.findByRole("tab", { name: /mis presets/i }));
  fireEvent.click(await screen.findByRole("button", { name: "Usar" }));
  await waitFor(() => expect(screen.getByText(/Estilo propio:/)).toBeTruthy());

  fireEvent.click(screen.getByRole("button", { name: "Quitar" }));
  await enviar("Ciudad sin estilo propio");

  await waitFor(() => expect(ai.generateImage).toHaveBeenCalledTimes(1));
  expect(ai.generateImage.mock.calls[0][0]).not.toHaveProperty("estiloId");
});
