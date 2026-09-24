import * as THREE from 'three';
import { HEX_SIDES, TUBE_SEGMENTS } from './hexTubeGeometry';

const ROWS = 80;
const COLUMNS = HEX_SIDES * 3;
export const PYRAMID_COUNT = ROWS * COLUMNS * 2;
const wrap = (value, length) => ((value % length) + length) % length;

// Each quadrilateral is split into two triangular bases, each with an apex.
// Only their three raised faces are drawn: there is no flat strip between them.
// The periodic shared lattice closes both seams and has no transparent holes.
export function createPyramidSkin() {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(PYRAMID_COUNT * 27), 3).setUsage(THREE.DynamicDrawUsage));
  return {
    geometry,
    points: Array.from({ length: ROWS * COLUMNS }, () => new THREE.Vector3()),
    normals: Array.from({ length: ROWS * COLUMNS }, () => new THREE.Vector3()),
    left: new THREE.Vector3(), right: new THREE.Vector3(), blend: new THREE.Vector3(),
    apex: new THREE.Vector3(), outward: new THREE.Vector3(), edge: new THREE.Vector3(), cross: new THREE.Vector3(),
  };
}

export function updatePyramidSkin(skin, surface, time) {
  const positions = surface.geometry.attributes.position;
  const normals = surface.geometry.attributes.normal;
  for (let row = 0; row < ROWS; row++) {
    const along = wrap(row * TUBE_SEGMENTS / ROWS + time * 10.5, TUBE_SEGMENTS);
    const ring = Math.floor(along), fraction = along - ring;
    for (let column = 0; column < COLUMNS; column++) {
      const around = wrap(column / 3 + along * HEX_SIDES * 4 / TUBE_SEGMENTS + time * .3, HEX_SIDES);
      const face = Math.floor(around), lateral = around - face;
      const index = (face * (TUBE_SEGMENTS + 1) + ring) * 2;
      skin.left.fromBufferAttribute(positions, index).lerp(skin.blend.fromBufferAttribute(positions, index + 2), fraction);
      skin.right.fromBufferAttribute(positions, index + 1).lerp(skin.blend.fromBufferAttribute(positions, index + 3), fraction);
      const id = row * COLUMNS + column;
      skin.points[id].copy(skin.left).lerp(skin.right, lateral);
      skin.normals[id].fromBufferAttribute(normals, index).lerp(skin.blend.fromBufferAttribute(normals, index + 2), fraction).normalize();
    }
  }
  const output = skin.geometry.attributes.position;
  let vertex = 0;
  const emit = (a, b, c) => {
    for (const p of [a, b, c]) output.setXYZ(vertex++, p.x, p.y, p.z);
  };
  const pyramid = (ia, ib, ic) => {
    const a = skin.points[ia];
    let b = skin.points[ib], c = skin.points[ic];
    skin.outward.copy(skin.normals[ia]).add(skin.normals[ib]).add(skin.normals[ic]).normalize();
    skin.cross.subVectors(b, a).cross(skin.edge.subVectors(c, a));
    if (skin.cross.dot(skin.outward) < 0) [b, c] = [c, b];
    skin.apex.copy(a).add(b).add(c).multiplyScalar(1 / 3).addScaledVector(skin.outward, .105);
    emit(a, b, skin.apex);
    emit(b, c, skin.apex);
    emit(c, a, skin.apex);
  };
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLUMNS; col++) {
      const nextRow = (row + 1) % ROWS, nextCol = (col + 1) % COLUMNS;
      const a = row * COLUMNS + col, b = row * COLUMNS + nextCol;
      const c = nextRow * COLUMNS + col, d = nextRow * COLUMNS + nextCol;
      pyramid(a, b, c);
      pyramid(b, d, c);
    }
  }
  output.needsUpdate = true;
  skin.geometry.computeVertexNormals();
}
