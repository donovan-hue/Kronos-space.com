import { useState, useId } from "react";

/**
 * KRONOS 3D MOTION DESIGN ARCHITECT — EMBLEMA OFICIAL KRONOS SPACE
 *
 * Emblema tridimensional de alta gama con geometría espacial poligonal,
 * facetas biseladas multicapa, iluminación dinámica y rotación/flotación
 * continua en bucle perfecto (seamless loop).
 *
 * 4 Diseños de Suscripción:
 * - genesis (Usuario Estándar: Cromo Titanio & Obsidiana)
 * - nova (Suscripción Básica / Creador Starter: Cobre Solar & Oro Cálido)
 * - pro (Suscripción Pro / Creador Avanzado: Cuarzo Magenta & Neón Cyber)
 * - quantum (Suscripción Premium / VIP Empresarial: Azul Cuántico & Oro Imperial)
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

  // Mapeo de tamaños normalizados
  const dimensions = {
    sm: { width: 34, height: 34, viewBox: "0 0 100 100" },
    md: { width: 50, height: 50, viewBox: "0 0 100 100" },
    lg: { width: 84, height: 84, viewBox: "0 0 100 100" },
    xl: { width: 130, height: 130, viewBox: "0 0 100 100" },
  }[size] || { width: 50, height: 50, viewBox: "0 0 100 100" };

  // Paletas de materiales espaciales por suscripción
  const tierThemes = {
    genesis: {
      facetA: `url(#g-facet-a-${id})`,
      facetB: `url(#g-facet-b-${id})`,
      facetC: `url(#g-facet-c-${id})`,
      glow: "rgba(220, 225, 230, 0.45)",
      shadow: "rgba(0, 0, 0, 0.8)",
      edgeColor: "#ffffff",
      stopsA: ["#ffffff", "#d7d9db", "#8f9296", "#3a3c3f"],
      stopsB: ["#f5f6f7", "#adb2b8", "#686b6d", "#18191a"],
      stopsC: ["#ffffff", "#d7d9db", "#686b6d", "#0d0e0f"],
      coreGlow: "#d7d9db",
      tierBadge: null,
    },
    nova: {
      facetA: `url(#n-facet-a-${id})`,
      facetB: `url(#n-facet-b-${id})`,
      facetC: `url(#n-facet-c-${id})`,
      glow: "rgba(239, 176, 131, 0.55)",
      shadow: "rgba(35, 12, 4, 0.85)",
      edgeColor: "#fff1e6",
      stopsA: ["#fff1e6", "#efb083", "#c47b4c", "#5a2c13"],
      stopsB: ["#fbd8c0", "#c47b4c", "#844520", "#2c1104"],
      stopsC: ["#ffffff", "#efb083", "#75452d", "#1a0802"],
      coreGlow: "#efb083",
      tierBadge: "NOVA",
    },
    pro: {
      facetA: `url(#p-facet-a-${id})`,
      facetB: `url(#p-facet-b-${id})`,
      facetC: `url(#p-facet-c-${id})`,
      glow: "rgba(244, 114, 182, 0.65)",
      shadow: "rgba(30, 8, 20, 0.85)",
      edgeColor: "#fff0f7",
      stopsA: ["#fff0f7", "#ffb7dc", "#e783b5", "#6c1e48"],
      stopsB: ["#ffd1e8", "#e783b5", "#a84377", "#390c24"],
      stopsC: ["#ffffff", "#ffb7dc", "#7c405f", "#1e0412"],
      coreGlow: "#e783b5",
      tierBadge: "PRO",
    },
    quantum: {
      facetA: `url(#q-facet-a-${id})`,
      facetB: `url(#q-facet-b-${id})`,
      facetC: `url(#q-facet-c-${id})`,
      glow: "rgba(56, 189, 248, 0.75)",
      shadow: "rgba(2, 6, 23, 0.9)",
      edgeColor: "#f0f9ff",
      stopsA: ["#f0f9ff", "#38bdf8", "#818cf8", "#1e1b4b"],
      stopsB: ["#e0e7ff", "#a855f7", "#4f46e5", "#0f172a"],
      stopsC: ["#fef08a", "#fbbf24", "#d97706", "#451a03"],
      coreGlow: "#38bdf8",
      tierBadge: "VIP",
    },
  };

  const currentTheme = tierThemes[tier] || tierThemes.genesis;

  return (
    <div
      className={`k-space-emblem-root k-tier-${tier} k-size-${size} ${
        animated ? "is-animated" : ""
      } ${interactive ? "is-interactive" : ""} ${className}`}
      onMouseEnter={() => interactive && setIsHovered(true)}
      onMouseLeave={() => interactive && setIsHovered(false)}
      role="img"
      aria-label={ariaLabel}
      style={{
        width: dimensions.width,
        height: dimensions.height,
        "--tier-glow": currentTheme.glow,
      }}
    >
      <div className={`k-space-emblem-viewport ${isHovered ? "is-hovered" : ""}`}>
        {/* Halo de atmósfera espacial volumétrica */}
        <div className="k-space-ambient-halo" aria-hidden="true" />

        <svg
          className="k-space-emblem-svg"
          viewBox={dimensions.viewBox}
          width="100%"
          height="100%"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            {/* Sombra de Oclusión 3D */}
            <filter id={`depth-filter-${id}`} x="-30%" y="-30%" width="160%" height="160%">
              <feDropShadow dx="0" dy="4" stdDeviation="4" floodColor="#000000" floodOpacity="0.8" />
              <feDropShadow dx="0" dy="8" stdDeviation="10" floodColor={currentTheme.glow} floodOpacity="0.4" />
            </filter>

            {/* Gradientes Dinámicos para el Tier Seleccionado */}
            <linearGradient id={`g-facet-a-${id}`} x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor={currentTheme.stopsA[0]} />
              <stop offset="40%" stopColor={currentTheme.stopsA[1]} />
              <stop offset="75%" stopColor={currentTheme.stopsA[2]} />
              <stop offset="100%" stopColor={currentTheme.stopsA[3]} />
            </linearGradient>
            <linearGradient id={`g-facet-b-${id}`} x1="100%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor={currentTheme.stopsB[0]} />
              <stop offset="45%" stopColor={currentTheme.stopsB[1]} />
              <stop offset="80%" stopColor={currentTheme.stopsB[2]} />
              <stop offset="100%" stopColor={currentTheme.stopsB[3]} />
            </linearGradient>
            <linearGradient id={`g-facet-c-${id}`} x1="50%" y1="0%" x2="50%" y2="100%">
              <stop offset="0%" stopColor={currentTheme.stopsC[0]} />
              <stop offset="35%" stopColor={currentTheme.stopsC[1]} />
              <stop offset="75%" stopColor={currentTheme.stopsC[2]} />
              <stop offset="100%" stopColor={currentTheme.stopsC[3]} />
            </linearGradient>

            {/* Gradiente Shimmer de Barrido Continuo */}
            <linearGradient id={`shimmer-grad-${id}`} x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="transparent" />
              <stop offset="50%" stopColor="rgba(255, 255, 255, 0.85)" />
              <stop offset="100%" stopColor="transparent" />
            </linearGradient>
          </defs>

          {/* CAPA 1: Sombra y Oclusión Base */}
          <g filter={`url(#depth-filter-${id})`}>
            {/* Columna Principal */}
            <path d="M 22 14 L 38 14 L 38 86 L 22 86 Z" fill={currentTheme.shadow} />
            {/* Ala Superior */}
            <path d="M 38 48 L 74 14 L 86 24 L 50 56 Z" fill={currentTheme.shadow} />
            {/* Ala Inferior */}
            <path d="M 46 48 L 86 84 L 74 92 L 36 58 Z" fill={currentTheme.shadow} />
          </g>

          {/* CAPA 2: Geometría Volumétrica 3D */}
          <g className="k-emblem-facets">
            {/* Columna Vertical - Cara Frontal */}
            <path d="M 24 16 L 38 16 L 38 84 L 24 84 Z" fill={currentTheme.facetA} />
            {/* Columna Vertical - Bisel Lateral Izquierdo */}
            <path d="M 18 22 L 24 16 L 24 84 L 18 78 Z" fill={currentTheme.facetB} />
            {/* Columna Vertical - Bisel Superior */}
            <polygon points="18,22 24,16 38,16 34,22" fill={currentTheme.facetC} />

            {/* Ala Diagonal Superior - Cara Frontal */}
            <path d="M 38 46 L 72 14 L 84 22 L 48 54 Z" fill={currentTheme.facetA} />
            {/* Ala Diagonal Superior - Bisel Inferior */}
            <path d="M 48 54 L 84 22 L 80 28 L 44 58 Z" fill={currentTheme.facetB} />
            {/* Ala Diagonal Superior - Punta Biselada */}
            <polygon points="72,14 84,22 80,26 68,18" fill={currentTheme.facetC} />

            {/* Ala Diagonal Inferior - Cara Frontal */}
            <path d="M 44 48 L 82 82 L 72 90 L 36 56 Z" fill={currentTheme.facetA} />
            {/* Ala Diagonal Inferior - Bisel Posterior */}
            <path d="M 44 48 L 72 90 L 68 86 L 42 46 Z" fill={currentTheme.facetB} />
            {/* Ala Diagonal Inferior - Punta Biselada */}
            <polygon points="72,90 82,82 78,78 68,84" fill={currentTheme.facetC} />

            {/* Núcleo de Convergencia Espacial */}
            <polygon points="36,44 48,34 56,48 44,58" fill={currentTheme.facetC} opacity="0.9" />

            {/* Anillo Orbital Cuántico Exclusivo para Tier Quantum */}
            {tier === "quantum" && (
              <g className="k-quantum-orbital-ring" style={{ mixBlendMode: "screen" }}>
                <ellipse
                  cx="50"
                  cy="50"
                  rx="42"
                  ry="16"
                  fill="none"
                  stroke={`url(#g-facet-c-${id})`}
                  strokeWidth="2.5"
                  transform="rotate(-28 50 50)"
                  opacity="0.85"
                />
              </g>
            )}
          </g>

          {/* CAPA 3: Aristas Especulares de Alta Precisión */}
          <g className="k-emblem-specular" style={{ mixBlendMode: "screen" }}>
            {/* Brillo de filo columna */}
            <line x1="25" y1="18" x2="25" y2="82" stroke={currentTheme.edgeColor} strokeWidth="1.2" strokeLinecap="round" opacity="0.85" />
            {/* Brillo de filo ala superior */}
            <line x1="39" y1="46" x2="72" y2="16" stroke={currentTheme.edgeColor} strokeWidth="1.2" strokeLinecap="round" opacity="0.9" />
            {/* Brillo de filo ala inferior */}
            <line x1="45" y1="50" x2="80" y2="80" stroke={currentTheme.edgeColor} strokeWidth="1.2" strokeLinecap="round" opacity="0.8" />
            {/* Destello estelar en el punto nodal */}
            <circle cx="47" cy="48" r="2.8" fill="#ffffff" opacity="0.95" />
          </g>

          {/* CAPA 4: Shimmer de Luz en Movimiento */}
          <g className="k-emblem-shimmer">
            <rect
              className="k-shimmer-sweep-bar"
              x="-100%"
              y="0"
              width="100%"
              height="100%"
              fill={`url(#shimmer-grad-${id})`}
              opacity="0.35"
            />
          </g>
        </svg>
      </div>
    </div>
  );
}
