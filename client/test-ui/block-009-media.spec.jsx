import React from "react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { fireEvent, render, screen, waitFor, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClientProvider } from "@tanstack/react-query";
import { createTestQueryClient } from "../src/app/queryClient";
import ImageEditor from "../src/components/media/ImageEditor";
import PostMedia from "../src/features/social/components/PostMedia";
import VideoGenerator from "../src/features/video-ai/VideoGenerator";
import * as ai from "../src/services/aiService";

vi.mock("../src/services/aiService", () => ({
  generateVideo: vi.fn(),
  getVideoHistory: vi.fn(),
  getVideoJob: vi.fn(),
}));

const originalCreateObjectURL = URL.createObjectURL;
const originalRevokeObjectURL = URL.revokeObjectURL;

beforeEach(() => {
  vi.resetAllMocks();
  ai.getVideoHistory.mockResolvedValue({ generations: [] });
  ai.getVideoJob.mockResolvedValue({ generation: {} });
  ai.generateVideo.mockResolvedValue({
    generation: { _id: "job-1", status: "queued", progress: 0 },
    message: "En cola"
  });
  Object.defineProperty(URL, "createObjectURL", { configurable: true, value: vi.fn(() => "blob:editor-source") });
  Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: vi.fn() });
});

afterEach(() => {
  cleanup();
  Object.defineProperty(URL, "createObjectURL", { configurable: true, value: originalCreateObjectURL });
  Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: originalRevokeObjectURL });
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function withProviders(ui) {
  return render(
    <QueryClientProvider client={createTestQueryClient()}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>
  );
}

test("editor de imagen aplica filtro, marco y overlays al archivo exportado", async () => {
  const sourceFile = new File(["source"], "poster.png", { type: "image/png" });
  const context = {
    fillRect: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    translate: vi.fn(),
    rotate: vi.fn(),
    scale: vi.fn(),
    drawImage: vi.fn(),
    fillText: vi.fn(),
    measureText: vi.fn(() => ({ width: 120 })),
    imageSmoothingEnabled: false,
    imageSmoothingQuality: ""
  };
  const filters = [];
  Object.defineProperty(context, "filter", {
    configurable: true,
    get: () => filters.at(-1) || "none",
    set: (value) => filters.push(value)
  });
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(context);
  vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation((callback) => {
    callback(new Blob(["edited"], { type: "image/jpeg" }));
  });
  vi.stubGlobal("Image", class MockImage {
    naturalWidth = 1200;
    naturalHeight = 800;
    set src(value) {
      this.currentSrc = value;
      this.onload?.();
    }
  });

  const onApply = vi.fn();
  render(<ImageEditor file={sourceFile} onApply={onApply} onCancel={vi.fn()} />);

  fireEvent.change(await screen.findByLabelText("Filtro"), { target: { value: "sepia" } });
  fireEvent.change(screen.getByLabelText("Marco"), { target: { value: "aqua" } });
  fireEvent.change(screen.getByLabelText("Sticker"), { target: { value: "heart" } });
  fireEvent.change(screen.getByLabelText("Texto superpuesto"), { target: { value: "Kronos" } });
  fireEvent.click(screen.getByLabelText("Añadir fecha"));
  fireEvent.click(screen.getByRole("button", { name: "Aplicar imagen" }));

  await waitFor(() => expect(onApply).toHaveBeenCalledWith(
    expect.any(File),
    expect.objectContaining({ focalPoint: { x: expect.any(Number), y: expect.any(Number) } })
  ));
  expect(filters).toContain("sepia(.85)");
  expect(context.drawImage).toHaveBeenCalled();
  expect(context.fillText).toHaveBeenCalled();
});

test("las publicaciones de video reproducen la portada multimedia persistida", () => {
  withProviders(
    <PostMedia
      media={{
        url: "/uploads/media/video.mp4",
        type: "video",
        posterUrl: "/uploads/media/video-poster.jpg",
        alt: "Video de prueba"
      }}
    />
  );

  const video = screen.getByLabelText("Video de prueba");
  expect(video.tagName).toBe("VIDEO");
  expect(video.getAttribute("poster")).toContain("video-poster.jpg");
});

test("generador de video envía los controles avanzados soportados por el backend", async () => {
  withProviders(<VideoGenerator />);

  fireEvent.change(screen.getByLabelText("Prompt"), { target: { value: "Una órbita sobre Jalisco" } });
  fireEvent.change(screen.getByLabelText("Negative prompt"), { target: { value: "texto ilegible" } });
  fireEvent.change(screen.getByLabelText("Estilo visual"), { target: { value: "documental" } });
  fireEvent.click(screen.getByRole("button", { name: "Generar video" }));

  await waitFor(() => expect(ai.generateVideo).toHaveBeenCalledWith({
    prompt: "Una órbita sobre Jalisco",
    negativePrompt: "texto ilegible",
    style: "documental"
  }));
});
