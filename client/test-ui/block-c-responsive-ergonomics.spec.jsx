import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import ShortcutsModal from "../src/components/shortcuts/ShortcutsModal";

describe("Bloque C — Responsive, Atajos y Ergonomía", () => {
  afterEach(() => {
    cleanup();
  });

  it("ShortcutsModal no renderiza nada cuando isOpen es false", () => {
    const { container } = render(<ShortcutsModal isOpen={false} onClose={() => {}} />);
    expect(container.querySelector(".k-shortcuts-dialog")).toBeNull();
  });

  it("ShortcutsModal muestra todos los atajos de teclado clave cuando isOpen es true", () => {
    render(<ShortcutsModal isOpen={true} onClose={() => {}} />);
    expect(screen.getByText("Atajos de teclado")).toBeDefined();
    expect(screen.getByText("⌘K / Ctrl+K")).toBeDefined();
    expect(screen.getByText("Esc")).toBeDefined();
    expect(screen.getByText("?")).toBeDefined();
  });

  it("ShortcutsModal llama a onClose al presionar el botón de cierre o Entendido", () => {
    const onClose = vi.fn();
    render(<ShortcutsModal isOpen={true} onClose={onClose} />);
    const button = screen.getByText("Entendido");
    fireEvent.click(button);
    expect(onClose).toHaveBeenCalled();
  });

  it("ShortcutsModal responde a la tecla Escape", () => {
    const onClose = vi.fn();
    render(<ShortcutsModal isOpen={true} onClose={onClose} />);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });

  it("El manifiesto web PWA tiene los campos requeridos para instalación", async () => {
    const fs = await import("fs");
    const manifestRaw = fs.readFileSync("./public/manifest.webmanifest", "utf-8");
    const manifest = JSON.parse(manifestRaw);
    expect(manifest.name).toBe("Kronos Space");
    expect(manifest.display).toBe("standalone");
    expect(manifest.theme_color).toBe("#000000");
    expect(manifest.background_color).toBe("#000000");
    expect(Array.isArray(manifest.icons)).toBe(true);
    expect(manifest.icons.length).toBeGreaterThan(0);
  });

  it("design-tokens.css define los breakpoints y variables de safe area para responsive", async () => {
    const fs = await import("fs");
    const tokens = fs.readFileSync("./src/styles/design-tokens.css", "utf-8");
    expect(tokens.includes("--k-bp-phone-sm")).toBe(true);
    expect(tokens.includes("--k-bp-phone")).toBe(true);
    expect(tokens.includes("--k-bp-tablet")).toBe(true);
    expect(tokens.includes("--k-bp-laptop")).toBe(true);
    expect(tokens.includes("--k-bp-wide")).toBe(true);
    expect(tokens.includes("--k-safe-bottom")).toBe(true);
  });
});
