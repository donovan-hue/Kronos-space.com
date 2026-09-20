import React from "react";
import { beforeEach, afterEach, expect, test, vi } from "vitest";
import { QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Link, MemoryRouter, Route, Routes } from "react-router-dom";
import { createTestQueryClient } from "../src/app/queryClient";
import AppLayout from "../src/layouts/AppLayout";
import MotionProvider from "../src/app/MotionProvider";
import { ToastProvider, useToast } from "../src/components/feedback/ToastProvider";
import PostActions from "../src/features/social/components/PostActions";
import * as socket from "../src/services/socket";

vi.mock("../src/services/socket", () => ({
  getSocket: vi.fn(() => null),
  connectSocket: vi.fn(),
  disconnectSocket: vi.fn(),
}));

beforeEach(() => {
  vi.clearAllMocks();
});
afterEach(() => cleanup());

test("transición de pantalla: AppLayout monta rutas y cambia de vista con Motion", async () => {
  function Home() {
    return (
      <div>
        <h1>Inicio KRONOS</h1>
        <Link to="/explore">Ir a explorar</Link>
      </div>
    );
  }
  function Explore() {
    return <h1>Explorar</h1>;
  }

  render(
    <QueryClientProvider client={createTestQueryClient()}>
      <ToastProvider>
        <MemoryRouter initialEntries={["/home"]}>
          <Routes>
            <Route element={<AppLayout />}>
              <Route path="/home" element={<Home />} />
              <Route path="/explore" element={<Explore />} />
            </Route>
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>
  );

  expect(screen.getByRole("heading", { name: "Inicio KRONOS" })).toBeTruthy();

  // Navegación real con Link: la vista nueva aparece (la animación de
  // pantalla es visual; el contenido queda accesible al terminar).
  fireEvent.click(screen.getByRole("link", { name: "Ir a explorar" }));

  expect(await screen.findByRole("heading", { name: "Explorar" })).toBeTruthy();
});

test("toast animado: entra, se puede cerrar y desaparece del DOM", async () => {
  function Consumer() {
    const { showToast } = useToast();
    return (
      <button onClick={() => showToast("Aviso premium", { tone: "success" })}>
        Lanzar
      </button>
    );
  }

  render(
    <MotionProvider>
      <ToastProvider>
        <Consumer />
      </ToastProvider>
    </MotionProvider>
  );

  fireEvent.click(screen.getByText("Lanzar"));
  const toast = await screen.findByText("Aviso premium");
  expect(toast.closest(".k-toast")).toBeTruthy();

  fireEvent.click(screen.getByRole("button", { name: "Cerrar aviso" }));
  await waitFor(() => expect(screen.queryByText("Aviso premium")).toBeNull());
});

test("PostActions con microinteracciones conserva roles y refleja el like", () => {
  const onLike = vi.fn();
  const onRepost = vi.fn();
  const post = { _id: "p1", liked: false, likesCount: 0, saved: false, savedCount: 0 };

  const { rerender } = render(
    <MemoryRouter>
      <PostActions post={post} onLike={onLike} onRepost={onRepost} commentsCount={0} />
    </MemoryRouter>
  );

  const like = screen.getByRole("button", { name: "Reaccionar. 0 reacciones" });
  fireEvent.click(like);
  expect(onLike).toHaveBeenCalledWith("p1");

  // El estado llega del servidor (caché): el rótulo cambia con su pop.
  rerender(
    <MemoryRouter>
      <PostActions
        post={{ ...post, liked: true, likesCount: 1 }}
        onLike={onLike}
        onRepost={onRepost}
        commentsCount={0}
      />
    </MemoryRouter>
  );
  expect(screen.getByRole("button", { name: "Quitar reacción. 1 reacciones" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Comentar. 0 comentarios" })).toBeTruthy();
  expect(screen.queryByRole("menuitem", { name: "Repost" })).toBeNull();
});

test("MotionProvider respeta prefers-reduced-motion del usuario", () => {
  // MotionConfig reducedMotion="user": con la preferencia activa, las
  // transformaciones se omiten y solo queda opacidad. Verificamos que el
  // árbol renderiza con la preferencia activa (sin romperse).
  window.matchMedia = vi.fn().mockReturnValue({
    matches: true,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  });

  render(
    <MotionProvider>
      <p>Contenido con movimiento reducido</p>
    </MotionProvider>
  );

  expect(screen.getByText("Contenido con movimiento reducido")).toBeTruthy();
});
