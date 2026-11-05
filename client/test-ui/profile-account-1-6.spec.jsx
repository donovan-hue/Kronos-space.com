import React from "react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { createTestQueryClient } from "../src/app/queryClient";
import {
  applyTheme,
  initialThemePreference,
  normalizeTheme,
  readThemePreference,
  resolveTheme,
  setThemePreference
} from "../src/lib/themePreference";
import Settings from "../src/features/settings/Settings";

vi.mock("../src/services/usersService", () => ({
  getMe: vi.fn(),
  updatePreferences: vi.fn(),
  changePassword: vi.fn(),
  updateProfile: vi.fn()
}));

vi.mock("../src/services/authService", () => ({
  getSessions: vi.fn(async () => []),
  requestEmailVerification: vi.fn(),
  revokeOtherSessions: vi.fn(),
  revokeSession: vi.fn()
}));

vi.mock("../src/services/exportService", () => ({
  downloadDataExport: vi.fn(),
  getExportStatus: vi.fn(),
  requestDataExport: vi.fn()
}));

vi.mock("../src/components/feedback/ConfirmProvider", () => ({
  useConfirm: () => vi.fn(async () => true)
}));

vi.mock("../src/features/settings/ProfilePrivacy", () => ({ default: () => null }));
vi.mock("../src/features/settings/DeleteAccount", () => ({ default: () => null }));

import * as usersService from "../src/services/usersService";

const profile = {
  _id: "me",
  username: "ana",
  displayName: "Ana",
  bio: "",
  hasPassword: true,
  emailVerified: true,
  preferences: {
    notifications: { inApp: true, email: false },
    content: { showSensitive: false },
    appearance: "dark",
    language: "es-MX",
    aiPersonality: "normal",
    feed: { mode: "latest", interests: [] }
  }
};

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  document.documentElement.removeAttribute("data-k-theme");
  usersService.getMe.mockResolvedValue(profile);
  usersService.updatePreferences.mockImplementation(async (next) => next);
});

afterEach(() => cleanup());

// ---------------------------------------------------------------
// Tema: el campo existía en el estado local de Ajustes, en ningún otro sitio.
// ---------------------------------------------------------------

test("sin preferencia el tema es el de marca (oscuro)", () => {
  expect(readThemePreference()).toBeNull();
  expect(initialThemePreference(undefined)).toBe("dark");
  expect(applyTheme("dark")).toBe("dark");
  expect(document.documentElement.getAttribute("data-k-theme")).toBe("dark");
});

test("un valor raro no deja la app sin tema", () => {
  expect(normalizeTheme("neon")).toBe("dark");
  window.localStorage.setItem("kronos.theme-preference", "basura");
  expect(readThemePreference()).toBe("dark");
});

test("«sistema» sigue a prefers-color-scheme", () => {
  const original = window.matchMedia;
  window.matchMedia = vi.fn(() => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
  try {
    expect(resolveTheme("system")).toBe("light");
    expect(applyTheme("system")).toBe("light");
  } finally {
    window.matchMedia = original;
  }
});

test("el tema elegido se recuerda en este navegador", () => {
  setThemePreference("light");
  expect(readThemePreference()).toBe("light");
  expect(document.documentElement.getAttribute("data-k-theme")).toBe("light");
});

// ---------------------------------------------------------------
// Ajustes
// ---------------------------------------------------------------

test("Ajustes aplica la apariencia del perfil al cargar", async () => {
  usersService.getMe.mockResolvedValue({
    ...profile,
    preferences: { ...profile.preferences, appearance: "light" }
  });

  render(<MemoryRouter><Settings onLogout={vi.fn()} /></MemoryRouter>);

  await waitFor(() =>
    expect(document.documentElement.getAttribute("data-k-theme")).toBe("light")
  );
});

test("cambiar la apariencia la aplica al instante y la guarda", async () => {
  render(<MemoryRouter><Settings onLogout={vi.fn()} /></MemoryRouter>);
  await screen.findByText("Configuración");
  fireEvent.click(screen.getByText("Notificaciones y apariencia"));

  fireEvent.click(screen.getByRole("radio", { name: /^Claro/ }));

  await waitFor(() =>
    expect(usersService.updatePreferences).toHaveBeenCalledWith({ appearance: "light" })
  );
  expect(document.documentElement.getAttribute("data-k-theme")).toBe("light");
});

test("si el guardado de apariencia falla, el tema vuelve atrás", async () => {
  usersService.updatePreferences.mockRejectedValue({ response: { data: { error: "No se pudo guardar" } } });

  render(<MemoryRouter><Settings onLogout={vi.fn()} /></MemoryRouter>);
  await screen.findByText("Configuración");
  fireEvent.click(screen.getByText("Notificaciones y apariencia"));
  fireEvent.click(screen.getByRole("radio", { name: /^Claro/ }));

  expect(await screen.findByText("No se pudo guardar")).toBeTruthy();
  expect(document.documentElement.getAttribute("data-k-theme")).toBe("dark");
});

test("cambiar la contraseña envía los tres campos y confirma", async () => {
  usersService.changePassword.mockResolvedValue({ updated: true, revokedSessions: 2 });

  render(<MemoryRouter><Settings onLogout={vi.fn()} /></MemoryRouter>);
  await screen.findByText("Configuración");

  fireEvent.change(screen.getByLabelText(/^Contraseña actual/), { target: { value: "actual-123" } });
  fireEvent.change(screen.getByLabelText(/^Nueva contraseña/), { target: { value: "nueva-clave" } });
  fireEvent.change(screen.getByLabelText(/^Repite la nueva contraseña/), { target: { value: "nueva-clave" } });
  fireEvent.click(screen.getByRole("button", { name: "Cambiar contraseña" }));

  await waitFor(() =>
    expect(usersService.changePassword).toHaveBeenCalledWith({
      currentPassword: "actual-123",
      newPassword: "nueva-clave",
      confirmPassword: "nueva-clave"
    })
  );
  expect(await screen.findByText(/Se cerraron 2 sesiones/)).toBeTruthy();
});

test("una cuenta de Google ve «Crear contraseña» y no pide la actual", async () => {
  usersService.getMe.mockResolvedValue({ ...profile, hasPassword: false });

  render(<MemoryRouter><Settings onLogout={vi.fn()} /></MemoryRouter>);
  await screen.findByText("Configuración");

  expect(screen.getByText("Crear una contraseña")).toBeTruthy();
  expect(screen.queryByLabelText("Contraseña actual")).toBeNull();
  expect(screen.getByRole("button", { name: "Crear contraseña" })).toBeTruthy();
});

test("el error del servidor al cambiar la contraseña se muestra tal cual", async () => {
  usersService.changePassword.mockRejectedValue({
    response: { data: { error: "La contraseña actual no es correcta" } }
  });

  render(<MemoryRouter><Settings onLogout={vi.fn()} /></MemoryRouter>);
  await screen.findByText("Configuración");

  fireEvent.change(screen.getByLabelText(/^Contraseña actual/), { target: { value: "mala" } });
  fireEvent.change(screen.getByLabelText(/^Nueva contraseña/), { target: { value: "nueva-clave" } });
  fireEvent.change(screen.getByLabelText(/^Repite la nueva contraseña/), { target: { value: "nueva-clave" } });
  fireEvent.click(screen.getByRole("button", { name: "Cambiar contraseña" }));

  expect(await screen.findByText("La contraseña actual no es correcta")).toBeTruthy();
});
