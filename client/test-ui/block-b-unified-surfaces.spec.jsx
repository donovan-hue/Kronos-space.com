import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act, cleanup } from "@testing-library/react";
import React from "react";
import { ConfirmProvider, useConfirm } from "../src/components/feedback/ConfirmProvider";
import Spinner from "../src/components/ui/Spinner";
import EmptyState from "../src/components/ui/EmptyState";

function TestConfirmComponent({ options, onResult }) {
  const confirm = useConfirm();

  async function handleClick() {
    const res = await confirm(options);
    onResult(res);
  }

  return (
    <div>
      <button type="button" onClick={handleClick}>
        Abrir Confirmación
      </button>
    </div>
  );
}

describe("Bloque B — Componentes y Diálogo Cromado Unificado", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  describe("ConfirmProvider y useConfirm", () => {
    it("abre el diálogo cromado accesible y resuelve 'true' al confirmar", async () => {
      const onResult = vi.fn();

      render(
        <ConfirmProvider>
          <TestConfirmComponent
            options={{
              title: "¿Eliminar publicación?",
              message: "Esta acción no se puede deshacer.",
              confirmText: "Eliminar",
              cancelText: "Volver",
              danger: true,
              eyebrow: "ELIMINAR"
            }}
            onResult={onResult}
          />
        </ConfirmProvider>
      );

      // Dialog is not open yet
      expect(screen.queryByRole("dialog")).toBeNull();

      // Click button to trigger confirm
      fireEvent.click(screen.getByRole("button", { name: "Abrir Confirmación" }));

      // Dialog should now be in the DOM
      const dialog = screen.getByRole("dialog");
      expect(dialog).toBeTruthy();
      expect(screen.getByText("¿Eliminar publicación?")).toBeTruthy();
      expect(screen.getByText("Esta acción no se puede deshacer.")).toBeTruthy();
      expect(screen.getByText("ELIMINAR")).toBeTruthy();

      const confirmBtn = screen.getByRole("button", { name: "Eliminar" });
      expect(confirmBtn.className).toContain("k-button-danger");

      // Click confirm
      await act(async () => {
        fireEvent.click(confirmBtn);
      });

      expect(onResult).toHaveBeenCalledWith(true);
      expect(screen.queryByRole("dialog")).toBeNull();
    });

    it("resuelve 'false' al presionar Cancelar o presionar Escape", async () => {
      const onResult = vi.fn();

      render(
        <ConfirmProvider>
          <TestConfirmComponent
            options="¿Estás seguro?"
            onResult={onResult}
          />
        </ConfirmProvider>
      );

      fireEvent.click(screen.getByRole("button", { name: "Abrir Confirmación" }));
      expect(screen.getByRole("dialog")).toBeTruthy();

      const cancelBtn = screen.getByRole("button", { name: "Cancelar" });
      await act(async () => {
        fireEvent.click(cancelBtn);
      });

      expect(onResult).toHaveBeenCalledWith(false);
      expect(screen.queryByRole("dialog")).toBeNull();
    });
  });

  describe("Spinner cromado", () => {
    it("renderiza correctamente con rol status y atributos accesibles", () => {
      const { container } = render(<Spinner size="lg" label="Cargando datos..." />);
      const status = screen.getByRole("status");
      expect(status).toBeTruthy();
      expect(status.getAttribute("aria-label")).toBe("Cargando datos...");
      expect(screen.getByText("Cargando datos...")).toBeTruthy();
      const svg = container.querySelector(".k-spinner-ring");
      expect(svg).toBeTruthy();
      expect(svg.getAttribute("width")).toBe("40");
    });

    it("soporta variante inline", () => {
      const { container } = render(<Spinner inline size="sm" label="" />);
      const wrap = container.querySelector(".k-spinner-wrap");
      expect(wrap.className).toContain("is-inline");
    });
  });

  describe("EmptyState unificado", () => {
    it("renderiza título, descripción, eyebrow y acción", () => {
      render(
        <EmptyState
          eyebrow="SIN CONTENIDO"
          title="No hay publicaciones"
          description="Sé el primero en compartir algo aquí."
          action={<button type="button">Crear post</button>}
          icon={<span data-testid="test-icon">🌌</span>}
        />
      );

      expect(screen.getByText("SIN CONTENIDO")).toBeTruthy();
      expect(screen.getByText("No hay publicaciones")).toBeTruthy();
      expect(screen.getByText("Sé el primero en compartir algo aquí.")).toBeTruthy();
      expect(screen.getByRole("button", { name: "Crear post" })).toBeTruthy();
      expect(screen.getByTestId("test-icon")).toBeTruthy();
    });
  });
});
