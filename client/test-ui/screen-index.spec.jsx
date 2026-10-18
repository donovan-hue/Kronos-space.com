import React from "react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import ScreenIndex from "../src/features/system/ScreenIndex";
import { ALIAS, MAPA_PANTALLAS, buscarPantallas, totalesDelMapa } from "../src/lib/screenIndex";
import { SECTION_LABELS, getCurrentSection } from "../src/navigation/model";
import { NAV_GROUPS } from "../src/navigation/model";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function montar() {
  return render(
    <MemoryRouter initialEntries={["/pantallas"]}>
      <Routes>
        <Route path="/pantallas" element={<ScreenIndex />} />
      </Routes>
    </MemoryRouter>
  );
}

describe("mapa de pantallas", () => {
  test("cada pantalla declara origen, estado y descripción", () => {
    MAPA_PANTALLAS.forEach((area) => {
      expect(area.pantallas.length).toBeGreaterThan(0);
      area.pantallas.forEach((pantalla) => {
        expect(pantalla.nombre).toBeTruthy();
        expect(pantalla.descripcion.length).toBeGreaterThan(8);
        expect(["menu", "boton", "tecla", "direccion", "pendiente"]).toContain(pantalla.origen);
        expect(["visible", "escondido", "apagable", "proximamente", "fuera"]).toContain(pantalla.estado);
      });
    });
  });

  test("ninguna ruta se repite dentro del mapa", () => {
    const rutas = MAPA_PANTALLAS.flatMap((area) => area.pantallas)
      .map((pantalla) => pantalla.ruta)
      .filter(Boolean);
    expect(new Set(rutas).size).toBe(rutas.length);
  });

  test("los totales cuadran con las pantallas declaradas", () => {
    const totales = totalesDelMapa();
    const pantallas = MAPA_PANTALLAS.flatMap((area) => area.pantallas);
    expect(totales.total).toBe(pantallas.length);
    expect(totales.conRuta).toBe(pantallas.filter((p) => p.ruta).length);
    expect(Object.values(totales.porEstado).reduce((a, b) => a + b, 0)).toBe(totales.total);
  });

  test("lo que está en el menú tiene su sección y su etiqueta", () => {
    const enMenu = MAPA_PANTALLAS.flatMap((area) => area.pantallas).filter((p) => p.origen === "menu");
    expect(enMenu.length).toBeGreaterThan(10);
    enMenu.forEach((pantalla) => {
      expect(pantalla.ruta).toBeTruthy();
      const seccion = getCurrentSection(pantalla.ruta);
      expect(seccion).toBeTruthy();
      expect(SECTION_LABELS[seccion]).toBeTruthy();
    });
  });

  test("los alias apuntan a una ruta que existe en el mapa", () => {
    const rutas = new Set(MAPA_PANTALLAS.flatMap((area) => area.pantallas).map((p) => p.ruta).filter(Boolean));
    Object.values(ALIAS).forEach((destino) => expect(rutas.has(destino)).toBe(true));
  });

  test("la búsqueda no distingue acentos ni mayúsculas", () => {
    expect(buscarPantallas("cairos").length).toBeGreaterThan(0);
    expect(buscarPantallas("KAiros").length).toBeGreaterThan(0);
    expect(buscarPantallas("educación").length).toBe(0);
    expect(buscarPantallas("guiones").length).toBeGreaterThan(0);
    const areas = buscarPantallas("kairos");
    const nombres = areas.flatMap((area) => area.pantallas.map((p) => p.nombre));
    expect(nombres).toContain("Kairos");
  });
});

describe("pantalla del índice", () => {
  test("lista las áreas y cuenta las pantallas", () => {
    montar();
    expect(screen.getByRole("heading", { name: "Todas las pantallas" })).toBeTruthy();
    ["Entrar", "La red", "Comunidad", "La persona", "Ajustes y control", "Kairos", "Sistema"].forEach((area) => {
      expect(screen.getByRole("heading", { name: area })).toBeTruthy();
    });
    expect(screen.getByText(/pantallas y funciones en 7 áreas/)).toBeTruthy();
  });

  test("filtra por estado y solo deja ese grupo", () => {
    montar();
    fireEvent.click(screen.getByRole("button", { name: /Escondido/ }));
    const estados = Array.from(document.querySelectorAll(".k-indice-estado")).map((nodo) => nodo.textContent.trim());
    expect(estados.length).toBeGreaterThan(0);
    expect(estados.every((texto) => texto === "Escondido")).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: /Todas/ }));
    expect(document.querySelectorAll(".k-indice-estado").length).toBe(totalesDelMapa().total);
  });

  test("el buscador reduce la lista sin acentos", () => {
    montar();
    fireEvent.change(screen.getByLabelText("Buscar una pantalla"), { target: { value: "guardados" } });
    const nombres = Array.from(document.querySelectorAll(".k-indice-nombre")).map((nodo) => nodo.textContent);
    expect(nombres).toContain("Guardados");
    expect(nombres).not.toContain("En vivo");
    fireEvent.change(screen.getByLabelText("Buscar una pantalla"), { target: { value: "zzzz" } });
    expect(screen.getByText(/No hay ninguna pantalla que coincida/)).toBeTruthy();
  });

  test("las pantallas con ruta enlazan y las que no, se muestran igual", () => {
    montar();
    const enlaces = screen.getAllByRole("link");
    expect(enlaces.length).toBe(totalesDelMapa().conRuta);
    // Sin ruta no hay enlace: se ve la ficha, pero no lleva a ningún lado.
    expect(screen.getByText("Apoyos recibidos")).toBeTruthy();
    expect(screen.getByText("Proyectos")).toBeTruthy();
    expect(screen.queryByRole("link", { name: /Proyectos/ })).toBeNull();
  });

  test("el menú ofrece el índice y su sección está etiquetada", () => {
    const items = NAV_GROUPS.flatMap((grupo) => grupo.items);
    const indice = items.find((item) => item.to === "/pantallas");
    expect(indice).toBeTruthy();
    expect(indice.label).toBe("Todas las pantallas");
    expect(getCurrentSection("/pantallas")).toBe("pantallas");
    expect(SECTION_LABELS.pantallas).toBe("Todas las pantallas");
  });
});
