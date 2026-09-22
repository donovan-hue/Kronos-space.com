export default function EmptyState({
  icon = null,
  eyebrow = "",
  title = "Sin resultados",
  description = "",
  action = null,
  className = ""
}) {
  return (
    <div className={`k-empty-state-unified ${className}`} role="region" aria-label={title}>
      {icon && <div className="k-empty-state-icon" aria-hidden="true">{icon}</div>}
      {eyebrow && <span className="k-eyebrow">{eyebrow}</span>}
      <h3 className="k-empty-state-title">{title}</h3>
      {description && <p className="k-empty-state-desc">{description}</p>}
      {action && <div className="k-empty-state-action">{action}</div>}
    </div>
  );
}
