import { useLocation, useNavigate, NavLink } from "react-router-dom";
import { useMemo } from "react";

const ICONS = {
  home: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M3.5 11.4 12 4l8.5 7.4" />
      <path d="M5.6 9.8V20h12.8V9.8" />
      <path d="M9.8 20v-5.2h4.4V20" />
    </svg>
  ),
  explore: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="10.8" cy="10.8" r="6.3" />
      <path d="m15.4 15.4 4.8 4.8" />
    </svg>
  ),
  create: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="4.5" y="4.5" width="15" height="15" rx="3.2" />
      <path d="M12 8.7v6.6M8.7 12h6.6" />
    </svg>
  ),
  messages: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M20 6.5a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2V14a2 2 0 0 0 2 2h1.4v3l3.6-3H18a2 2 0 0 0 2-2Z" />
      <path d="M8 9.3h8M8 12.4h5" />
    </svg>
  ),
  notifications: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M6 16v-5a6 6 0 0 1 12 0v5l1.6 2.4H4.4Z" />
      <path d="M10.2 20.6a2 2 0 0 0 3.6 0" />
    </svg>
  ),
  saved: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M6 4.5A2.5 2.5 0 0 1 8.5 2H18v18l-6-3.7L6 20Z" />
    </svg>
  ),
  profile: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="8" r="3.6" />
      <path d="M5.4 19.6a6.6 6.6 0 0 1 13.2 0" />
    </svg>
  ),
  kairos: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3Z" />
    </svg>
  ),
  settings: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="2.8" />
      <path d="M12 3.2v2.2M12 18.6v2.2M20.8 12h-2.2M5.4 12H3.2M18.2 5.8l-1.6 1.6M7.4 16.6l-1.6 1.6M18.2 18.2l-1.6-1.6M7.4 7.4 5.8 5.8" />
    </svg>
  ),
  moderation: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 3.5 19 6v5.2c0 4.3-2.9 7.7-7 9.3-4.1-1.6-7-5-7-9.3V6Z" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  ),
  groups: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="9" cy="8" r="3" />
      <circle cx="16.5" cy="9" r="2.3" />
      <path d="M3.8 19a5.2 5.2 0 0 1 10.4 0M14.2 14.7a4.2 4.2 0 0 1 6 3.8" />
    </svg>
  )
};

const NAV_GROUPS = [
  {
    id: "social",
    label: "Social",
    items: [
      { id: "home", label: "Inicio", description: "Tu feed", to: "/home", icon: "home" },
      { id: "explore", label: "Explorar", description: "Personas y publicaciones", to: "/explore", icon: "explore" },
      { id: "create", label: "Crear", description: "Nueva publicación", to: "/create", icon: "create" },
      { id: "messages", label: "Mensajes", description: "Conversaciones directas", to: "/messages", icon: "messages" },
      { id: "groups", label: "Grupos", description: "Conversaciones grupales", to: "/conversations", icon: "groups" },
      { id: "notifications", label: "Notificaciones", description: "Actividad de tu red", to: "/notifications", icon: "notifications" },
      { id: "saved", label: "Guardados", description: "Contenido conservado", to: "/saved", icon: "saved" },
      { id: "profile", label: "Perfil", description: "Tu identidad", to: "/profile", icon: "profile" }
    ]
  },
  {
    id: "kairos",
    label: "Kairos",
    items: [
      { id: "kairos", label: "Centro de IA", description: "Crear con Kairos", to: "/kairos", icon: "kairos" }
    ]
  },
  {
    id: "account",
    label: "Cuenta",
    items: [
      { id: "settings", label: "Configuración", description: "Preferencias y sesiones", to: "/settings", icon: "settings" },
      { id: "moderation", label: "Moderación", description: "Privacidad y seguridad", to: "/moderation", icon: "moderation" }
    ]
  }
];

const MOBILE_ITEMS = NAV_GROUPS[0].items.filter((item) => [
  "home",
  "explore",
  "create",
  "messages",
  "notifications",
  "profile"
].includes(item.id));

export function getCurrentSection(pathname) {
  const p = pathname || "";
  if (p === "/home" || p === "/feed" || p === "/social") return "home";
  if (p === "/explore" || p === "/search" || p === "/users") return "explore";
  if (p.startsWith("/create")) return "create";
  if (p.startsWith("/messages")) return "messages";
  if (p.startsWith("/conversations")) return "groups";
  if (p.startsWith("/notifications")) return "notifications";
  if (p.startsWith("/saved")) return "saved";
  if (p.startsWith("/profile") || p.startsWith("/users/")) return "profile";
  if (p.startsWith("/kairos") || p.startsWith("/ai") || p === "/library") return "kairos";
  if (p.startsWith("/settings") || p.startsWith("/admin")) return "settings";
  if (p.startsWith("/moderation")) return "moderation";
  return "";
}

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
      <span className="k-navigation-icon">{ICONS[item.icon]}</span>
      <span className="k-navigation-copy">
        <strong>{item.label}</strong>
        {!mobile && <small>{item.description}</small>}
      </span>
    </NavLink>
  );
}

export default function FanNav() {
  const location = useLocation();
  const navigate = useNavigate();
  const section = useMemo(() => getCurrentSection(location.pathname), [location.pathname]);

  return (
    <>
      <aside className="k-navigation" aria-label="Navegación principal de Kronos">
        <button className="k-navigation-brand" type="button" onClick={() => navigate("/home")} aria-label="Ir a Inicio">
          <span className="k-navigation-brand-mark">K</span>
          <span><strong>KRONOS</strong><small>RED SOCIAL</small></span>
        </button>

        <div className="k-navigation-scroll">
          {NAV_GROUPS.map((group) => (
            <section className="k-navigation-group" key={group.id} aria-labelledby={`nav-group-${group.id}`}>
              <h2 id={`nav-group-${group.id}`}>{group.label}</h2>
              <div className="k-navigation-list">
                {group.items.map((item) => <NavigationItem key={item.id} item={item} section={section} />)}
              </div>
            </section>
          ))}
        </div>

        <p className="k-navigation-note">Las funciones se muestran por módulo para que cada área tenga un lugar claro.</p>
      </aside>

      <nav className="k-mobile-navigation" aria-label="Navegación social móvil">
        {MOBILE_ITEMS.map((item) => <NavigationItem key={item.id} item={item} section={section} mobile />)}
      </nav>
    </>
  );
}
