import { useState } from "react";

/**
 * KRONOS — LOGO ICON (RELOJ + ÓRBITA + ESFERA)
 *
 * Implementación exacta con máscara conic-gradient de horas,
 * órbita elíptica a -25deg, esfera metálica con destello y manecillas:
 */

export default function KronosClockLogo({
  size = "md",
  className = "",
  ariaLabel = "Kronos, logo orbital",
}) {
  const [isHovered, setIsHovered] = useState(false);

  // Escalas relativas a la dimensión base de 110px
  const scales = {
    xs: 0.28,  // ~31px
    sm: 0.36,  // ~40px
    md: 0.55,  // ~60px
    lg: 0.82,  // ~90px
    xl: 1.0,   // 110px exacto
    hero: 1.25 // 138px
  };

  const scale = scales[size] || 0.55;
  const dimension = 110 * scale;

  return (
    <div
      className={`k-logo-icon-wrapper ${className}`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      role="img"
      aria-label={ariaLabel}
      style={{
        width: dimension,
        height: dimension,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
      }}
    >
      <div
        className="k-logo-scaler"
        style={{
          width: 110,
          height: 110,
          transform: `scale(${scale})`,
          transformOrigin: "center center",
          transition: "transform 0.2s ease",
        }}
      >
        <div className={`logo-icon ${isHovered ? "is-hovered" : ""}`}>
          <div className="clock-circle">
            <div className="hands">
              <div className="hand-hour"></div>
              <div className="hand-minute"></div>
              <div className="center-dot"></div>
            </div>
          </div>
          <div className="orbit">
            <div className="sphere"></div>
          </div>
        </div>
      </div>
    </div>
  );
}
