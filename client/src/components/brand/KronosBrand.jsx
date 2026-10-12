/**
 * Marca KRONOS — sello cromado de 4 capas.
 *
 * Port fiel del componente `Brand` de Kronos-space-react, que a su vez
 * reproduce el helper `brand(txt, cls)` de kronos.html.
 *
 * Las cuatro capas (extrude / bevel / rim / face) y su CSS viven en
 * src/styles/kronos-system/02-theme.css: son las que producen la
 * extrusión cromada y no se tocan desde aquí. Sólo la capa frontal
 * lleva el texto accesible; las otras tres son decorativas.
 *
 * Uso:
 *   <KronosBrand />                    marca completa KRONOS
 *   <KronosBrand text="K" size={1.4} /> sello suelto
 */
export function KronosBrand({ text = "KRONOS", className = "", size }) {
  const clase = className ? `brand ${className}` : "brand";
  const estilo = size ? { fontSize: `${size}rem` } : undefined;

  return (
    <span className={clase} style={estilo}>
      <span className="lay b-extrude" aria-hidden="true">{text}</span>
      <span className="lay b-bevel" aria-hidden="true">{text}</span>
      <span className="lay b-rim" aria-hidden="true">{text}</span>
      <span className="lay b-face">{text}</span>
    </span>
  );
}

export default KronosBrand;
