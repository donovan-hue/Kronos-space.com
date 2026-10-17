import { useEffect, useId, useRef, useState } from 'react';
import { MOTION_CHANGE_EVENT, motionEnabled } from '../../lib/motionPreference';
import { clockAngles, planetPose } from './clockMath';
import MirrorMetalDefs from './MirrorMetalDefs';

function Planet({ id, planetRef, front, pose }) {
  return (
    <g ref={planetRef} data-planet-front={front} transform={`translate(${pose.x} ${pose.y}) scale(${pose.scale})`} opacity={front === pose.front ? 1 : 0}>
      <circle r="13" fill={`url(#${id}-sphere)`} stroke={`url(#${id}-edge)`} strokeWidth=".75" />
      <ellipse cx="-3.8" cy="-7.2" rx="6.4" ry="2.5" fill="#ffffff" opacity=".85" transform="rotate(-22)" />
      <path d="M-11 1 Q0 -3 11 1 M-8 7 Q0 3 8 7" fill="none" stroke="#080808" strokeWidth="1.5" opacity=".8" />
      <path d="M-7 -10 Q-12 -3 -9 4" fill="none" stroke="#ffffff" strokeWidth="1" />
    </g>
  );
}

/** Reloj funcional + órbita vectorial. Nunca depende de WebGL ni de una foto.
 * La pausa detiene sólo la órbita; la hora real sigue avanzando. Al volver
 * de otra pestaña se consulta Date de nuevo, sin acumular deriva del timer.
 */
export default function KronosClock() {
  const id = `clock-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const [initial] = useState(() => new Date());
  const [time, setTime] = useState(initial);
  const svg = useRef(null);
  const hour = useRef(null), minute = useRef(null), second = useRef(null);
  const frontPlanet = useRef(null), backPlanet = useRef(null);
  const frontRing = useRef(null), backRing = useRef(null);
  const angles = clockAngles(initial);
  const pose = planetPose(0);
  const formattedTime = time.toLocaleTimeString('es-MX', { hourCycle: 'h23' });

  useEffect(() => {
    let frame = 0, timer = 0, previous = 0, lastPaint = 0, elapsed = 0;
    let moving = motionEnabled();
    const syncMotion = () => {
      moving = motionEnabled();
      if (svg.current) svg.current.dataset.orbitPaused = String(!moving);
    };
    const paint = (now) => {
      if (document.hidden) return;
      if (!lastPaint || now - lastPaint >= 32) {
        const delta = previous ? Math.min(now - previous, 100) : 0;
        previous = now;
        lastPaint = now;
        const wallTime = new Date();
        const current = clockAngles(wallTime);
        for (const [ref, angle] of [[hour, current.hour], [minute, current.minute], [second, current.second]]) {
          ref.current?.setAttribute('transform', `rotate(${angle} 160 160)`);
          ref.current?.setAttribute('data-angle', String(angle));
        }
        if (moving) elapsed += delta;
        const planet = planetPose(elapsed);
        for (const [ref, front] of [[frontPlanet, true], [backPlanet, false]]) {
          ref.current?.setAttribute('transform', `translate(${planet.x} ${planet.y}) scale(${planet.scale}) rotate(${planet.spin})`);
          ref.current?.setAttribute('opacity', front === planet.front ? '1' : '0');
        }
        for (const ref of [frontRing, backRing]) {
          ref.current?.setAttribute('transform', `translate(160 160) rotate(${planet.tilt})`);
        }
      }
      frame = requestAnimationFrame(paint);
    };
    const syncTime = () => {
      setTime(new Date());
      timer = window.setTimeout(syncTime, 1000 - Date.now() % 1000);
    };
    const visibility = () => {
      cancelAnimationFrame(frame);
      clearTimeout(timer);
      previous = 0;
      lastPaint = 0;
      if (!document.hidden) {
        syncTime();
        frame = requestAnimationFrame(paint);
      }
    };
    syncMotion();
    visibility();
    document.addEventListener('visibilitychange', visibility);
    window.addEventListener(MOTION_CHANGE_EVENT, syncMotion);
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', visibility);
      window.removeEventListener(MOTION_CHANGE_EVENT, syncMotion);
    };
  }, []);

  return (
    <div className="k-live-clock">
      <svg ref={svg} className="k-clock-svg" viewBox="0 0 320 320" aria-hidden="true" focusable="false">
        <MirrorMetalDefs id={id} />
        {/* El semianillo posterior y el planeta quedan detrás de la esfera. */}
        <g ref={backRing} transform={`translate(160 160) rotate(${pose.tilt})`} data-orbit-ring="back">
          <path d="M-132 0 A132 42 0 0 1 132 0" fill="none" stroke={`url(#${id}-rim)`} strokeWidth="2.1" />
        </g>
        <Planet id={id} planetRef={backPlanet} front={false} pose={pose} />
        <circle cx="160" cy="160" r="104" fill="#000000" stroke="#242424" strokeWidth="7" />
        <circle cx="160" cy="160" r="104" fill="none" stroke={`url(#${id}-edge)`} strokeWidth="5" />
        <circle cx="160" cy="160" r="101.3" fill="none" stroke="#d0d0d0" strokeWidth=".65" />
        <circle cx="160" cy="160" r="106.4" fill="none" stroke={`url(#${id}-rim)`} strokeWidth=".8" />
        {Array.from({ length: 12 }, (_, i) => (
          <path key={i} d="M158.8 67 L161.2 67 L161.6 77 L158.4 77 Z" transform={`rotate(${i * 30} 160 160)`} fill={`url(#${id}-edge)`} stroke="#b8b8b8" strokeWidth=".35" />
        ))}
        <g ref={hour} data-clock-hand="hour" transform={`rotate(${angles.hour} 160 160)`}>
          <path d="M157.7 168 L158.2 112 Q160 107 161.8 112 L162.3 168 Z" fill={`url(#${id}-face)`} stroke="#d0d0d0" strokeWidth=".7" />
        </g>
        <g ref={minute} data-clock-hand="minute" transform={`rotate(${angles.minute} 160 160)`}>
          <path d="M158.6 172 L159 84 Q160 80 161 84 L161.4 172 Z" fill={`url(#${id}-edge)`} stroke="#c7c7c7" strokeWidth=".5" />
        </g>
        <g ref={second} data-clock-hand="second" transform={`rotate(${angles.second} 160 160)`}>
          <path d="M160 73 L160 181" stroke="#d0d0d0" strokeWidth=".8" />
          <circle cx="160" cy="177" r="2.4" fill="#090909" stroke="#d0d0d0" strokeWidth=".7" />
        </g>
        <circle cx="160" cy="160" r="6" fill={`url(#${id}-sphere)`} stroke="#d0d0d0" strokeWidth=".55" />
        {/* El otro semianillo cruza delante: profundidad real de capas. */}
        <g ref={frontRing} transform={`translate(160 160) rotate(${pose.tilt})`} data-orbit-ring="front">
          <path d="M132 0 A132 42 0 0 1 -132 0" fill="none" stroke="#242424" strokeWidth="3.6" />
          <path d="M132 0 A132 42 0 0 1 -132 0" fill="none" stroke={`url(#${id}-rim)`} strokeWidth="2.2" />
          <path d="M132 0 A132 42 0 0 1 -132 0" fill="none" stroke="#eeeeee" strokeWidth=".45" />
        </g>
        <Planet id={id} planetRef={frontPlanet} front pose={pose} />
      </svg>
      <time className="sr-only" dateTime={time.toISOString()} aria-label={`Hora local del dispositivo: ${formattedTime}`}>
        {formattedTime}
      </time>
    </div>
  );
}
