import { afterEach, describe, expect, test, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import GlobalSearchModal from "../src/components/search/GlobalSearchModal";
import CreateHub from "../src/features/social/CreateHub";
import * as usersService from "../src/services/usersService";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function renderWithProviders(ui) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>
  );
}

describe("Bloque A: Navegación y búsqueda única", () => {
  test("CreateHub contextual adapta el botón cuando viene de una órbita", () => {
    render(
      <MemoryRouter initialEntries={["/create?orbitId=orb123&orbitName=Cielo%20profundo%20GDL"]}>
        <CreateHub />
      </MemoryRouter>
    );

    expect(screen.getByRole("heading", { name: "Tu espacio para crear" })).toBeTruthy();
    const ctaButton = screen.getByRole("link", { name: /Publicar en Cielo profundo GDL/i });
    expect(ctaButton).toBeTruthy();
    expect(ctaButton.getAttribute("href")).toContain("/create/post?orbitId=orb123");
  });

  test("GlobalSearchModal muestra sugerencias rápidas cuando está vacío", () => {
    renderWithProviders(<GlobalSearchModal isOpen={true} onClose={() => {}} />);

    expect(screen.getByPlaceholderText(/Buscar personas, temas, órbitas, publicaciones…/i)).toBeTruthy();
    expect(screen.getByText("SUGERENCIAS RÁPIDAS")).toBeTruthy();
    expect(screen.getByRole("button", { name: "#arte" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "#IA" })).toBeTruthy();
  });

  test("GlobalSearchModal muestra mensaje de estado vacío adecuado", async () => {
    vi.spyOn(usersService, "searchGlobal").mockResolvedValueOnce({
      users: [],
      posts: [],
      orbits: [],
      topics: [],
      totals: { users: 0, posts: 0, orbits: 0, topics: 0 },
    });

    renderWithProviders(<GlobalSearchModal isOpen={true} onClose={() => {}} />);

    const input = screen.getByPlaceholderText(/Buscar personas, temas, órbitas, publicaciones…/i);
    fireEvent.change(input, { target: { value: "inexistente12345" } });

    await waitFor(() => {
      expect(
        screen.getByText(/Nada por aquí todavía. Prueba con otro término o crea la órbita que falta./i)
      ).toBeTruthy();
    });
  });

  test("GlobalSearchModal renderiza resultados agrupados por personas, temas y órbitas", async () => {
    vi.spyOn(usersService, "searchGlobal").mockResolvedValueOnce({
      users: [
        { _id: "u1", username: "ana", displayName: "Ana Torres", bio: "Fotógrafa nocturna" }
      ],
      topics: [
        { tag: "astrofotografía", count: 128 }
      ],
      orbits: [
        { _id: "o1", name: "Cielo profundo GDL", membersCount: 56, visibility: "public" }
      ],
      posts: [
        { _id: "p1", content: "Nebulosa de Orión desde Tapalpa", author: { username: "ana" }, createdAt: new Date().toISOString() }
      ],
      totals: { users: 1, posts: 1, orbits: 1, topics: 1 }
    });

    renderWithProviders(<GlobalSearchModal isOpen={true} onClose={() => {}} />);

    const input = screen.getByPlaceholderText(/Buscar personas, temas, órbitas, publicaciones…/i);
    fireEvent.change(input, { target: { value: "astro" } });

    await waitFor(() => {
      expect(screen.getByText("GENTE")).toBeTruthy();
      expect(screen.getByText("@ana")).toBeTruthy();
      expect(screen.getByText("TEMAS")).toBeTruthy();
      expect(screen.getByText("#astrofotografía")).toBeTruthy();
      expect(screen.getByText("ÓRBITAS")).toBeTruthy();
      expect(screen.getByText("Cielo profundo GDL")).toBeTruthy();
      expect(screen.getByText("PUBLICACIONES")).toBeTruthy();
    });
  });
});
