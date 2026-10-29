import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import Settings from "../src/features/settings/Settings";
import * as usersService from "../src/services/usersService";
import * as authService from "../src/services/authService";
import * as exportService from "../src/services/exportService";

vi.mock("../src/services/usersService");
vi.mock("../src/services/authService");
vi.mock("../src/services/exportService");

describe("Bloque F — Portabilidad de datos y Confianza", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    usersService.getMe.mockResolvedValue({
      _id: "user-123",
      username: "viajero",
      displayName: "Viajero Estelar",
      email: "viajero@kronos-space.com",
      emailVerified: true,
      preferences: {
        notifications: { inApp: true, email: false },
        content: { showSensitive: false },
        language: "es-MX",
        aiPersonality: "normal",
        feed: { mode: "latest", interests: ["espacio", "fotografía"] }
      }
    });
    authService.getSessions.mockResolvedValue([
      { id: "sess-1", current: true, userAgent: "Mozilla Chrome", expiresAt: new Date().toISOString() }
    ]);
    exportService.getExportStatus.mockResolvedValue({
      eligible: true,
      canExport: true,
      lastExportDate: null,
      nextAvailableDate: null
    });
    exportService.requestDataExport.mockResolvedValue({
      ok: true,
      message: "Exportación lista"
    });
    exportService.downloadDataExport.mockResolvedValue(true);
  });

  afterEach(() => {
    cleanup();
  });

  it("renderiza la sección de Tus datos / Portabilidad en Configuración", async () => {
    render(
      <MemoryRouter>
        <Settings onLogout={vi.fn()} />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText("Privacidad y datos")).toBeDefined();
      expect(screen.getByText("Descargar mis datos")).toBeDefined();
    });
  });

  it("expone el borrado definitivo de cuenta dentro de Privacidad y datos", async () => {
    render(
      <MemoryRouter>
        <Settings onLogout={vi.fn()} />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Eliminar tu cuenta" })).toBeDefined();
    });

    // Tres barreras antes de tocar la red: casilla, credencial y diálogo.
    const boton = screen.getByRole("button", { name: "Eliminar mi cuenta" });
    expect(boton.disabled).toBe(true);

    fireEvent.click(screen.getByLabelText(/Entiendo que esta acción es definitiva/));
    expect(boton.disabled).toBe(false);
    expect(screen.getByPlaceholderText("Confirma para eliminar")).toBeDefined();
  });

  it("una cuenta de Google sin contraseña confirma con su usuario", async () => {
    usersService.getMe.mockResolvedValueOnce({
      _id: "user-456",
      username: "viajero_google",
      displayName: "Viajero Google",
      email: "viajero@kronos-space.com",
      emailVerified: true,
      hasPassword: false,
      preferences: {}
    });

    render(
      <MemoryRouter>
        <Settings onLogout={vi.fn()} />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByPlaceholderText("viajero_google")).toBeDefined();
    });
    expect(screen.queryByPlaceholderText("Confirma para eliminar")).toBeNull();
  });

  it("enlaza los documentos del servicio desde Configuración", async () => {
    render(
      <MemoryRouter>
        <Settings onLogout={vi.fn()} />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText("Documentos del servicio")).toBeDefined();
    });

    const destinos = screen
      .getAllByRole("link")
      .map((enlace) => enlace.getAttribute("href"));

    for (const ruta of ["/terminos", "/privacidad", "/cookies", "/estado"]) {
      expect(destinos, `falta ${ruta}`).toContain(ruta);
    }
  });

  it("solicita y descarga los datos del usuario al hacer clic", async () => {
    render(
      <MemoryRouter>
        <Settings onLogout={vi.fn()} />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText("Descargar mis datos")).toBeDefined();
    });

    const downloadBtn = screen.getByText("Descargar mis datos");
    fireEvent.click(downloadBtn);

    await waitFor(() => {
      expect(exportService.requestDataExport).toHaveBeenCalledTimes(1);
      expect(exportService.downloadDataExport).toHaveBeenCalledTimes(1);
      expect(screen.getByText("Tu archivo de datos se ha descargado correctamente.")).toBeDefined();
    });
  });

  it("muestra mensaje de error si la exportación topa el límite semanal de tasa (429)", async () => {
    exportService.requestDataExport.mockRejectedValueOnce({
      response: {
        status: 429,
        data: {
          error: "Solo puedes solicitar una exportación por semana. Próxima disponible: 2026-09-28"
        }
      }
    });

    render(
      <MemoryRouter>
        <Settings onLogout={vi.fn()} />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText("Descargar mis datos")).toBeDefined();
    });

    const downloadBtn = screen.getByText("Descargar mis datos");
    fireEvent.click(downloadBtn);

    await waitFor(() => {
      expect(screen.getByText("Solo puedes solicitar una exportación por semana. Próxima disponible: 2026-09-28")).toBeDefined();
    });
  });

  // Regresión del defecto A-08: el botón solicitaba SIEMPRE la exportación
  // antes de descargar. Dentro de la ventana semanal eso responde 429, así que
  // un segundo clic (o un primero cuya descarga falló) quedaba bloqueado siete
  // días con el archivo ya disponible en el servidor.
  it("descarga sin volver a solicitar cuando la ventana semanal sigue abierta", async () => {
    exportService.getExportStatus.mockResolvedValue({
      eligible: false,
      canExport: false,
      canDownload: true,
      lastExportDate: new Date().toISOString(),
      nextAvailableDate: new Date(Date.now() + 86400000).toISOString()
    });

    render(
      <MemoryRouter>
        <Settings onLogout={vi.fn()} />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText("Descargar mis datos")).toBeDefined();
    });

    fireEvent.click(screen.getByText("Descargar mis datos"));

    await waitFor(() => {
      expect(exportService.downloadDataExport).toHaveBeenCalledTimes(1);
      expect(screen.getByText("Tu archivo de datos se ha descargado correctamente.")).toBeDefined();
    });

    // Lo decisivo: no se volvió a solicitar, que es lo que provocaba el 429.
    expect(exportService.requestDataExport).not.toHaveBeenCalled();
  });
});
