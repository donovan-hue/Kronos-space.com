import React from "react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import CreatePost from "../src/features/social/CreatePost";
import * as posts from "../src/services/postsService";
import * as drafts from "../src/services/draftsService";

/**
 * El compositor frente a la política de publicación del despliegue.
 *
 * `REQUIRE_VERIFIED_EMAIL_TO_POST` es una decisión del despliegue, así que el
 * cliente no la conoce de antemano: la entera por el 403. Lo que se prueba aquí
 * es que ese rechazo no se queda en un texto — tiene que llevar a la pantalla
 * donde el requisito se resuelve — y que ningún otro error inventa el aviso.
 */

vi.mock("../src/services/postsService", () => ({
  createPost: vi.fn(),
  uploadMedia: vi.fn(),
  votePoll: vi.fn()
}));

vi.mock("../src/services/draftsService", () => ({
  createDraft: vi.fn(),
  deleteDraft: vi.fn(),
  getDrafts: vi.fn(),
  updateDraft: vi.fn()
}));

vi.mock("../src/services/circlesService", () => ({ getCircles: vi.fn(() => Promise.resolve([])) }));

beforeEach(() => {
  vi.resetAllMocks();
  drafts.getDrafts.mockResolvedValue({ drafts: [], hasMore: false });
  drafts.deleteDraft.mockResolvedValue({});
});

afterEach(() => cleanup());

function rechazarDe(nuevo) {
  posts.createPost.mockRejectedValue(nuevo);
}

async function intentarPublicar() {
  render(<MemoryRouter><CreatePost /></MemoryRouter>);
  fireEvent.change(screen.getByRole("textbox"), { target: { value: "Un texto breve y real." } });
  fireEvent.click(screen.getByRole("button", { name: "Publicar" }));
  await waitFor(() => expect(posts.createPost).toHaveBeenCalled());
}

test("un 403 por correo sin verificar ofrece el enlace de verificación", async () => {
  rechazarDe({
    response: {
      status: 403,
      data: {
        error: "Necesitas verificar tu correo antes de publicar. Revisa tu bandeja de entrada o pide uno nuevo desde Verificación de correo.",
        code: "correo_no_verificado"
      }
    }
  });

  await intentarPublicar();

  expect(await screen.findByText(/verificar tu correo antes de publicar/)).toBeTruthy();
  const enlace = await screen.findByRole("link", { name: "Verificar mi correo" });
  expect(enlace.getAttribute("href")).toBe("/verify-email");
});

test("la verificación se ofrece sin borrar lo escrito: no se pierde el borrador por un 403", async () => {
  rechazarDe({
    response: { status: 403, data: { error: "Verifica tu correo.", code: "correo_no_verificado" } }
  });

  await intentarPublicar();

  await screen.findByRole("link", { name: "Verificar mi correo" });
  expect(screen.getByRole("textbox").value).toBe("Un texto breve y real.");
  // El contenido no se mandó a guardar como borrador por detrás: solo se informó.
  expect(drafts.createDraft).not.toHaveBeenCalled();
});

test("otros rechazos no disfrazan un problema de verificación", async () => {
  rechazarDe({ response: { status: 429, data: { error: "Demasiadas solicitudes" } } });

  await intentarPublicar();

  expect(await screen.findByText(/Demasiadas publicaciones/)).toBeTruthy();
  expect(screen.queryByRole("link", { name: "Verificar mi correo" })).toBeNull();
});

test("una sesión caducada sigue diciendo lo suyo, no pidiendo verificar el correo", async () => {
  rechazarDe({ response: { status: 401, data: { error: "Token inválido" } } });

  await intentarPublicar();

  expect(await screen.findByText("Tu sesión expiró. Inicia sesión de nuevo.")).toBeTruthy();
  expect(screen.queryByRole("link", { name: "Verificar mi correo" })).toBeNull();
});

test("una publicación aceptada no deja el aviso puesto", async () => {
  posts.createPost.mockResolvedValue({ _id: "post-ok" });

  await intentarPublicar();

  expect(await screen.findByText("Publicación creada.")).toBeTruthy();
  expect(screen.queryByRole("link", { name: "Verificar mi correo" })).toBeNull();
});
