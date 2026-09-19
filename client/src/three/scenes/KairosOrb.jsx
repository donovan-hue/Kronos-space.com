import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import ChromeField from "./ChromeField";
import StudioLighting from "./StudioLighting";

const step = (delta) => Math.min(delta, 0.05);

/**
 * Núcleo del orbe: esfera de cromo espejo, un anillo fino inclinado
 * y un satélite que lo orbita. La rotación es lenta y constante —
 * presencia, no espectáculo: comparte hero con el titular de Kairos.
 */
function OrbCore({ reducedMotion }) {
  const ringPivot = useRef(null);

  useFrame((_, delta) => {
    if (reducedMotion) return;
    ringPivot.current.rotation.z += step(delta) * 0.45;
  });

  return (
    <group>
      <mesh>
        <sphereGeometry args={[1.05, 48, 48]} />
        <meshStandardMaterial
          color="#e9ebef"
          metalness={1}
          roughness={0.08}
          envMapIntensity={1.25}
        />
      </mesh>
      <group rotation={[1.2, 0.25, 0]}>
        <mesh>
          <torusGeometry args={[1.75, 0.028, 16, 160]} />
          <meshStandardMaterial
            color="#e9ebef"
            metalness={1}
            roughness={0.14}
            envMapIntensity={1.1}
          />
        </mesh>
        {/* Satélite cromado orbitando el anillo. */}
        <group ref={ringPivot}>
          <mesh position={[1.75, 0, 0]}>
            <sphereGeometry args={[0.085, 24, 24]} />
            <meshStandardMaterial
              color="#ffffff"
              metalness={1}
              roughness={0.05}
              emissive="#c9ced6"
              emissiveIntensity={0.25}
            />
          </mesh>
        </group>
      </group>
    </group>
  );
}

/**
 * Orbe decorativo del hub de Kairos (/kairos). Vive dentro del hero
 * (el propio hero lo recorta con overflow: hidden), desplazado a la
 * derecha del titular, con polvo de cromo más escaso que en la
 * escena de acceso. Sin postprocessing: en un lienzo pequeño el
 * render limpio ya lee como joyería.
 */
export default function KairosOrb({
  tier = "medium",
  particles = 160,
  reducedMotion = false,
}) {
  return (
    <>
      <fog attach="fog" args={["#000000", 6, 15]} />
      <StudioLighting />
      <group position={[3.2, 0, 0]}>
        <OrbCore reducedMotion={reducedMotion} />
        <ChromeField
          count={Math.max(24, Math.round(particles / 3))}
          reducedMotion={reducedMotion}
          innerRadius={2.1}
          spread={2.4}
          flatten={0.5}
          spin={0.03}
        />
      </group>
    </>
  );
}
