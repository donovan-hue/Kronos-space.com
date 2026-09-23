import { Suspense, lazy, useEffect } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { PerformanceMonitor } from "@react-three/drei";
import KronosGyroscope from "./scenes/KronosGyroscope";
import KairosOrb from "./scenes/KairosOrb";
import OrbitField from "./scenes/OrbitField";
import ChromeLoop from "./scenes/ChromeLoop";

// El postprocessing (Bloom) viaja en un chunk propio: solo lo
// descargan los dispositivos de gama media/alta que montan la escena
// cinematográfica. Los móviles jamás lo piden.
const Effects3D = lazy(() => import("./Effects3D"));

/**
 * Registro de escenas de KRONOS. Añadir una experiencia nueva es
 * sumar una entrada aquí + su componente en ./scenes: el resto de la
 * app solo conoce el nombre ("auth", "kairos-orb", ...).
 */
const SCENES = {
  // Fondo cinematográfico de las pantallas de acceso (login/registro).
  auth: {
    component: KronosGyroscope,
    camera: { position: [0, 0.5, 11], fov: 42 },
    postprocessing: true,
  },
  // Orbe cromado decorativo del hub de Kairos.
  "kairos-orb": {
    component: KairosOrb,
    camera: { position: [0, 0.15, 5.4], fov: 38 },
    postprocessing: false,
  },
  // Campo de partículas del mapa orbital de navegación. Vive DETRÁS de
  // la UI HTML real (links con href), no la sustituye: es una señal de
  // profundidad, no la navegación misma.
  "orbit-field": {
    component: OrbitField,
    camera: { position: [0, 0.2, 8.5], fov: 46 },
    postprocessing: false,
  },
  // Bucle de metal líquido del portón (KRONOS-CROMO): nudo trefoil
  // cromo + polvo metálico, rotación continua. Nada orbital: el logo es
  // un bucle, no un sistema solar.
  "chrome-loop": {
    component: ChromeLoop,
    camera: { position: [0, 0.35, 7.6], fov: 44 },
    postprocessing: true,
  },
};

/**
 * Con frameloop "demand" (movimiento reducido o escena pausada) el
 * repintado hay que pedirlo a mano: esta pieza invalida una vez por
 * cambio de condición para dejar la pose fija pintada en el canvas.
 */
function RenderOnDemand({ trigger }) {
  const invalidate = useThree((state) => state.invalidate);
  useEffect(() => {
    invalidate();
  }, [invalidate, trigger]);
  return null;
}

/**
 * Degradación progresiva: si los FPS caen de forma sostenida el DPR
 * baja a 1 y se queda ahí (nunca re-escala hacia arriba). Los
 * dispositivos modestos reciben una escena más nítida-pero-más-lenta
 * en lugar de una experiencia a tirones.
 */
function AdaptiveQuality() {
  const setDpr = useThree((state) => state.setDpr);
  return <PerformanceMonitor onDecline={() => setDpr(1)} />;
}

/**
 * Canvas 3D real. Se carga EXCLUSIVAMENTE vía React.lazy desde
 * SceneBackground: este módulo (y todo three) queda en un chunk
 * separado que la app principal nunca descarga.
 */
export default function Canvas3D({
  scene = "auth",
  tier = "medium",
  maxDpr = 1.75,
  particles = 160,
  paused = false,
  reducedMotion = false,
  onLost = null,
}) {
  const config = SCENES[scene] || SCENES.auth;
  const Scene = config.component;
  // "always": animación completa. "demand": un solo frame (pose fija)
  // y 0 GPU hasta la siguiente invalidación — sirve tanto para
  // prefers-reduced-motion como para pausar fuera del viewport.
  const frameloop = paused || reducedMotion ? "demand" : "always";

  return (
    <div className="k-scene-canvas-wrap">
      <Canvas
        frameloop={frameloop}
        dpr={[1, maxDpr]}
        camera={config.camera}
        gl={{
          antialias: tier !== "low",
          powerPreference: "high-performance",
          stencil: false,
          alpha: false,
        }}
        onCreated={({ gl }) => {
          // Si el navegador revoca el contexto (cambio de GPU,
          // suspensión del sistema, driver), la escena se descarta y
          // queda el fallback CSS en lugar de un canvas muerto.
          gl.domElement.addEventListener(
            "webglcontextlost",
            (event) => {
              event.preventDefault();
              if (typeof onLost === "function") onLost();
            },
            { once: true },
          );
        }}
      >
        <color attach="background" args={["#000000"]} />
        <AdaptiveQuality />
        <Scene tier={tier} particles={particles} reducedMotion={reducedMotion} />
        {config.postprocessing && tier !== "low" && (
          <Suspense fallback={null}>
            <Effects3D tier={tier} />
          </Suspense>
        )}
        {frameloop === "demand" && <RenderOnDemand trigger={frameloop} />}
      </Canvas>
    </div>
  );
}
