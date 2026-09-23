// ============================================================
// KRONOS NAVIGATION MODEL — fuente única de verdad de la navegación
// ------------------------------------------------------------
// Todo el sistema de navegación (barra lateral, barra móvil, drawer
// «Todas las secciones», mapa orbital 3D y transiciones direccionales)
// consume ESTE módulo. Nadie declara rutas en otro sitio: si una ruta
// no vive aquí y en App.jsx, no existe.
//
// Cada ítem declara:
//   id          → coincide con la clave que produce getCurrentSection()
//   to          → ruta REAL declarada en el router (App.jsx)
//   ring        → anillo espacial del mapa orbital:
//                   0 = Núcleo (contenido del día a día)
//                   1 = Red (personas, comunidad, directo)
//                   2 = Sistema (yo, estudio IA, cuenta)
//   flag        → feature flag opcional (services/flagsService)
//
// REGLA (auditoría UX 2026-09): ninguna destino del modelo puede quedar
// muerto — el spec navigation-3d cruza CADA `to` contra los <Route> de
// App.jsx para probarlo en CI.
// ============================================================

// ---------------- iconografía (SVG inline, stroke: currentColor) ----
export const NAV_ICONS = {
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
  live: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="3" />
      <path d="M7.2 7.2a6.8 6.8 0 0 0 0 9.6M16.8 7.2a6.8 6.8 0 0 1 0 9.6" />
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
  ),
  // KRONOS-UIX-AUDIT: «Analítica» referenciaba un icono inexistente.
  analytics: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M3.5 20h17" />
      <path d="M6.7 16.5v-4.2M12 16.5V7.5M17.3 16.5v-6" />
    </svg>
  )
};

// ---------------- grupos del shell lateral (dominios visibles) ------
// El orden importa: es el eje de la transición direccional entre
// pantallas (navTransition.js). Mover un ítem = mover la coreografía.
export const NAV_GROUPS = [
  {
    id: "social",
    label: "Social",
    items: [
      { id: "home", label: "Inicio", description: "Tu feed", to: "/home", icon: "home", ring: 0 },
      { id: "pulse", label: "Pulso", description: "Sesión finita sin repeticiones", to: "/pulse", icon: "pulse", flag: "pulse", ring: 0 },
      { id: "vertical", label: "Vertical", description: "Videos en pantalla completa", to: "/vertical", icon: "vertical", flag: "vertical", ring: 0 },
      { id: "explore", label: "Explorar", description: "Personas y publicaciones", to: "/explore", icon: "explore", ring: 0 },
      { id: "create", label: "Crear", description: "Centro de creación", to: "/create", icon: "create", ring: 0 },
      { id: "messages", label: "Mensajes", description: "Conversaciones directas", to: "/messages", icon: "messages", ring: 1 },
      { id: "groups", label: "Grupos", description: "Conversaciones grupales", to: "/conversations", icon: "groups", ring: 1 },
      { id: "channels", label: "Canales", description: "Anuncios de comunidades", to: "/channels", icon: "channels", ring: 1 },
      { id: "live", label: "En vivo", description: "Audio y video con quien invites", to: "/live", icon: "live", ring: 1 },
      { id: "circles", label: "Círculos", description: "Audiencias privadas", to: "/circles", icon: "circles", ring: 1 },
      { id: "orbits", label: "Órbitas", description: "Comunidades temáticas", to: "/orbits", icon: "orbits", ring: 1 },
      { id: "notifications", label: "Notificaciones", description: "Actividad de tu red", to: "/notifications", icon: "notifications", ring: 1 },
      { id: "capsules", label: "Cápsulas", description: "Mensajes que se abren en el futuro", to: "/capsules", icon: "capsules", flag: "capsules", ring: 2 },
      { id: "analytics", label: "Analítica", description: "Tu alcance privado", to: "/analytics", icon: "analytics", flag: "analytics", ring: 2 },
      { id: "saved", label: "Guardados", description: "Contenido conservado", to: "/saved", icon: "saved", ring: 2 },
      { id: "profile", label: "Perfil", description: "Tu identidad", to: "/profile", icon: "profile", ring: 2 }
    ]
  },
  {
    id: "kairos",
    label: "Kairos",
    items: [
      { id: "kairos", label: "Centro de IA", description: "Crear con Kairos", to: "/kairos", icon: "kairos", ring: 2 }
    ]
  },
  {
    id: "account",
    label: "Cuenta",
    items: [
      { id: "settings", label: "Configuración", description: "Preferencias y sesiones", to: "/settings", icon: "settings", ring: 2 },
      { id: "moderation", label: "Moderación", description: "Privacidad y seguridad", to: "/moderation", icon: "moderation", ring: 2 }
    ]
  }
];

// Barra móvil: mismos destinos, menos ruido. El orden se preserva del
// modelo para que la jerarquía espacial sea idéntica en móvil.
export const MOBILE_ITEM_IDS = ["home", "explore", "create", "messages", "profile"];

// Etiquetas del topbar: TODA sección que produce getCurrentSection().
export const SECTION_LABELS = {
  home: "Inicio",
  pulse: "Pulso",
  vertical: "Vertical",
  explore: "Explorar",
  create: "Centro de creación",
  messages: "Mensajes directos",
  groups: "Grupos",
  channels: "Canales",
  live: "En vivo",
  circles: "Círculos",
  orbits: "Órbitas",
  capsules: "Cápsulas del tiempo",
  analytics: "Analítica",
  post: "Publicación",
  notifications: "Notificaciones",
  saved: "Guardados",
  profile: "Perfil",
  kairos: "Kairos",
  settings: "Configuración",
  moderation: "Moderación"
};

/**
 * Sección activa para un pathname dado. Fuente única usada por el
 * shell, el mapa orbital, la barra móvil y las transiciones: los tres
 * sistemas siempre marcan lo mismo.
 */
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
  if (p.startsWith("/live")) return "live";
  if (p.startsWith("/circles")) return "circles";
  if (p.startsWith("/orbits")) return "orbits";
  if (p.startsWith("/capsules")) return "capsules";
  if (p.startsWith("/analytics")) return "analytics";
  if (p.startsWith("/notifications")) return "notifications";
  if (p.startsWith("/saved")) return "saved";
  if (p.startsWith("/profile") || p.startsWith("/users/")) return "profile";
  if (p.startsWith("/post/")) return "post";
  if (p.startsWith("/kairos") || p.startsWith("/ai") || p === "/library") return "kairos";
  if (p.startsWith("/settings") || p.startsWith("/admin")) return "settings";
  if (p.startsWith("/moderation")) return "moderation";
  return "";
}

/**
 * Eje de profundidad: lista plana ordenada por anillo (0 → 2) y por
 * posición de declaración. La transición entre pantallas mide su
 * distancia en esta lista para decidir hacia dónde se desliza el plano
 * saliente (más lejos = más desplazamiento, tope 3 pasos).
 */
export const NAV_ORDER = (() => {
  const flat = [];
  for (const ring of [0, 1, 2]) {
    for (const group of NAV_GROUPS) {
      for (const item of group.items) {
        if ((item.ring ?? 1) === ring) flat.push(item.id);
      }
    }
  }
  return flat;
})();

/** Anillos del mapa orbital: ítems por ring, en el orden del modelo. */
export function buildRings(items) {
  const rings = [[], [], []];
  for (const item of items) {
    rings[item.ring ?? 1].push(item);
  }
  return rings;
}
