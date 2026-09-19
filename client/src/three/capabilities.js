// ============================================================
// KRONOS-3D — Capacidades gráficas del dispositivo
// ------------------------------------------------------------
// Este módulo NO importa three: debe poder ejecutarse en cualquier
// entorno (incluidos los tests en jsdom) ANTES de decidir si se
// descarga el chunk 3D. El resultado positivo se memoiza (una vez
// confirmado, WebGL no desaparece); el negativo se reintenta en el
// siguiente montaje por si el entorno cambia.
// ============================================================

let webglAvailable = null;

/**
 * ¿Puede este navegador crear un contexto WebGL (2 o 1)?
 *
 * Crea un contexto de prueba y lo libera de inmediato. Cualquier
 * fallo (WebGL desactivado, driver en blacklist, navegador sin
 * aceleración) cuenta como "no disponible" y deja paso al fallback
 * CSS cromado, sin que la aplicación falle.
 *
 * @returns {boolean}
 */
export function supportsWebGL() {
  if (webglAvailable === true) return true;
  if (typeof document === "undefined") return false;

  try {
    const canvas = document.createElement("canvas");
    const gl =
      canvas.getContext("webgl2") ||
      canvas.getContext("webgl") ||
      canvas.getContext("experimental-webgl");

    webglAvailable = Boolean(gl);

    // Liberar el contexto de prueba: no retenemos la GPU.
    const lose =
      gl && typeof gl.getExtension === "function"
        ? gl.getExtension("WEBGL_lose_context")
        : null;
    if (lose && typeof lose.loseContext === "function") {
      lose.loseContext();
    }
  } catch {
    webglAvailable = false;
  }

  return webglAvailable;
}

/**
 * Clasifica el dispositivo en tres niveles ("low" | "medium" |
 * "high") para dimensionar la escena: densidad de partículas, DPR
 * máximo y si se descarga el chunk de postprocessing.
 *
 * Conservador por diseño: ante la duda gana el nivel inferior. La
 * señal principal es puntero grueso / UA móvil (los móviles nunca
 * pasan de "low"); en escritorio cuentan núcleos y RAM declarada.
 *
 * @returns {{ level: string, isMobile: boolean, maxDpr: number, particles: number }}
 */
export function getGraphicsTier() {
  if (typeof window === "undefined") {
    return { level: "low", isMobile: false, maxDpr: 1, particles: 60 };
  }

  const nav = window.navigator || {};
  const ua = nav.userAgent || "";
  const coarsePointer =
    typeof window.matchMedia === "function" &&
    window.matchMedia("(pointer: coarse)").matches;

  const isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(ua) || coarsePointer;
  const cores = nav.hardwareConcurrency || 2;
  // navigator.deviceMemory solo existe en Chromium (GB aprox., tope 8);
  // el resto de navegadores no declara memoria y cae en "medium".
  const memoryGb = nav.deviceMemory || 6;

  let level = "medium";
  if (isMobile || cores <= 2) level = "low";
  if (!isMobile && cores >= 8 && memoryGb >= 8) level = "high";

  const config = {
    low: { maxDpr: 1.25, particles: 80 },
    medium: { maxDpr: 1.75, particles: 160 },
    high: { maxDpr: 2, particles: 260 },
  }[level];

  return {
    level,
    isMobile,
    maxDpr: config.maxDpr,
    particles: config.particles,
  };
}

/**
 * Solo para tests: reinicia la memoria de detección de WebGL para
 * poder alternar entre escenarios con y sin soporte en el mismo
 * archivo de specs.
 */
export function resetWebGLCacheForTests() {
  webglAvailable = null;
}
