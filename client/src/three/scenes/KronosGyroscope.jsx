import { useEffect, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import ChromeField from "./ChromeField";
import StudioLighting from "./StudioLighting";

// Cromo pulido: reflexión casi de espejo.
const CHROME = { color: "#e9ebef", metalness: 1, roughness: 0.13 };

/** Delta acotado: evita saltos de animación al volver de segundo plano. */
const step = (delta) => Math.min(delta, 0.05);

/**
 * Mecanismo central: tres anillos cromados concéntricos girando cada
 * uno en su propio eje, a velocidades lentas y distintas. El núcleo
 * es acero satinado. Juntos leen como el giroscopio de un reloj de
 * alta gama — la materialización 3D del reloj CSS del landing.
 */
function Gyroscope({ reducedMotion }) {
  const outer = useRef(null);
  const middle = useRef(null);
  const inner = useRef(null);

  useFrame((_, delta) => {
    if (reducedMotion) return;
    const d = step(delta);
    outer.current.rotation.x += d * 0.1;
    outer.current.rotation.y += d * 0.05;
    middle.current.rotation.y += d * 0.16;
    middle.current.rotation.z += d * 0.06;
    inner.current.rotation.x += d * 0.22;
    inner.current.rotation.z += d * 0.12;
  });

  return (
    <group>
      <mesh ref={outer} rotation={[1.25, 0, 0]}>
        <torusGeometry args={[3.45, 0.04, 24, 220]} />
        <meshStandardMaterial {...CHROME} envMapIntensity={1.15} />
      </mesh>
      <mesh ref={middle} rotation={[0.35, 0, 0.65]}>
        <torusGeometry args={[2.95, 0.055, 24, 200]} />
        <meshStandardMaterial {...CHROME} envMapIntensity={1} />
      </mesh>
      <mesh ref={inner} rotation={[-0.45, 0, -0.3]}>
        <torusGeometry args={[2.4, 0.045, 24, 180]} />
        <meshStandardMaterial {...CHROME} envMapIntensity={0.95} />
      </mesh>
      <mesh>
        <sphereGeometry args={[0.52, 48, 48]} />
        <meshStandardMaterial
          color="#a7adb6"
          metalness={1}
          roughness={0.32}
          envMapIntensity={1.2}
        />
      </mesh>
    </group>
  );
}

/**
 * Deriva de cámara lenta + parallax sutil con el puntero (solo
 * escritorio): profundidad cinematográfica sin interrumpir jamás la
 * interacción real — escucha pasiva en window, el canvas sigue
 * teniendo pointer-events: none.
 */
function CameraDrift({ reducedMotion, enablePointer }) {
  const pointer = useRef({ x: 0, y: 0 });

  useEffect(() => {
    if (reducedMotion || !enablePointer || typeof window === "undefined") {
      return undefined;
    }
    const onMove = (event) => {
      pointer.current.x = (event.clientX / window.innerWidth) * 2 - 1;
      pointer.current.y = (event.clientY / window.innerHeight) * 2 - 1;
    };
    window.addEventListener("mousemove", onMove, { passive: true });
    return () => window.removeEventListener("mousemove", onMove);
  }, [reducedMotion, enablePointer]);

  useFrame(({ camera, clock }, delta) => {
    if (reducedMotion) return;
    const t = clock.elapsedTime;
    const d = step(delta);
    const targetX = Math.sin(t * 0.07) * 0.5 + pointer.current.x * 0.35;
    const targetY = 0.5 + Math.cos(t * 0.05) * 0.25 - pointer.current.y * 0.25;
    const ease = Math.min(1, d * 2.2);
    camera.position.x += (targetX - camera.position.x) * ease;
    camera.position.y += (targetY - camera.position.y) * ease;
    camera.lookAt(0, 0, 0);
  });

  return null;
}

/**
 * Fondo cinematográfico de las pantallas de acceso de KRONOS.
 *
 * Negro puro, niebla para profundidad, un giroscopio cromado en el
 * centro y polvo de metal en órbita. La composición queda ENMARCANDO
 * el contenido HTML (los anillos pasan por detrás del titular), y la
 * viñeta CSS (.k-scene--auth::after) garantiza el contraste del
 * texto sin importar lo que haga la escena.
 */
export default function KronosGyroscope({
  tier = "medium",
  particles = 160,
  reducedMotion = false,
}) {
  return (
    <>
      <fog attach="fog" args={["#000000", 10, 26]} />
      <StudioLighting />
      <group position={[0, 0.15, 0]}>
        <Gyroscope reducedMotion={reducedMotion} />
      </group>
      <ChromeField count={particles} reducedMotion={reducedMotion} />
      <CameraDrift reducedMotion={reducedMotion} enablePointer={tier !== "low"} />
    </>
  );
}
