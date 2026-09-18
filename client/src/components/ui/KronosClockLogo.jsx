import { useState, useId } from "react";

/**
 * KRONOS — RELOJ ORBITAL CROMADO (LOGOTIPO DEFINITIVO)
 *
 * Referencia visual maestra: reloj analógico circular minimalista de
 * esfera plateada, atravesado por dos anillos orbitales atómicos en
 * cromo espejo con esferas metálicas flotando en las órbitas, y
 * manecillas que marcan las horas. Todo en un solo material: cromo.
 *
 * - Órbita A (trasera) y órbita B (frontal) giran en sentidos
 *   contrarios; las esferas orbitan con ellas.
 * - Manecilla de minutos y horas con rotación lenta y elegante.
 * - Modo `loading`: rotaciones aceleradas (feedback de carga).
 * - Tamaños: xs · sm · md · lg · xl.
 */

const CHROME = {
  accent: "#e2e8f0",
  glowColor: "rgba(226, 232, 240, 0.4)",
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
    lg: { width: 88, height: 88, viewBox: "0 0 100 100" },
    xl: { width: 136, height: 136, viewBox: "0 0 100 100" },
  }[size] || { width: 50, height: 50, viewBox: "0 0 100 100" };

  // Marcadores de horas (12 ticks; los cardinales más largos)
  const ticks = Array.from({ length: 12 }, (_, i) => {
    const main = i % 3 === 0;
    return {
      key: i,
      transform: `rotate(${i * 30} 50 50)`,
      y1: main ? 27.5 : 28.4,
      y2: main ? 31.5 : 30.2,
      width: main ? 1.9 : 1.2,
      opacity: main ? 0.72 : 0.45,
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
            {/* Esfera plateada minimalista */}
            <radialGradient id={`face-${id}`} cx="50%" cy="40%" r="65%">
              <stop offset="0%" stopColor="#ffffff" />
              <stop offset="45%" stopColor="#f1f5f9" />
              <stop offset="80%" stopColor="#cbd5e1" />
              <stop offset="100%" stopColor="#94a3b8" />
            </radialGradient>

            {/* Bisel cromado espejo (horizonte de reflexión) */}
            <linearGradient id={`bezel-${id}`} x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#ffffff" />
              <stop offset="38%" stopColor="#c4cdd7" />
              <stop offset="50%" stopColor="#2c333c" />
              <stop offset="62%" stopColor="#616d7a" />
              <stop offset="100%" stopColor="#e8eef4" />
            </linearGradient>

            {/* Tubo cromado de las órbitas */}
            <linearGradient id={`ring-${id}`} x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#f8fafc" />
              <stop offset="35%" stopColor="#c4cdd7" />
              <stop offset="50%" stopColor="#2c333c" />
              <stop offset="65%" stopColor="#8b95a1" />
              <stop offset="100%" stopColor="#eef2f7" />
            </linearGradient>

            {/* Esfera metálica flotante */}
            <radialGradient id={`sphere-${id}`} cx="34%" cy="30%" r="75%">
              <stop offset="0%" stopColor="#ffffff" />
              <stop offset="40%" stopColor="#e2e8f0" />
              <stop offset="82%" stopColor="#64748b" />
              <stop offset="100%" stopColor="#2b333d" />
            </radialGradient>

            {/* Manecillas cromadas oscuras (contraste sobre esfera clara) */}
            <linearGradient id={`hand-${id}`} x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#f8fafc" />
              <stop offset="55%" stopColor="#94a3b8" />
              <stop offset="100%" stopColor="#2f373f" />
            </linearGradient>
          </defs>

          {/* ÓRBITA A — trasera, inclinada, con esfera; gira en sentido horario */}
          <g transform="rotate(64 50 50)">
            <g className="k-clock-orbit-a">
              <ellipse cx="50" cy="50" rx="47.5" ry="14" fill="none" stroke="#04060c" strokeWidth="4.8" opacity="0.9" />
              <ellipse cx="50" cy="50" rx="47.5" ry="14" fill="none" stroke={`url(#ring-${id})`} strokeWidth="3.1" />
              <circle cx="88.9" cy="58" r="3.4" fill={`url(#sphere-${id})`} />
              <circle cx="87.6" cy="56.7" r="0.9" fill="#ffffff" opacity="0.95" />
            </g>
          </g>

          {/* RELOJ — esfera, bisel, marcadores y manecillas */}
          <g className="k-clock-body">
            <circle cx="50" cy="50" r="26.5" fill={`url(#face-${id})`} />
            <circle cx="50" cy="50" r="26.5" fill="none" stroke={`url(#bezel-${id})`} strokeWidth="3.4" />
            <circle cx="50" cy="50" r="22.8" fill="none" stroke="rgba(15, 23, 42, 0.14)" strokeWidth="0.8" />
            {ticks.map((t) => (
              <line
                key={t.key}
                x1="50" y1={t.y1} x2="50" y2={t.y2}
                stroke="rgba(20, 28, 44, 0.85)"
                strokeWidth={t.width}
                strokeLinecap="round"
                opacity={t.opacity}
                transform={t.transform}
              />
            ))}
            {/* Manecilla de horas (rotación muy lenta) */}
            <g className="k-clock-hour">
              <line x1="50" y1="52.5" x2="50" y2="36.5" stroke={`url(#hand-${id})`} strokeWidth="3.6" strokeLinecap="round" />
            </g>
            {/* Manecilla de minutos (rotación lenta) */}
            <g className="k-clock-minute">
              <line x1="50" y1="53.5" x2="50" y2="29.5" stroke={`url(#hand-${id})`} strokeWidth="2.4" strokeLinecap="round" />
            </g>
            <circle cx="50" cy="50" r="2.7" fill="#0f172a" />
            <circle cx="50" cy="50" r="1.1" fill="#ffffff" />
          </g>

          {/* ÓRBITA B — frontal, contrainclinada, dos esferas; gira en antihorario */}
          <g transform="rotate(-58 50 50)">
            <g className="k-clock-orbit-b">
              <ellipse cx="50" cy="50" rx="44" ry="12" fill="none" stroke="#04060c" strokeWidth="4.4" opacity="0.9" />
              <ellipse cx="50" cy="50" rx="44" ry="12" fill="none" stroke={`url(#ring-${id})`} strokeWidth="2.8" />
              <circle cx="10.1" cy="44.9" r="3" fill={`url(#sphere-${id})`} />
              <circle cx="9" cy="43.8" r="0.8" fill="#ffffff" opacity="0.95" />
              <circle cx="91.3" cy="54.1" r="2.1" fill={`url(#sphere-${id})`} />
            </g>
          </g>
        </svg>
      </div>
    </div>
  );
}
