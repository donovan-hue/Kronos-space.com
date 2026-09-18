/**
 * KRONOS-SPACE.COM — LETRERO CROMADO ESPEJO HD · MOJADO POR LLUVIA LEVE
 *
 * La marca ES el nombre: kronos-space.com en letras 3D grandes y
 * gruesas, cromado espejo de alta definición. Nada de elementos
 * flotando: TODOS los efectos viven recortados a la forma de las
 * letras (background-clip: text), incluidas las gotitas de lluvia.
 *
 * Capas (de atrás hacia adelante):
 * 1. k-sign-extrude — bloque 3D macizo (sombras apiladas).
 * 2. k-sign-face   — cara frontal cromada espejo con horizonte.
 * 3. k-sign-wet w1 — gotas grandes estáticas SOBRE las letras.
 * 4. k-sign-wet w2 — gotas pequeñas que se deslizan lento (residuo).
 * 5. k-sign-gloss  — barrido especular suave.
 */

const DEFAULT_TEXT = "krono-space.com";

export default function WetChromeSign({
  text = DEFAULT_TEXT,
  size = "hero",
  interactive = true,
  className = "",
  ariaLabel = "krono-space.com",
}) {
  const value = text || DEFAULT_TEXT;

  return (
    <span
      className={`k-sign k-sign--${size} ${interactive ? "is-interactive" : ""} ${className}`}
      role="img"
      aria-label={ariaLabel}
    >
      <span className="k-sign-extrude" aria-hidden="true">
        {value}
      </span>
      <span className="k-sign-face">{value}</span>
      <span className="k-sign-wet w1" aria-hidden="true">
        {value}
      </span>
      <span className="k-sign-wet w2" aria-hidden="true">
        {value}
      </span>
      <span className="k-sign-gloss" aria-hidden="true">
        {value}
      </span>
    </span>
  );
}
