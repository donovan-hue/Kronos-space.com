import React from "react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

// ---------------------------------------------------------------
// KRONOS-3D — specs de la capa 3D.
//
// jsdom no tiene WebGL: el chunk diferido (three + fiber + drei) se
// mockea por completo y se verifica el CONTRATO de la capa —
// detección de capacidades, fallback, aislamiento de fallos y
// props que cruzan la frontera lazy — sin renderizar WebGL real.
// ---------------------------------------------------------------

// Stub del módulo diferido: registra sus props y expone un marcador
// en el DOM. (Prefijo "mock" requerido por el hoisting de vi.mock.)
function Canvas3DStub(props) {
  return (
    <div
      data-testid="canvas3d"
      data-scene={props.scene}
      data-tier={props.tier}
      data-paused={String(props.paused)}
      data-reduced={String(props.reducedMotion)}
    />
  );
}

const mockCanvas3D = vi.fn(Canvas3DStub);

vi.mock("../src/three/Canvas3D", () => ({ default: mockCanvas3D }));

// Auth consulta /auth/google/config al montarse: sin backend en jsdom.
vi.mock("../src/services/apiClient", () => ({
  api: {
    get: vi.fn().mockResolvedValue({ data: { enabled: false } }),
    post: vi.fn(),
  },
}));

import SceneBackground from "../src/three/SceneBackground";
import {
  getGraphicsTier,
  resetWebGLCacheForTests,
  supportsWebGL,
} from "../src/three/capabilities";
import Auth from "../src/features/auth/Auth";
import AICenter from "../src/features/ai/AICenter";

/** Simula el resultado de HTMLCanvasElement.prototype.getContext. */
function mockContext(impl) {
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(impl);
}

/** jsdom no implementa matchMedia: se inyecta controlado por test. */
function mockMatchMedia(matches) {
  window.matchMedia = vi.fn().mockReturnValue({
    matches,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  });
}

/** Redefine (y devuelve un restaurador para) props de navigator. */
function setNavigatorProp(name, value) {
  Object.defineProperty(window.navigator, name, {
    value,
    configurable: true,
  });
  return () => {
    delete window.navigator[name];
  };
}

beforeEach(() => {
  resetWebGLCacheForTests();
  mockMatchMedia(false);
  mockContext(() => null);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------
// Capacidades gráficas
// ---------------------------------------------------------------

describe("KRONOS-3D · detección de capacidades", () => {
  test("sin WebGL disponible devuelve false sin lanzar errores", () => {
    mockContext(() => {
      throw new Error("WebGL desactivado");
    });

    expect(supportsWebGL()).toBe(false);
  });

  test("con contexto WebGL devuelve true", () => {
    mockContext(() => ({ getExtension: () => null }));

    expect(supportsWebGL()).toBe(true);
  });

  test("el resultado positivo se memoiza (no reabre contextos)", () => {
    mockContext(() => ({ getExtension: () => null }));
    supportsWebGL();

    // Aunque el navegador "cambie", el positivo ya confirmado persiste.
    mockContext(() => null);
    expect(supportsWebGL()).toBe(true);

    resetWebGLCacheForTests();
    expect(supportsWebGL()).toBe(false);
  });

  test("móviles (puntero grueso) siempre clasifican como tier low", () => {
    mockMatchMedia(true); // (pointer: coarse)
    const restoreUA = setNavigatorProp(
      "userAgent",
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)",
    );
    const restoreCores = setNavigatorProp("hardwareConcurrency", 6);
    const restoreMemory = setNavigatorProp("deviceMemory", 8);

    const tier = getGraphicsTier();

    expect(tier.isMobile).toBe(true);
    expect(tier.level).toBe("low");
    expect(tier.maxDpr).toBe(1.25);

    restoreUA();
    restoreCores();
    restoreMemory();
  });

  test("escritorio modesto clasifica como medium", () => {
    const restoreUA = setNavigatorProp(
      "userAgent",
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36",
    );
    const restoreCores = setNavigatorProp("hardwareConcurrency", 4);
    const restoreMemory = setNavigatorProp("deviceMemory", 4);

    const tier = getGraphicsTier();

    expect(tier.isMobile).toBe(false);
    expect(tier.level).toBe("medium");
    expect(tier.maxDpr).toBe(1.75);

    restoreUA();
    restoreCores();
    restoreMemory();
  });

  test("escritorio potente (8 núcleos, 8 GB) clasifica como high", () => {
    const restoreUA = setNavigatorProp(
      "userAgent",
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    );
    const restoreCores = setNavigatorProp("hardwareConcurrency", 8);
    const restoreMemory = setNavigatorProp("deviceMemory", 8);

    const tier = getGraphicsTier();

    expect(tier.level).toBe("high");
    expect(tier.maxDpr).toBe(2);
    expect(tier.particles).toBe(260);

    restoreUA();
    restoreCores();
    restoreMemory();
  });
});

// ---------------------------------------------------------------
// SceneBackground — frontera entre la app y el chunk 3D
// ---------------------------------------------------------------

describe("KRONOS-3D · SceneBackground", () => {
  test("sin WebGL muestra el fallback CSS y jamás carga el chunk 3D", async () => {
    mockContext(() => null);

    const { container } = render(<SceneBackground scene="auth" />);

    // El fallback cromado siempre está presente.
    expect(container.querySelector(".k-scene-fallback")).toBeTruthy();
    // La capa es decorativa: oculta para lectores de pantalla.
    expect(container.querySelector(".k-scene").getAttribute("aria-hidden")).toBe(
      "true",
    );

    await act(async () => {});

    // El módulo diferido nunca se pidió.
    expect(screen.queryByTestId("canvas3d")).toBeNull();
    expect(mockCanvas3D).not.toHaveBeenCalled();
  });

  test("con WebGL monta el canvas diferido con la escena y el tier pedidos", async () => {
    mockContext(() => ({ getExtension: () => null }));
    // jsdom no declara hardwareConcurrency: se fija un escritorio
    // modesto (4 núcleos / 4 GB) para obtener el tier "medium".
    const restoreUA = setNavigatorProp(
      "userAgent",
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36",
    );
    const restoreCores = setNavigatorProp("hardwareConcurrency", 4);
    const restoreMemory = setNavigatorProp("deviceMemory", 4);

    const { container } = render(<SceneBackground scene="auth" />);

    await act(async () => {});

    const canvas = screen.getByTestId("canvas3d");
    expect(canvas.dataset.scene).toBe("auth");
    expect(canvas.dataset.tier).toBe("medium");
    expect(canvas.dataset.reduced).toBe("false");
    // El fallback sigue montado debajo: es la red de seguridad.
    expect(container.querySelector(".k-scene-fallback")).toBeTruthy();

    restoreUA();
    restoreCores();
    restoreMemory();
  });

  test("reduced-motion del sistema SOLO ya no congela (bucle por defecto del propietario)", async () => {
    mockMatchMedia(true);
    localStorage.removeItem("kronos.motion-preference");
    mockContext(() => ({ getExtension: () => null }));

    render(<SceneBackground scene="auth" />);

    await act(async () => {});

    // Decisión 2026-09: el 3D es el producto; el SO no lo apaga.
    expect(screen.getByTestId("canvas3d").dataset.reduced).toBe("false");
  });

  test("la pausa EXPLÍCITA del conmutador congela la escena (pose fija)", async () => {
    mockMatchMedia(false);
    localStorage.setItem("kronos.motion-preference", "reduced");
    mockContext(() => ({ getExtension: () => null }));

    try {
      render(<SceneBackground scene="auth" />);
      await act(async () => {});
      expect(screen.getByTestId("canvas3d").dataset.reduced).toBe("true");
    } finally {
      localStorage.removeItem("kronos.motion-preference");
    }
  });

  test("un fallo al renderizar la escena no tumba la capa", async () => {
    const errorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    mockContext(() => ({ getExtension: () => null }));
    // React 19 reintenta el render tras un error: el fallo debe ser
    // persistente para verificar que el boundary lo contiene de verdad.
    mockCanvas3D.mockImplementation(() => {
      throw new Error("driver defectuoso");
    });

    const { container } = render(<SceneBackground scene="auth" />);

    await act(async () => {});

    // La escena se descarta, el fallback permanece: la app sigue viva.
    expect(screen.queryByTestId("canvas3d")).toBeNull();
    expect(container.querySelector(".k-scene-fallback")).toBeTruthy();
    expect(errorSpy).toHaveBeenCalled();

    // Restaurar el stub para los tests siguientes.
    mockCanvas3D.mockImplementation(Canvas3DStub);
    errorSpy.mockRestore();
  });

  test("la pérdida de contexto WebGL (onLost) descarta la escena", async () => {
    mockContext(() => ({ getExtension: () => null }));

    const { container } = render(<SceneBackground scene="auth" />);

    await act(async () => {});

    expect(screen.getByTestId("canvas3d")).toBeTruthy();

    // Simula el evento webglcontextlost: Canvas3D avisa vía onLost.
    const lastCall =
      mockCanvas3D.mock.calls[mockCanvas3D.mock.calls.length - 1][0];
    await act(async () => {
      lastCall.onLost();
    });

    expect(screen.queryByTestId("canvas3d")).toBeNull();
    expect(container.querySelector(".k-scene-fallback")).toBeTruthy();
  });
});

// ---------------------------------------------------------------
// Integración con las pantallas reales
// ---------------------------------------------------------------

describe("KRONOS-3D · integración con pantallas", () => {
  test("Auth monta la escena de fondo sin interferir con el formulario", async () => {
    mockContext(() => ({ getExtension: () => null }));

    const { container } = render(
      <MemoryRouter>
        <Auth initialMode="login" onLogin={() => {}} />
      </MemoryRouter>,
    );

    await act(async () => {});

    // Escena presente y posicionada como fondo del landing.
    expect(container.querySelector(".k-scene--auth")).toBeTruthy();
    expect(screen.getByTestId("canvas3d").dataset.scene).toBe("chrome-loop");

    // La UI funcional HTML sigue intacta: acciones del landing visibles.
    expect(
      screen.getByRole("button", { name: "Iniciar sesión" }),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Crear cuenta" })).toBeTruthy();
    expect(screen.getByText("KRONOSPACE")).toBeTruthy();
  });

  test("Auth sin WebGL funciona igual: solo el fallback CSS", async () => {
    mockContext(() => null);

    const { container } = render(
      <MemoryRouter>
        <Auth initialMode="login" onLogin={() => {}} />
      </MemoryRouter>,
    );

    await act(async () => {});

    expect(container.querySelector(".k-scene-fallback")).toBeTruthy();
    expect(screen.queryByTestId("canvas3d")).toBeNull();
    expect(
      screen.getByRole("button", { name: "Iniciar sesión" }),
    ).toBeTruthy();
  });

  test("AICenter monta el orbe de Kairos en su hero", async () => {
    mockContext(() => ({ getExtension: () => null }));

    const { container } = render(
      <MemoryRouter>
        <AICenter />
      </MemoryRouter>,
    );

    await act(async () => {});

    expect(container.querySelector(".k-scene--kairos")).toBeTruthy();
    expect(screen.getByTestId("canvas3d").dataset.scene).toBe("kairos-orb");

    // El hub conserva sus 4 herramientas + el acceso al historial.
    expect(screen.getByRole("heading", { name: "Kairos" })).toBeTruthy();
    const links = screen.getAllByRole("link");
    expect(links.length).toBe(5);
  });
});
