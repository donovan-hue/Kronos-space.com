import { useLocation, NavLink } from "react-router-dom";
import {
  NAV_ICONS,
  NAV_GROUPS,
  MOBILE_ITEM_IDS,
  getCurrentSection
} from "../navigation/model.jsx";
import { useNavFlags } from "../navigation/useNavFlags";

// ============================================================
// KRONOS — navegación del armazón: pestañas inferiores + índice.
//
// La organización es la de la referencia de diseño: una tira inferior
// fija con los cinco destinos de un toque y, fuera de la vista pero en
// el árbol de accesibilidad, el índice con TODAS las secciones (así
// ningún destino depende de abrir un diálogo, y el teclado y los
// lectores de pantalla llegan a todo). Los destinos, iconos y la
// función de sección viven en `src/navigation/model.jsx` (fuente única,
// compartida con el cajón «Más secciones» y el mapa orbital).
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

export default function FanNav() {
  const location = useLocation();
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
      {/* Índice de todas las secciones (fuera de la vista). Es el respaldo
          accesible de la tira inferior y mantiene cada destino a un tabulador
          de distancia, sin depender del cajón. */}
      <nav className="k-section-index" aria-label="Todas las secciones">
        {visibleGroups.flatMap((group) =>
          group.items.map((item) => (
            <NavLink key={`index-${item.id}`} to={item.to}>
              {item.label}
            </NavLink>
          ))
        )}
      </nav>

      {/* La tira inferior: cinco destinos, siempre visibles (móvil y
          escritorio), con el nombre de cada sección. */}
      <nav className="k-mobile-navigation" aria-label="Navegación social móvil">
        {finalMobileItems.map((item) => <NavigationItem key={item.id} item={item} section={section} mobile />)}
      </nav>
    </>
  );
}
