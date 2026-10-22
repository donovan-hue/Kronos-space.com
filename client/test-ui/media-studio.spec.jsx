import React from "react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import MediaStudio from "../src/components/media/MediaStudio";
import * as videoExport from "../src/lib/videoExport";
import * as voiceService from "../src/services/voiceService";
import {
  LIMITE_CLIPS,
  agregarClip,
  cajaRecorte,
  cssAjustes,
  cssCombinado,
  dividirClip,
  duracionDeClip,
  duracionTotalClips,
  formatearTiempo,
  moverClip,
  normalizarAjustes,
  normalizarClip,
  normalizarVoz,
  quitarClip,
  recortarVoz,
  recetaVideo,
  recortarMusica,
  topeTransicion,
  validarReceta
} from "../src/lib/mediaStudio";
import { FILTROS } from "../src/lib/mediaStudio";

const musicaReal = await vi.importActual("../src/services/musicService");

vi.mock("../src/services/voiceService", () => ({
  MOTIVO_SIN_VOCES: "No se pudo leer el catálogo de voces del servidor. Vuelve a intentarlo en un momento.",
  MOTIVO_SIN_GRABACION: "Graba tu voz en off desde el estudio para usarla en la pieza.",
  obtenerVoces: vi.fn(async () => ({
    voces: [
      { _id: "v1", nombre: "Ana del estudio", idioma: "es-MX", genero: "femenina", tipo: "catalogo", url: "", duracion: 0, disponible: true, motivo: "" },
      { _id: "v2", nombre: "Voz sin modelo", idioma: "es-MX", genero: "neutra", tipo: "catalogo", url: "", duracion: 0, disponible: false, motivo: "Esta voz todavía no tiene modelo asignado." }
    ],
    servicio: { listo: true, variable: "OPENROUTER_API_KEY", modelo: "x-ai/grok-voice-tts-1.0", voz: "eve", limites: { texto: 1200 } },
    motivo: ""
  })),
  filtrarVoces: (voces, consulta) => {
    const texto = String(consulta || "").trim().toLowerCase();
    if (!texto) return voces;
    return voces.filter((voz) => [voz.nombre, voz.idioma, voz.genero].join(" ").toLowerCase().includes(texto));
  },
  subirVoz: vi.fn(async () => ({ url: "/uploads/voices/grabada.webm", size: 1200, mimeType: "audio/webm" })),
  generarLocucion: vi.fn(async () => ({ url: "/uploads/voices/locucion.mp3", mimeType: "audio/mpeg", size: 4000, modelo: "x-ai/grok-voice-tts-1.0", voz: "eve" }))
}));

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
  MOTIVO_SIN_CATALOGO: "No se pudo leer el catálogo de música del servidor."
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

  test("la línea de tiempo suma video e imágenes con duración elegida y respeta el tope", () => {
    const clips = [
      { tipo: "video", duracion: 5, inicio: 0, fin: 5 },
      { tipo: "image", duracion: 0, inicio: 0, fin: 0 },
      { tipo: "video", duracion: 8, inicio: 1, fin: 8 }
    ];
    expect(duracionTotalClips(clips)).toBe(12);
    expect(duracionDeClip({ tipo: "image", duracion: 2.5, velocidad: 4 })).toBe(2.5);

    const llena = Array.from({ length: LIMITE_CLIPS }, () => clips[0]);
    const pasado = agregarClip(llena, clips[0]);
    expect(pasado.clips.length).toBe(LIMITE_CLIPS);
    expect(pasado.error).toContain(String(LIMITE_CLIPS));

    const agregado = agregarClip([clips[0]], clips[1]);
    expect(agregado.error).toBe("");
    expect(agregado.clips.length).toBe(2);
  });

  test("la línea de tiempo mueve y quita sin perder tomas", () => {
    const clips = [
      { id: "a", tipo: "video", duracion: 5, inicio: 0, fin: 5 },
      { id: "b", tipo: "video", duracion: 8, inicio: 0, fin: 8 }
    ];
    expect(moverClip(clips, 0, 1).map((clip) => clip.id)).toEqual(["b", "a"]);
    // Sacar una toma del principio de la lista no la pierde: se queda igual.
    expect(moverClip(clips, 0, -1).map((clip) => clip.id)).toEqual(["a", "b"]);
    expect(quitarClip(clips, 0).map((clip) => clip.id)).toEqual(["b"]);
    expect(normalizarClip({ duracion: 10, inicio: 4, fin: 99 }).fin).toBe(10);
  });

  test("la velocidad alarga o acorta el tramo, y el total la respeta", () => {
    const toma = { tipo: "video", duracion: 10, inicio: 0, fin: 10 };
    expect(duracionDeClip(toma)).toBe(10);
    // Cámara lenta: el mismo tramo dura más.
    expect(duracionDeClip({ ...toma, velocidad: 0.5 })).toBe(20);
    expect(duracionDeClip({ ...toma, velocidad: 0.25 })).toBe(40);
    expect(duracionDeClip({ ...toma, velocidad: 2 })).toBe(5);
    expect(duracionTotalClips([{ ...toma, velocidad: 0.5 }, { tipo: "video", duracion: 8, inicio: 3, fin: 8 }])).toBe(25);
    // Una velocidad de otro mundo se acota, no se acepta tal cual.
    expect(normalizarClip({ ...toma, velocidad: 9 }).velocidad).toBe(4);
    expect(normalizarClip({ ...toma, velocidad: 0.1 }).velocidad).toBe(0.25);
  });

  test("partir una toma deja dos mitades del mismo archivo", () => {
    const clips = [
      { id: "principal", fuente: "principal", file: null, tipo: "video", duracion: 10, inicio: 0, fin: 8, velocidad: 2 },
      { id: "b", fuente: "b", tipo: "video", duracion: 6, inicio: 0, fin: 6 }
    ];
    const resultado = dividirClip(clips, 0, 5);
    expect(resultado.error).toBe("");
    expect(resultado.clips.length).toBe(3);
    expect([resultado.clips[0].inicio, resultado.clips[0].fin]).toEqual([0, 5]);
    expect([resultado.clips[1].inicio, resultado.clips[1].fin]).toEqual([5, 8]);
    // Las dos mitades salen del mismo archivo y conservan la velocidad.
    expect(resultado.clips[0].fuente).toBe("principal");
    expect(resultado.clips[1].fuente).toBe("principal");
    expect(resultado.clips[1].velocidad).toBe(2);
    // El empalme entre las dos mitades es un corte seco.
    expect(resultado.clips[1].transicion).toEqual({ tipo: "corte", duracion: 0 });
    // El total no cambia por partir la toma: 4 segundos de la primera a 2x.
    expect(duracionTotalClips(resultado.clips)).toBe(4 + 6);

    expect(dividirClip([{ id: "x", tipo: "image" }], 0, 3).error).toMatch(/video/);
    expect(dividirClip([], 0, 3).error).toMatch(/dividir/);
  });

  test("la transición no puede comerse las tomas que une", () => {
    const clips = [
      { tipo: "video", duracion: 4, inicio: 0, fin: 4 },
      { tipo: "video", duracion: 20, inicio: 0, fin: 20, transicion: { tipo: "fundido", duracion: 9 } }
    ];
    expect(topeTransicion(4, 20)).toBe(2);
    const receta = recetaVideo({ duracion: 20, corte: { inicio: 0, fin: 20 }, clips });
    // El motor acota la transición al tope en vez de rechazar la receta.
    expect(receta.clips[1].transicion.duracion).toBe(2);
    expect(validarReceta(receta)).toEqual([]);
    // Una transición inventada no entra: se queda en corte seco.
    expect(recetaVideo({ duracion: 20, corte: { inicio: 0, fin: 20 }, clips: [{ ...clips[0] }, { ...clips[1], transicion: { tipo: "giro", duracion: 1 } }] }).clips[1].transicion.tipo).toBe("corte");
  });

  test("la voz en off se recorta con topes sensatos", () => {
    const toma = recortarVoz({ url: "/uploads/voices/a.m4a", inicio: 2, fin: 12, volumen: 2, fundidoEntrada: 30, fundidoSalida: 1 });
    expect(toma.duracion).toBe(10);
    expect(toma.volumen).toBe(1);
    // El fundido no puede pasar de la mitad de la toma.
    expect(toma.fundidoEntrada).toBe(5);
    expect(toma.fundidoSalida).toBe(1);
    // Sin toma no hay voz que guardar.
    expect(normalizarVoz({})).toBe(null);
    expect(normalizarVoz({ url: "/uploads/voices/a.m4a" }).url).toBe("/uploads/voices/a.m4a");
    expect(normalizarVoz({ voiceId: "v1" }).voiceId).toBe("v1");
  });

  test("una toma con velocidad propia conserva su receta y duración montada", () => {
    const receta = recetaVideo({ duracion: 10, clips: [{ tipo: "video", duracion: 10, inicio: 2, fin: 8, velocidad: 0.5 }] });
    expect(receta.clips).toHaveLength(1);
    expect(receta.clips[0].velocidad).toBe(0.5);
    expect(receta.duracionTotal).toBe(12);
  });

  test("la receta no arma línea de tiempo con una sola toma", () => {
    const unaSola = recetaVideo({ duracion: 30, corte: { inicio: 0, fin: 30 }, clips: [{ tipo: "video", duracion: 30, inicio: 0, fin: 30 }] });
    expect("clips" in unaSola).toBe(false);
    expect("duracionTotal" in unaSola).toBe(false);

    const dosTomas = recetaVideo({
      duracion: 30,
      corte: { inicio: 0, fin: 30 },
      clips: [
        { tipo: "video", duracion: 5, inicio: 0, fin: 5 },
        { tipo: "video", duracion: 10, inicio: 2, fin: 10 }
      ]
    });
    expect(dosTomas.clips.length).toBe(2);
    expect(dosTomas.duracionTotal).toBe(13);
    expect(validarReceta(dosTomas)).toEqual([]);
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
    const { baseElement } = render(<MediaStudio {...props} />);
    fireEvent.click(screen.getByRole("tab", { name: "Texto" }));
    fireEvent.change(screen.getByPlaceholderText("Escribe algo corto"), { target: { value: "Buen día" } });
    const rotulo = baseElement.querySelector(".k-studio-texto");
    expect(rotulo.textContent).toBe("Buen día");
    expect(rotulo.className).toContain("es-abajo");
    fireEvent.click(screen.getByRole("button", { name: "Centro" }));
    expect(baseElement.querySelector(".k-studio-texto").className).toContain("es-centro");
    expect(baseElement.querySelector("img").style.filter).toBeDefined();
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

  test("abre en Corte y ofrece las ocho secciones", () => {
    render(<MediaStudio {...props} />);
    ["Clips", "Corte", "Filtros", "Ajustes", "Música", "Voz", "Texto", "Salida"].forEach((nombre) => {
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

  test("la línea de tiempo ordena, agrega y quita clips", async () => {
    const originalCreateObjectURL = URL.createObjectURL;
    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: vi.fn(() => "blob:clip-nuevo") });
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: vi.fn() });
    try {
      render(<MediaStudio {...props} />);
      fireEvent.click(screen.getByRole("tab", { name: "Clips" }));

      // El video que se abrió ya es el clip 1.
      expect(screen.getByText(/1 de 12/)).toBeTruthy();
      expect(screen.getByText(/Duración total: 1:00/)).toBeTruthy();
      expect(screen.getByText((_texto, nodo) => nodo?.className === "k-studio-clip-titulo" && nodo.textContent === "Clip 1")).toBeTruthy();

      // Una foto entra como clip nuevo: no aporta duración, pero ocupa lugar.
      const entrada = screen.getByLabelText("Agregar un clip a la línea de tiempo");
      fireEvent.change(entrada, { target: { files: [new File(["x"], "foto.png", { type: "image/png" })] } });
      await waitFor(() => expect(screen.getByText(/2 de 12/)).toBeTruthy());
      expect(screen.getByText(/Duración total: 1:00/)).toBeTruthy();

      // El clip 2 sube a la posición 1 y luego se quita.
      fireEvent.click(screen.getByLabelText("Subir el clip 2"));
      const ordenes = [...document.querySelectorAll(".k-studio-clip-titulo")].map((nodo) => nodo.textContent);
      expect(ordenes[0]).toBe("foto.png");
      fireEvent.click(screen.getByLabelText("Quitar el clip 2"));
      await waitFor(() => expect(screen.getByText(/1 de 12/)).toBeTruthy());
      expect(document.querySelectorAll(".k-studio-clip").length).toBe(1);
    } finally {
      Object.defineProperty(URL, "createObjectURL", { configurable: true, value: originalCreateObjectURL });
    }
  });

  test("aplicar la velocidad de una sola toma mantiene el corte de la pestaña Corte", async () => {
    const onApply = vi.fn();
    render(<MediaStudio {...props} onApply={onApply} />);
    fireEvent.change(screen.getByLabelText(/Inicio ·/), { target: { value: "4" } });
    fireEvent.change(screen.getByLabelText(/Fin ·/), { target: { value: "20" } });
    fireEvent.click(screen.getByRole("tab", { name: "Clips" }));
    fireEvent.click(screen.getByRole("listitem", { name: "Velocidad 2x" }));
    fireEvent.click(screen.getByRole("button", { name: "Aplicar edición" }));
    await waitFor(() => expect(onApply).toHaveBeenCalledOnce());
    const resultado = onApply.mock.calls[0][0];
    expect(resultado.receta.clips[0]).toMatchObject({ inicio: 4, fin: 20, velocidad: 2 });
    expect(resultado.linea[0]).toMatchObject({ ref: "principal", inicio: 4, fin: 20, velocidad: 2 });
    expect(resultado.receta.duracionTotal).toBe(8);
  });

  test("la velocidad y la transición se eligen desde la pantalla", async () => {
    const originalCreateObjectURL = URL.createObjectURL;
    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: vi.fn(() => "blob:clip-nuevo") });
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: vi.fn() });
    try {
      const onApply = vi.fn();
      render(<MediaStudio {...props} onApply={onApply} />);
      fireEvent.click(screen.getByRole("tab", { name: "Clips" }));

      // Media velocidad: el tramo de 60 segundos pasa a durar 2 minutos.
      fireEvent.click(screen.getByRole("listitem", { name: "Velocidad 0.5x" }));
      expect(screen.getByText(/Duración total: 2:00/)).toBeTruthy();

      // Partir la toma en dos deja dos piezas y no cambia el total.
      fireEvent.click(screen.getByRole("button", { name: "Dividir aquí" }));
      expect(document.querySelectorAll(".k-studio-clip").length).toBe(2);
      expect(screen.getByText(/2 de 12/)).toBeTruthy();

      // La segunda pieza lleva su transición; la primera no la ofrece.
      fireEvent.click(screen.getByText("Clip 2").closest("button"));
      const transicion = screen.getByLabelText("Transición con la toma anterior");
      fireEvent.change(transicion, { target: { value: "fundido" } });
      expect(screen.getByText(/Duración de la transición/)).toBeTruthy();

      fireEvent.click(screen.getByRole("button", { name: "Aplicar edición" }));
      await waitFor(() => expect(onApply).toHaveBeenCalledTimes(1));
      const resultado = onApply.mock.calls[0][0];
      expect(resultado.receta.clips.length).toBe(2);
      expect(resultado.receta.clips[0].velocidad).toBe(0.5);
      expect(resultado.receta.clips[1].transicion.tipo).toBe("fundido");
      // Las dos mitades salen del mismo archivo: se sube una sola vez.
      expect(resultado.archivos.length).toBe(0);
    } finally {
      Object.defineProperty(URL, "createObjectURL", { configurable: true, value: originalCreateObjectURL });
    }
  });

  test("el último clip no se puede quitar", () => {
    render(<MediaStudio {...props} />);
    fireEvent.click(screen.getByRole("tab", { name: "Clips" }));
    fireEvent.click(screen.getByLabelText("Quitar el clip 1"));
    // El aviso se muestra arriba y abajo del estudio: basta con que aparezca.
    expect(screen.getAllByText("La pieza necesita al menos un clip.").length).toBeGreaterThan(0);
    expect(document.querySelectorAll(".k-studio-clip").length).toBe(1);
  });

  test("al aplicar con varios clips devuelve la línea de tiempo y los archivos", async () => {
    const originalCreateObjectURL = URL.createObjectURL;
    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: vi.fn(() => "blob:clip-nuevo") });
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: vi.fn() });
    try {
      const onApply = vi.fn();
      render(<MediaStudio {...props} onApply={onApply} />);
      fireEvent.click(screen.getByRole("tab", { name: "Clips" }));
      const entrada = screen.getByLabelText("Agregar un clip a la línea de tiempo");
      fireEvent.change(entrada, { target: { files: [new File(["x"], "foto.png", { type: "image/png" })] } });
      await waitFor(() => expect(screen.getByText(/2 de 12/)).toBeTruthy());

      fireEvent.click(screen.getByRole("button", { name: "Aplicar edición" }));
      await screen.findAllByText(/Elige la duración de la imagen/);
      expect(onApply).not.toHaveBeenCalled();
      fireEvent.change(screen.getByLabelText("Duración de la imagen (segundos)"), { target: { value: "2.5" } });
      fireEvent.click(screen.getByRole("button", { name: "Aplicar edición" }));
      await waitFor(() => expect(onApply).toHaveBeenCalledTimes(1));
      const resultado = onApply.mock.calls[0][0];
      expect(resultado.receta.clips.length).toBe(2);
      expect(resultado.receta.clips.every((clip) => !("ref" in clip))).toBe(true);
      expect(resultado.receta.duracionTotal).toBe(62.5);
      expect(resultado.linea[1].duracion).toBe(2.5);
      expect(resultado.linea[0].ref).toBe("principal");
      expect(resultado.archivos.length).toBe(1);
      expect(resultado.archivos[0].file.name).toBe("foto.png");
    } finally {
      Object.defineProperty(URL, "createObjectURL", { configurable: true, value: originalCreateObjectURL });
    }
  });

  test("la voz en off se graba con el micrófono y se avisa si no se puede", () => {
    render(<MediaStudio {...props} />);
    fireEvent.click(screen.getByRole("tab", { name: "Voz" }));
    // jsdom no tiene micrófono: el estudio lo dice en lugar de quedarse mudo.
    fireEvent.click(screen.getByRole("button", { name: "Grabar la voz" }));
    expect(screen.getByText(/No se pudo abrir el micrófono/)).toBeTruthy();
  });

  test("la voz del catálogo solo se puede elegir si está disponible", async () => {
    render(<MediaStudio {...props} />);
    fireEvent.click(screen.getByRole("tab", { name: "Voz" }));
    await waitFor(() => expect(screen.getByText("Ana del estudio")).toBeTruthy());
    expect(screen.getByText("Voz sin modelo").closest("button").disabled).toBe(true);
    expect(screen.getByText("Esta voz todavía no tiene modelo asignado.")).toBeTruthy();
    fireEvent.click(screen.getByText("Ana del estudio").closest("button"));
    expect(screen.getByText(/Volumen de la voz/)).toBeTruthy();
  });

  test("la locución se genera desde el texto y entra en la receta", async () => {
    const onApply = vi.fn();
    render(<MediaStudio {...props} guion="Hoy hablamos del estudio" onApply={onApply} />);
    fireEvent.click(screen.getByRole("tab", { name: "Voz" }));
    await waitFor(() => expect(screen.getByText("Ana del estudio")).toBeTruthy());

    // El texto arranca con el guion de la publicación y se puede cambiar.
    const texto = screen.getByLabelText("Texto de la locución");
    expect(texto.value).toBe("Hoy hablamos del estudio");

    fireEvent.click(screen.getByText("Ana del estudio").closest("button"));
    fireEvent.click(screen.getByRole("button", { name: "Generar la locución" }));
    await waitFor(() => expect(screen.getByLabelText("Vista previa de la voz grabada").src).toContain("/uploads/voices/locucion.mp3"));

    fireEvent.click(screen.getByRole("button", { name: "Aplicar edición" }));
    await waitFor(() => expect(onApply).toHaveBeenCalledTimes(1));
    const resultado = onApply.mock.calls[0][0];
    expect(resultado.receta.voz.url).toBe("/uploads/voices/locucion.mp3");
    expect(resultado.receta.voz.voiceId).toBe("v1");
    // La locución ya viene subida: no hay archivo que subir al publicar.
    expect(resultado.voz).toBe(null);
  });

  test("cambiar la voz retira la toma anterior en lugar de publicarla con otro modelo", async () => {
    const onApply = vi.fn();
    render(<MediaStudio {...props} guion="Toma de prueba" onApply={onApply} />);
    fireEvent.click(screen.getByRole("tab", { name: "Voz" }));
    await screen.findByText("Ana del estudio");
    fireEvent.click(screen.getByText("Ana del estudio").closest("button"));
    fireEvent.click(screen.getByRole("button", { name: "Generar la locución" }));
    await screen.findByLabelText("Vista previa de la voz grabada");
    fireEvent.click(screen.getByText("Ana del estudio").closest("button"));
    expect(screen.queryByLabelText("Vista previa de la voz grabada")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Aplicar edición" }));
    await screen.findByText(/Genera la locución antes de aplicar/);
    expect(onApply).not.toHaveBeenCalled();
  });

  test("el botón de locución espera texto y dice qué modelo usa", async () => {
    render(<MediaStudio {...props} />);
    fireEvent.click(screen.getByRole("tab", { name: "Voz" }));
    await waitFor(() => expect(screen.getByText("Ana del estudio")).toBeTruthy());
    // Sin texto no hay nada que generar.
    expect(screen.getByRole("button", { name: /Generar la locución/ }).disabled).toBe(true);
    expect(screen.getByText(/Modelo: x-ai\/grok-voice-tts-1.0/)).toBeTruthy();
  });

  test("sin el servicio de voz configurado la locución lo dice", async () => {
    voiceService.obtenerVoces.mockResolvedValueOnce({
      voces: [{ _id: "v1", nombre: "Ana del estudio", idioma: "es-MX", genero: "femenina", tipo: "catalogo", url: "", duracion: 0, disponible: false, motivo: "Falta configurar el servicio de voz en el servidor." }],
      servicio: { listo: false, variable: "OPENROUTER_API_KEY", modelo: "", voz: "", limites: { texto: 1200 } },
      motivo: ""
    });
    render(<MediaStudio {...props} guion="Texto listo" />);
    fireEvent.click(screen.getByRole("tab", { name: "Voz" }));
    await waitFor(() => expect(screen.getByText(/no está configurado/)).toBeTruthy());
    expect(screen.getByRole("button", { name: /Generar la locución/ }).disabled).toBe(true);
  });

  test("elegir un modelo sin generar la toma no publica una voz muda", async () => {
    const onApply = vi.fn();
    render(<MediaStudio {...props} onApply={onApply} />);
    fireEvent.click(screen.getByRole("tab", { name: "Voz" }));
    await waitFor(() => expect(screen.getByText("Ana del estudio")).toBeTruthy());
    fireEvent.click(screen.getByText("Ana del estudio").closest("button"));
    fireEvent.click(screen.getByRole("button", { name: "Aplicar edición" }));
    await screen.findByText(/Genera la locución antes de aplicar/);
    expect(onApply).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Quitar la voz" }));
    fireEvent.click(screen.getByRole("button", { name: "Aplicar edición" }));
    await waitFor(() => expect(onApply).toHaveBeenCalledTimes(1));
    expect(onApply.mock.calls[0][0].receta.voz).toBe(null);
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

describe("filtro guardado para reproducir videos", () => {
  test.each(FILTROS)("reconstruye $id desde el catálogo", async ({ id, css }) => {
    const { cssFiltroVideo } = await import("../src/lib/mediaStudio");
    expect(cssFiltroVideo({ type: "video", edit: { filtro: { id, intensidad: 1 } } })).toBe(css);
  });

  test("respeta intensidad, defaults y recetas antiguas sin confiar en CSS de la API", async () => {
    const { cssFiltroVideo } = await import("../src/lib/mediaStudio");
    const media = (filtro) => ({ type: "video", edit: { filtro } });
    expect(cssFiltroVideo(media({ id: "negro", intensidad: 0.5 }))).toBe(cssCombinado("negro", {}, 0.5));
    expect(cssFiltroVideo(media({ id: "negro", intensidad: 0 }))).toBe("none");
    expect(cssFiltroVideo(media({ id: "negro" }))).toBe(cssCombinado("negro", {}, 1));
    expect(cssFiltroVideo(media({ id: "negro", intensidad: "inválida" }))).toBe(cssCombinado("negro", {}, 1));
    expect(cssFiltroVideo(media({ id: "negro", intensidad: 10 }))).toBe(cssCombinado("negro", {}, 1));
    expect(cssFiltroVideo(media({ id: "negro", intensidad: -1 }))).toBe("none");
    expect(cssFiltroVideo(media({ id: "desconocido", css: "url(https://example.com/filter.svg)" }))).toBe("none");
    expect(cssFiltroVideo(media({ css: "blur(100px)" }))).toBe("none");
    expect(cssFiltroVideo({ type: "video", edit: { filtro: { id: "negro", css: "blur(100px)" }, ajustes: { brillo: 1.5 } } }))
      .toBe(cssCombinado("negro", { brillo: 1.5 }, 1));
    for (const value of [null, {}, { type: "video" }, { type: "video", edit: {} }, { type: "image", edit: { filtro: { id: "negro" } } }]) {
      expect(cssFiltroVideo(value)).toBe("none");
    }
  });
});

describe("tono guardado para reproducir videos", () => {
  test.each([
    ["brillo", 1.2, "brightness(1.200)"],
    ["contraste", 1.3, "contrast(1.300)"],
    ["saturacion", 0.5, "saturate(0.500)"],
    ["calidez", 0.2, "sepia(0.200) hue-rotate(-8deg)"],
    ["calidez", -0.2, "sepia(0.200) hue-rotate(8deg)"],
    ["exposicion", 0.2, "brightness(1.200)"],
    ["desenfoque", 1.5, "blur(1.50px)"]
  ])("reproduce %s sin exigir un filtro", async (clave, valor, esperado) => {
    const { cssFiltroVideo } = await import("../src/lib/mediaStudio");
    expect(cssFiltroVideo({ type: "video", edit: { ajustes: { [clave]: valor } } })).toBe(esperado);
  });

  test("combina filtro y tono una sola vez, incluso con intensidad cero", async () => {
    const { cssFiltroVideo } = await import("../src/lib/mediaStudio");
    const ajustes = { brillo: 1.1, exposicion: 0.2, contraste: 1.2, saturacion: 0.8, calidez: 0.2, desenfoque: 1.5 };
    for (const intensidad of [0, 0.5, 1]) {
      const media = { type: "video", edit: { ajustes, filtro: { id: "negro", intensidad, css: "url(https://example.com/no.svg)" } } };
      expect(cssFiltroVideo(media)).toBe(cssCombinado("negro", ajustes, intensidad));
    }
  });

  test("acota números y descarta ajustes nulos, inválidos o de fotos", async () => {
    const { ajustesTonoVideo, cssFiltroVideo } = await import("../src/lib/mediaStudio");
    const video = (ajustes) => ({ type: "video", edit: { ajustes } });
    expect(ajustesTonoVideo(video({ brillo: 99, contraste: -8, saturacion: 99, calidez: 1, exposicion: -1, desenfoque: 99, vineta: 4, grano: -2 })))
      .toEqual({ brillo: 1.5, contraste: 0.5, saturacion: 2, calidez: 0.3, exposicion: -0.4, desenfoque: 4, vineta: 1, grano: 0 });
    expect(cssFiltroVideo(video({ brillo: null, contraste: "", saturacion: false, calidez: {}, exposicion: Infinity, desenfoque: "blur(99px)" }))).toBe("none");
    expect(cssFiltroVideo(video({ brillo: "1.2" }))).toBe("brightness(1.200)");
    expect(cssFiltroVideo({ type: "image", edit: { ajustes: { brillo: 1.2 } } })).toBe("none");
    expect(ajustesTonoVideo(null)).toEqual(normalizarAjustes({}));
  });
});

test("el estudio conserva la URL de música elegida en la receta del video", async () => {
  const service = await import("../src/services/musicService");
  service.obtenerCatalogoMusica.mockResolvedValueOnce({ pistas: [{ _id: "music-url", titulo: "Pista con archivo", autor: "Kronos", duracion: 20, url: "/uploads/music/real.mp3" }], motivo: "" });
  const onApply = vi.fn();
  render(<MediaStudio open file={new File(["video"], "clip.mp4", { type: "video/mp4" })} previewUrl="blob:clip" kind="video" duracionInicial={20} onApply={onApply} onCancel={() => {}} />);
  fireEvent.click(screen.getByRole("tab", { name: "Música" }));
  fireEvent.click(await screen.findByRole("listitem", { name: "Pista con archivo, Kronos" }));
  fireEvent.click(screen.getByRole("button", { name: "Aplicar edición" }));
  await waitFor(() => expect(onApply).toHaveBeenCalledOnce());
  expect(onApply.mock.calls[0][0].receta.musica).toMatchObject({ trackId: "music-url", url: "/uploads/music/real.mp3", autor: "Kronos" });
});


test("exporta bajo acción explícita, permite usar el archivo e invalida una salida al editar", async () => {
  const file = new File(["render"], "render.webm", { type: "video/webm" }); const onApply = vi.fn();
  const encode = vi.spyOn(videoExport, "exportarVideo").mockResolvedValue({ file, duration: 10, width: 1080, height: 1920 });
  render(<MediaStudio open kind="video" previewUrl="blob:original" duracionInicial={20} onApply={onApply} />);
  expect(encode).not.toHaveBeenCalled(); fireEvent.click(screen.getByRole("tab", { name: "Salida" }));
  fireEvent.click(screen.getByRole("button", { name: "Exportar video (WebM)" }));
  await screen.findByRole("link", { name: "Descargar video exportado" });
  expect(encode.mock.calls[0][0]).toMatchObject({ clips: [{ tipo: "video", url: "blob:original", inicio: 0, fin: 20 }], calidad: "alta" });
  fireEvent.click(screen.getByRole("button", { name: "Usar video exportado" }));
  expect(onApply).toHaveBeenCalledWith(expect.objectContaining({ tipo: "video", archivo: file, duration: 10, width: 1080, height: 1920 }));
  fireEvent.change(screen.getByRole("combobox", { name: "Calidad" }), { target: { value: "ligera" } });
  expect(screen.queryByRole("link", { name: "Descargar video exportado" })).toBeNull();
});

test("cancelar una exportación aborta el trabajo, bloquea los ajustes y no aplica nada", async () => {
  const onApply = vi.fn(); let signal;
  vi.spyOn(videoExport, "exportarVideo").mockImplementation(options => {
    signal = options.signal;
    return new Promise((resolve, reject) => signal.addEventListener("abort", () => reject(Object.assign(new Error("cancel"), { name: "AbortError" })), { once: true }));
  });
  render(<MediaStudio open kind="video" previewUrl="blob:original" duracionInicial={20} onApply={onApply} />);
  fireEvent.click(screen.getByRole("tab", { name: "Salida" })); fireEvent.click(screen.getByRole("button", { name: "Exportar video (WebM)" }));
  expect(screen.getByRole("tab", { name: "Clips" }).disabled).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "Cancelar exportación" }));
  await screen.findByText("Exportación cancelada. El original no cambió.");
  expect(signal.aborted).toBe(true); expect(onApply).not.toHaveBeenCalled(); expect(screen.getByRole("tab", { name: "Clips" }).disabled).toBe(false);
});
