/**
 * KRONOS — preferencia de movimiento (bucles cinemáticos).
 *
 * El sitio vive de bucles continuos (mapa orbital, portada). Por defecto
 * se respeta `prefers-reduced-motion` del sistema; pero el usuario puede
 * contradecirlo explícitamente desde el portón de entrada: eso escribe
 * data-k-motion="full|reduced" en <html>, que es la llave con la que las
 * capas CSS levantadas (flow.css, orbit-map.css y los bloques globales de
 * reduced-motion) deciden si animan o se congelan. Sin JavaScript, sin
 * preferencia y sin sistema que pida reducción: full por defecto.
 */

const STORAGE_KEY = "kronos.motion-preference";

export const MOTION_CHANGE_EVENT = "kronos:motionchange";

export function readMotionPreference() {
  try {
    const value = window.localStorage.getItem(STORAGE_KEY);
    return value === "full" || value === "reduced" ? value : null;
  } catch {
    return null;
  }
}

export function systemPrefersReduced() {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/**
 * true = los bucles pueden correr.
 *
 * DECISIÓN EXPLÍCITA DEL PROPIETARIO (2026-09): el movimiento en bucle es
 * parte del producto y corre POR DEFECTO para todos, incluso si el sistema
 * pide "reduced-motion". El conmutador del portón es el opt-out real (se
 * recuerda en este navegador); con "reduced" guardado, todo se congela.
 */
export function motionEnabled() {
  return readMotionPreference() !== "reduced";
}

export function applyMotionPreference(pref) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  if (pref === "full") root.setAttribute("data-k-motion", "full");
  else if (pref === "reduced") root.setAttribute("data-k-motion", "reduced");
  else root.removeAttribute("data-k-motion");
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(MOTION_CHANGE_EVENT));
  }
}

export function setMotionPreference(pref) {
  try {
    if (pref) window.localStorage.setItem(STORAGE_KEY, pref);
    else window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* almacenamiento no disponible: el cambio vive solo en memoria */
  }
  applyMotionPreference(pref);
}
