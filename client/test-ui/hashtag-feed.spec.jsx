import React from "react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { createTestQueryClient } from "../src/app/queryClient";
import HashtagFeed from "../src/features/social/HashtagFeed";
import { api } from "../src/services/apiClient";

vi.mock("../src/services/apiClient", () => ({
  API_URL: "/api",
  api: { get: vi.fn(), patch: vi.fn(), post: vi.fn() }
}));

const post = {
  _id: "p1",
  content: "sobre #arte",
  createdAt: new Date().toISOString(),
  likesCount: 3,
  commentsCount: 1,
  repostsCount: 0,
  author: { _id: "u1", username: "ana", displayName: "Ana" },
  recommendationReason: "Relacionado con #arte"
};

beforeEach(() => vi.clearAllMocks());
afterEach(() => cleanup());

function mount(tag = "arte") {
  return render(
    <QueryClientProvider client={createTestQueryClient()}>
      <MemoryRouter initialEntries={[`/hashtag/${tag}`]}>
        <Routes>
          <Route path="/hashtag/:tag" element={<HashtagFeed />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

/**
 * `GET /posts/topic/:tag` llevaba tiempo existiendo sin ninguna pantalla que lo
 * llamara: al pulsar un hashtag se caía en la búsqueda global de texto.
 */
test("pide el tema al endpoint real, normalizado", async () => {
  api.get.mockResolvedValue({ data: { posts: [post], hasMore: false, total: 1 } });
  // El `#` no puede viajar en la ruta (es el fragmento de la URL): los enlaces
  // de la app generan `/hashtag/arte`, y el hook normaliza mayúsculas.
  mount("Arte");

  expect(await screen.findByText("sobre #arte")).toBeTruthy();
  const [url, config] = api.get.mock.calls[0];
  expect(url).toBe(`/posts/topic/${encodeURIComponent("arte")}`);
  expect(config.params.page).toBe(1);
});

test("muestra el autor, los contadores y por qué aparece", async () => {
  api.get.mockResolvedValue({ data: { posts: [post], hasMore: false, total: 1 } });
  mount();

  expect(await screen.findByRole("link", { name: "Ana" })).toBeTruthy();
  expect(screen.getByText("3 me gusta")).toBeTruthy();
  expect(screen.getByText(/Relacionado con #arte/)).toBeTruthy();
});

test("un tema vacío lo dice y ofrece escribir", async () => {
  api.get.mockResolvedValue({ data: { posts: [], hasMore: false, total: 0 } });
  mount("tema-nuevo");

  expect(await screen.findByText(/Todavía no hay publicaciones con este tema/)).toBeTruthy();
  expect(screen.getByRole("link", { name: /Escribir una publicación/ })).toBeTruthy();
});

test("pagina: «Cargar más» pide la página siguiente", async () => {
  api.get.mockImplementation(async (_url, { params } = {}) => ({
    data: { posts: [{ ...post, _id: `p${params.page}` }], hasMore: params.page < 2, total: 2 }
  }));
  mount();

  await screen.findByText("sobre #arte");
  fireEvent.click(await screen.findByRole("button", { name: "Cargar más" }));

  await waitFor(() => {
    const calls = api.get.mock.calls.filter(([url]) => url.startsWith("/posts/topic/"));
    expect(calls[calls.length - 1][1].params.page).toBe(2);
  });
});

test("si el servidor falla, ofrece reintentar en lugar de una lista vacía", async () => {
  api.get.mockRejectedValue({ response: { data: { error: "Error obteniendo el tema" } } });
  mount();

  expect(await screen.findByText("Error obteniendo el tema")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Reintentar" })).toBeTruthy();
});
