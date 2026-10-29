import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useShellMetrics } from "../src/layouts/useShellMetrics";

function Shell() {
  const ref = useShellMetrics();
  return <div ref={ref} data-testid="shell"><header className="k-app-topbar" /><nav className="k-app-tabbar" /><input aria-label="Mensaje" /></div>;
}

let viewport;
let observer;
let headerHeight;
let navVisible;
const originalHeight = window.innerHeight;
const originalViewport = window.visualViewport;

beforeEach(() => {
  headerHeight = 68;
  navVisible = true;
  Object.defineProperty(window, "innerHeight", { value: 844, configurable: true });
  viewport = new EventTarget();
  Object.assign(viewport, { height: 844, scale: 1 });
  Object.defineProperty(window, "visualViewport", { value: viewport, configurable: true });
  vi.stubGlobal("ResizeObserver", class {
    constructor(callback) { observer = { callback, observe: vi.fn(), disconnect: vi.fn() }; }
    observe(el) { observer.observe(el); }
    disconnect() { observer.disconnect(); }
  });
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function () {
    if (this.className === "k-app-topbar") return { height: headerHeight };
    if (this.className === "k-app-tabbar") return { height: navVisible ? 62 : 0, top: 772 };
    return { height: 0, top: 0 };
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  Object.defineProperty(window, "innerHeight", { value: originalHeight, configurable: true });
  Object.defineProperty(window, "visualViewport", { value: originalViewport, configurable: true });
});

describe("espacio real del shell", () => {
  it("reserva la barra, su margen y una separación sin adivinar la altura", () => {
    render(<Shell />);
    const shell = screen.getByTestId("shell");
    expect(shell.style.getPropertyValue("--k-shell-bottom")).toBe("84px");
    expect(shell.style.getPropertyValue("--k-topbar-h")).toBe("68px");
    expect(observer.observe).toHaveBeenCalledTimes(2);
  });

  it("actualiza el alto si aparece el aviso offline o el texto ocupa dos líneas", () => {
    render(<Shell />);
    headerHeight = 110;
    observer.callback();
    expect(screen.getByTestId("shell").style.getPropertyValue("--k-topbar-h")).toBe("110px");
  });

  it("no reserva una barra móvil inexistente en escritorio", () => {
    navVisible = false;
    render(<Shell />);
    expect(screen.getByTestId("shell").style.getPropertyValue("--k-shell-bottom")).toBe("0px");
  });

  it("usa visualViewport para el teclado y restaura la barra al cerrarlo", () => {
    render(<Shell />);
    screen.getByLabelText("Mensaje").focus();
    viewport.height = 400;
    viewport.dispatchEvent(new Event("resize"));
    const shell = screen.getByTestId("shell");
    expect(shell.hasAttribute("data-keyboard-open")).toBe(true);
    expect(shell.style.getPropertyValue("--k-viewport-h")).toBe("400px");
    expect(shell.style.getPropertyValue("--k-shell-bottom")).toBe("0px");
    viewport.height = 844;
    viewport.dispatchEvent(new Event("resize"));
    expect(shell.hasAttribute("data-keyboard-open")).toBe(false);
    expect(shell.style.getPropertyValue("--k-shell-bottom")).toBe("84px");
  });

  it("no confunde ampliar la página con abrir el teclado", () => {
    render(<Shell />);
    screen.getByLabelText("Mensaje").focus();
    Object.assign(viewport, { height: 422, scale: 2 });
    viewport.dispatchEvent(new Event("resize"));
    expect(screen.getByTestId("shell").hasAttribute("data-keyboard-open")).toBe(false);
  });

  it("sin visualViewport conserva respaldo y desconecta el observador al salir", () => {
    Object.defineProperty(window, "visualViewport", { value: undefined, configurable: true });
    const { unmount } = render(<Shell />);
    fireEvent(window, new Event("resize"));
    expect(screen.getByTestId("shell").style.getPropertyValue("--k-viewport-h")).toBe("844px");
    unmount();
    expect(observer.disconnect).toHaveBeenCalledOnce();
  });
});
