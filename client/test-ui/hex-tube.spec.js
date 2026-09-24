import { expect, test } from 'vitest';
import { Vector3 } from 'three';
import { createHexTube, updateHexTube, HEX_SIDES, TUBE_RADIUS, TUBE_SEGMENTS } from '../src/design-preview/hexTubeGeometry';

test('the tube itself has six hard faces and keeps its hexagonal section during torsion', () => {
  const tube = createHexTube();
  try {
    expect(HEX_SIDES).toBe(6);
    expect(tube.geometry.attributes.position.count).toBe(6 * (TUBE_SEGMENTS + 1) * 2);
    for (const time of [0, 1, 4, 12]) {
      updateHexTube(tube, time);
      for (const ring of [0, 60, 120, 180, TUBE_SEGMENTS]) {
        const corners = [];
        for (let face = 0; face < HEX_SIDES; face++) {
          const index = (face * (TUBE_SEGMENTS + 1) + ring) * 2;
          const corner = new Vector3().fromBufferAttribute(tube.geometry.attributes.position, index);
          expect(corner.distanceTo(tube.frames[ring].center)).toBeCloseTo(TUBE_RADIUS, 5);
          corners.push(corner);
          const nextIndex = (((face + 1) % HEX_SIDES) * (TUBE_SEGMENTS + 1) + ring) * 2;
          const a = new Vector3().fromBufferAttribute(tube.geometry.attributes.normal, index + 1);
          const b = new Vector3().fromBufferAttribute(tube.geometry.attributes.normal, nextIndex);
          // An averaged round-cylinder normal would be identical on both sides.
          expect(a.dot(b)).toBeLessThan(.8);
        }
        for (let face = 0; face < HEX_SIDES; face++) {
          expect(corners[face].distanceTo(corners[(face + 1) % HEX_SIDES])).toBeCloseTo(TUBE_RADIUS, 5);
        }
      }
    }
  } finally { tube.geometry.dispose(); }
});


test('torsion travels through the body continuously and closes at the knot seam', () => {
  const tube = createHexTube();
  try {
    const before = tube.geometry.attributes.position.array.slice();
    updateHexTube(tube, 1);
    const positions = tube.geometry.attributes.position;
    let maxDisplacement = 0;
    for (let i = 0; i < positions.count; i++) {
      const previous = new Vector3().fromArray(before, i * 3);
      maxDisplacement = Math.max(maxDisplacement, previous.distanceTo(new Vector3().fromBufferAttribute(positions, i)));
    }
    expect(maxDisplacement).toBeGreaterThan(.2);
    for (const time of [0, 1, 4, 12]) {
      updateHexTube(tube, time);
      for (let face = 0; face < HEX_SIDES; face++) {
        const first = face * (TUBE_SEGMENTS + 1) * 2;
        const a = new Vector3().fromBufferAttribute(positions, first);
        const b = new Vector3().fromBufferAttribute(positions, first + TUBE_SEGMENTS * 2);
        expect(a.distanceTo(b)).toBeLessThan(.001);
      }
    }
  } finally { tube.geometry.dispose(); }
});
