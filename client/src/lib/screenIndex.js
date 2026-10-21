/* ============================================================
   MAPA DE PANTALLAS — la ruta de todo

   Fuente única de lo que existe en Kronos y en Kairos: cada pantalla,
   su ruta, dónde vive y cómo se llega a ella. De aquí salen dos cosas:

     1. La pantalla /pantallas (el indice), que lo muestra ordenado y
        buscable para que nada quede escondido.
     2. El documento docs/RUTAS-Y-NAVEGACION.md, que es este mismo mapa
        en texto para decidir que se mueve al menu y que se queda fuera.

   Campos de cada entrada:
     nombre      Como se llama para el usuario
     ruta        Pantalla operativa o ficha informativa con estado explícito
     descripcion Que hace, en una linea
     origen      menu | boton | tecla | direccion | pendiente
     estado      visible | escondido | apagable | proximamente | fuera
     alias       Otros caminos que llevan al mismo lugar
   ============================================================ */

export const ORIGENES = {
  menu: "Menú lateral",
  boton: "Botón en pantalla",
  tecla: "Atajo de teclado",
  direccion: "Dirección directa",
  pendiente: "Ficha pendiente de implementación"
};

export const ESTADOS = {
  visible: "A la vista",
  escondido: "Escondido",
  apagable: "Se puede apagar",
  proximamente: "Próximamente",
  fuera: "Fuera del alcance"
};

const AREAS_PANTALLAS = [
  {
    id: "entrar",
    titulo: "Entrar",
    nota: "Lo primero que ve alguien que llega.",
    pantallas: [
      { id: "entrada", nombre: "Entrada", ruta: "/", descripcion: "Decide a dónde ir: sesión o acceso.", origen: "direccion", estado: "visible" },
      { id: "iniciar-sesion", nombre: "Iniciar sesión", ruta: "/login", descripcion: "Acceso con correo o con Google.", origen: "direccion", estado: "visible" },
      { id: "crear-cuenta", nombre: "Crear cuenta", ruta: "/register", descripcion: "Alta con correo.", origen: "boton", estado: "visible" },
      { id: "recuperar-contrasena", nombre: "Recuperar contraseña", ruta: "/forgot-password", descripcion: "Pide el enlace de recuperación.", origen: "boton", estado: "visible" },
      { id: "restablecer-contrasena", nombre: "Restablecer contraseña", ruta: "/reset-password", descripcion: "Cambia la contraseña con el enlace del correo.", origen: "direccion", estado: "visible" },
      { id: "verificar-correo", nombre: "Verificar correo", ruta: "/verify-email", descripcion: "Confirma la cuenta desde el correo.", origen: "direccion", estado: "visible" },
      { id: "bienvenida", nombre: "Bienvenida", ruta: "/onboarding", descripcion: "Primeros pasos después del alta.", origen: "boton", estado: "visible" }
    ]
  },
  {
    id: "social",
    titulo: "La red",
    nota: "El día a día: ver, publicar y conversar.",
    pantallas: [
      { id: "inicio", nombre: "Inicio", ruta: "/home", descripcion: "Feed con historias, compositor y publicaciones.", origen: "menu", estado: "visible" },
      { id: "pulso", nombre: "Pulso", ruta: "/pulse", descripcion: "Sesión corta de contenido, sin repetir.", origen: "menu", estado: "apagable" },
      { id: "vertical", nombre: "Vertical", ruta: "/vertical", descripcion: "Videos a pantalla completa, tipo reel.", origen: "menu", estado: "apagable" },
      { id: "explorar", nombre: "Explorar", ruta: "/explore", descripcion: "Búsqueda de personas y publicaciones.", origen: "menu", estado: "visible", alias: ["/users"] },
      { id: "publicacion", nombre: "Publicación", ruta: "/post/:id", descripcion: "Una publicación con sus comentarios.", origen: "boton", estado: "visible" },
      { id: "centro-de-creacion", nombre: "Centro de creación", ruta: "/create", descripcion: "Elige qué crear: publicación, encuesta o evento.", origen: "menu", estado: "visible" },
      { id: "nueva-publicacion", nombre: "Nueva publicación", ruta: "/create/post", descripcion: "Compositor con fotos, video, encuestas y eventos.", origen: "boton", estado: "visible" },
      { id: "archivo-de-historias", nombre: "Archivo de historias", ruta: "/stories/archive", descripcion: "Archivo de las historias publicadas.", origen: "boton", estado: "visible", alias: ["/historias"] },
      { id: "guardados", nombre: "Guardados", ruta: "/saved", descripcion: "Lo que conservaste, con colecciones privadas.", origen: "menu", estado: "visible" }
    ]
  },
  {
    id: "comunidad",
    titulo: "Comunidad",
    nota: "Donde la gente se junta: órbitas, círculos, canales y grupos.",
    pantallas: [
      { id: "orbitas", nombre: "Órbitas", ruta: "/orbits", descripcion: "Comunidades temáticas; cada una con su feed.", origen: "menu", estado: "apagable" },
      { id: "feed-de-una-orbita", nombre: "Feed de una órbita", ruta: "/orbits/:orbitId", descripcion: "Lo publicado dentro de una órbita.", origen: "boton", estado: "visible" },
      { id: "circulos", nombre: "Círculos", ruta: "/circles", descripcion: "Audiencias privadas para publicar a pocos.", origen: "menu", estado: "apagable" },
      { id: "canales", nombre: "Canales", ruta: "/channels", descripcion: "Anuncios de comunidades.", origen: "menu", estado: "apagable" },
      { id: "conversaciones", nombre: "Conversaciones", ruta: "/conversations", descripcion: "Grupos de mensajes.", origen: "menu", estado: "visible" },
      { id: "un-grupo", nombre: "Un grupo", ruta: "/conversations/:conversationId", descripcion: "Un grupo concreto, abierto por su enlace.", origen: "boton", estado: "visible" },
      { id: "mensajes", nombre: "Mensajes", ruta: "/messages", descripcion: "Conversaciones directas.", origen: "menu", estado: "visible" },
      { id: "un-mensaje-directo", nombre: "Un mensaje directo", ruta: "/messages/:userId", descripcion: "Chat con una persona.", origen: "boton", estado: "visible" },
      { id: "en-vivo", nombre: "En vivo", ruta: "/live", descripcion: "Audio y video con quien invites.", origen: "menu", estado: "apagable" },
      { id: "notificaciones", nombre: "Notificaciones", ruta: "/notifications", descripcion: "Actividad de tu red.", origen: "menu", estado: "visible" }
    ]
  },
  {
    id: "persona",
    titulo: "La persona",
    nota: "Identidad, ajustes y lo que se recibe.",
    pantallas: [
      { id: "perfil", nombre: "Perfil", ruta: "/profile", descripcion: "Tu portada, tus fotos y tu actividad.", origen: "menu", estado: "visible" },
      { id: "perfil-de-alguien", nombre: "Perfil de alguien", ruta: "/profile/:username", descripcion: "Perfil por su nombre de usuario.", origen: "boton", estado: "visible", alias: ["/u/:username"] },
      { id: "perfil-por-identificador", nombre: "Perfil por identificador", ruta: "/users/:id", descripcion: "El mismo perfil, por su identificador.", origen: "boton", estado: "visible" },
      { id: "apoyar-a-un-creador", nombre: "Apoyar a un creador", ruta: "/support/:userId", descripcion: "Envía créditos simbólicos a un creador. No son pagos reales.", origen: "boton", estado: "visible" },
      { id: "apoyos-recibidos", nombre: "Apoyos recibidos", ruta: "/support", descripcion: "Historial privado de apoyos simbólicos recibidos y enviados.", origen: "boton", estado: "visible" },
      { id: "capsulas", nombre: "Cápsulas", ruta: "/capsules", descripcion: "Mensajes que se abren en una fecha futura.", origen: "menu", estado: "apagable" },
      { id: "analitica", nombre: "Analítica", ruta: "/analytics", descripcion: "Tu alcance, en privado.", origen: "menu", estado: "apagable" },
      { id: "biblioteca-de-medios", nombre: "Biblioteca de medios", ruta: "/library", descripcion: "Todo lo que has subido y generado.", origen: "menu", estado: "visible" }
    ]
  },
  {
    id: "ajustes",
    titulo: "Ajustes y control",
    nota: "Lo que se toca de vez en cuando, pero tiene que estar claro.",
    pantallas: [
      { id: "configuracion", nombre: "Configuración", ruta: "/settings", descripcion: "Preferencias, privacidad, sesiones y datos.", origen: "menu", estado: "visible" },
      { id: "ajustes-de-perfil", nombre: "Privacidad de la cuenta", ruta: "/settings/profile", descripcion: "Acceso directo a Configuración → Privacidad; no es otra pantalla.", origen: "boton", estado: "visible" },
      { id: "moderacion", nombre: "Moderación", ruta: "/moderation", descripcion: "Bloqueos, silencios y reportes.", origen: "menu", estado: "visible", alias: ["/settings/security"] },
      { id: "administracion", nombre: "Administración", acceso: "admin", ruta: "/admin", descripcion: "Centro de control del sitio.", origen: "direccion", estado: "visible" }
    ]
  },
  {
    id: "kairos",
    titulo: "Kairos",
    nota: "El estudio: se produce y se publica en el mismo lugar.",
    pantallas: [
      { id: "kairos", nombre: "Kairos", ruta: "/kairos", descripcion: "Tablero del estudio: crear, armar y ajustar.", origen: "menu", estado: "visible" },
      { id: "imagen", nombre: "Imagen", ruta: "/kairos/image", descripcion: "Genera conceptos visuales desde un texto.", origen: "menu", estado: "visible" },
      { id: "video", nombre: "Video", ruta: "/kairos/video", descripcion: "De idea a pieza audiovisual.", origen: "menu", estado: "visible" },
      { id: "guion", nombre: "Guion", ruta: "/kairos/script", descripcion: "Guiones para reels, campañas e historias por escenas.", origen: "menu", estado: "visible" },
      { id: "historial", nombre: "Historial", ruta: "/kairos/history", descripcion: "Generaciones anteriores, para reutilizarlas.", origen: "boton", estado: "visible" },
      { id: "trabajos", nombre: "Trabajos", ruta: "/kairos/video/jobs", descripcion: "Cola de videos, con su estado.", origen: "boton", estado: "visible" },
      { id: "estudio-de-foto-y-video", nombre: "Estudio de foto y video", ruta: "/kairos/studio", descripcion: "Edita fotos y videos con el estudio del compositor y publica cuando lo decidas.", origen: "boton", estado: "visible" },
      { id: "audio-locucion", nombre: "Audio (locución)", ruta: "/kairos/audio", descripcion: "Genera locución con las voces y el servicio configurados en el servidor.", origen: "boton", estado: "apagable" },
      { id: "voces-y-musica", nombre: "Voces y música", ruta: "/kairos/catalogs", descripcion: "Escucha el catálogo real de voces y pistas disponibles para el estudio.", origen: "boton", estado: "visible" },
      { id: "proyectos", nombre: "Proyectos", ruta: "/projects", descripcion: "Un tablero por pieza: guion, tomas, música y versiones.", origen: "menu", estado: "visible", alias: ["/projects/:projectId"] },
      { id: "versiones-y-comparacion", nombre: "Versiones y comparación", ruta: "/projects/:projectId", rutaFicha: "/projects", descripcion: "Comparar dos versiones del proyecto, escena por escena.", origen: "boton", estado: "visible" },
      { id: "plantillas-de-formato", nombre: "Plantillas de formato", ruta: "/projects/plantillas", descripcion: "Reels, cuadrado y portada con textos ya armados.", origen: "boton", estado: "visible" }
    ]
  },
  {
    id: "sistema",
    titulo: "Sistema",
    nota: "Navegación, herramientas del sistema e infraestructura documentada.",
    pantallas: [
      { id: "todas-las-pantallas", nombre: "Todas las pantallas", ruta: "/pantallas", descripcion: "Este índice: la ruta de todo, buscable.", origen: "menu", estado: "visible" },
      { id: "federacion", nombre: "Federación", ruta: null, descripcion: "Solo lectura: no se puede publicar desde fuera.", origen: "direccion", estado: "fuera" },
      { id: "webhooks-y-flujos", nombre: "Webhooks y flujos", ruta: null, descripcion: "Automatizaciones de infraestructura documentadas; no es un panel de usuario.", origen: "direccion", estado: "fuera" }
    ]
  }
];

// Toda entrada tiene una ficha enlazable. Una ficha pendiente explica su
// estado; asignarle dirección NO inventa una herramienta que aún no existe.
const RUTAS_PUBLICAS = new Set(["/", "/login", "/register", "/forgot-password", "/reset-password", "/verify-email"]);

export const MAPA_PANTALLAS = AREAS_PANTALLAS.map((area) => ({
  ...area,
  pantallas: area.pantallas.map((pantalla) => {
    const id = pantalla.id;
    const rutaFicha = pantalla.rutaFicha || `/funciones/${id}`;
    return {
      ...pantalla,
      id,
      rutaFicha,
      tipoRuta: pantalla.ruta ? "pantalla" : "ficha",
      ruta: pantalla.ruta || rutaFicha,
      acceso: pantalla.acceso || (RUTAS_PUBLICAS.has(pantalla.ruta) ? "publico" : "sesion")
    };
  })
}));

export function encontrarPantalla(id) {
  return MAPA_PANTALLAS.flatMap((area) => area.pantallas).find((pantalla) => pantalla.id === id);
}

export function parametrosDeRuta(ruta) {
  return [...ruta.matchAll(/:([a-zA-Z][a-zA-Z0-9]*)/g)].map((match) => match[1]);
}

// Nunca navegar a /post/:id ni sustituir identificadores por ejemplos falsos.
export function destinoPantalla(pantalla) {
  return parametrosDeRuta(pantalla.ruta).length ? pantalla.rutaFicha : pantalla.ruta;
}

export function completarRuta(ruta, valores) {
  return ruta.replace(/:([a-zA-Z][a-zA-Z0-9]*)/g, (_match, key) => {
    const valor = String(valores[key] || "").trim();
    if (!valor || valor === "." || valor === ".." || /[\s/\\?#]/u.test(valor)) {
      throw new Error("Escribe un identificador válido, sin espacios ni separadores de ruta.");
    }
    return encodeURIComponent(valor);
  });
}

/* Caminos viejos que llevan al mismo lugar. Se declaran aquí para que el
   índice los conozca y para que no se pierda ningún enlace compartido. */
export const ALIAS = {
  "/feed": "/home",
  "/social": "/home",
  "/search": "/explore",
  "/ai": "/kairos",
  "/ai/image": "/kairos/image",
  "/ai/script": "/kairos/script",
  "/ai/video": "/kairos/video",
  "/ai/video/jobs": "/kairos/video/jobs"
};

export function totalesDelMapa() {
  const pantallas = MAPA_PANTALLAS.flatMap((area) => area.pantallas);
  const porEstado = {};
  Object.keys(ESTADOS).forEach((estado) => {
    porEstado[estado] = pantallas.filter((pantalla) => pantalla.estado === estado).length;
  });
  return {
    total: pantallas.length,
    conRuta: pantallas.filter((pantalla) => Boolean(pantalla.ruta)).length,
    porEstado
  };
}

/* Búsqueda por nombre, descripción o ruta. Sin acentos, para que "cairos"
   encuentre "Kairos" y "informacion" encuentre "información". */
function sinAcentos(texto) {
  return String(texto || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

/* Palabras que la gente escribe distinto y deben encontrar lo mismo:
   "cairos" por Kairos, "cronos" por Kronos, "inicio" por la pantalla de
   entrada. Se resuelven antes de buscar, no en cada renglón. */
const SINONIMOS = {
  cairos: "kairos",
  cairo: "kairos",
  cronos: "kronos",
  inicio: "inicio",
  login: "iniciar sesion",
  signin: "iniciar sesion",
  registro: "crear cuenta",
  editar: "publicacion",
  reels: "vertical",
  historias: "historias"
};

export function buscarPantallas(consulta) {
  const limpio = sinAcentos(consulta).trim();
  const texto = SINONIMOS[limpio] || limpio;
  if (!texto) return MAPA_PANTALLAS;
  return MAPA_PANTALLAS.map((area) => ({
    ...area,
    pantallas: area.pantallas.filter((pantalla) =>
      sinAcentos([pantalla.nombre, pantalla.descripcion, pantalla.ruta, pantalla.rutaFicha, ...(pantalla.alias || []), area.titulo].join(" ")).includes(texto)
    )
  })).filter((area) => area.pantallas.length > 0);
}
