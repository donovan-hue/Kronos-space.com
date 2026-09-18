/**
 * KRONOS-SPACE.COM — LETRERO ESPECTACULAR CROMADO ESPEJO "MOJADO" HD
 *
 * La marca ES el nombre: kronos-space.com en letras 3D enormes y
 * gruesas tipo anuncio espectacular, acabado cromado espejo de alta
 * definición con efecto de letras empapadas (ilusión óptica húmeda):
 *
 * - Extrusión 3D profunda en pasos finos (bloque macizo HD).
 * - Cromado espejo: luz cenital → horizonte de reflexión → rebote inferior.
 * - Doble brillo húmedo: dos barridos especulares desfasados + velo
 *   perlate permanente (la superficie siempre se ve mojada).
 * - Gotas: líquido resbalando por el letrero en bucle, 5 corrientes.
 * - Charco de luz: reflejo del letrero sobre el negro absoluto.
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
      {/* CAPA 1: Extrusión 3D HD — bloque macizo de cada letra */}
      <span className="k-sign-extrude" aria-hidden="true">
        {value}
      </span>

      {/* CAPA 2: Cara frontal cromada espejo */}
      <span className="k-sign-face">{value}</span>

      {/* CAPA 3: Velo perlate — la superficie siempre se ve mojada */}
      <span className="k-sign-veil" aria-hidden="true">
        {value}
      </span>

      {/* CAPA 4: Brillo húmedo — doble barrido especular desfasado */}
      <span className="k-sign-gloss g1" aria-hidden="true">
        {value}
      </span>
      <span className="k-sign-gloss g2" aria-hidden="true">
        {value}
      </span>

      {/* CAPA 5: Gotitas de lluvia — perlas de agua sobre las letras (leve) */}
      <span className="k-sign-bead b1" aria-hidden="true" />
      <span className="k-sign-bead b2" aria-hidden="true" />
      <span className="k-sign-bead b3" aria-hidden="true" />
      <span className="k-sign-bead b4" aria-hidden="true" />
      <span className="k-sign-bead b5" aria-hidden="true" />
      <span className="k-sign-bead b6" aria-hidden="true" />
      <span className="k-sign-bead b7" aria-hidden="true" />

      {/* CAPA 6: Gotas que resbalan lento (lluvia ligera) */}
      <span className="k-sign-drip d1" aria-hidden="true" />
      <span className="k-sign-drip d2" aria-hidden="true" />
      <span className="k-sign-drip d3" aria-hidden="true" />

      {/* CAPA 7: Charco de luz bajo el letrero */}
      <span className="k-sign-pool" aria-hidden="true" />
    </span>
  );
}
