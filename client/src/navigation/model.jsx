// ============================================================
// KRONOS NAVIGATION MODEL — fuente única de verdad de la navegación
// ------------------------------------------------------------
// Todo el sistema de navegación (barra inferior y menú de secciones)
// consume ESTE módulo. Nadie declara rutas en otro sitio: si una ruta no
// vive aquí y en App.jsx, no existe.
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

// ---------------- grupos del menú de secciones (dominios visibles) ---
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

// Barra inferior: los cinco destinos que se mantienen accesibles en todo
// momento, a cualquier ancho. El orden es el de la barra y es también el eje
// de lectura del shell; todo lo demás vive en el menú de secciones, que nunca
// repite estos destinos.
export const TAB_ITEM_IDS = ["home", "explore", "create", "kairos", "profile"];

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
 * Rutas que `NAV_GROUPS` no muestra pero que pertenecen a una sección: los
 * alias históricos que el router redirige (`/feed`, `/search`, `/users`), las
 * familias de URLs de un recurso (`/post/:id`, `/users/:id`, `/support/:id`),
 * los destinos sin entrada en el menú (`/admin`, `/library`) y los grupos de
 * rutas que el centro de IA absorbe (`/ai`, `/projects`). `exactas` se compara
 * palabra por palabra; `prefijos` vale para todo lo que cuelga de esa carpeta.
 *
 * Es la única lista que hay que tocar cuando nace una ruta nueva fuera del
 * menú. Todo lo demás se deriva del propio modelo de navegación, así que no
 * puede quedar desincronizado: si un destino entra en `NAV_GROUPS`, su sección
 * deja de calcularse a mano en otro archivo.
 */
const ALIAS_DE_SECCION = {
  home: { exactas: ["/feed", "/social"] },
  explore: { exactas: ["/search", "/users"] },
  profile: { prefijos: ["/users/", "/support"] },
  post: { prefijos: ["/post/"] },
  kairos: { prefijos: ["/ai"], exactas: ["/library"] },
  settings: { prefijos: ["/admin"] }
};

/**
 * Tabla `pathname → sección` derivada de `NAV_GROUPS` + `ALIAS_DE_SECCION`.
 * Se construye una vez al cargar el módulo: el coste es un bucle sobre el
 * modelo, no diecinueve `if` con prefijos escritos a mano que se olvidan de
 * actualizarse cuando cambia un destino.
 *
 * Un prefijo casa solo con su carpeta: `/profile` y `/profile/ana` son
 * «profile», `/profilex` no es nada. Así el mismo mecanismo sirve para rutas
 * exactas y para familias de recursos.
 */
export const TABLA_DE_SECCIONES = (() => {
  const exactas = new Map();
  const prefijos = [];
  const ponerPrefijo = (id, ruta) => {
    if (!ruta || ruta === "/") return;
    if (!prefijos.some((p) => p.ruta === ruta)) prefijos.push({ ruta, id });
  };
  const ponerExacta = (id, ruta) => {
    if (ruta && !exactas.has(ruta)) exactas.set(ruta, id);
  };

  for (const grupo of NAV_GROUPS) {
    for (const item of grupo.items ?? []) {
      ponerPrefijo(item.id, item.to);

      for (const hijo of item.children ?? []) ponerPrefijo(item.id, hijo.to);
    }
  }

  for (const [id, alias] of Object.entries(ALIAS_DE_SECCION)) {
    for (const ruta of alias.prefijos ?? []) ponerPrefijo(id, ruta);
    for (const ruta of alias.exactas ?? []) ponerExacta(id, ruta);
  }

  prefijos.sort((a, b) => b.ruta.length - a.ruta.length);

  return { exactas, prefijos };
})();

/** Rutas que la tabla resuelve, para poder afirmar sobre ella en una prueba. */
export const SECCIONES_RESUELTAS = (() => {
  const ids = new Set();

  for (const { id } of TABLA_DE_SECCIONES.prefijos) ids.add(id);
  for (const id of TABLA_DE_SECCIONES.exactas.values()) ids.add(id);

  return [...ids].sort();
})();

/**
 * Sección activa para un pathname dado. Fuente única usada por el
 * shell, la barra móvil y las transiciones: los tres sistemas siempre
 * marcan lo mismo, porque los tres consultan la misma tabla derivada.
 */
export function getCurrentSection(pathname) {
  const p = String(pathname || "");

  if (!p || p === "/") return "";

  const porExacta = TABLA_DE_SECCIONES.exactas.get(p);

  if (porExacta) return porExacta;

  for (const { ruta, id } of TABLA_DE_SECCIONES.prefijos) {
    if (p === ruta || p.startsWith(ruta.endsWith("/") ? ruta : `${ruta}/`)) return id;
  }

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
