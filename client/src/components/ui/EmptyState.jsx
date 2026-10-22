export default function EmptyState({
  icon = null,
  eyebrow = "",
  title = "Sin resultados",
  description = "",
  action = null,
  className = "",
  headingAs: Heading = "h3"
}) {
  return (
    <div className={`k-empty-state-unified ${className}`} role="region" aria-label={title}>
      {icon && <div className="k-empty-state-icon" aria-hidden="true">{icon}</div>}
      {eyebrow && <span className="k-eyebrow">{eyebrow}</span>}
      <Heading className="k-empty-state-title">{title}</Heading>
      {description && <p className="k-empty-state-desc">{description}</p>}
      {action && <div className="k-empty-state-action">{action}</div>}
    </div>
  );
}
