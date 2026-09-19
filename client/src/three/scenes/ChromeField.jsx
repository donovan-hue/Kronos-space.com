import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

/**
 * Campo de partículas metálicas (polvo de cromo en suspensión).
 *
 * Un único InstancedMesh = un solo draw call para cientos de
 * fragmentos. Las posiciones se fijan al montar (cáscara orbital
 * aplanada) y el movimiento es la rotación lenta del grupo completo:
 * coste por frame ≈ 1 actualización de matriz, no una por partícula.
 * Es la regla de rendimiento de la fase Motion llevada a 3D: nunca
 * animar grandes cantidades de elementos de forma individual.
 */
export default function ChromeField({
  count = 160,
  reducedMotion = false,
  innerRadius = 4.2,
  spread = 5.5,
  flatten = 0.6,
  spin = 0.015,
}) {
  const groupRef = useRef(null);

  // Posiciones/escalas fijas por montaje: sin re-cálculos por frame.
  const instances = useMemo(() => {
    const list = [];
    for (let i = 0; i < count; i += 1) {
      const radius = innerRadius + Math.random() * spread;
      const theta = Math.random() * Math.PI * 2;
      // Distribución en banda orbital aplanada, no esfera plena.
      const phi = Math.acos(2 * Math.random() - 1);
      list.push({
        x: radius * Math.sin(phi) * Math.cos(theta),
        y: radius * Math.cos(phi) * flatten,
        z: radius * Math.sin(phi) * Math.sin(theta),
        scale: 0.35 + Math.random() * 0.9,
        rx: Math.random() * Math.PI,
        ry: Math.random() * Math.PI,
      });
    }
    return list;
  }, [count, innerRadius, spread, flatten]);

  useEffect(() => {
    const mesh = groupRef.current;
    if (!mesh) return;
    const dummy = new THREE.Object3D();
    instances.forEach((item, i) => {
      dummy.position.set(item.x, item.y, item.z);
      dummy.rotation.set(item.rx, item.ry, 0);
      dummy.scale.setScalar(item.scale);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
  }, [instances]);

  useFrame((_, delta) => {
    if (reducedMotion) return;
    // Clamp de delta: sin saltos al volver de una pestaña en segundo plano.
    groupRef.current.rotation.y += Math.min(delta, 0.05) * spin;
  });

  return (
    <instancedMesh
      ref={groupRef}
      args={[undefined, undefined, count]}
      frustumCulled={false}
    >
      <octahedronGeometry args={[0.05, 0]} />
      <meshStandardMaterial
        color="#c9ced6"
        metalness={1}
        roughness={0.22}
        envMapIntensity={0.8}
      />
    </instancedMesh>
  );
}
