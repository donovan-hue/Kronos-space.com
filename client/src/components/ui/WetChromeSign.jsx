/**
 * KRONOSPACE — TÍTULO PRINCIPAL CROMADO (CÓDIGO OFICIAL)
 *
 * background: linear-gradient(180deg, #ffffff 0%, #b0b0b0 40%, #444444 50%, #e0e0e0 70%, #777777 100%)
 * font-weight: 800, letter-spacing: 4px, text-transform: uppercase
 */

const DEFAULT_TEXT = "KRONOSPACE";

export default function WetChromeSign({
  text = DEFAULT_TEXT,
  size = "hero",
  className = "",
  ariaLabel = "KRONOSPACE",
}) {
  const value = text || DEFAULT_TEXT;

  return (
    <span
      className={`brand-title k-brand-title--${size} ${className}`}
      role="img"
      aria-label={ariaLabel}
    >
      {value}
    </span>
  );
}
