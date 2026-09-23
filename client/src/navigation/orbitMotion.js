/**
 * KRONOS — geometría del bucle orbital.
 *
 * El mapa orbital no es una foto: los nodos revolucionaN alrededor del
 * núcleo en bucle continuo, exactamente sobre la elipse proyectada del
 * diseño. Este módulo es una función pura (testeable sin DOM): dado el
 * nodo en reposo (x, y unitarios cos/sin de su ángulo) y el tiempo de
 * fase, devuelve la posición rotada y su z de pintado.
 *
 * Física simplificada, con sentido (regla del brief: cada movimiento
 * comunica): los anillos interiores giran más rápido que los exteriores,
 * como un sistema orbital real, y el anillo de en medio gira en sentido
 * contrario — los engranajes del mapa nunca se ven muertos.
 */

// rad/ms por anillo. Signo = sentido. Periodos resultantes:
//   ring 0 (Núcleo)  ≈ 26.0 s · ring 1 (Red) ≈ 41.6 s (rev) · ring 2 (Sistema) ≈ 62.2 s
export const RING_OMEGA = [0.000242, -0.000151, 0.000101];

/**
 * Rota el punto-base del nodo un ángulo ω(ring)·phaseMs sobre la elipse.
 * @param {{x:number,y:number,ring:number}} node geometría en reposo
 * @param {number} phaseMs tiempo acumulado de la animación
 * @returns {{x:string,y:string,z:number}} valores listos para CSS
 */
export function orbitFrame(node, phaseMs) {
  const omega = RING_OMEGA[node.ring] ?? RING_OMEGA[1];
  const a = omega * phaseMs;
  const c = Math.cos(a);
  const s = Math.sin(a);
  const x = node.x * c - node.y * s;
  const y = node.x * s + node.y * c;
  return {
    x: x.toFixed(4),
    y: y.toFixed(4),
    // Misma fórmula de pintado que el layout estático (OrbitMap):
    // el frente (y → 1) pinta delante del fondo.
    z: Math.round((y + 1) * 400)
  };
}
