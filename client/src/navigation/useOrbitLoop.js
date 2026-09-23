import { useEffect, useRef } from "react";
import { orbitFrame } from "./orbitMotion.js";
import { motionEnabled } from "../lib/motionPreference.js";

/**
 * KRONOS — motor del bucle orbital (rAF → CSS vars).
 *
 * Escribe --x/--y y z-index directamente sobre cada nodo en vez de
 * re-renderizar React por frame: cero trabajo de reconciliación, cero
 * GC churn. El CSS ya deriva de esas variables la posición elíptica,
 * la profundidad (translateZ) y la opacidad, así que el giro es el
 * mismo sistema de coordenadas que el layout estático.
 *
 * Comportamiento (todo con propósito, nunca decoración suelta):
 * - Solo rueda con el mapa abierto y en modo espacial (compacto = no).
 * - Al hacer hover/focus en un nodo el campo se frena con suavidad y se
 *   detiene: apuntar a algo en movimiento no puede ser un test de reflejos.
 * - Pausa total con la pestaña oculta (visibilitychange) y con
 *   prefers-reduced-motion (el campo queda en su composición estática,
 *   que es funcional por sí sola).
 */
const EASE_MS = 260; // tiempo de arranque/frenado de la velocidad
const MAX_DT = 64; // clamp de frames largos (pestaña estrangulada)
const STOP_EPS = 0.0015;

export function useOrbitLoop({ active, frozen, getTargets }) {
  const frozenRef = useRef(frozen);
  frozenRef.current = frozen;
  const targetsRef = useRef(getTargets);
  targetsRef.current = getTargets;

  useEffect(() => {
    if (!active) return undefined;
    if (typeof window === "undefined") {
      return undefined; // sin entorno de navegador (tests): campo estático
    }
    if (!motionEnabled()) {
      return undefined; // reduced-motion del sistema, o preferencia "reduced"
    }

    let raf = 0;
    let speed = 0;
    let phase = 0;
    let last = 0;
    let visible = document.visibilityState !== "hidden";

    const frame = (now) => {
      raf = window.requestAnimationFrame(frame);
      const dt = Math.min(MAX_DT, last ? now - last : 16);
      last = now;
      if (!visible) return;

      const target = frozenRef.current ? 0 : 1;
      speed += (target - speed) * Math.min(1, dt / EASE_MS);
      if (target === 0 && speed < STOP_EPS) speed = 0;
      if (speed === 0) return;

      phase += dt * speed;
      const collect = targetsRef.current;
      if (!collect) return;
      for (const { el, node } of collect()) {
        const f = orbitFrame(node, phase);
        el.style.setProperty("--x", f.x);
        el.style.setProperty("--y", f.y);
        el.style.zIndex = String(f.z);
      }
    };
    raf = window.requestAnimationFrame(frame);

    const onVisibility = () => {
      visible = document.visibilityState !== "hidden";
      last = 0; // no salta al volver
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [active]);
}
