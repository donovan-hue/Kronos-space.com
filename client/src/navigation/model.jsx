// ============================================================
// KRONOS NAVIGATION MODEL — fuente única de verdad de la navegación
// ------------------------------------------------------------
// Todo el sistema de navegación (barra lateral, barra móvil, drawer
// «Todas las secciones») consume ESTE módulo. Nadie declara rutas
// en otro sitio: si una ruta no vive aquí y en App.jsx, no existe.
//
// Cada ítem declara:
//   id          → coincide con la clave que produce getCurrentSection()
//   to          → ruta REAL declarada en el router (App.jsx)
//   emoji       → representación de la función (un solo carácter)
//   ring        → anillo espacial: 0 = uso diario, 1 = gente, 2 = sistema
//   flag        → feature flag opcional (services/flagsService)
//
// REGLA: ningún destino del modelo puede quedar muerto — el spec
// navigation-3d cruza CADA `to` contra los <Route> de App.jsx.
// ============================================================

// ---------------- representación por emoji -----------------------
// Un carácter por función. Los SVG inline se quitaron: eran una segunda
// fuente de verdad visual (y 20 iconos más que mantener) para marcar lo
// mismo que ya dice el texto. El emoji ES la marca.
export const NAV_EMOJIS = {
  home: "🏠",
  explore: "🔎",
  create: "➕",
  messages: "💬",
  groups: "👥",
  live: "🔴",
  circles: "🎯",
  notifications: "🔔",
  capsules: "⏳",
  analytics: "📊",
  saved: "🔖",
  profile: "👤",
  pulse: "⚡",
  vertical: "🎬",
  kairos: "✨",
  settings: "⚙️",
  moderation: "🛡️"
};

// ---------------- grupos del shell lateral (dominios visibles) ------
// El reparto es lo que hace legible el menú: cuatro grupos equilibrados
// en vez de un bloque social de dieciséis entradas apretadas y un grupo
// de tres. El orden importa: es el eje de la transición direccional
// entre pantallas (navTransition.js).
export const NAV_GROUPS = [
  {
    id: "social",
    label: "Social",
    items: [
      { id: "home", label: "Inicio", to: "/home", emoji: "🏠", ring: 0 },
      { id: "explore", label: "Explorar", to: "/explore", emoji: "🔎", ring: 0 },
      { id: "create", label: "Crear", to: "/create", emoji: "➕", ring: 0 },
      { id: "messages", label: "Mensajes", to: "/messages", emoji: "💬", ring: 1 },
      { id: "notifications", label: "Notificaciones", to: "/notifications", emoji: "🔔", ring: 1 }
    ]
  },
  {
    id: "comunidad",
    label: "Comunidad",
    items: [
      { id: "pulse", label: "Pulso", to: "/pulse", emoji: "⚡", flag: "pulse", ring: 0 },
      { id: "vertical", label: "Vertical", to: "/vertical", emoji: "🎬", flag: "vertical", ring: 0 },
      { id: "groups", label: "Grupos", to: "/conversations", emoji: "👥", ring: 1 },
      { id: "circles", label: "Círculos", to: "/circles", emoji: "🎯", ring: 1 },
      { id: "live", label: "En vivo", to: "/live", emoji: "🔴", ring: 1 }
    ]
  },
  {
    id: "kairos",
    label: "Kairos",
    items: [
      { id: "kairos", label: "Centro de IA", to: "/kairos", emoji: "✨", ring: 2, children: [
        { label: "Generador de Imágenes", to: "/kairos/image", emoji: "🖼️" },
        { label: "Generador de Video", to: "/kairos/video", emoji: "🎥" },
        { label: "Generador de Guiones", to: "/kairos/script", emoji: "📝" },
        { label: "Proyectos", to: "/projects", emoji: "📁" },
        { label: "Estudio de foto y video", to: "/kairos/studio", emoji: "🎞️" },
        { label: "Multimedia IA", to: "/kairos/audio", emoji: "🎙️" },
        { label: "Historial", to: "/kairos/history", emoji: "🕘" },
        { label: "Trabajos de video", to: "/kairos/video/jobs", emoji: "📼" }
      ] }
    ]
  },
  {
    id: "account",
    label: "Cuenta",
    items: [
      { id: "capsules", label: "Cápsulas", to: "/capsules", emoji: "⏳", flag: "capsules", ring: 2 },
      { id: "analytics", label: "Analítica", to: "/analytics", emoji: "📊", flag: "analytics", ring: 2 },
      { id: "saved", label: "Guardados", to: "/saved", emoji: "🔖", ring: 2 },
      { id: "profile", label: "Perfil", to: "/profile", emoji: "👤", ring: 2 },
      { id: "settings", label: "Configuración", to: "/settings", emoji: "⚙️", ring: 2 },
      { id: "moderation", label: "Moderación", to: "/moderation", emoji: "🛡️", ring: 2 }
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
  live: "En vivo",
  circles: "Círculos",
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
 * shell, la barra móvil y las transiciones: los tres sistemas siempre
 * marcan lo mismo.
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
  if (p.startsWith("/live")) return "live";
  if (p.startsWith("/circles")) return "circles";
  if (p.startsWith("/capsules")) return "capsules";
  if (p.startsWith("/analytics")) return "analytics";
  if (p.startsWith("/notifications")) return "notifications";
  if (p.startsWith("/saved")) return "saved";
  if (p.startsWith("/profile") || p.startsWith("/users/")) return "profile";
  if (p.startsWith("/post/")) return "post";
  if (p.startsWith("/kairos") || p.startsWith("/ai") || p.startsWith("/projects") || p === "/library") return "kairos";
  if (p.startsWith("/settings") || p.startsWith("/admin")) return "settings";
  if (p.startsWith("/moderation")) return "moderation";
  if (p.startsWith("/support")) return "profile";
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

/** Anillos del mapa de destinos: ítems por ring, en el orden del modelo. */
export function buildRings(items) {
  const rings = [[], [], []];
  for (const item of items) {
    rings[item.ring ?? 1].push(item);
  }
  return rings;
}
