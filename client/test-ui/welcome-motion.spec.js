import { expect, test } from 'vitest';
import { cubePosition, welcomePhase, DIAMOND_COUNT, WELCOME, TAGLINE } from '../src/design-preview/wordmark/welcomeMotion';
test('cubes fall, rebound above an invisible floor, and assemble at exact text targets', () => {
  const particle = { x: 0, y: 0, landing: 60, delay: 0, tx: -20, ty: 5 };
  const origin = { x: 100, y: 100 }, target = { x: 200, y: 400 }, floor = 432;
  expect(cubePosition(0, particle, origin, target, floor).y).toBe(100);
  expect(cubePosition(3.2, particle, origin, target, floor).y).toBeCloseTo(floor);
  expect(cubePosition(3.6, particle, origin, target, floor).y).toBeLessThan(floor - 30);
  for (let time = 3.2; time < 9; time += .05) expect(cubePosition(time, particle, origin, target, floor).y).toBeLessThanOrEqual(floor + .001);
  expect(cubePosition(9, particle, origin, target, floor)).toEqual({ x: 180, y: 405, gather: 1 });
  expect(cubePosition(30, particle, origin, target, floor)).toEqual(cubePosition(9, particle, origin, target, floor));
  expect(welcomePhase(0)).toBe('welcome'); expect(welcomePhase(4)).toBe('bouncing'); expect(welcomePhase(9)).toBe('formed');
  expect(DIAMOND_COUNT).toBe(4); expect(WELCOME).toBe('BIENVENID@'); expect(TAGLINE).toBe('Tu espacio. Tu tiempo. Tu dominio.');
});
