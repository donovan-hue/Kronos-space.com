import { useEffect, useRef } from 'react';
import { WELCOME, TAGLINE, DIAMOND_COUNT, smooth, hash, welcomePhase, cubePosition } from './welcomeMotion';

function textMask(text, available, initialSize) {
  const mask = document.createElement('canvas'); mask.width = Math.ceil(available); mask.height = 80;
  const pen = mask.getContext('2d');
  let size = initialSize;
  pen.font = `700 ${size}px WMOrbitron, sans-serif`;
  size *= Math.min(1, (available - 16) / pen.measureText(text).width);
  pen.font = `700 ${size}px WMOrbitron, sans-serif`;
  const width = pen.measureText(text).width;
  pen.textAlign = 'center'; pen.textBaseline = 'middle'; pen.fillStyle = '#fff';
  pen.fillText(text, available / 2, 40);
  const pixels = pen.getImageData(0, 0, mask.width, mask.height).data;
  const points = [];
  for (let y = 2; y < 80; y += 3) for (let x = 2; x < mask.width; x += 3) {
    if (pixels[(y * mask.width + x) * 4 + 3] > 90) points.push({ x: x - available / 2, y: y - 40 });
  }
  return { points, size, width };
}
function metal(context, light, y, size) {
  const gradient = context.createLinearGradient(0, y - size / 2, 0, y + size / 2);
  const colors = light ? ['#050608', '#444b56', '#090b0f', '#7d8795', '#11151b'] : ['#fff', '#e9edf4', '#798594', '#fff', '#d4dce7'];
  colors.forEach((color, i) => gradient.addColorStop(i / 4, color));
  return gradient;
}
function polygon(context, points, fill) {
  context.beginPath(); points.forEach(([x, y], i) => i ? context.lineTo(x, y) : context.moveTo(x, y));
  context.closePath(); context.fillStyle = fill; context.fill();
}
export default function WelcomeParticles({ light, paused, replay, targetRef }) {
  const anchor = useRef(), canvas = useRef(), time = useRef(0), run = useRef(replay);
  useEffect(() => {
    if (run.current !== replay) { time.current = 0; run.current = replay; }
    const element = canvas.current, context = element.getContext('2d');
    if (!context) return;
    let frame, disposed = false, particles = [], width = 0, height = 0, last = 0, source, destination;
    const prepare = () => {
      width = window.innerWidth; height = window.innerHeight;
      const dpr = Math.min(devicePixelRatio || 1, 2);
      element.width = width * dpr; element.height = height * dpr;
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      source = textMask(WELCOME, Math.min(480, width - 32), Math.min(38, width * .077));
      destination = textMask(TAGLINE, Math.min(760, targetRef.current.clientWidth), width < 700 ? 17 : 23);
      destination.points.sort((a, b) => a.x - b.x || a.y - b.y);
      const count = Math.min(280, Math.max(source.points.length, destination.points.length));
      particles = Array.from({ length: count }, (_, i) => {
        const a = source.points[Math.floor(i * source.points.length / count)];
        const b = destination.points[Math.floor(i * destination.points.length / count)];
        return { ...a, tx: b.x, ty: b.y, landing: (hash(i + 31) - .5) * destination.width,
          size: 2.5 + hash(i + 42) * 2.2, delay: i / count * .6, spin: hash(i + 15) * 2 - 1 };
      });
      element.dataset.particleCount = String(particles.length);
      element.dataset.diamondCount = String(DIAMOND_COUNT);
      element.dataset.textWidth = source.width.toFixed(1);
      element.dataset.taglineWidth = destination.width.toFixed(1);
    };
    const label = (text, info, point, alpha) => {
      if (alpha <= 0) return;
      context.globalAlpha = alpha;
      context.font = `700 ${info.size}px WMOrbitron, sans-serif`;
      context.textAlign = 'center'; context.textBaseline = 'middle';
      context.fillStyle = metal(context, light, point.y, info.size);
      context.fillText(text, point.x, point.y);
      context.strokeStyle = light ? '#15181c' : '#f7fbff'; context.lineWidth = .25;
      context.strokeText(text, point.x, point.y);
      context.globalAlpha = 1;
    };
    const draw = now => {
      if (disposed) return;
      if (last && !paused) time.current += Math.min((now - last) / 1000, .1);
      last = now;
      const t = time.current;
      const rect = anchor.current.getBoundingClientRect(), end = targetRef.current.getBoundingClientRect();
      const origin = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
      const target = { x: end.left + end.width / 2, y: end.top + end.height / 2 };
      const floor = target.y + 32;
      context.clearRect(0, 0, width, height);
      const dissolve = smooth((t - 1.4) / 1.2), formed = smooth((t - 8.2) / .8);
      element.dataset.phase = welcomePhase(t);
      element.dataset.cubeCount = formed === 1 ? '0' : String(particles.length);
      label(WELCOME, source, origin, 1 - dissolve);
      if (t > 1.4 && formed < 1) particles.forEach(particle => {
        const point = cubePosition(t, particle, origin, target, floor);
        const size = particle.size * (1 - point.gather * .6);
        context.save(); context.translate(point.x, point.y);
        context.rotate(particle.spin * (t - 1.4) * (1 - point.gather));
        context.globalAlpha = dissolve * (1 - formed);
        // Three opaque faces make visible little cubes, not flat confetti.
        polygon(context, [[-size, -size], [size, -size], [size, size], [-size, size]], metal(context, light, 0, size * 2));
        polygon(context, [[-size, -size], [-size + size * .65, -size * 1.65], [size * 1.65, -size * 1.65], [size, -size]], light ? '#7d8795' : '#ffffff');
        polygon(context, [[size, -size], [size * 1.65, -size * 1.65], [size * 1.65, size * .35], [size, size]], light ? '#080b10' : '#758193');
        context.restore();
      });
      label(TAGLINE, destination, target, formed);
      // Only four independent decorative rhombi remain after the cubes assemble.
      [[.07, .24], [.93, .31], [.10, .73], [.91, .81]].forEach(([x, y], i) => {
        context.save(); context.translate(width * x, height * y + Math.sin(t * .35 + i) * 9);
        context.rotate(t * .08 * (i % 2 ? -1 : 1) + i * .4);
        context.scale(.7 + .3 * Math.cos(t * .2 + i), 1);
        const size = 7 + i;
        context.globalAlpha = .85;
        polygon(context, [[0, -size * 1.3], [size * .8, 0], [0, size * 1.3], [-size * .8, 0]], metal(context, light, 0, size * 2));
        context.restore();
      });
      context.globalAlpha = 1;
      if (!paused) frame = requestAnimationFrame(draw);
    };
    const resize = () => { prepare(); if (paused) draw(performance.now()); };
    prepare();
    document.fonts.load('700 38px WMOrbitron').then(() => {
      if (disposed) return;
      prepare(); frame = requestAnimationFrame(draw);
    });
    window.addEventListener('resize', resize);
    const scroller = anchor.current.closest('.design-preview');
    const scroll = () => { if (paused) draw(performance.now()); };
    scroller?.addEventListener('scroll', scroll, { passive: true });
    return () => { disposed = true; cancelAnimationFrame(frame); window.removeEventListener('resize', resize); scroller?.removeEventListener('scroll', scroll); };
  }, [light, paused, replay, targetRef]);
  return <>
    <div ref={anchor} className="wm-welcome" role="img" aria-label="Bienvenid@: se desintegra en cubos que rebotan y forman Tu espacio. Tu tiempo. Tu dominio." />
    <canvas ref={canvas} className="wm-particles" aria-hidden="true" data-effect="welcome-assembly" />
  </>;
}
