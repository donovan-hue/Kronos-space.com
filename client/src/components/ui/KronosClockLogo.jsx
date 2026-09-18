import { useState, useId } from "react";

/**
 * KRONOS — RELOJ ORBITAL CROMADO (LOGOTIPO MAESTRO DEFINITIVO)
 *
 * Basado fielmente en la referencia visual oficial de Kronos Space (IMG-20260917-WA0001.jpg):
 * - Esfera analógica circular minimalista de fondo negro puro con
 *   bisel cromado tubular brillante y 12 marcadores horarios plateados.
 * - Esfera cromada 3D central como eje de pivote con dos manecillas
 *   metálicas pulidas (horas ~4:20 y minutos ~10:10).
 * - Dos anillos orbitales elípticos inclinados en perspectiva 3D
 *   cruzada con material de cromo espejo puro.
 * - Esfera satelital metálica pulida orbitando en la trayectoria
 *   superior derecha del anillo orbital.
 * - Animaciones suaves: rotación orbital en bucle continuo y
 *   modo `loading` acelerado para feedback de interactividad.
 * - Tamaños: xs · sm · md · lg · xl · hero.
 */

const CHROME = {
  accent: "#f1f5f9",
  glowColor: "rgba(226, 232, 240, 0.45)",
};

export default function KronosClockLogo({
  size = "md",
  animated = true,
  interactive = true,
  loading = false,
  className = "",
  ariaLabel = "Kronos, reloj orbital cromado",
}) {
  const [isHovered, setIsHovered] = useState(false);
  const rawId = useId();
  const id = rawId.replace(/[^a-zA-Z0-9_-]/g, "");

  const dimensions = {
    xs: { width: 26, height: 26, viewBox: "0 0 100 100" },
    sm: { width: 34, height: 34, viewBox: "0 0 100 100" },
    md: { width: 50, height: 50, viewBox: "0 0 100 100" },
    lg: { width: 92, height: 92, viewBox: "0 0 100 100" },
    xl: { width: 140, height: 140, viewBox: "0 0 100 100" },
    hero: { width: 175, height: 175, viewBox: "0 0 100 100" },
  }[size] || { width: 50, height: 50, viewBox: "0 0 100 100" };

  // 12 marcadores de hora plateados radiales
  const ticks = Array.from({ length: 12 }, (_, i) => {
    const main = i % 3 === 0;
    return {
      key: i,
      transform: `rotate(${i * 30} 50 50)`,
      y1: main ? 25.5 : 26.3,
      y2: main ? 29.8 : 28.7,
      width: main ? 1.8 : 1.2,
      opacity: main ? 0.95 : 0.72,
    };
  });

  return (
    <div
      className={`k-clock-root k-clock-size-${size} ${
        animated ? "is-animated" : ""
      } ${interactive && !loading ? "is-interactive" : ""} ${
        loading ? "is-loading" : ""
      } ${className}`}
      onMouseEnter={() => interactive && setIsHovered(true)}
      onMouseLeave={() => interactive && setIsHovered(false)}
      role="img"
      aria-label={ariaLabel}
      style={{
        width: dimensions.width,
        height: dimensions.height,
        "--clock-glow": CHROME.glowColor,
      }}
    >
      <div className={`k-clock-viewport ${isHovered ? "is-hovered" : ""}`}>
        <svg
          className="k-clock-svg"
          viewBox={dimensions.viewBox}
          width="100%"
          height="100%"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            {/* Fondo oscuro profundo de la esfera */}
            <radialGradient id={`dial-bg-${id}`} cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#000000" />
              <stop offset="85%" stopColor="#020305" />
              <stop offset="100%" stopColor="#080c12" />
            </radialGradient>

            {/* Bisel tubular cromado espejo con horizonte */}
            <linearGradient id={`bezel-${id}`} x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#ffffff" />
              <stop offset="22%" stopColor="#cbd5e1" />
              <stop offset="48%" stopColor="#1e293b" />
              <stop offset="52%" stopColor="#0f172a" />
              <stop offset="68%" stopColor="#64748b" />
              <stop offset="88%" stopColor="#e2e8f0" />
              <stop offset="100%" stopColor="#ffffff" />
            </linearGradient>

            {/* Marcadores de hora plateados */}
            <linearGradient id={`tick-grad-${id}`} x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#ffffff" />
              <stop offset="100%" stopColor="#cbd5e1" />
            </linearGradient>

            {/* Tubos de las órbitas cromadas */}
            <linearGradient id={`ring-a-${id}`} x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#ffffff" />
              <stop offset="28%" stopColor="#d1d9e2" />
              <stop offset="49%" stopColor="#1c2430" />
              <stop offset="53%" stopColor="#090d12" />
              <stop offset="70%" stopColor="#7a8797" />
              <stop offset="90%" stopColor="#eef2f7" />
              <stop offset="100%" stopColor="#ffffff" />
            </linearGradient>

            <linearGradient id={`ring-b-${id}`} x1="100%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#ffffff" />
              <stop offset="25%" stopColor="#c5cfdb" />
              <stop offset="48%" stopColor="#151b22" />
              <stop offset="52%" stopColor="#06090d" />
              <stop offset="68%" stopColor="#8794a4" />
              <stop offset="92%" stopColor="#eef2f7" />
              <stop offset="100%" stopColor="#ffffff" />
            </linearGradient>

            {/* Esfera 3D metálica cromada (pivote y satélite) */}
            <radialGradient id={`sphere-3d-${id}`} cx="32%" cy="28%" r="72%">
              <stop offset="0%" stopColor="#ffffff" />
              <stop offset="26%" stopColor="#e2e8f0" />
              <stop offset="60%" stopColor="#64748b" />
              <stop offset="88%" stopColor="#1e293b" />
              <stop offset="100%" stopColor="#070a0f" />
            </radialGradient>

            {/* Manecillas cromadas */}
            <linearGradient id={`hand-grad-${id}`} x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#ffffff" />
              <stop offset="40%" stopColor="#cbd5e1" />
              <stop offset="75%" stopColor="#64748b" />
              <stop offset="100%" stopColor="#1e293b" />
            </linearGradient>
          </defs>

          {/* ÓRBITA A — trasera / inclinada (rotación continua) */}
          <g transform="rotate(62 50 50)">
            <g className="k-clock-orbit-a">
              {/* Oclusión y tubo metálico */}
              <ellipse cx="50" cy="50" rx="47" ry="14.5" fill="none" stroke="#000000" strokeWidth="4.6" opacity="0.95" />
              <ellipse cx="50" cy="50" rx="47" ry="14.5" fill="none" stroke={`url(#ring-a-${id})`} strokeWidth="3.0" />
              {/* Esfera satelital cromada 3D en la parte superior derecha */}
              <circle cx="89.2" cy="58.2" r="3.7" fill={`url(#sphere-3d-${id})`} />
              <circle cx="88.0" cy="56.8" r="1.1" fill="#ffffff" opacity="0.98" />
            </g>
          </g>

          {/* CUERPO DEL RELOJ — esfera negra + bisel cromado + ticks + manecillas */}
          <g className="k-clock-body">
            {/* Esfera negra pura */}
            <circle cx="50" cy="50" r="26.8" fill={`url(#dial-bg-${id})`} />
            <circle cx="50" cy="50" r="26.8" fill="none" stroke={`url(#bezel-${id})`} strokeWidth="3.2" />
            <circle cx="50" cy="50" r="23.4" fill="none" stroke="rgba(255, 255, 255, 0.12)" strokeWidth="0.6" />

            {/* 12 marcadores de hora radiales */}
            {ticks.map((t) => (
              <line
                key={t.key}
                x1="50"
                y1={t.y1}
                x2="50"
                y2={t.y2}
                stroke={`url(#tick-grad-${id})`}
                strokeWidth={t.width}
                strokeLinecap="round"
                opacity={t.opacity}
                transform={t.transform}
              />
            ))}

            {/* Manecilla de horas (~4:20) */}
            <g className="k-clock-hour">
              <line
                x1="50"
                y1="50"
                x2="63.2"
                y2="57.8"
                stroke={`url(#hand-grad-${id})`}
                strokeWidth="3.2"
                strokeLinecap="round"
              />
            </g>

            {/* Manecilla de minutos (~10:10) */}
            <g className="k-clock-minute">
              <line
                x1="50"
                y1="50"
                x2="35.5"
                y2="39.8"
                stroke={`url(#hand-grad-${id})`}
                strokeWidth="2.2"
                strokeLinecap="round"
              />
            </g>

            {/* Esfera pivote central cromada 3D */}
            <circle cx="50" cy="50" r="3.2" fill={`url(#sphere-3d-${id})`} />
            <circle cx="49.1" cy="48.9" r="0.9" fill="#ffffff" opacity="0.98" />
          </g>

          {/* ÓRBITA B — frontal / contrainclinada (contrarrotación) */}
          <g transform="rotate(-58 50 50)">
            <g className="k-clock-orbit-b">
              <ellipse cx="50" cy="50" rx="44" ry="12.5" fill="none" stroke="#000000" strokeWidth="4.2" opacity="0.95" />
              <ellipse cx="50" cy="50" rx="44" ry="12.5" fill="none" stroke={`url(#ring-b-${id})`} strokeWidth="2.6" />
            </g>
          </g>
        </svg>
      </div>
    </div>
  );
}
