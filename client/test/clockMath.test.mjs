import test from 'node:test';
import assert from 'node:assert/strict';
import { clockAngles, planetPose } from '../src/components/brand/clockMath.js';

const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 0.000001, `${actual} != ${expected}`);

test('las tres agujas incluyen segundos y milisegundos de la hora local real', () => {
  const angles = clockAngles(new Date(2026, 9, 17, 10, 8, 30, 500));
  close(angles.second, 183);
  close(angles.minute, 51.05);
  close(angles.hour, 304.25416666666666);
});

test('mediodía, medianoche y cambio de minuto no se acumulan ni derivan', () => {
  assert.deepEqual(clockAngles(new Date(2026, 9, 17, 12, 0, 0)), { hour: 0, minute: 0, second: 0 });
  assert.deepEqual(clockAngles(new Date(2026, 9, 18, 0, 0, 0)), { hour: 0, minute: 0, second: 0 });
  const before = clockAngles(new Date(2026, 9, 17, 23, 59, 59, 999));
  assert.ok(before.hour > 359.99 && before.minute > 359.99 && before.second > 359.99);
  close(clockAngles(new Date(2026, 9, 18, 3, 30, 0)).hour, 105);
});

test('el planeta completa la órbita con profundidad y escala coherentes', () => {
  const poses = Array.from({ length: 25 }, (_, i) => planetPose(i * 1000));
  assert.ok(poses.some((pose) => pose.front));
  assert.ok(poses.some((pose) => !pose.front));
  assert.ok(Math.max(...poses.map((pose) => pose.x)) - Math.min(...poses.map((pose) => pose.x)) > 200);
  for (const pose of poses) {
    assert.ok(Number.isFinite(pose.x) && Number.isFinite(pose.y));
    assert.ok(pose.scale >= 0.87 && pose.scale <= 1.13);
    assert.ok(pose.tilt >= -33 && pose.tilt <= -27);
  }
});
