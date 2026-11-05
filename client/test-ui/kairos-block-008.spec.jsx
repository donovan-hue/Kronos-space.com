import React from "react";
import { beforeEach, afterEach, expect, test, vi } from "vitest";
import { QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { createTestQueryClient } from "../src/app/queryClient";
import KairosHistory from "../src/features/ai/KairosHistory";
import MediaLibrary from "../src/features/ai/MediaLibrary";
import ScriptGenerator from "../src/features/script-ai/ScriptGenerator";
import VideoJobs from "../src/features/video-ai/VideoJobs";
import * as ai from "../src/services/aiService";
import { createPost } from "../src/services/postsService";

vi.mock("../src/services/aiService", () => ({
  deleteImage: vi.fn(),
  deleteScript: vi.fn(),
  deleteVideo: vi.fn(),
  getImageHistory: vi.fn(),
  getScriptHistory: vi.fn(),
  getVideoHistory: vi.fn(),
  getVideoJob: vi.fn(),
  // El generador de guiones monta la sección de proyectos guardados (bloque
  // 2.3): sin estos dobles la sección falla y su alerta tapa la del historial.
  listScriptProjects: vi.fn(),
  getScriptProject: vi.fn(),
  updateScriptProject: vi.fn(),
  deleteScriptProject: vi.fn(),
  exportScriptProject: vi.fn(),
}));

vi.mock("../src/services/postsService", () => ({
  createPost: vi.fn(),
}));

beforeEach(() => {
  vi.resetAllMocks();
  ai.getImageHistory.mockResolvedValue({ generations: [] });
  ai.getVideoHistory.mockResolvedValue({ generations: [] });
  ai.getScriptHistory.mockResolvedValue({ scripts: [] });
  ai.listScriptProjects.mockResolvedValue([]);
  ai.getVideoJob.mockResolvedValue({ generation: {} });
  createPost.mockResolvedValue({});
});

afterEach(() => cleanup());

function withProviders(ui) {
  return render(
    <QueryClientProvider client={createTestQueryClient()}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>
  );
}

test("historial combinado conserva resultados y ofrece reintento ante una falla parcial", async () => {
  ai.getImageHistory.mockResolvedValue({
    generations: [{ _id: "image-1", imageUrl: "https://cdn.example/image.webp", prompt: "Nebulosa" }]
  });
  ai.getVideoHistory.mockRejectedValueOnce(new Error("video offline"));

  withProviders(<KairosHistory />);

  expect(await screen.findByText("Imagen")).toBeTruthy();
  expect((await screen.findByRole("alert")).textContent).toContain("No se pudo cargar una parte del historial");
  expect(screen.queryByText("No hay generaciones todavía")).toBeNull();
  expect(screen.getByRole("button", { name: "Reintentar" })).toBeTruthy();
});

test("biblioteca multimedia conserva imágenes si falla el historial de videos", async () => {
  ai.getImageHistory.mockResolvedValue({
    generations: [{ _id: "image-1", imageUrl: "https://cdn.example/image.webp", prompt: "Nebulosa" }]
  });
  ai.getVideoHistory.mockRejectedValueOnce(new Error("video offline"));

  withProviders(<MediaLibrary />);

  expect(await screen.findByAltText("Nebulosa")).toBeTruthy();
  expect((await screen.findByRole("alert")).textContent).toContain("No se pudo cargar una parte de la biblioteca");
  expect(screen.queryByText("Todavía no tienes archivos multimedia.")).toBeNull();
});

/**
 * Agrupación por generación (bloque 2.2).
 *
 * Una generación de tres variaciones es **una** pieza de la biblioteca con
 * tres miniaturas seleccionables, no tres filas con el mismo prompt. Y se
 * borra entera: borrar una variación suelta dejaría la generación a medias.
 */
test("una generación con variaciones es una sola pieza con sus miniaturas", async () => {
  ai.getImageHistory.mockResolvedValue({
    generations: [
      {
        _id: "image-1",
        prompt: "Nebulosa",
        imageUrl: "https://cdn.example/1.webp",
        variants: ["https://cdn.example/1.webp", "https://cdn.example/2.webp", "https://cdn.example/3.webp"]
      }
    ]
  });

  withProviders(<MediaLibrary />);

  await screen.findByText("Nebulosa");
  expect(screen.getAllByText("Nebulosa")).toHaveLength(1);
  expect(screen.getByText(/3 variaciones en una pieza/)).toBeTruthy();

  // Las tres miniaturas, con la primera activa.
  const miniaturas = screen.getAllByRole("button", { name: /Variación \d de 3/ });
  expect(miniaturas).toHaveLength(3);
  expect(miniaturas[0].getAttribute("aria-pressed")).toBe("true");

  // Elegir otra cambia la imagen grande y el enlace de descarga.
  fireEvent.click(miniaturas[2]);
  await waitFor(() =>
    expect(screen.getByAltText("Nebulosa").getAttribute("src")).toContain("3.webp")
  );
  expect(screen.getByRole("link", { name: "Descargar" }).getAttribute("href")).toContain("3.webp");
});

test("una generación sin variaciones no pinta miniaturas", async () => {
  ai.getImageHistory.mockResolvedValue({
    generations: [{ _id: "image-1", prompt: "Nebulosa", imageUrl: "https://cdn.example/1.webp" }]
  });
  ai.getVideoHistory.mockResolvedValue({ generations: [] });

  withProviders(<MediaLibrary />);
  await screen.findByText("Nebulosa");

  expect(screen.queryAllByRole("button", { name: /Variación \d de/ })).toHaveLength(0);
});

test("reintentar historial vuelve a incorporar la fuente que se recuperó", async () => {
  ai.getImageHistory.mockResolvedValue({
    generations: [{ _id: "image-1", imageUrl: "https://cdn.example/image.webp", prompt: "Nebulosa" }]
  });
  ai.getVideoHistory
    .mockRejectedValueOnce(new Error("video offline"))
    .mockResolvedValueOnce({
      generations: [{ _id: "video-1", videoUrl: "https://cdn.example/video.mp4", prompt: "Órbita" }]
    });

  withProviders(<KairosHistory />);
  await screen.findByRole("alert");
  fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));

  expect(await screen.findByText("Video")).toBeTruthy();
  await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
});

test("acciones del historial publican y eliminan mediante los servicios reales", async () => {
  ai.getImageHistory.mockResolvedValue({
    generations: [{ _id: "image-1", imageUrl: "https://cdn.example/image.webp", prompt: "Nebulosa" }]
  });
  window.confirm = vi.fn(() => true);

  withProviders(<KairosHistory />);
  await screen.findByText("Imagen");

  fireEvent.click(screen.getByRole("button", { name: "Publicar" }));
  await waitFor(() => expect(createPost).toHaveBeenCalledWith(
    "Imagen generado con Kairos: Nebulosa",
    {
      media: { url: "https://cdn.example/image.webp", type: "image", alt: "Nebulosa" },
      lineage: { tool: "kairos-image", aiGenerated: true }
    }
  ));

  fireEvent.click(screen.getByRole("button", { name: "Eliminar" }));
  await waitFor(() => expect(ai.deleteImage).toHaveBeenCalledWith("image-1"));
});

test("trabajos de video ofrecen reintento cuando el historial falla", async () => {
  ai.getVideoHistory.mockRejectedValueOnce(new Error("jobs offline"));

  withProviders(<VideoJobs />);

  expect((await screen.findByRole("alert")).textContent).toContain("No se pudieron cargar los trabajos de video");
  expect(screen.queryByText("Todavía no tienes trabajos de video.")).toBeNull();
  expect(screen.getByRole("button", { name: "Reintentar" })).toBeTruthy();
});

test("historial de scripts muestra error y permite recuperarlo", async () => {
  ai.getScriptHistory
    .mockRejectedValueOnce(new Error("scripts offline"))
    .mockResolvedValueOnce({ scripts: [] });

  withProviders(<ScriptGenerator />);

  expect((await screen.findByRole("alert")).textContent).toContain("No se pudo cargar el historial de scripts");
  fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));

  expect(await screen.findByText("Todavía no tienes scripts generados.")).toBeTruthy();
  await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
});
