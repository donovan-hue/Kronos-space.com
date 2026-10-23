import React from "react";
import { afterEach, expect, test } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import PostMedia from "../src/features/social/components/PostMedia";
import MediaViewer from "../src/components/media/MediaViewer";

const video = (texto, extra = {}) => ({
  type: "video", url: "/uploads/texto.mp4", edit: { ...extra, texto }
});

afterEach(cleanup);

test.each(["arriba", "centro", "abajo"])("Inicio y visor muestran el texto en %s con su estilo guardado", (posicion) => {
  const media = video({ contenido: "Mensaje del video", posicion, tamano: 1.5, color: "#ff8800", fondo: false });
  const { container } = render(<PostMedia media={media} />);
  const comprobar = (root) => {
    const texto = root.querySelector(".k-video-overlay-text");
    expect(texto.textContent).toBe("Mensaje del video");
    expect(texto.classList.contains(`es-${posicion}`)).toBe(true);
    expect(texto.style.fontSize).toBe("1.35rem");
    expect(texto.style.color).toBe("rgb(255, 136, 0)");
    expect(texto.style.background).toBe("transparent");
    expect(texto.closest('[aria-hidden="true"]')).toBeNull();
  };
  comprobar(container);
  fireEvent.click(screen.getByRole("button", { name: "Ver video en pantalla completa" }));
  comprobar(screen.getByRole("dialog"));
  fireEvent.keyDown(document, { key: "Escape" });
  expect(screen.queryByRole("dialog")).toBeNull();
});

test("normaliza el texto antiguo o inválido y no interpreta HTML", () => {
  const contenido = '<img src=x onerror="alert(1)">\nTexto literal';
  const { container } = render(<PostMedia media={video({ contenido, posicion: "otra", tamano: 99, color: "url(https://example.com/x)", fondo: true })} />);
  const texto = container.querySelector(".k-video-overlay-text");
  expect(texto.textContent).toBe(contenido);
  expect(texto.classList.contains("es-abajo")).toBe(true);
  expect(texto.style.fontSize).toBe("1.8rem");
  expect(texto.style.color).toBe("rgb(255, 255, 255)");
  expect(texto.style.background).toBe("rgba(0, 0, 0, 0.55)");
  expect(texto.querySelector("img")).toBeNull();
});

test("limita el contenido y el tamaño mínimo como el estudio", () => {
  const { container } = render(<PostMedia media={video({ contenido: "a".repeat(200), tamano: 0.1 })} />);
  const texto = container.querySelector(".k-video-overlay-text");
  expect(texto.textContent).toHaveLength(140);
  expect(Number.parseFloat(texto.style.fontSize)).toBeCloseTo(0.54);
});

test("cambiar de video elimina el texto anterior sin perder los efectos de tono", () => {
  const media = video({ contenido: "Texto anterior" }, { ajustes: { vineta: 0.5, grano: 0.4 } });
  const { container, rerender } = render(<MediaViewer open items={[media]} onClose={() => {}} />);
  expect(screen.getByText("Texto anterior")).toBeTruthy();
  expect(container.ownerDocument.querySelectorAll(".k-video-tone-overlays")).toHaveLength(1);
  rerender(<MediaViewer open items={[video(null, { ajustes: { vineta: 0.5, grano: 0.4 } })]} onClose={() => {}} />);
  expect(screen.queryByText("Texto anterior")).toBeNull();
  expect(screen.getByRole("dialog").querySelector(".k-video-tone-vineta")).toBeTruthy();
  expect(screen.getByRole("dialog").querySelector(".k-video-tone-overlays").getAttribute("aria-hidden")).toBe("true");
  rerender(<MediaViewer open items={[{ type: "image", url: "/uploads/foto.jpg", edit: media.edit }]} onClose={() => {}} />);
  expect(screen.getByRole("dialog").querySelector(".k-video-tone-overlays")).toBeNull();
});

test.each([null, {}, { contenido: "" }, { contenido: " \n  " }, { contenido: { html: "No es texto" } }])("no dibuja capas para texto ausente o vacío: %j", (texto) => {
  const { container } = render(<PostMedia media={video(texto)} />);
  expect(container.querySelector(".k-video-tone-overlays")).toBeNull();
});
