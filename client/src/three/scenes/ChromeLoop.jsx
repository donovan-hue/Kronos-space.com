import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import ChromeField from "./ChromeField";
import StudioLighting from "./StudioLighting";

const clamp = (delta) => Math.min(delta, 0.05);

/**
 * KRONOS-CROMO — "Bucle de metal líquido".
 *
 * El nuevo lenguaje visual del portón: NO hay planetas ni órbitas — un
 * nudo toroidal (trefoil, el símbolo del bucle sin fin) de cromo espejo
 * retorciéndose sobre sí mismo en rotación continua, flotando con un
 * vaivén lentísimo sobre negro absoluto. Un polvo de fragmentos metálicos
 * (ChromeField reutilizado: mismo draw-call barato, sin anillos) da la
 * sensación de materia suspendida, no de sistema solar.
 *
 * Un solo directionalLight verde (#3de892, el acento del proyecto)
 * raspa el cromo desde atrás: los reflejos del metal absorben el color
 * y es lo único de color en la escena — la firma verde-blanco sobre
 * negro sin pintar nada de verde.
 *
 * Rendimiento/accessibilidad (heredan la política de Canvas3D):
 * - gama baja: menos segmentos del nudo y menos polvo — nunca menos
 *   presencia;
 * - `reducedMotion` (pausa explícita del conmutador): sin rotación ni
 *   flote; frameloop "demand" pinta la pose fija y suelta la GPU;
 * - parallax de puntero mínimo (±2.4°): la señal de que es un objeto
 *   en un espacio, no un fondo plano.
 */
export default function ChromeLoop({ tier = "medium", reducedMotion = false }) {
  const knotRef = useRef(null);
  const floatRef = useRef(null);
  const parallaxRef = useRef(null);

  useFrame((state, delta) => {
    const d = clamp(delta);
    const knot = knotRef.current;
    const floater = floatRef.current;
    const group = parallaxRef.current;

    if (!reducedMotion) {
      if (knot) {
        // Dos ejes a velocidad inconmensurable: el nudo nunca repite su
        // pose exacta, pero el movimiento es lento y continuo — hipnótico,
        // no nervioso.
        knot.rotation.y += d * 0.17;
        knot.rotation.x += d * 0.058;
      }
      if (floater) {
        floater.position.y = Math.sin(state.clock.elapsedTime * 0.45) * 0.16;
        floater.rotation.z = Math.sin(state.clock.elapsedTime * 0.21) * 0.08;
      }
    }
    if (group) {
      const target = state.pointer;
      const ease = Math.min(1, d * 2.2);
      group.rotation.x += (target.y * 0.042 - group.rotation.x) * ease;
      group.rotation.y += (target.x * 0.042 - group.rotation.y) * ease;
    }
  });

  const low = tier === "low";

  return (
    <group ref={parallaxRef}>
      <StudioLighting />
      {/* Rim verde: la única fuente de color — pinta de verde-blanco los
          cantos del cromo sin tocar materiales ni paleta global. */}
      <directionalLight position={[-3.6, -2.2, -4.5]} intensity={0.75} color="#3de892" />

      <group ref={floatRef}>
        <mesh ref={knotRef} rotation={[0.42, 0.32, 0.1]}>
          <torusKnotGeometry
            args={[1.5, 0.3, low ? 96 : 220, low ? 12 : 26, 2, 3]}
          />
          <meshStandardMaterial
            color="#e9ebef"
            metalness={1}
            roughness={0.07}
            envMapIntensity={1.35}
          />
        </mesh>
      </group>

      {/* Polvo metálico suspendido (no orbital: flatten 1, giro ínfimo). */}
      <ChromeField
        count={low ? 56 : 130}
        reducedMotion={reducedMotion}
        innerRadius={3.4}
        spread={8.2}
        flatten={0.9}
        spin={0.004}
      />
    </group>
  );
}
