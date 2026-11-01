import { useLocation, NavLink } from "react-router-dom";
import {
  NAV_EMOJIS,
  NAV_GROUPS,
  TAB_ITEM_IDS,
  getCurrentSection
} from "../../navigation/model.jsx";
import { useNavFlags } from "../../navigation/useNavFlags";

// ============================================================
// KRONOS TAB BAR — barra inferior de destinos.
//
// Los destinos, su emoji y la función de sección viven en
// `src/navigation/model.jsx`: la barra y el menú de secciones consumen el
// mismo modelo, así que marcan lo mismo y nunca declaran rutas propias.
//
// La barra se pinta a cualquier ancho de ventana. Es el acceso que no se
// oculta; los destinos que no caben aquí los muestra el menú de secciones,
// que excluye precisamente estos cinco para no duplicarlos.
//
// `getCurrentSection` se reexporta por compatibilidad con los consumidores
// históricos del módulo de navegación (AppLayout y sus pruebas).
// ============================================================

export { getCurrentSection };

// La barra toma sus destinos de TODO el modelo, no solo del primer grupo:
// están repartidos entre grupos y buscarlos solo en el primero dejaba la
// barra a medias.
const TAB_ITEMS = NAV_GROUPS
  .flatMap((group) => group.items)
  .filter((item) => TAB_ITEM_IDS.includes(item.id));

function TabBarItem({ item, active }) {
  const emoji = NAV_EMOJIS[item.emoji] || item.emoji;
  return (
    <NavLink
      to={item.to}
      end
      className={`k-navigation-item is-tab ${active ? "is-active" : ""}`}
      aria-current={active ? "page" : undefined}
      title={item.label}
    >
      <span className="k-navigation-icon" aria-hidden="true">{emoji}</span>
      <span className="k-navigation-copy">
        <strong>{item.label}</strong>
      </span>
    </NavLink>
  );
}

export default function TabBar() {
  const location = useLocation();
  const section = getCurrentSection(location.pathname);
  // Fase 0 — feature flags: la navegación se adapta a lo encendido.
  // Si el servidor no responde, todo queda visible (defaults en true).
  const { flags, filterItems } = useNavFlags();
  const visible = flags ? filterItems(TAB_ITEMS) : TAB_ITEMS;
  // Con las banderas cargadas y todo apagado no se deja la barra sin un solo
  // destino: Inicio y Perfil nunca se apagan.
  const items = visible.length > 0
    ? visible
    : TAB_ITEMS.filter((item) => item.id === "home" || item.id === "profile");

  return (
    <nav className="k-app-tabbar" aria-label="Navegación principal">
      {items.map((item) => (
        <TabBarItem key={item.id} item={item} active={item.id === section} />
      ))}
    </nav>
  );
}
