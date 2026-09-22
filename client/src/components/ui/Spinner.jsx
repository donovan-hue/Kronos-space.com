export default function Spinner({
  size = "md",
  label = "Cargando…",
  className = "",
  inline = false
}) {
  const sizeMap = {
    sm: 18,
    md: 26,
    lg: 40,
    xl: 56
  };

  const px = sizeMap[size] || sizeMap.md;

  return (
    <div
      className={`k-spinner-wrap ${inline ? "is-inline" : ""} ${className}`}
      role="status"
      aria-label={label}
    >
      <svg
        className="k-spinner-ring"
        width={px}
        height={px}
        viewBox="0 0 32 32"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <circle
          cx="16"
          cy="16"
          r="13"
          stroke="rgba(255, 255, 255, 0.14)"
          strokeWidth="3"
        />
        <path
          d="M29 16A13 13 0 0 0 16 3"
          stroke="url(#k-spinner-chrome-grad)"
          strokeWidth="3"
          strokeLinecap="round"
        />
        <defs>
          <linearGradient id="k-spinner-chrome-grad" x1="16" y1="3" x2="29" y2="16" gradientUnits="userSpaceOnUse">
            <stop stopColor="#ffffff" />
            <stop offset="0.5" stopColor="#b8b8b8" />
            <stop offset="1" stopColor="rgba(255, 255, 255, 0.1)" />
          </linearGradient>
        </defs>
      </svg>
      {label && <span className="k-spinner-label">{label}</span>}
    </div>
  );
}
