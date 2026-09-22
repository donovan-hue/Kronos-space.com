import { useLocation, useNavigate, NavLink } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import { getFeatureFlags } from "../services/flagsService";

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
  ),
  channels: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 5.5h14v10H9l-4 3Z" />
      <path d="M8 9h8M8 12h5" />
    </svg>
  ),
  vertical: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="8" y="3.5" width="8" height="17" rx="2.6" />
      <path d="m10.8 12 1.7 1.7 3-3.2" />
    </svg>
  ),
  capsules: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M6.5 8.5a5.5 5.5 0 0 1 11 0v7a5.5 5.5 0 0 1-11 0Z" />
      <path d="M6.5 10.5h11M12 10.5V14" />
    </svg>
  ),
  pulse: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M3 12.5h4l2.5-6 4 11 2.5-5H21" />
    </svg>
  ),
  circles: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="8.5" cy="9" r="3.4" />
      <circle cx="15.5" cy="9" r="3.4" />
      <path d="M3.7 19.4a5.1 5.1 0 0 1 9.1 0M11.2 19.4a5.1 5.1 0 0 1 9.1 0" />
    </svg>
  ),
  orbits: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <ellipse cx="12" cy="12" rx="8.6" ry="3.8" transform="rotate(-28 12 12)" />
      <ellipse cx="12" cy="12" rx="8.6" ry="3.8" transform="rotate(28 12 12)" />
      <circle cx="12" cy="12" r="1.7" />
    </svg>
  )
};

const NAV_GROUPS = [
  {
    id: "social",
    label: "Social",
    items: [
      { id: "home", label: "Inicio", description: "Tu feed", to: "/home", icon: "home" },
      { id: "pulse", label: "Pulso", description: "Sesión finita sin repeticiones", to: "/pulse", icon: "pulse", flag: "pulse" },
      { id: "vertical", label: "Vertical", description: "Videos en pantalla completa", to: "/vertical", icon: "vertical", flag: "vertical" },
      { id: "explore", label: "Explorar", description: "Personas y publicaciones", to: "/explore", icon: "explore" },
      { id: "create", label: "Crear", description: "Centro de creación", to: "/create", icon: "create" },
      { id: "messages", label: "Mensajes", description: "Conversaciones directas", to: "/messages", icon: "messages" },
      { id: "groups", label: "Grupos", description: "Conversaciones grupales", to: "/conversations", icon: "groups" },
      { id: "channels", label: "Canales", description: "Anuncios de comunidades", to: "/channels", icon: "channels" },
      { id: "circles", label: "Círculos", description: "Audiencias privadas", to: "/circles", icon: "circles" },
      { id: "orbits", label: "Órbitas", description: "Comunidades temáticas", to: "/orbits", icon: "orbits" },
      { id: "capsules", label: "Cápsulas", description: "Mensajes que se abren en el futuro", to: "/capsules", icon: "capsules", flag: "capsules" },
      { id: "analytics", label: "Analítica", description: "Tu alcance privado", to: "/analytics", icon: "analytics", flag: "analytics" },
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
  "profile"
].includes(item.id));

export function getCurrentSection(pathname) {
  const p = pathname || "";
  if (p === "/home" || p === "/feed" || p === "/social") return "home";
  if (p.startsWith("/pulse")) return "pulse";
  if (p.startsWith("/vertical")) return "vertical";
  if (p === "/explore" || p === "/search" || p === "/users") return "explore";
  if (p.startsWith("/create")) return "create";
  if (p.startsWith("/messages")) return "messages";
  if (p.startsWith("/conversations")) return "groups";
  if (p.startsWith("/channels")) return "channels";
  if (p.startsWith("/circles")) return "circles";
  if (p.startsWith("/orbits")) return "orbits";
  if (p.startsWith("/capsules")) return "capsules";
  if (p.startsWith("/analytics")) return "analytics";
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

export default function FanNav({ onOpenMenu }) {
  const location = useLocation();
  const navigate = useNavigate();
  const section = useMemo(() => getCurrentSection(location.pathname), [location.pathname]);
  // Fase 0 — feature flags: la navegación se adapta a lo encendido.
  // Si el servidor no responde, todo queda visible (defaults en true).
  const [flags, setFlags] = useState(null);
  useEffect(() => {
    let active = true;
    getFeatureFlags()
      .then((value) => { if (active) setFlags(value); })
      .catch(() => { /* el servicio ya degrada a "todo encendido"; si aún
                        así falla, la navegación se queda con los
                        defaults y nunca rompe la app. */ });
    return () => { active = false; };
  }, []);
  const visibleGroups = useMemo(() => {
    if (!flags) return NAV_GROUPS;
    return NAV_GROUPS.map((group) => ({
      ...group,
      items: group.items.filter((item) => !item.flag || flags[item.flag] !== false)
    })).filter((group) => group.items.length > 0);
  }, [flags]);

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

        <p className="k-navigation-note">Las funciones se muestran por módulo para que cada área tenga un lugar claro.</p>
      </aside>

      <nav className="k-mobile-navigation" aria-label="Navegación social móvil">
        {MOBILE_ITEMS.map((item) => <NavigationItem key={item.id} item={item} section={section} mobile />)}
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
