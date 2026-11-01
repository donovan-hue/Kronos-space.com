import { useLocation, NavLink } from "react-router-dom";
import {
  NAV_EMOJIS,
  NAV_GROUPS,
  TAB_ITEM_IDS,
  getCurrentSection,
} from "../../navigation/model.jsx";
import { useNavFlags } from "../../navigation/useNavFlags";

export { getCurrentSection };

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
    </NavLink>
  );
}

export default function TabBar() {
  const location = useLocation();
  const section = getCurrentSection(location.pathname);
  const { flags, filterItems } = useNavFlags();
  const visible = flags ? filterItems(TAB_ITEMS) : TAB_ITEMS;
  const items = visible.length > 0 ? visible : TAB_ITEMS.filter((item) => item.id === "home" || item.id === "profile");

  return (
    <nav className="k-app-tabbar" aria-label="Navegación principal">
      {items.map((item) => (
        <TabBarItem key={item.id} item={item} active={item.id === section} />
      ))}
    </nav>
  );
}
