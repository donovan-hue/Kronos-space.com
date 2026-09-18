import { useState, useId } from "react";

/**
 * KRONOS-SPACE.COM — DOBLE INFINITO CROMADO ESPEJO — TORSIÓN CONTRARROTANTE
 *
 * Emblema de marca: un infinito (∞) exterior cromado que envuelve a un segundo
 * infinito interior, ambos en CROMADO ESPEJO puro (un solo material metálico,
 * sin colores). Ambos giran de forma continua en direcciones contrarias,
 * produciendo una torsión hipnótica en bucle perfecto. Lemniscatas de
 * Bernoulli matemáticas reales renderizadas como tubos de cromo líquido con
 * reflejo especular, cometas de luz y núcleo esférico espejo.
 *
 * El prop `tier` se conserva por compatibilidad de API, pero todos los
 * niveles comparten ahora el mismo acabado: CROMADO ESPEJO.
 */

/** Lemniscata de Bernoulli como path SVG (curva ∞ matemática real). */
function lemniscate(cx, cy, scale, yBoost, { vertical = false, steps = 120 } = {}) {
  const points = [];
  for (let i = 0; i <= steps; i += 1) {
    const t = (i / steps) * Math.PI * 2;
    const denom = 1 + Math.sin(t) * Math.sin(t);
    const a = (scale * Math.cos(t)) / denom;
    const b = ((yBoost * scale) * Math.sin(t) * Math.cos(t)) / denom;
    points.push(vertical ? [cx + b, cy + a] : [cx + a, cy + b]);
  }
  return (
    points
      .map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`)
      .join(" ") + " Z"
  );
}

/** Material CROMADO ESPEJO — gradiente con horizonte de reflexión. */
const CHROME = {
  accent: "#e2e8f0",
  glowColor: "rgba(226, 232, 240, 0.38)",
  edge: "#ffffff",
  // Cromado espejo: luz cenital → reflejo del horizonte → banda oscura → base
  stopsOuter: ["#ffffff", "#c7ced6", "#2b3038", "#6b7280", "#161a20"],
  stopsInner: ["#ffffff", "#dfe5ea", "#2a2f37", "#9aa4b1", "#12151a"],
  stopsCore: ["#ffffff", "#cfd6de", "#4a515c", "#0c0f13"],
};

export default function KronosLogo3D({
  size = "md",
  tier = "genesis",
  animated = true,
  interactive = true,
  className = "",
  ariaLabel = "Emblema 3D Kronos Space",
}) {
  const [isHovered, setIsHovered] = useState(false);
  const rawId = useId();
  const id = rawId.replace(/[^a-zA-Z0-9_-]/g, "");

  const dimensions = {
    sm: { width: 34, height: 34, viewBox: "0 0 100 100" },
    md: { width: 50, height: 50, viewBox: "0 0 100 100" },
    lg: { width: 88, height: 88, viewBox: "0 0 100 100" },
    xl: { width: 136, height: 136, viewBox: "0 0 100 100" },
  }[size] || { width: 50, height: 50, viewBox: "0 0 100 100" };

  const currentTheme = CHROME;

  // Geometría: infinito exterior horizontal + infinito interior vertical.
  const outerPath = lemniscate(50, 50, 44, 1.35);
  const innerPath = lemniscate(50, 50, 25, 1.35, { vertical: true });

  return (
    <div
      className={`k-3d-inf-root k-tier-${tier} k-size-${size} ${
        animated ? "is-animated" : ""
      } ${interactive ? "is-interactive" : ""} ${className}`}
      onMouseEnter={() => interactive && setIsHovered(true)}
      onMouseLeave={() => interactive && setIsHovered(false)}
      role="img"
      aria-label={ariaLabel}
      style={{
        width: dimensions.width,
        height: dimensions.height,
        "--inf-accent": currentTheme.accent,
        "--inf-glow": currentTheme.glowColor,
      }}
    >
      <div className={`k-3d-inf-viewport ${isHovered ? "is-hovered" : ""}`}>
        <div className="k-3d-inf-floater">
          <svg
            className="k-3d-inf-svg"
            viewBox={dimensions.viewBox}
            width="100%"
            height="100%"
            xmlns="http://www.w3.org/2000/svg"
          >
            <defs>
              {/* Halo ambiental neutro del cromo */}
              <radialGradient id={`halo-${id}`} cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="#e2e8f0" stopOpacity="0.3" />
                <stop offset="55%" stopColor="#cbd5e1" stopOpacity="0.09" />
                <stop offset="100%" stopColor="#94a3b8" stopOpacity="0" />
              </radialGradient>

              {/* CROMADO ESPEJO — tubo exterior (horizonte de reflexión) */}
              <linearGradient id={`outer-${id}`} x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor={currentTheme.stopsOuter[0]} />
                <stop offset="30%" stopColor={currentTheme.stopsOuter[1]} />
                <stop offset="48%" stopColor={currentTheme.stopsOuter[2]} />
                <stop offset="62%" stopColor={currentTheme.stopsOuter[3]} />
                <stop offset="100%" stopColor={currentTheme.stopsOuter[4]} />
              </linearGradient>

              {/* CROMADO ESPEJO — tubo interior (más brillante) */}
              <linearGradient id={`inner-${id}`} x1="100%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor={currentTheme.stopsInner[0]} />
                <stop offset="34%" stopColor={currentTheme.stopsInner[1]} />
                <stop offset="52%" stopColor={currentTheme.stopsInner[2]} />
                <stop offset="66%" stopColor={currentTheme.stopsInner[3]} />
                <stop offset="100%" stopColor={currentTheme.stopsInner[4]} />
              </linearGradient>

              {/* Brillo especular del cromo */}
              <linearGradient id={`sheen-${id}`} x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#ffffff" stopOpacity="0.15" />
                <stop offset="45%" stopColor="#ffffff" stopOpacity="0.95" />
                <stop offset="100%" stopColor="#ffffff" stopOpacity="0.15" />
              </linearGradient>

              {/* Núcleo esférico espejo */}
              <radialGradient id={`core-${id}`} cx="50%" cy="40%" r="62%">
                <stop offset="0%" stopColor={currentTheme.stopsCore[0]} />
                <stop offset="42%" stopColor={currentTheme.stopsCore[1]} />
                <stop offset="80%" stopColor={currentTheme.stopsCore[2]} />
                <stop offset="100%" stopColor={currentTheme.stopsCore[3]} />
              </radialGradient>
            </defs>

            {/* CAPA 0: Halo ambiental */}
            <circle className="k-inf-halo" cx="50" cy="50" r="47" fill={`url(#halo-${id})`} />

            {/* CAPA 1: INFINITO EXTERIOR — gira en sentido HORARIO (torsión continua) */}
            <g className="k-inf-spin-cw">
              <path d={outerPath} fill="none" stroke="#04060c" strokeWidth="11.5" strokeLinecap="round" opacity="0.95" />
              <path d={outerPath} fill="none" stroke={`url(#outer-${id})`} strokeWidth="8" strokeLinecap="round" />
              <path
                d={outerPath}
                fill="none"
                stroke={`url(#sheen-${id})`}
                strokeWidth="2.1"
                strokeLinecap="round"
                opacity="0.9"
                transform="translate(0,-2.4)"
              />
              {/* Cometa de luz cromada recorriendo el infinito exterior */}
              <path
                className="k-inf-flow k-inf-flow-outer"
                d={outerPath}
                pathLength="100"
                fill="none"
                stroke="#f8fafc"
                strokeWidth="4.4"
                strokeLinecap="round"
                opacity="0.35"
              />
              <path
                className="k-inf-flow k-inf-flow-outer"
                d={outerPath}
                pathLength="100"
                fill="none"
                stroke="#ffffff"
                strokeWidth="2.4"
                strokeLinecap="round"
                opacity="0.95"
              />
            </g>

            {/* CAPA 2: INFINITO INTERIOR — gira en sentido ANTIHORARIO (contrario) */}
            <g className="k-inf-spin-ccw">
              <path d={innerPath} fill="none" stroke="#04060c" strokeWidth="9" strokeLinecap="round" opacity="0.9" />
              <path d={innerPath} fill="none" stroke={`url(#inner-${id})`} strokeWidth="6" strokeLinecap="round" />
              <path
                d={innerPath}
                fill="none"
                stroke={`url(#sheen-${id})`}
                strokeWidth="1.7"
                strokeLinecap="round"
                opacity="0.85"
                transform="translate(0,-1.8)"
              />
              {/* Cometa de luz en sentido contrario */}
              <path
                className="k-inf-flow k-inf-flow-inner"
                d={innerPath}
                pathLength="100"
                fill="none"
                stroke="#e2e8f0"
                strokeWidth="3.2"
                strokeLinecap="round"
                opacity="0.38"
              />
              <path
                className="k-inf-flow k-inf-flow-inner"
                d={innerPath}
                pathLength="100"
                fill="none"
                stroke="#ffffff"
                strokeWidth="1.8"
                strokeLinecap="round"
                opacity="0.95"
              />
            </g>

            {/* CAPA 3: Núcleo esférico espejo (eje de la torsión) */}
            <g className="k-inf-core">
              <circle className="k-inf-core-aura" cx="50" cy="50" r="11" fill={`url(#core-${id})`} opacity="0.5" />
              <circle cx="50" cy="50" r="4.8" fill={`url(#core-${id})`} />
              <circle cx="50" cy="50" r="1.9" fill="#ffffff" />
            </g>
          </svg>
        </div>
      </div>
    </div>
  );
}
