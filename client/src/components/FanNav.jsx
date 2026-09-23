import { useLocation, useNavigate, NavLink } from "react-router-dom";
import {
  NAV_ICONS,
  NAV_GROUPS,
  MOBILE_ITEM_IDS,
  getCurrentSection
} from "../navigation/model.jsx";
import { useNavFlags } from "../navigation/useNavFlags";

// ============================================================
// KRONOS FAN NAV — barra lateral + barra táctil móvil.
//
// KRONOS-NAV3D: los destinos, iconos y la función de sección viven en
// `src/navigation/model.jsx` (fuente única compartida con el mapa
// orbital). Este archivo solo pinta el shell; eliminar cualquier otro
// duplicado de rutas. `getCurrentSection` se reexporta por
// compatibilidad con los consumidores históricos (AppLayout/tests).
// ============================================================

export { getCurrentSection };

const visibleGroupsFor = (filterItems) =>
  NAV_GROUPS.map((group) => ({
    ...group,
    items: filterItems(group.items)
  })).filter((group) => group.items.length > 0);

const MOBILE_ITEMS = NAV_GROUPS[0].items.filter((item) => MOBILE_ITEM_IDS.includes(item.id));

function isItemActive(itemId, section) {
  if (itemId === "kairos") return section === "kairos";
  return itemId === section;
}

function NavigationItem({ item, section, mobile = false }) {
  const active = isItemActive(item.id, section);
  return (
    <NavLink
      to={item.to}
      end={item.id === "home" || item.id === "explore" || item.id === "profile"}
      className={`k-navigation-item ${active ? "is-active" : ""} ${mobile ? "is-mobile" : ""}`}
      aria-current={active ? "page" : undefined}
      title={mobile ? item.label : undefined}
    >
      <span className="k-navigation-icon">{NAV_ICONS[item.icon]}</span>
      <span className="k-navigation-copy">
        <strong>{item.label}</strong>
        {!mobile && <small>{item.description}</small>}
      </span>
    </NavLink>
  );
}

export default function FanNav({ onOpenMenu }) {
  const location = useLocation();
  const navigate = useNavigate();
  const section = getCurrentSection(location.pathname);
  // Fase 0 — feature flags: la navegación se adapta a lo encendido.
  // Si el servidor no responde, todo queda visible (defaults en true).
  const { flags, filterItems } = useNavFlags();
  const visibleGroups = visibleGroupsFor(filterItems);
  // Con flags cargadas y el grupo social vacío (todo apagado), no se
  // deja la barra sin un solo destino: Inicio y Perfil nunca se apagan.
  const mobileItems = flags ? filterItems(MOBILE_ITEMS) : MOBILE_ITEMS;
  const finalMobileItems = mobileItems.length > 0
    ? mobileItems
    : MOBILE_ITEMS.filter((item) => item.id === "home" || item.id === "profile");

  return (
    <>
      <aside className="k-navigation" aria-label="Navegación principal de Kronos">
        <button className="k-navigation-brand" type="button" onClick={() => navigate("/home")} aria-label="Ir a Inicio">
          <span className="k-navigation-brand-mark">K</span>
          <span><strong>KRONOS</strong><small>RED SOCIAL</small></span>
        </button>

        <div className="k-navigation-scroll">
          {visibleGroups.map((group) => (
            <section className="k-navigation-group" key={group.id} aria-labelledby={`nav-group-${group.id}`}>
              <h2 id={`nav-group-${group.id}`}>{group.label}</h2>
              <div className="k-navigation-list">
                {group.items.map((item) => <NavigationItem key={item.id} item={item} section={section} />)}
              </div>
            </section>
          ))}
        </div>

        <p className="k-navigation-note">Pulsa <kbd>G</kbd> para abrir el mapa orbital de navegación.</p>
      </aside>

      <nav className="k-mobile-navigation" aria-label="Navegación social móvil">
        {finalMobileItems.map((item) => <NavigationItem key={item.id} item={item} section={section} mobile />)}
        {typeof onOpenMenu === "function" && (
          <button
            type="button"
            className="k-navigation-item is-mobile"
            onClick={onOpenMenu}
            aria-label="Abrir menú de todas las secciones"
            title="Más secciones"
          >
            <span className="k-navigation-icon">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <line x1="4" y1="7" x2="20" y2="7" />
                <line x1="4" y1="12" x2="20" y2="12" />
                <line x1="4" y1="17" x2="20" y2="17" />
              </svg>
            </span>
            <span className="k-navigation-copy">
              <strong>Más</strong>
            </span>
          </button>
        )}
      </nav>
    </>
  );
}
