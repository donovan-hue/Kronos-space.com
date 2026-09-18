/**
 * KRONOS-SPACE.COM — LETRERO ESPECTACULAR CROMADO ESPEJO "MOJADO"
 *
 * La marca ES el nombre: kronos-space.com en letras 3D gorditas y
 * cuadradas tipo anuncio espectacular, acabado cromado espejo con
 * horizonte de reflexión y efecto de letras mojadas:
 *
 * - Extrusión 3D profunda (bloque macizo con cara frontal cromada).
 * - Cromado espejo: luz cenital → línea de horizonte → reflejo inferior.
 * - Brillo húmedo: barrido especular continuo sobre las letras.
 * - Gotas: líquido resbalando por el letrero, en bucle.
 * - Charco de luz: reflejo del letrero sobre el negro profundo.
 */

const DEFAULT_TEXT = "kronos-space.com";

export default function WetChromeSign({
  text = DEFAULT_TEXT,
  size = "hero",
  interactive = true,
  className = "",
  ariaLabel = "kronos-space.com",
}) {
  const value = text || DEFAULT_TEXT;

  return (
    <span
      className={`k-sign k-sign--${size} ${interactive ? "is-interactive" : ""} ${className}`}
      role="img"
      aria-label={ariaLabel}
    >
      {/* CAPA 1: Extrusión 3D — el bloque macizo de cada letra */}
      <span className="k-sign-extrude" aria-hidden="true">
        {value}
      </span>

      {/* CAPA 2: Cara frontal cromada espejo */}
      <span className="k-sign-face">{value}</span>

      {/* CAPA 3: Brillo húmedo — barrido de luz sobre las letras mojadas */}
      <span className="k-sign-gloss" aria-hidden="true">
        {value}
      </span>

      {/* CAPA 4: Gotas resbalando por el letrero */}
      <span className="k-sign-drip d1" aria-hidden="true" />
      <span className="k-sign-drip d2" aria-hidden="true" />
      <span className="k-sign-drip d3" aria-hidden="true" />

      {/* CAPA 5: Charco de luz bajo el letrero */}
      <span className="k-sign-pool" aria-hidden="true" />
    </span>
  );
}
