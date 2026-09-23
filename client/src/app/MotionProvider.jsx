import { useEffect, useState } from "react";
import { MotionConfig } from "motion/react";
import { MOTION_CHANGE_EVENT, readMotionPreference } from "../lib/motionPreference.js";

/**
 * Configuración global de Motion para KRONOS.
 *
 * - Sin preferencia guardada: reducedMotion="user" (respeta
 *   prefers-reduced-motion del sistema, como siempre).
 * - El conmutador de la portada puede contradecir explícitamente al
 *   sistema ("full" → las transformaciones corren) o reforzarlo
 *   ("reduced" → solo opacidad). La elección se escucha en vivo.
 * - Transición por defecto corta y con curva suave: las animaciones
 *   KRONOS son discretas (0.2s), nunca teatrales.
 */
function modeFor(pref) {
  if (pref === "reduced") return "always";
  if (pref === "full") return "never";
  return "user";
}

export default function MotionProvider({ children }) {
  const [pref, setPref] = useState(() => readMotionPreference());
  useEffect(() => {
    const sync = () => setPref(readMotionPreference());
    window.addEventListener(MOTION_CHANGE_EVENT, sync);
    return () => window.removeEventListener(MOTION_CHANGE_EVENT, sync);
  }, []);

  return (
    <MotionConfig
      reducedMotion={modeFor(pref)}
      transition={{ duration: 0.2, ease: [0.21, 0.6, 0.35, 1] }}
    >
      {children}
    </MotionConfig>
  );
}
