import { Component, Suspense, lazy, useEffect, useMemo, useRef, useState } from "react";
import { getGraphicsTier, supportsWebGL } from "./capabilities";
import { MOTION_CHANGE_EVENT, readMotionPreference } from "../lib/motionPreference.js";

// El chunk 3D completo (three + fiber + drei + escenas) solo se
// descarga cuando esta capa llega a montarse en un dispositivo con
// WebGL: la aplicación principal nunca paga ese coste.
const Canvas3D = lazy(() => import("./Canvas3D"));

/**
 * Aísla los fallos de la escena (contexto perdido, driver
 * defectuoso): el canvas se descarta en silencio y bajo él sigue
 * el fallback cromado CSS. La app jamás se entera del error.
 */
class SceneErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { failed: false };
  }

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error) {
    // Trazabilidad del fallo sin romper la experiencia.
    console.error("[KRONOS-3D] escena descartada:", error);
    if (typeof this.props.onError === "function") {
      this.props.onError(error);
    }
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}

function sceneFrozen() {
  // Decisión del propietario (2026-09): el bucle 3D corre por defecto
  // para todos — incluida una OS que pida reduced-motion — y solo se
  // congela con la pausa EXPLÍCITA del conmutador del portón
  // ("reduced" en kronos.motion-preference). La escena además se detiene
  // sola fuera del viewport y sin WebGL.
  return readMotionPreference() === "reduced";
}

/**
 * Capa 3D decorativa de KRONOS.
 *
 * Reglas de la capa:
 *  - Aislada: toda la maquinaria three vive tras un React.lazy; este
 *    wrapper es lo único que entra en el bundle principal (~2 KB).
 *  - Progresiva: sin WebGL (o si la escena falla) queda el fallback
 *    CSS plata/negro, siempre montado debajo del canvas.
 *  - Inerte: aria-hidden + pointer-events none; jamás interfiere con
 *    la UI funcional HTML/React.
 *  - Con respeto: prefers-reduced-motion congela la escena en una
 *    pose fija y fuera del viewport el render se detiene por completo.
 *
 * @param {{ scene: "auth" | "kairos-orb", className?: string }} props
 */
export default function SceneBackground({ scene = "auth", className = "" }) {
  const containerRef = useRef(null);
  const tier = useMemo(getGraphicsTier, []);
  const [reducedMotion, setReducedMotion] = useState(sceneFrozen);
  const [visible, setVisible] = useState(true);
  const [failed, setFailed] = useState(false);
  const supported = supportsWebGL();

  // La preferencia es dinámica: pausar/reactivar desde el portón
  // congela o suelta la escena al instante, sin recargar.
  useEffect(() => {
    const sync = () => setReducedMotion(sceneFrozen());
    window.addEventListener(MOTION_CHANGE_EVENT, sync);
    return () => window.removeEventListener(MOTION_CHANGE_EVENT, sync);
  }, []);

  // Fuera del viewport el render se detiene por completo (frameloop
  // "demand" sin invalidaciones: 0 GPU mientras no se ve). Con la
  // pestaña en segundo plano el propio rAF del navegador ya para.
  useEffect(() => {
    const node = containerRef.current;
    if (!node || typeof IntersectionObserver === "undefined") {
      return undefined;
    }
    const observer = new IntersectionObserver(
      ([entry]) => setVisible(entry.isIntersecting),
      { rootMargin: "96px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={containerRef}
      className={`k-scene ${className}`.trim()}
      aria-hidden="true"
    >
      {/* Fallback cromado CSS: siempre presente. Es lo que se ve sin
          WebGL, mientras viaja el chunk 3D y si la escena se descarta. */}
      <div className="k-scene-fallback" />
      {supported && !failed && (
        <SceneErrorBoundary onError={() => setFailed(true)}>
          <Suspense fallback={null}>
            <Canvas3D
              scene={scene}
              tier={tier.level}
              maxDpr={tier.maxDpr}
              particles={tier.particles}
              paused={!visible}
              reducedMotion={reducedMotion}
              onLost={() => setFailed(true)}
            />
          </Suspense>
        </SceneErrorBoundary>
      )}
    </div>
  );
}
