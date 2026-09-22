import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import SupportDialog from "../src/features/users/SupportDialog";
import * as supportService from "../src/services/supportService";

vi.mock("../src/services/supportService", () => ({
  sendCreatorTip: vi.fn(),
  getCreatorSupport: vi.fn(),
  getSupportHistory: vi.fn()
}));

describe("Bloque G — Escala, Federación y Apoyo a Creadores", () => {
  const mockCreator = {
    _id: "user-creator-123",
    username: "astro_juan",
    displayName: "Juan Astrónomo"
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it("SupportDialog muestra opciones de niveles de apoyo y campos de mensaje", () => {
    renderSupportDialog({ open: true, creator: mockCreator });

    expect(screen.getByText("Apoyar a @astro_juan")).toBeDefined();
    // Los niveles son apoyo simbólico en créditos Kronos (★): no hay
    // pasarela de pago, así que la interfaz no puede mostrar importes.
    expect(screen.getByText("10 ★")).toBeDefined();
    expect(screen.getByText("50 ★")).toBeDefined();
    expect(screen.getByText("200 ★")).toBeDefined();
    expect(screen.getByText(/no se procesa ningún pago real/i)).toBeDefined();
    expect(screen.getByPlaceholderText("¡Excelente trabajo, sigue creando!")).toBeDefined();
    expect(screen.getByText("Enviar como usuario anónimo")).toBeDefined();
  });

  it("permite seleccionar un nivel de apoyo y enviar propina", async () => {
    supportService.sendCreatorTip.mockResolvedValue({ success: true });
    const handleSuccess = vi.fn();
    const handleClose = vi.fn();

    renderSupportDialog({
      open: true,
      creator: mockCreator,
      onClose: handleClose,
      onSuccess: handleSuccess
    });

    // Cambiar a nivel Destacado (200 ★)
    const supernovaBtn = screen.getByText("200 ★");
    fireEvent.click(supernovaBtn);

    // Escribir mensaje
    const messageInput = screen.getByPlaceholderText("¡Excelente trabajo, sigue creando!");
    fireEvent.change(messageInput, { target: { value: "¡Sigue adelante con tu contenido!" } });

    // Enviar
    const submitBtn = screen.getByText("Enviar apoyo");
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(supportService.sendCreatorTip).toHaveBeenCalledWith({
        creatorId: "user-creator-123",
        amount: 200,
        tier: "supernova",
        message: "¡Sigue adelante con tu contenido!",
        anonymous: false
      });
      expect(handleSuccess).toHaveBeenCalled();
      expect(handleClose).toHaveBeenCalled();
    });
  });

  it("no renderiza el diálogo si open es false", () => {
    renderSupportDialog({ open: false, creator: mockCreator });
    expect(screen.queryByText("Apoyar a @astro_juan")).toBeNull();
  });
});

function renderSupportDialog(props) {
  const { render } = require("@testing-library/react");
  return render(<SupportDialog {...props} />);
}
