import * as THREE from 'three';

export const HEX_SIDES = 6;
export const TUBE_RADIUS = .45;
export const TUBE_SEGMENTS = 240;

// Each face owns its vertices: normals must never be averaged across the
// six longitudinal edges. Keep the ChromeLoop centerline; the section is
// 50% thicker than the previous .3 radius, without scaling the whole knot.
export function createHexTube() {
  const reference = new THREE.TorusKnotGeometry(1.5, TUBE_RADIUS, TUBE_SEGMENTS, HEX_SIDES, 2, 3);
  const samples = reference.attributes.position;
  const frames = [];
  for (let i = 0; i <= TUBE_SEGMENTS; i++) {
    const first = new THREE.Vector3().fromBufferAttribute(samples, i * 7);
    const opposite = new THREE.Vector3().fromBufferAttribute(samples, i * 7 + 3);
    const center = first.clone().add(opposite).multiplyScalar(.5);
    const u = first.sub(center);
    const v = new THREE.Vector3().fromBufferAttribute(samples, i * 7 + 1)
      .sub(center).addScaledVector(u, -.5).multiplyScalar(2 / Math.sqrt(3));
    frames.push({ center, u, v });
  }
  reference.dispose();
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(HEX_SIDES * (TUBE_SEGMENTS + 1) * 2 * 3), 3).setUsage(THREE.DynamicDrawUsage));
  const indices = [];
  for (let face = 0; face < HEX_SIDES; face++) {
    for (let i = 0; i < TUBE_SEGMENTS; i++) {
      const start = (face * (TUBE_SEGMENTS + 1) + i) * 2;
      indices.push(start, start + 2, start + 1, start + 1, start + 2, start + 3);
    }
  }
  geometry.setIndex(indices);
  const surface = { geometry, frames };
  updateHexTube(surface, 0);
  return surface;
}

export function updateHexTube({ geometry, frames }, time) {
  const positions = geometry.attributes.position;
  for (let face = 0; face < HEX_SIDES; face++) {
    for (let i = 0; i <= TUBE_SEGMENTS; i++) {
      const { center, u, v } = frames[i];
      // Twist the section around its own centerline, not the whole shape.
      // All six corners retain TUBE_RADIUS at every instant.
      // A traveling torsion wave rather than a barely visible standing wobble.
      // Periodic harmonics close the seam and let neighboring sections twist
      // progressively, while preserving the centerline and section thickness.
      const phase = i / TUBE_SEGMENTS * Math.PI * 2 - time * .8;
      const torsion = .78 * Math.sin(phase) + .16 * Math.sin(2 * phase);
      for (let corner = 0; corner < 2; corner++) {
        const angle = (face + corner) / HEX_SIDES * Math.PI * 2 + torsion;
        const cos = Math.cos(angle), sin = Math.sin(angle);
        const index = (face * (TUBE_SEGMENTS + 1) + i) * 2 + corner;
        positions.setXYZ(index,
          center.x + u.x * cos + v.x * sin,
          center.y + u.y * cos + v.y * sin,
          center.z + u.z * cos + v.z * sin);
      }
    }
  }
  positions.needsUpdate = true;
  geometry.computeVertexNormals();
}
