import { useLocation, NavLink } from "react-router-dom";
import { KronosBrand } from "./brand/KronosBrand.jsx";
import {
  NAV_EMOJIS,
  NAV_GROUPS,
  MOBILE_ITEM_IDS,
  getCurrentSection
} from "../navigation/model.jsx";
import { useNavFlags } from "../navigation/useNavFlags";

// ============================================================
// KRONOS FAN NAV — barra lateral + barra táctil móvil.
//
// Los destinos, su emoji y la función de sección viven en
// `src/navigation/model.jsx` (fuente única compartida). Este archivo
// solo pinta el shell: no hay descripciones ni marcos. El destino se
// lee de un vistazo por su emoji y su nombre, nada más.
//
// `getCurrentSection` se reexporta por compatibilidad con los
// consumidores históricos (AppLayout/tests).
// ============================================================

export { getCurrentSection };

const visibleGroupsFor = (filterItems) =>
  NAV_GROUPS.map((group) => ({
    ...group,
    items: filterItems(group.items)
  })).filter((group) => group.items.length > 0);

// La barra móvil toma sus destinos de TODO el modelo, no solo del
// primer grupo: los destinos móviles están repartidos entre grupos y
// buscarlos solo en el primero dejaba la barra a medias.
const MOBILE_ITEMS = NAV_GROUPS
  .flatMap((group) => group.items)
  .filter((item) => MOBILE_ITEM_IDS.includes(item.id));

function isItemActive(itemId, section) {
  if (itemId === "kairos") return section === "kairos";
  return itemId === section;
}

function NavigationItem({ item, section, mobile = false }) {
  const active = isItemActive(item.id, section);
  const emoji = NAV_EMOJIS[item.emoji] || item.emoji;
  return (
    <NavLink
      to={item.to}
      end={item.id === "home" || item.id === "explore" || item.id === "profile"}
      className={`k-navigation-item ${active ? "is-active" : ""} ${mobile ? "is-mobile" : ""}`}
      aria-current={active ? "page" : undefined}
      title={mobile ? item.label : undefined}
    >
      <span className="k-navigation-icon" aria-hidden="true">{emoji}</span>
      <span className="k-navigation-copy">
        <strong>{item.label}</strong>
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
  // Con flags cargadas y todo el grupo social apagado, no se deja la
  // barra sin un solo destino: Inicio y Perfil nunca se apagan.
  const mobileItems = flags ? filterItems(MOBILE_ITEMS) : MOBILE_ITEMS;
  const finalMobileItems = mobileItems.length > 0
    ? mobileItems
    : MOBILE_ITEMS.filter((item) => item.id === "home" || item.id === "profile");

  return (
    <>
      <aside className="k-navigation" aria-label="Navegación principal de Kronos">
        <div className="k-navigation-brand">
          <KronosBrand text="K" className="k-navigation-brand-mark" size={1.15} />
          <span><KronosBrand /></span>
        </div>

        <div className="k-navigation-scroll">
          {visibleGroups.map((group) => (
            <section className="k-navigation-group" key={group.id} aria-labelledby={`nav-group-${group.id}`}>
              <h2 id={`nav-group-${group.id}`}>{group.label}</h2>
              <div className="k-navigation-list">
                {group.items.map((item) => (
                  <section key={item.id}>
                    <NavigationItem item={item} section={section} />
                    {item.children?.map((child) => (
                      <NavLink key={child.to} to={child.to} end className="k-navigation-subitem">
                        <span aria-hidden="true">{child.emoji}</span>
                        {child.label}
                      </NavLink>
                    ))}
                  </section>
                ))}
              </div>
            </section>
          ))}
        </div>
      </aside>

      <nav className="k-mobile-navigation" aria-label="Navegación social móvil">
        {finalMobileItems.map((item) => <NavigationItem key={item.id} item={item} section={section} mobile />)}
      </nav>
    </>
  );
}
