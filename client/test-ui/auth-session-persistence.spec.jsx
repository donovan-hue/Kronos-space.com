import React from "react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { createTestQueryClient } from "../src/app/queryClient";
import Auth from "../src/features/auth/Auth";
import { getSession, getToken, getUser } from "../src/services/authStorage";

/**
 * KRONOS-AUDIT-002 — destino real de la sesión al iniciar sesión.
 *
 * Regresión del defecto encontrado validando en navegador real: el
 * checkbox "Recordar sesión" llegaba `undefined` a `saveSession` porque
 * `loginSchema` no declaraba el campo y `zodResolver` entrega a
 * `handleSubmit` solo los valores que el esquema devuelve. Con la casilla
 * marcada (valor por defecto) la sesión acababa en sessionStorage, así que
 * cerrar el navegador cerraba la sesión de quien pidió ser recordado.
 *
 * La prueba monta el formulario real de Auth con el transporte HTTP
 * simulado: la capa que se audita —zod + react-hook-form + authStorage—
 * es la de producción.
 */

vi.mock("../src/services/apiClient", () => ({
  API_URL: "/api",
  api: { get: vi.fn(), post: vi.fn(), patch: vi.fn() },
}));

import { api } from "../src/services/apiClient";

const me = {
  _id: "507f1f77bcf86cd799439011",
  id: "507f1f77bcf86cd799439011",
  username: "example",
  email: "example@kronos.space",
  emailVerified: true,
  displayName: "Example",
  avatar: "",
  cover: "",
  bio: "",
  role: "user",
};

const token = `e30.${Buffer.from(JSON.stringify({ id: me.id, exp: Math.floor(Date.now() / 1000) + 3600 })).toString("base64url")}.firma-de-prueba`;

function loginResponse() {
  return {
    data: {
      token,
      expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
      refreshToken: "refresh-de-prueba",
      refreshExpiresAt: new Date(Date.now() + 86_400_000).toISOString(),
      user: me,
    },
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  localStorage.clear();
  sessionStorage.clear();
  api.get.mockResolvedValue({ data: {} });
  api.post.mockResolvedValue(loginResponse());
});

afterEach(() => cleanup());

function mountLogin() {
  const onLogin = vi.fn();
  render(
    <QueryClientProvider client={createTestQueryClient()}>
      <MemoryRouter>
        <Auth onLogin={onLogin} initialMode="login" />
      </MemoryRouter>
    </QueryClientProvider>
  );
  return onLogin;
}

async function submitLogin({ remember }) {
  const onLogin = mountLogin();
  fireEvent.click(await screen.findByRole("button", { name: "Iniciar sesión" }));

  fireEvent.change(screen.getByLabelText("Correo electrónico"), {
    target: { value: "example@kronos.space" },
  });
  fireEvent.change(screen.getByLabelText("Contraseña"), {
    target: { value: "12345678" },
  });

  const checkbox = screen.getByLabelText("Recordar sesión");
  if (checkbox.checked !== remember) fireEvent.click(checkbox);

  fireEvent.click(screen.getByRole("button", { name: "Iniciar sesión" }));
  await waitFor(() => expect(onLogin).toHaveBeenCalled());
  return { onLogin, checkbox };
}

test("recordar sesión (por defecto) persiste en localStorage y sobrevive al navegador", async () => {
  const { checkbox } = await submitLogin({ remember: true });

  expect(checkbox.checked).toBe(true);
  expect(localStorage.getItem("kronos_token")).toBe(token);
  expect(JSON.parse(localStorage.getItem("kronos_user")).username).toBe("example");
  expect(localStorage.getItem("kronos_session_remember")).toBe("true");
  expect(sessionStorage.length).toBe(0);
  expect(getSession().remember).toBe(true);
  expect(getToken()).toBe(token);
  expect(getUser().id).toBe(me.id);
});

test("sin recordar sesión persiste solo en sessionStorage", async () => {
  await submitLogin({ remember: false });

  expect(localStorage.length).toBe(0);
  expect(sessionStorage.getItem("kronos_token")).toBe(token);
  expect(sessionStorage.getItem("kronos_session_remember")).toBe("false");
  expect(getSession().remember).toBe(false);
});

test("el login solo envía credenciales al backend: nunca el flag de recordar", async () => {
  await submitLogin({ remember: true });

  expect(api.post).toHaveBeenCalledWith("/auth/login", {
    email: "example@kronos.space",
    password: "12345678",
  });
});

test("no se persisten credenciales ni campos internos del usuario", async () => {
  await submitLogin({ remember: true });

  const stored = localStorage.getItem("kronos_user");
  const parsed = JSON.parse(stored);
  expect(Object.keys(parsed).sort()).toEqual([
    "_id", "avatar", "bio", "cover", "displayName", "email", "emailVerified", "id", "role", "username"
  ]);
  for (const forbidden of ["password", "passwordHash", "credential", "googleId", "resetToken"]) {
    expect(stored.includes(forbidden)).toBe(false);
  }
});
