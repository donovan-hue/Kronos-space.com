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
});
