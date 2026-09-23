import { useEffect, useState } from "react";
import {
  MOTION_CHANGE_EVENT,
  motionEnabled,
  readMotionPreference,
  setMotionPreference,
  systemPrefersReduced
} from "../../lib/motionPreference.js";

/**
 * KRONOS — conmutador del bucle cinemático. Botón real (no decorativo):
 * guarda la preferencia en este navegador y refleja el estado del sistema.
 * Vive en el portón de entrada porque el movimiento de KRONOS es parte de
 * su lenguaje, y quien pide "menos movimiento" debe poder pedirlo — y
 * revertirlo — sin tocar ajustes del SO.
 */
export default function MotionToggle() {
  const [enabled, setEnabled] = useState(() => motionEnabled());
  const [explicit, setExplicit] = useState(() => Boolean(readMotionPreference()));

  useEffect(() => {
    const sync = () => {
      setEnabled(motionEnabled());
      setExplicit(Boolean(readMotionPreference()));
    };
    window.addEventListener(MOTION_CHANGE_EVENT, sync);
    return () => window.removeEventListener(MOTION_CHANGE_EVENT, sync);
  }, []);

  const hint =
    !explicit && systemPrefersReduced()
      ? "Tu sistema pedía menos movimiento, pero el bucle de KRONOS es el producto: corre por defecto. Páusalo aquí si aun así lo prefieres."
      : "Activa o pausa los bucles de la interfaz. La elección se recuerda en este navegador.";

  return (
    <button
      type="button"
      className="k-motion-toggle"
      aria-pressed={enabled}
      title={hint}
      onClick={() => setMotionPreference(enabled ? "reduced" : "full")}
    >
      <span className="k-motion-toggle-dot" aria-hidden="true" />
      <span>{enabled ? "Movimiento en bucle · activo" : "Movimiento en bucle · pausado"}</span>
    </button>
  );
}
