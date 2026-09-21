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
}));

vi.mock("../src/services/postsService", () => ({
  createPost: vi.fn(),
}));

beforeEach(() => {
  vi.resetAllMocks();
  ai.getImageHistory.mockResolvedValue({ generations: [] });
  ai.getVideoHistory.mockResolvedValue({ generations: [] });
  ai.getScriptHistory.mockResolvedValue({ scripts: [] });
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
    { media: { url: "https://cdn.example/image.webp", type: "image", alt: "Nebulosa" } }
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
