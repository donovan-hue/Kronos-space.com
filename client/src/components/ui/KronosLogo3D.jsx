import { useState, useId } from "react";

/**
 * KRONOS-SPACE.COM — 3D CYBER-PRISM EMBLEM
 *
 * Emblema tridimensional abstracto de alta tecnología y geometría facetada pura.
 * Sin conceptos literales: arquitectura geométrica isométrica de vanguardia
 * sobre fondo negro profundo puro (#000000).
 *
 * 4 NIVELES DE IDENTIDAD VISUAL:
 * 1. genesis (Usuario Normal): Cromo Hielo Puro & Azul Cobalto Eléctrico (#ffffff / #38bdf8 / #1d4ed8)
 * 2. nova (Suscripción Básica): Fuego Solar & Cobre Líquido (#fef08a / #f59e0b / #ea580c)
 * 3. pro (Suscripción Creador): Neón Ultravioleta & Fucsia Cyberpunk (#f472b6 / #ec4899 / #a855f7)
 * 4. quantum (VIP / Empresarial): Esmeralda Imperial & Oro Plasma (#34d399 / #06b6d4 / #fbbf24)
 */
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
      glowColor: "rgba(56, 189, 248, 0.4)",
      facetTop: `url(#f-top-${id})`,
      facetLeft: `url(#f-left-${id})`,
      facetRight: `url(#f-right-${id})`,
      facetCore: `url(#f-core-${id})`,
      facetBase: `url(#f-base-${id})`,
      edge: "#ffffff",
      stopsTop: ["#ffffff", "#e0f2fe", "#7dd3fc", "#0284c7"],
      stopsLeft: ["#f8fafc", "#94a3b8", "#334155", "#0f172a"],
      stopsRight: ["#bae6fd", "#38bdf8", "#0369a1", "#082f49"],
      stopsCore: ["#ffffff", "#38bdf8", "#1d4ed8", "#0f172a"],
      stopsBase: ["#64748b", "#334155", "#0f172a", "#020617"],
    },
    nova: {
      name: "Nova",
      accent: "#f59e0b",
      glowColor: "rgba(245, 158, 11, 0.45)",
      facetTop: `url(#f-top-${id})`,
      facetLeft: `url(#f-left-${id})`,
      facetRight: `url(#f-right-${id})`,
      facetCore: `url(#f-core-${id})`,
      facetBase: `url(#f-base-${id})`,
      edge: "#fef08a",
      stopsTop: ["#ffffff", "#fef08a", "#f59e0b", "#b45309"],
      stopsLeft: ["#fed7aa", "#f97316", "#c2410c", "#431407"],
      stopsRight: ["#fde047", "#eab308", "#a16207", "#2e1002"],
      stopsCore: ["#ffffff", "#fbbf24", "#ea580c", "#451a03"],
      stopsBase: ["#9a3412", "#7c2d12", "#431407", "#1c0701"],
    },
    pro: {
      name: "Pro",
      accent: "#ec4899",
      glowColor: "rgba(236, 72, 153, 0.5)",
      facetTop: `url(#f-top-${id})`,
      facetLeft: `url(#f-left-${id})`,
      facetRight: `url(#f-right-${id})`,
      facetCore: `url(#f-core-${id})`,
      facetBase: `url(#f-base-${id})`,
      edge: "#fdf2f8",
      stopsTop: ["#ffffff", "#fbcfe8", "#f472b6", "#be185d"],
      stopsLeft: ["#e9d5ff", "#c084fc", "#7e22ce", "#2e1065"],
      stopsRight: ["#f472b6", "#ec4899", "#9d174d", "#3b0721"],
      stopsCore: ["#ffffff", "#f472b6", "#a855f7", "#3b0764"],
      stopsBase: ["#701a75", "#4a044e", "#2e1065", "#120224"],
    },
    quantum: {
      name: "Quantum",
      accent: "#34d399",
      glowColor: "rgba(52, 211, 153, 0.55)",
      facetTop: `url(#f-top-${id})`,
      facetLeft: `url(#f-left-${id})`,
      facetRight: `url(#f-right-${id})`,
      facetCore: `url(#f-core-${id})`,
      facetBase: `url(#f-base-${id})`,
      edge: "#ecfdf5",
      stopsTop: ["#ffffff", "#a7f3d0", "#34d399", "#047857"],
      stopsLeft: ["#cffafe", "#22d3ee", "#0891b2", "#164e63"],
      stopsRight: ["#fef08a", "#fbbf24", "#d97706", "#451a03"],
      stopsCore: ["#ffffff", "#34d399", "#06b6d4", "#064e3b"],
      stopsBase: ["#065f46", "#044e3b", "#0f2e24", "#02150f"],
    },
  };

  const currentTheme = tierPalettes[tier] || tierPalettes.genesis;

  return (
    <div
      className={`k-3d-prism-root k-tier-${tier} k-size-${size} ${
        animated ? "is-animated" : ""
      } ${interactive ? "is-interactive" : ""} ${className}`}
      onMouseEnter={() => interactive && setIsHovered(true)}
      onMouseLeave={() => interactive && setIsHovered(false)}
      role="img"
      aria-label={ariaLabel}
      style={{
        width: dimensions.width,
        height: dimensions.height,
        "--prism-accent": currentTheme.accent,
        "--prism-glow": currentTheme.glowColor,
      }}
    >
      <div className={`k-3d-prism-viewport ${isHovered ? "is-hovered" : ""}`}>
        <svg
          className="k-3d-prism-svg"
          viewBox={dimensions.viewBox}
          width="100%"
          height="100%"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            {/* Sombra de Oclusión Volumétrica Profunda */}
            <filter id={`p-shadow-${id}`} x="-20%" y="-20%" width="140%" height="140%">
              <feDropShadow dx="0" dy="6" stdDeviation="6" floodColor="#000000" floodOpacity="0.95" />
            </filter>

            {/* Gradientes de las Facetas 3D */}
            <linearGradient id={`f-top-${id}`} x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor={currentTheme.stopsTop[0]} />
              <stop offset="35%" stopColor={currentTheme.stopsTop[1]} />
              <stop offset="75%" stopColor={currentTheme.stopsTop[2]} />
              <stop offset="100%" stopColor={currentTheme.stopsTop[3]} />
            </linearGradient>

            <linearGradient id={`f-left-${id}`} x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor={currentTheme.stopsLeft[0]} />
              <stop offset="45%" stopColor={currentTheme.stopsLeft[1]} />
              <stop offset="85%" stopColor={currentTheme.stopsLeft[2]} />
              <stop offset="100%" stopColor={currentTheme.stopsLeft[3]} />
            </linearGradient>

            <linearGradient id={`f-right-${id}`} x1="100%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor={currentTheme.stopsRight[0]} />
              <stop offset="40%" stopColor={currentTheme.stopsRight[1]} />
              <stop offset="80%" stopColor={currentTheme.stopsRight[2]} />
              <stop offset="100%" stopColor={currentTheme.stopsRight[3]} />
            </linearGradient>

            <linearGradient id={`f-core-${id}`} x1="50%" y1="0%" x2="50%" y2="100%">
              <stop offset="0%" stopColor={currentTheme.stopsCore[0]} />
              <stop offset="35%" stopColor={currentTheme.stopsCore[1]} />
              <stop offset="70%" stopColor={currentTheme.stopsCore[2]} />
              <stop offset="100%" stopColor={currentTheme.stopsCore[3]} />
            </linearGradient>

            <linearGradient id={`f-base-${id}`} x1="0%" y1="100%" x2="100%" y2="0%">
              <stop offset="0%" stopColor={currentTheme.stopsBase[0]} />
              <stop offset="50%" stopColor={currentTheme.stopsBase[1]} />
              <stop offset="100%" stopColor={currentTheme.stopsBase[2]} />
            </linearGradient>

            {/* Shimmer Especular de Barrido */}
            <linearGradient id={`shimmer-ray-${id}`} x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="transparent" />
              <stop offset="50%" stopColor="rgba(255, 255, 255, 0.95)" />
              <stop offset="100%" stopColor="transparent" />
            </linearGradient>

            <clipPath id={`prism-clip-${id}`}>
              <polygon points="50,6 88,27 88,73 50,94 12,73 12,27" />
            </clipPath>
          </defs>

          {/* CAPA 1: Base Sombra Volumétrica */}
          <g filter={`url(#p-shadow-${id})`}>
            <polygon points="50,8 86,28 86,72 50,92 14,72 14,28" fill="#000000" opacity="0.9" />
          </g>

          {/* CAPA 2: Facetas Isométricas 3D del Prisma */}
          <g clipPath={`url(#prism-clip-${id})`}>
            {/* Faceta Superior Diamante */}
            <polygon
              points="50,6 88,27 50,48 12,27"
              fill={currentTheme.facetTop}
            />

            {/* Faceta Lateral Izquierda Superior */}
            <polygon
              points="12,27 50,48 50,78 12,57"
              fill={currentTheme.facetLeft}
            />

            {/* Faceta Lateral Derecha Superior */}
            <polygon
              points="50,48 88,27 88,57 50,78"
              fill={currentTheme.facetRight}
            />

            {/* Faceta Inferior Base Izquierda */}
            <polygon
              points="12,57 50,78 50,94 12,73"
              fill={currentTheme.facetBase}
            />

            {/* Faceta Inferior Base Derecha */}
            <polygon
              points="50,78 88,57 88,73 50,94"
              fill={currentTheme.facetRight}
            />

            {/* Prisma Flotante Central (Monolito Interior de Poder) */}
            <polygon
              points="50,22 72,35 72,65 50,78 28,65 28,35"
              fill={currentTheme.facetCore}
              opacity="0.95"
            />
            {/* Corte Bisel Superior del Monolito Interior */}
            <polygon
              points="50,22 72,35 50,48 28,35"
              fill={currentTheme.facetTop}
              opacity="0.9"
            />
            {/* Faceta Izquierda Interior */}
            <polygon
              points="28,35 50,48 50,78 28,65"
              fill={currentTheme.facetLeft}
              opacity="0.85"
            />
          </g>

          {/* CAPA 3: Aristas Especulares de Alta Precisión (Líneas Láser) */}
          <g style={{ mixBlendMode: "screen" }}>
            {/* Arista Perimetral Superior */}
            <line x1="12" y1="27" x2="50" y2="6" stroke={currentTheme.edge} strokeWidth="1.2" strokeLinecap="round" opacity="0.9" />
            <line x1="50" y1="6" x2="88" y2="27" stroke={currentTheme.edge} strokeWidth="1.2" strokeLinecap="round" opacity="0.9" />
            {/* Aristas Centrales */}
            <line x1="50" y1="6" x2="50" y2="94" stroke={currentTheme.edge} strokeWidth="1.4" strokeLinecap="round" opacity="0.95" />
            <line x1="12" y1="27" x2="50" y2="48" stroke={currentTheme.edge} strokeWidth="1.2" strokeLinecap="round" opacity="0.85" />
            <line x1="88" y1="27" x2="50" y2="48" stroke={currentTheme.edge} strokeWidth="1.2" strokeLinecap="round" opacity="0.85" />
            {/* Puntos de Fulgor (Specular Flares) */}
            <circle cx="50" cy="6" r="2.2" fill="#ffffff" opacity="0.98" />
            <circle cx="50" cy="48" r="2.5" fill="#ffffff" opacity="0.98" />
            <circle cx="50" cy="94" r="2.2" fill="#ffffff" opacity="0.98" />
          </g>

          {/* CAPA 4: Barrido de Shimmer Continuo */}
          <g clipPath={`url(#prism-clip-${id})`}>
            <rect
              className="k-prism-shimmer"
              x="-120%"
              y="0"
              width="100%"
              height="100%"
              fill={`url(#shimmer-ray-${id})`}
              opacity="0.45"
            />
          </g>
        </svg>
      </div>
    </div>
  );
}
