export const WELCOME = 'BIENVENID@';
export const TAGLINE = 'Tu espacio. Tu tiempo. Tu dominio.';
export const DIAMOND_COUNT = 4;
export const smooth = value => { const t = Math.max(0, Math.min(1, value)); return t * t * (3 - 2 * t); };
export const hash = value => { const n = Math.sin(value * 127.1 + 311.7) * 43758.5453; return n - Math.floor(n); };
export function welcomePhase(time) {
  return time < 1.4 ? 'welcome' : time < 3.8 ? 'falling' : time < 5.4 ? 'bouncing' : time < 9 ? 'assembling' : 'formed';
}
// Continuous deterministic fall, two diminishing rebounds, then magnetic assembly.
// Coordinates are CSS pixels. The invisible floor is never drawn.
export function cubePosition(time, particle, origin, target, floor) {
  const age = Math.max(0, time - 1.4 - particle.delay);
  const startX = origin.x + particle.x, startY = origin.y + particle.y;
  const landingX = target.x + particle.landing;
  if (age < 1.8) {
    const p = age / 1.8;
    return { x: startX + (landingX - startX) * smooth(p), y: startY + (floor - startY) * p * p, gather: 0 };
  }
  if (age < 3.4) {
    const p = (age - 1.8) / 1.6;
    return { x: landingX, y: floor - Math.abs(Math.sin(p * Math.PI * 2)) * 70 * (1 - p), gather: 0 };
  }
  const p = smooth((age - 3.4) / 2.5);
  return { x: landingX + (target.x + particle.tx - landingX) * p,
    y: floor + (target.y + particle.ty - floor) * p - Math.sin(p * Math.PI) * 18, gather: p };
}
