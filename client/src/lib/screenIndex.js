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
     ruta        El camino (null si todavia no tiene)
     descripcion Que hace, en una linea
     origen      menu | boton | tecla | direccion | pendiente
     estado      visible | escondido | apagable | proximamente | fuera
     alias       Otros caminos que llevan al mismo lugar
   ============================================================ */

export const ORIGENES = {
  menu: "Menú lateral",
  boton: "Botón en pantalla",
  tecla: "Atajo de teclado",
  direccion: "Solo escribiendo la dirección",
  pendiente: "Todavía no se puede llegar"
};

export const ESTADOS = {
  visible: "A la vista",
  escondido: "Escondido",
  apagable: "Se puede apagar",
  proximamente: "Próximamente",
  fuera: "Fuera del alcance"
};

export const MAPA_PANTALLAS = [
  {
    id: "entrar",
    titulo: "Entrar",
    nota: "Lo primero que ve alguien que llega.",
    pantallas: [
      { nombre: "Entrada", ruta: "/", descripcion: "Decide a dónde ir: sesión o acceso.", origen: "direccion", estado: "visible" },
      { nombre: "Iniciar sesión", ruta: "/login", descripcion: "Acceso con correo o con Google.", origen: "direccion", estado: "visible" },
      { nombre: "Crear cuenta", ruta: "/register", descripcion: "Alta con correo.", origen: "boton", estado: "visible" },
      { nombre: "Recuperar contraseña", ruta: "/forgot-password", descripcion: "Pide el enlace de recuperación.", origen: "boton", estado: "visible" },
      { nombre: "Restablecer contraseña", ruta: "/reset-password", descripcion: "Cambia la contraseña con el enlace del correo.", origen: "direccion", estado: "visible" },
      { nombre: "Verificar correo", ruta: "/verify-email", descripcion: "Confirma la cuenta desde el correo.", origen: "direccion", estado: "visible" },
      { nombre: "Bienvenida", ruta: "/onboarding", descripcion: "Primeros pasos después del alta.", origen: "boton", estado: "escondido" }
    ]
  },
  {
    id: "social",
    titulo: "La red",
    nota: "El día a día: ver, publicar y conversar.",
    pantallas: [
      { nombre: "Inicio", ruta: "/home", descripcion: "Feed con historias, compositor y publicaciones.", origen: "menu", estado: "visible" },
      { nombre: "Pulso", ruta: "/pulse", descripcion: "Sesión corta de contenido, sin repetir.", origen: "menu", estado: "apagable" },
      { nombre: "Vertical", ruta: "/vertical", descripcion: "Videos a pantalla completa, tipo reel.", origen: "menu", estado: "apagable" },
      { nombre: "Explorar", ruta: "/explore", descripcion: "Búsqueda de personas y publicaciones.", origen: "menu", estado: "visible" },
      { nombre: "Publicación", ruta: "/post/:id", descripcion: "Una publicación con sus comentarios.", origen: "boton", estado: "visible" },
      { nombre: "Centro de creación", ruta: "/create", descripcion: "Elige qué crear: publicación, encuesta o evento.", origen: "menu", estado: "visible" },
      { nombre: "Nueva publicación", ruta: "/create/post", descripcion: "Compositor con fotos, video, encuestas y eventos.", origen: "boton", estado: "visible" },
      { nombre: "Historias en curso", ruta: "/stories/archive", descripcion: "Archivo de las historias publicadas.", origen: "boton", estado: "escondido", alias: ["/historias"] },
      { nombre: "Guardados", ruta: "/saved", descripcion: "Lo que conservaste, con colecciones privadas.", origen: "menu", estado: "visible" }
    ]
  },
  {
    id: "comunidad",
    titulo: "Comunidad",
    nota: "Donde la gente se junta: órbitas, círculos, canales y grupos.",
    pantallas: [
      { nombre: "Órbitas", ruta: "/orbits", descripcion: "Comunidades temáticas; cada una con su feed.", origen: "menu", estado: "apagable" },
      { nombre: "Feed de una órbita", ruta: "/orbits/:orbitId", descripcion: "Lo publicado dentro de una órbita.", origen: "boton", estado: "visible" },
      { nombre: "Círculos", ruta: "/circles", descripcion: "Audiencias privadas para publicar a pocos.", origen: "menu", estado: "apagable" },
      { nombre: "Canales", ruta: "/channels", descripcion: "Anuncios de comunidades.", origen: "menu", estado: "apagable" },
      { nombre: "Conversaciones", ruta: "/conversations", descripcion: "Grupos de mensajes.", origen: "menu", estado: "visible" },
      { nombre: "Un grupo", ruta: "/conversations/:conversationId", descripcion: "Un grupo concreto, abierto por su enlace.", origen: "boton", estado: "escondido" },
      { nombre: "Mensajes", ruta: "/messages", descripcion: "Conversaciones directas.", origen: "menu", estado: "visible" },
      { nombre: "Un mensaje directo", ruta: "/messages/:userId", descripcion: "Chat con una persona.", origen: "boton", estado: "visible" },
      { nombre: "En vivo", ruta: "/live", descripcion: "Audio y video con quien invites.", origen: "menu", estado: "apagable" },
      { nombre: "Notificaciones", ruta: "/notifications", descripcion: "Actividad de tu red.", origen: "menu", estado: "visible" }
    ]
  },
  {
    id: "persona",
    titulo: "La persona",
    nota: "Identidad, ajustes y lo que se recibe.",
    pantallas: [
      { nombre: "Perfil", ruta: "/profile", descripcion: "Tu portada, tus fotos y tu actividad.", origen: "menu", estado: "visible" },
      { nombre: "Perfil de alguien", ruta: "/profile/:username", descripcion: "Perfil por su nombre de usuario.", origen: "boton", estado: "visible", alias: ["/u/:username"] },
      { nombre: "Perfil por identificador", ruta: "/users/:id", descripcion: "El mismo perfil, por su identificador.", origen: "boton", estado: "escondido" },
      { nombre: "Buscar personas", ruta: "/users", descripcion: "Lista de personas y resultados.", origen: "boton", estado: "escondido" },
      { nombre: "Apoyar a un creador", ruta: null, descripcion: "Envía un apoyo desde el perfil de otra persona.", origen: "boton", estado: "escondido" },
      { nombre: "Apoyos recibidos", ruta: null, descripcion: "Historial de lo que te han apoyado.", origen: "pendiente", estado: "proximamente" },
      { nombre: "Cápsulas", ruta: "/capsules", descripcion: "Mensajes que se abren en una fecha futura.", origen: "menu", estado: "apagable" },
      { nombre: "Analítica", ruta: "/analytics", descripcion: "Tu alcance, en privado.", origen: "menu", estado: "apagable" },
      { nombre: "Biblioteca de medios", ruta: "/library", descripcion: "Todo lo que has subido y generado.", origen: "menu", estado: "visible" }
    ]
  },
  {
    id: "ajustes",
    titulo: "Ajustes y control",
    nota: "Lo que se toca de vez en cuando, pero tiene que estar claro.",
    pantallas: [
      { nombre: "Configuración", ruta: "/settings", descripcion: "Preferencias, privacidad, sesiones y datos.", origen: "menu", estado: "visible" },
      { nombre: "Ajustes de perfil", ruta: "/settings/profile", descripcion: "Hoy es un salto dentro de Configuración.", origen: "direccion", estado: "escondido" },
      { nombre: "Ajustes de seguridad", ruta: "/settings/security", descripcion: "Hoy es un salto dentro de Configuración.", origen: "direccion", estado: "escondido" },
      { nombre: "Moderación", ruta: "/moderation", descripcion: "Bloqueos, silencios y reportes.", origen: "menu", estado: "visible" },
      { nombre: "Administración", ruta: "/admin", descripcion: "Centro de control del sitio.", origen: "direccion", estado: "escondido" }
    ]
  },
  {
    id: "kairos",
    titulo: "Kairos",
    nota: "El estudio: se produce y se publica en el mismo lugar.",
    pantallas: [
      { nombre: "Kairos", ruta: "/kairos", descripcion: "Tablero del estudio: crear, armar y ajustar.", origen: "menu", estado: "visible" },
      { nombre: "Imagen", ruta: "/kairos/image", descripcion: "Genera conceptos visuales desde un texto.", origen: "menu", estado: "visible" },
      { nombre: "Video", ruta: "/kairos/video", descripcion: "De idea a pieza audiovisual.", origen: "menu", estado: "visible" },
      { nombre: "Guion", ruta: "/kairos/script", descripcion: "Guiones para reels, campañas e historias por escenas.", origen: "menu", estado: "visible" },
      { nombre: "Historial", ruta: "/kairos/history", descripcion: "Generaciones anteriores, para reutilizarlas.", origen: "boton", estado: "escondido" },
      { nombre: "Trabajos", ruta: "/kairos/video/jobs", descripcion: "Cola de videos, con su estado.", origen: "boton", estado: "escondido" },
      { nombre: "Estudio de foto y video", ruta: null, descripcion: "La pantalla completa de edición, hoy solo al publicar.", origen: "boton", estado: "escondido" },
      { nombre: "Audio (locución)", ruta: null, descripcion: "Voz a partir del guion.", origen: "pendiente", estado: "proximamente" },
      { nombre: "Voces y música", ruta: null, descripcion: "Catálogo de voces y de pistas.", origen: "pendiente", estado: "proximamente" },
      { nombre: "Proyectos", ruta: null, descripcion: "Un tablero por pieza: guion, tomas, música y versiones.", origen: "pendiente", estado: "proximamente" },
      { nombre: "Versiones y comparación", ruta: null, descripcion: "Comparar dos corridas y elegir una.", origen: "pendiente", estado: "proximamente" },
      { nombre: "Plantillas de formato", ruta: null, descripcion: "Reels, cuadrado y portada con textos ya armados.", origen: "pendiente", estado: "proximamente" }
    ]
  },
  {
    id: "sistema",
    titulo: "Sistema",
    nota: "Lo que existe en el código y casi nadie ve.",
    pantallas: [
      { nombre: "Todas las pantallas", ruta: "/pantallas", descripcion: "Este índice: la ruta de todo, buscable.", origen: "menu", estado: "visible" },
      { nombre: "Mapa de navegación", ruta: null, descripcion: "El círculo de destinos; hoy solo con la tecla G.", origen: "tecla", estado: "escondido" },
      { nombre: "Atajos de teclado", ruta: null, descripcion: "Lista de atajos; hoy con la tecla ?.", origen: "tecla", estado: "escondido" },
      { nombre: "Búsqueda global", ruta: null, descripcion: "Busca en todo el sitio; hoy con Control+K.", origen: "tecla", estado: "escondido" },
      { nombre: "No encontrado", ruta: "*", descripcion: "Lo que se ve cuando la dirección no existe.", origen: "direccion", estado: "visible" },
      { nombre: "Federación", ruta: null, descripcion: "Solo lectura: no se puede publicar desde fuera.", origen: "direccion", estado: "fuera" },
      { nombre: "Webhooks y flujos", ruta: null, descripcion: "Documentados, sin pantalla.", origen: "pendiente", estado: "fuera" }
    ]
  }
];

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
      sinAcentos([pantalla.nombre, pantalla.descripcion, pantalla.ruta, area.titulo].join(" ")).includes(texto)
    )
  })).filter((area) => area.pantallas.length > 0);
}
