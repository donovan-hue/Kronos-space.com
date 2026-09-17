import { useState, useId } from "react";

/**
 * KRONOS-SPACE.COM — DOBLE INFINITO ENTRELAZADO 3D
 *
 * Emblema de marca: un infinito (∞) exterior de cromo que envuelve a un
 * segundo infinito interior en rotación continua, entrelazados sobre el
 * cruce central (la "singularidad"). Matemáticamente son lemniscatas de
 * Bernoulli reales, renderizadas como tubos 3D con brillo especular,
 * cometas de energía que recorren cada curva y un núcleo pulsante.
 *
 * 4 NIVELES DE IDENTIDAD VISUAL (sin verde ni amarillo):
 * 1. genesis (Usuario Normal): Cromo Hielo & Zafiro Cobalto (#e2e8f0 / #38bdf8)
 * 2. nova (Suscripción Básica): Cobre Líquido & Ámbar Solar (#fb923c / #ea580c)
 * 3. pro (Suscripción Creador): Lirio Cromo & Fucsia Cyberpunk (#c084fc / #ec4899)
 * 4. quantum (VIP / Empresarial): Platino Iridio & Zafiro Eléctrico + Violeta Plasma (#94a3b8 / #3b82f6 / #7c3aed)
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

/** Segmento abierto de la lemniscata (para el trenzado sobre el cruce central). */
function lemniscateSegment(cx, cy, scale, yBoost, t0, t1, steps = 26) {
  const points = [];
  for (let i = 0; i <= steps; i += 1) {
    const t = t0 + ((t1 - t0) * i) / steps;
    const denom = 1 + Math.sin(t) * Math.sin(t);
    points.push([
      cx + (scale * Math.cos(t)) / denom,
      cy + ((yBoost * scale) * Math.sin(t) * Math.cos(t)) / denom,
    ]);
  }
  return points
    .map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`)
    .join(" ");
}

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

  const tierPalettes = {
    genesis: {
      name: "Genesis",
      accent: "#38bdf8",
      glowColor: "rgba(56, 189, 248, 0.42)",
      edge: "#f8fafc",
      flowColor: "#e0f2fe",
      stopsOuter: ["#f8fafc", "#e2e8f0", "#94a3b8", "#334155"],
      stopsInner: ["#f0f9ff", "#bae6fd", "#38bdf8", "#0369a1"],
      stopsCore: ["#ffffff", "#bae6fd", "#0284c7", "#082f49"],
    },
    nova: {
      name: "Nova",
      accent: "#fb923c",
      glowColor: "rgba(251, 146, 60, 0.45)",
      edge: "#fff7ed",
      flowColor: "#ffedd5",
      stopsOuter: ["#fff7ed", "#fed7aa", "#f97316", "#9a3412"],
      stopsInner: ["#ffffff", "#ffedd5", "#fb923c", "#c2410c"],
      stopsCore: ["#ffffff", "#fdba74", "#ea580c", "#431407"],
    },
    pro: {
      name: "Pro",
      accent: "#ec4899",
      glowColor: "rgba(236, 72, 153, 0.48)",
      edge: "#fdf4ff",
      flowColor: "#fdf2f8",
      stopsOuter: ["#faf5ff", "#e9d5ff", "#c084fc", "#6b21a8"],
      stopsInner: ["#fff1f2", "#fbcfe8", "#ec4899", "#9d174d"],
      stopsCore: ["#ffffff", "#f9a8d4", "#db2777", "#831843"],
    },
    quantum: {
      name: "Quantum",
      accent: "#818cf8",
      glowColor: "rgba(129, 140, 248, 0.5)",
      edge: "#f1f5f9",
      flowColor: "#dbeafe",
      stopsOuter: ["#f8fafc", "#cbd5e1", "#94a3b8", "#3f4a5f"],
      stopsInner: ["#eff6ff", "#bfdbfe", "#3b82f6", "#1e3a8a"],
      stopsCore: ["#ffffff", "#c4b5fd", "#7c3aed", "#4c1d95"],
    },
  };

  const currentTheme = tierPalettes[tier] || tierPalettes.genesis;

  // Geometría: infinito exterior horizontal + infinito interior vertical (rotando).
  const outerPath = lemniscate(50, 50, 44, 1.35);
  const innerPath = lemniscate(50, 50, 25, 1.35, { vertical: true });
  // Trenzado: el infinito exterior pasa POR ENCIMA del interior en el cruce.
  const weaveA = lemniscateSegment(50, 50, 44, 1.35, Math.PI / 2 - 0.42, Math.PI / 2 + 0.42);
  const weaveB = lemniscateSegment(50, 50, 44, 1.35, (3 * Math.PI) / 2 - 0.42, (3 * Math.PI) / 2 + 0.42);

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
              {/* Halo ambiental del emblema */}
              <radialGradient id={`halo-${id}`} cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor={currentTheme.accent} stopOpacity="0.32" />
                <stop offset="55%" stopColor={currentTheme.accent} stopOpacity="0.1" />
                <stop offset="100%" stopColor={currentTheme.accent} stopOpacity="0" />
              </radialGradient>

              {/* Tubo 3D del infinito exterior (cromo del tier) */}
              <linearGradient id={`outer-${id}`} x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor={currentTheme.stopsOuter[0]} />
                <stop offset="38%" stopColor={currentTheme.stopsOuter[1]} />
                <stop offset="78%" stopColor={currentTheme.stopsOuter[2]} />
                <stop offset="100%" stopColor={currentTheme.stopsOuter[3]} />
              </linearGradient>

              {/* Tubo 3D del infinito interior (acento del tier) */}
              <linearGradient id={`inner-${id}`} x1="100%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor={currentTheme.stopsInner[0]} />
                <stop offset="40%" stopColor={currentTheme.stopsInner[1]} />
                <stop offset="78%" stopColor={currentTheme.stopsInner[2]} />
                <stop offset="100%" stopColor={currentTheme.stopsInner[3]} />
              </linearGradient>

              {/* Brillo especular superior del tubo (reflejo cromado) */}
              <linearGradient id={`sheen-${id}`} x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#ffffff" stopOpacity="0.15" />
                <stop offset="45%" stopColor="#ffffff" stopOpacity="0.95" />
                <stop offset="100%" stopColor="#ffffff" stopOpacity="0.15" />
              </linearGradient>

              {/* Singularidad central */}
              <radialGradient id={`core-${id}`} cx="50%" cy="42%" r="60%">
                <stop offset="0%" stopColor={currentTheme.stopsCore[0]} />
                <stop offset="40%" stopColor={currentTheme.stopsCore[1]} />
                <stop offset="78%" stopColor={currentTheme.stopsCore[2]} />
                <stop offset="100%" stopColor={currentTheme.stopsCore[3]} />
              </radialGradient>
            </defs>

            {/* CAPA 0: Halo ambiental */}
            <circle className="k-inf-halo" cx="50" cy="50" r="47" fill={`url(#halo-${id})`} />

            {/* CAPA 1: Infinito exterior — tubo cromado con volumen 3D */}
            <g className="k-inf-tube">
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
              {/* Cometa de energía que recorre el infinito exterior */}
              <path
                className="k-inf-flow k-inf-flow-outer"
                d={outerPath}
                pathLength="100"
                fill="none"
                stroke={currentTheme.accent}
                strokeWidth="4.6"
                strokeLinecap="round"
                opacity="0.35"
              />
              <path
                className="k-inf-flow k-inf-flow-outer"
                d={outerPath}
                pathLength="100"
                fill="none"
                stroke="#ffffff"
                strokeWidth="2.5"
                strokeLinecap="round"
                opacity="0.95"
              />
            </g>

            {/* CAPA 2: Infinito interior vertical — rota continuamente (entrelazado vivo) */}
            <g className="k-inf-spin">
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
              {/* Cometa de energía en sentido contrario */}
              <path
                className="k-inf-flow k-inf-flow-inner"
                d={innerPath}
                pathLength="100"
                fill="none"
                stroke={currentTheme.edge}
                strokeWidth="3.4"
                strokeLinecap="round"
                opacity="0.4"
              />
              <path
                className="k-inf-flow k-inf-flow-inner"
                d={innerPath}
                pathLength="100"
                fill="none"
                stroke="#ffffff"
                strokeWidth="1.9"
                strokeLinecap="round"
                opacity="0.95"
              />
            </g>

            {/* CAPA 3: Trenzado — el infinito exterior cruza POR ENCIMA del interior */}
            <g opacity="0.96">
              <path d={`${weaveA} ${weaveB}`} fill="none" stroke="#04060c" strokeWidth="10.6" strokeLinecap="round" opacity="0.9" />
              <path d={`${weaveA} ${weaveB}`} fill="none" stroke={`url(#outer-${id})`} strokeWidth="7.4" strokeLinecap="round" />
              <path
                d={`${weaveA} ${weaveB}`}
                fill="none"
                stroke={`url(#sheen-${id})`}
                strokeWidth="1.9"
                strokeLinecap="round"
                opacity="0.85"
                transform="translate(0,-2.2)"
              />
            </g>

            {/* CAPA 4: Singularidad central pulsante */}
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
