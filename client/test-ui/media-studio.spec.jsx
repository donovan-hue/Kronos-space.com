import React from "react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import MediaStudio from "../src/components/media/MediaStudio";
import {
  cajaRecorte,
  cssAjustes,
  cssCombinado,
  formatearTiempo,
  normalizarAjustes,
  recetaVideo,
  recortarMusica,
  validarReceta
} from "../src/lib/mediaStudio";
import { FILTROS } from "../src/lib/mediaStudio";

const musicaReal = await vi.importActual("../src/services/musicService");

vi.mock("../src/services/musicService", () => ({
  obtenerCatalogoMusica: vi.fn(async () => ({
    pistas: [
      { _id: "m1", titulo: "Ritmo de barrio", autor: "Estudio Kronos", duracion: 95, etiquetas: ["urbano"], tipo: "catalogo" },
      { _id: "m2", titulo: "Mañana quieta", autor: "Estudio Kronos", duracion: 120, etiquetas: ["tranquilo"], tipo: "catalogo" }
    ],
    motivo: ""
  })),
  filtrarCatalogo: (pistas, consulta) => {
    const texto = String(consulta || "").trim().toLowerCase();
    if (!texto) return pistas;
    return pistas.filter((pista) => [pista.titulo, pista.autor, ...(pista.etiquetas || [])].join(" ").toLowerCase().includes(texto));
  },
  MOTIVO_SIN_CATALOGO: "El servidor todavía no publica un catálogo de música."
}));

function contextoFalso() {
  return {
    filter: "none",
    font: "",
    textAlign: "",
    textBaseline: "",
    fillStyle: "",
    drawImage: vi.fn(),
    fillRect: vi.fn(),
    fillText: vi.fn(),
    measureText: (texto) => ({ width: String(texto).length * 9 }),
    createRadialGradient: () => ({ addColorStop: vi.fn() })
  };
}

beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(() => contextoFalso());
  vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation((callback) => callback(new Blob(["foto"], { type: "image/jpeg" })));
  if (typeof HTMLImageElement.prototype.decode !== "function") {
    Object.defineProperty(HTMLImageElement.prototype, "decode", { configurable: true, value: () => Promise.resolve() });
  }
  Object.defineProperty(HTMLImageElement.prototype, "naturalWidth", { configurable: true, get: () => 1200 });
  Object.defineProperty(HTMLImageElement.prototype, "naturalHeight", { configurable: true, get: () => 1600 });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("motor del estudio", () => {
  test("los ajustes neutros no generan filtro", () => {
    expect(cssAjustes({})).toBe("none");
    expect(cssCombinado("original", {})).toBe("none");
  });

  test("filtro y ajustes se combinan y respetan los límites", () => {
    const css = cssCombinado("vivo", { brillo: 9, saturacion: 3 });
    expect(css).toContain("saturate(1.35)");
    expect(css).toContain("brightness(1.500)");
    expect(normalizarAjustes({ brillo: 9 }).brillo).toBe(1.5);
    expect(normalizarAjustes({ desenfoque: -4 }).desenfoque).toBe(0);
  });

  test("la calidez usa sepia hacia los dos lados", () => {
    expect(cssAjustes({ calidez: 0.2 })).toContain("sepia(0.200)");
    expect(cssAjustes({ calidez: -0.2 })).toContain("hue-rotate(8deg)");
  });

  test("a media intensidad el filtro se acerca al original", () => {
    const css = cssCombinado("vivo", {}, 0.5);
    expect(css).toContain("saturate(1.175)");
    expect(css).toContain("contrast(1.030)");
  });

  test("el recorte centra la caja según la medida", () => {
    expect(cajaRecorte(1200, 800, "1:1")).toEqual({ x: 200, y: 0, ancho: 800, alto: 800 });
    expect(cajaRecorte(1000, 2000, "9:16")).toEqual({ x: 0, y: 111, ancho: 1000, alto: 1778 });
    expect(cajaRecorte(1200, 800, "original")).toEqual({ x: 0, y: 0, ancho: 1200, alto: 800 });
  });

  test("la música se recorta dentro de la pista y con fundidos sensatos", () => {
    const corte = recortarMusica({ inicio: 10, fin: 40, volumen: 2, fundidoEntrada: 30, fundidoSalida: 4, duracion: 95 });
    expect(corte.duracion).toBe(30);
    expect(corte.volumen).toBe(1);
    expect(corte.fundidoEntrada).toBe(15);
    expect(corte.fundidoSalida).toBe(4);
    expect(formatearTiempo(95)).toBe("1:35");
  });

  test("la receta del video queda validada", () => {
    const receta = recetaVideo({ duracion: 60, corte: { inicio: 5, fin: 25, silenciar: true }, filtroId: "negro", ajustes: { contraste: 1.2 } });
    expect(receta.corte).toEqual({ inicio: 5, fin: 25, silenciar: true });
    expect(receta.filtro.css).toContain("grayscale(1)");
    expect(validarReceta(receta)).toEqual([]);
    expect(validarReceta(recetaVideo({ duracion: 10, corte: { inicio: 8, fin: 8 } })).length).toBe(1);
  });

  test("el catálogo se filtra por título, autor o etiqueta", () => {
    const pistas = [{ titulo: "Ritmo de barrio", autor: "Kronos", etiquetas: ["urbano"] }];
    expect(musicaReal.filtrarCatalogo(pistas, "urbano").length).toBe(1);
    expect(musicaReal.filtrarCatalogo(pistas, "kronos").length).toBe(1);
    expect(musicaReal.filtrarCatalogo(pistas, "zzz").length).toBe(0);
  });
});

describe("estudio de la foto", () => {
  const props = { open: true, kind: "image", previewUrl: "/uploads/foto.jpg", onApply: vi.fn(), onCancel: vi.fn() };

  test("abre con las cinco secciones y la vista previa", () => {
    render(<MediaStudio {...props} />);
    expect(screen.getByRole("dialog", { name: "Estudio de medios" })).toBeTruthy();
    ["Filtros", "Ajustes", "Texto", "Música", "Salida"].forEach((nombre) => {
      expect(screen.getByRole("tab", { name: nombre })).toBeTruthy();
    });
    expect(screen.getByAltText("Vista previa de la foto")).toBeTruthy();
  });

  test("ofrece el catálogo de filtros y aplica el elegido", () => {
    render(<MediaStudio {...props} />);
    const vivos = screen.getAllByRole("listitem").filter((nodo) => nodo.className.includes("k-studio-filtro"));
    expect(vivos.length).toBe(FILTROS.length);
    fireEvent.click(screen.getByRole("listitem", { name: /Noir/ }));
    expect(screen.getByRole("listitem", { name: /Noir/ }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByAltText("Vista previa de la foto").style.filter).toContain("grayscale(1)");
  });

  test("el texto se ve encima de la foto sin tapar los mandos", () => {
    const { container } = render(<MediaStudio {...props} />);
    fireEvent.click(screen.getByRole("tab", { name: "Texto" }));
    fireEvent.change(screen.getByPlaceholderText("Escribe algo corto"), { target: { value: "Buen día" } });
    const rotulo = container.querySelector(".k-studio-texto");
    expect(rotulo.textContent).toBe("Buen día");
    expect(rotulo.className).toContain("es-abajo");
    fireEvent.click(screen.getByRole("button", { name: "Centro" }));
    expect(container.querySelector(".k-studio-texto").className).toContain("es-centro");
    expect(container.querySelector("img").style.filter).toBeDefined();
  });

  test("la música se elige del catálogo y se ajusta", async () => {
    render(<MediaStudio {...props} />);
    fireEvent.click(screen.getByRole("tab", { name: "Música" }));
    const pista = await screen.findByRole("listitem", { name: /Ritmo de barrio/ });
    fireEvent.click(pista);
    expect(pista.getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByText(/Entra en/)).toBeTruthy();
    expect(screen.getByText(/Volumen/)).toBeTruthy();
  });

  test("al aplicar devuelve la foto ya editada", async () => {
    const onApply = vi.fn();
    render(<MediaStudio {...props} onApply={onApply} />);
    fireEvent.click(screen.getByRole("tab", { name: "Filtros" }));
    fireEvent.click(screen.getByRole("listitem", { name: /Vivo/ }));
    fireEvent.click(screen.getByRole("button", { name: "Aplicar a la foto" }));
    await waitFor(() => expect(onApply).toHaveBeenCalledTimes(1));
    const resultado = onApply.mock.calls[0][0];
    expect(resultado.tipo).toBe("imagen");
    expect(resultado.archivo instanceof File).toBe(true);
    expect(resultado.receta.filtro.id).toBe("vivo");
  });

  test("Escape y Cancelar cierran el estudio", () => {
    const onCancel = vi.fn();
    render(<MediaStudio {...props} onCancel={onCancel} />);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onCancel).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(onCancel).toHaveBeenCalledTimes(2);
  });
});

describe("estudio del video", () => {
  const props = { open: true, kind: "video", previewUrl: "/uploads/clip.mp4", duracionInicial: 60, onApply: vi.fn(), onCancel: vi.fn() };

  test("abre en Corte y ofrece las seis secciones", () => {
    render(<MediaStudio {...props} />);
    ["Corte", "Filtros", "Ajustes", "Música", "Texto", "Salida"].forEach((nombre) => {
      expect(screen.getByRole("tab", { name: nombre })).toBeTruthy();
    });
    expect(screen.getByText(/Silenciar el audio original/)).toBeTruthy();
    expect(screen.getByRole("button", { name: /portada/ })).toBeTruthy();
  });

  test("el corte respeta el orden y el silencio", () => {
    render(<MediaStudio {...props} />);
    const fin = screen.getByText(/^Fin/).parentElement.querySelector("input");
    fireEvent.change(fin, { target: { value: "30" } });
    expect(screen.getByText(/Duración del corte: 0:30/)).toBeTruthy();
    fireEvent.click(screen.getByText(/Silenciar el audio original/).previousSibling);
    expect(screen.getByLabelText("Vista previa de video").muted).toBe(true);
  });

  test("al aplicar devuelve la receta de edición", async () => {
    const onApply = vi.fn();
    render(<MediaStudio {...props} onApply={onApply} />);
    fireEvent.click(screen.getByRole("tab", { name: "Filtros" }));
    fireEvent.click(screen.getByRole("listitem", { name: /Cálido/ }));
    fireEvent.click(screen.getByRole("button", { name: "Aplicar edición" }));
    await waitFor(() => expect(onApply).toHaveBeenCalledTimes(1));
    const resultado = onApply.mock.calls[0][0];
    expect(resultado.tipo).toBe("video");
    expect(resultado.receta.filtro.id).toBe("calido");
    expect(resultado.receta.medida).toBe("9:16");
    expect(resultado.receta.corte.silenciar).toBe(false);
  });
});
