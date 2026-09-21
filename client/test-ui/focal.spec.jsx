import React from "react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { fireEvent, render, screen, waitFor, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClientProvider } from "@tanstack/react-query";
import { createTestQueryClient } from "../src/app/queryClient";
import ImageEditor from "../src/components/media/ImageEditor";
import PostMedia from "../src/features/social/components/PostMedia";

const originalCreateObjectURL = URL.createObjectURL;
const originalRevokeObjectURL = URL.revokeObjectURL;

beforeEach(() => {
  vi.resetAllMocks();
  Object.defineProperty(URL, "createObjectURL", { configurable: true, value: vi.fn(() => "blob:editor-source") });
  Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: vi.fn() });
});

afterEach(() => {
  cleanup();
  Object.defineProperty(URL, "createObjectURL", { configurable: true, value: originalCreateObjectURL });
  Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: originalRevokeObjectURL });
  vi.restoreAllMocks();
});

function withProviders(ui) {
  return render(
    <QueryClientProvider client={createTestQueryClient()}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>
  );
}

function mockCanvas() {
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
}

test("el clic sobre la imagen fija el punto focal y viaja con la edición", async () => {
  mockCanvas();
  const onApply = vi.fn();
  const sourceFile = new File(["source"], "foto.png", { type: "image/png" });

  const { container } = render(
    <ImageEditor file={sourceFile} onApply={onApply} onCancel={vi.fn()} />
  );

  const stage = await screen.findByLabelText(/Elegir punto focal/);
  stage.getBoundingClientRect = () => ({ left: 0, top: 0, width: 200, height: 100 });

  // Centro-superior: x=50%, y=25%.
  fireEvent.click(stage, { clientX: 100, clientY: 25 });

  const marker = container.querySelector(".k-image-editor-focal-marker");
  expect(marker).toBeTruthy();
  expect(marker.style.left).toBe("50%");
  expect(marker.style.top).toBe("25%");

  fireEvent.click(screen.getByRole("button", { name: "Aplicar imagen" }));

  await waitFor(() => expect(onApply).toHaveBeenCalled());
  const meta = onApply.mock.calls[0][1];
  expect(meta.focalPoint).toEqual({ x: 0.5, y: 0.25 });
});

test("sin clic el punto focal por defecto es el centro", async () => {
  mockCanvas();
  const onApply = vi.fn();
  const sourceFile = new File(["source"], "foto.png", { type: "image/png" });

  render(
    <ImageEditor file={sourceFile} onApply={onApply} onCancel={vi.fn()} />
  );

  fireEvent.click(await screen.findByRole("button", { name: "Aplicar imagen" }));

  await waitFor(() => expect(onApply).toHaveBeenCalled());
  expect(onApply.mock.calls[0][1].focalPoint).toEqual({ x: 0.5, y: 0.5 });
});

test("el punto focal persistente guía el recorte visual en el feed", () => {
  withProviders(
    <PostMedia
      media={{
        url: "/uploads/media/retrato.jpg",
        type: "image",
        alt: "Retrato",
        focalPoint: { x: 0.3, y: 0.8 }
      }}
    />
  );

  const image = screen.getByAltText("Retrato");
  expect(image.style.objectPosition).toBe("30% 80%");
});

test("sin punto focal la imagen no recibe objectPosition", () => {
  withProviders(
    <PostMedia
      media={{
        url: "/uploads/media/paisaje.jpg",
        type: "image",
        alt: "Paisaje"
      }}
    />
  );

  const image = screen.getByAltText("Paisaje");
  expect(image.style.objectPosition).toBe("");
});
