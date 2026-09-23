import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import ChromeField from "./ChromeField";
import StudioLighting from "./StudioLighting";

/**
 * Campo orbital del mapa de navegación.
 *
 * Composición híbrida con piezas YA existentes (no se añade geometría
 * nueva): el campo de partículas de cromo (ChromeField, un solo draw
 * call) flota en un plano ligeramente inclinado y responde al puntero
 * con un parallax mínimo (±2.2°). El parallax es la señal espacial que
 * dice "esto es profundidad, no un fondo plano" — el resto de la
 * escena queda en manos del HTML.
 *
 * StudioLighting aporta el entorno que el cromo necesita reflejar; al
 * renderizarse a un cubemap de 256px una sola vez, el coste por frame
 * es la rotación del grupo, no luces dinámicas.
 *
 * prefers-reduced-motion: sin rotación ni parallax (ChromeField
 * congela su giro; el grupo queda en pose fija). frameloop "demand"
 * en Canvas3D ya evita repintar.
 */
export default function OrbitField({ tier = "medium", particles = 160, reducedMotion = false }) {
  const parallaxRef = useRef(null);

  useFrame((state, delta) => {
    if (reducedMotion || !parallaxRef.current) return;
    const step = Math.min(delta, 0.05);
    const target = state.pointer; // normalizado -1..1
    // Lerp suave hacia la pose objetivo: sin brusquedad, sin bucles inútiles.
    const group = parallaxRef.current;
    group.rotation.x += (target.y * 0.038 - group.rotation.x) * Math.min(1, step * 2.4);
    group.rotation.y += (target.x * 0.038 - group.rotation.y) * Math.min(1, step * 2.4);
  });

  return (
    <group ref={parallaxRef} rotation={[0.16, 0, 0]}>
      <StudioLighting />
      {/* En gama baja se reduce la densidad; nunca la funcionalidad. */}
      <ChromeField
        count={tier === "low" ? Math.min(particles, 80) : particles}
        reducedMotion={reducedMotion}
        innerRadius={5.2}
        spread={6.5}
        flatten={0.42}
        spin={0.012}
      />
    </group>
  );
}
