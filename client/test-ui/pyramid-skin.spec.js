import { expect, test } from 'vitest';
import { createHexTube, updateHexTube } from '../src/design-preview/hexTubeGeometry';
import { createPyramidSkin, updatePyramidSkin, PYRAMID_COUNT } from '../src/design-preview/pyramidSkin';

test('contiguous raised triangular faces form a closed opaque skin with no flat strips', () => {
  const tube = createHexTube(), skin = createPyramidSkin();
  try {
    for (const time of [0, .5, 7]) {
      updateHexTube(tube, time);
      const body = tube.geometry.attributes.position.array.slice();
      updatePyramidSkin(skin, tube, time);
      expect(tube.geometry.attributes.position.array).toEqual(body);
      const positions = skin.geometry.attributes.position;
      expect(positions.count).toBe(PYRAMID_COUNT * 9);
      expect([...positions.array].every(Number.isFinite)).toBe(true);
      const edges = new Map();
      const key = i => [positions.getX(i), positions.getY(i), positions.getZ(i)].map(v => v.toFixed(6)).join(',');
      for (let i = 0; i < positions.count; i += 3) {
        for (let j = 0; j < 3; j++) {
          const edge = [key(i + j), key(i + (j + 1) % 3)].sort().join('|');
          edges.set(edge, (edges.get(edge) || 0) + 1);
        }
      }
      // All triangle edges meet another triangle: no open lines or holes.
      expect([...edges.values()].every(count => count === 2)).toBe(true);
      const pose = positions.array.slice();
      updatePyramidSkin(skin, tube, time);
      expect(positions.array).toEqual(pose);
      updatePyramidSkin(skin, tube, time + .1);
      expect(positions.array).not.toEqual(pose);
    }
  } finally { tube.geometry.dispose(); skin.geometry.dispose(); }
});
