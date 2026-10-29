import { NAV_GROUPS } from "../../navigation/model.jsx";

/**
 * CENTRO DE AYUDA — el texto de `/ayuda`, escrito leyendo el código.
 *
 * Fuente de verdad, como en los documentos legales:
 *
 *  · el recorrido del shell ......... `client/src/layouts/AppLayout.jsx`, `client/src/components/navigation/`
 *  · las pantallas .................. `client/src/navigation/model.jsx` (los nombres salen de ahí)
 *  · cuenta y correo ............... `client/src/features/auth/`, `server/src/modules/auth/auth.routes.js`
 *  · sesiones y ajustes ............ `client/src/features/settings/Settings.jsx`
 *  · privacidad y borrado .......... `server/src/modules/users/profilePrivacy.js`, `accountDeletionPolicy.js`
 *  · moderación y apelaciones ...... `server/src/modules/moderation/`
 *  · lo que no está ................ `docs/LIMITES-Y-DEUDA.md`
 *
 * Dos reglas sostienen la página:
 *
 *  1. **Ningún destino del modelo de navegación se queda sin explicación.** La
 *     lista de pantallas se genera recorriendo `NAV_GROUPS`, así que añadir o
 *     quitar un destino obliga a pasar por aquí (el spec
 *     `client/test-ui/ayuda-publica.spec.jsx` falla si falta texto).
 *  2. **No se promete lo que el sistema no hace.** Los límites declarados
 *     (apoyos simbólicos, catálogos vacíos, tiempo real en una instancia, un
 *     solo idioma) se escriben arriba tal cual están en
 *     `docs/LIMITES-Y-DEUDA.md`, no suavizados.
 */

export const AYUDA_ACTUALIZADA = "2026-10-29";

/** Título de la página y frase que la describe en el encabezado. */
export const AYUDA_CABECERA = {
  eyebrow: "KRONOS-SPACE · CENTRO DE AYUDA",
  title: "Centro de ayuda",
  intro:
    "Cómo se recorre Kronos, qué hace cada pantalla, qué pasa con tus datos y qué es lo que el producto todavía no hace. Escrito leyendo el código, no desde una plantilla."
};

/** Una frase por destino del modelo. La clave es el `id` de `navigation/model.jsx`. */
export const AYUDA_PANTALLAS = {
  home: "Tu feed completo: las publicaciones de la gente y los círculos que sigues, con las historias arriba.",
  explore: "Encuentra personas y conversaciones públicas de tu comunidad.",
  create: "Una entrada clara para publicar, trabajar con Kairos y organizar lo que ya tienes.",
  messages: "Tus conversaciones directas: la lista reciente y el hilo abierto con esa persona.",
  notifications: "Lo que te menciona, te responde o te sigue. El encabezado dice cuántos quedan sin leer; si no quedan, dice «Todo al día».",
  pulse: "Tu sesión finita: hasta 8 publicaciones seleccionadas, sin repetir, una a la vez. Cuando termina, termina —el infinito vive en Inicio.",
  vertical: "Videos verticales de tu red, uno a la vez. Se recorren con las flechas arriba y abajo.",
  groups: "Conversaciones entre varias personas, con el historial compartido por todas.",
  circles: "Comparte publicaciones con grupos privados de personas que tú eliges.",
  live: "Salas de audio, video y pantalla. El audio sale de tu navegador directo a quien está en la sala: no hay servidor de retransmisión, así que dos redes con NAT simétrico pueden no conectar.",
  kairos: "Estudio de creación con IA. Sus herramientas se listan abajo, en el mismo orden en que aparecen en el menú de secciones.",
  capsules: "Guarda un mensaje cifrado que solo se revelará en la fecha que elijas.",
  analytics: "Privada, solo para ti: alcance e interacciones de tu propia obra.",
  saved: "Las publicaciones que marcaste para después.",
  profile: "Tu cuenta vista desde fuera: lo que otras personas ven de ti, con tus apoyos y tus enlaces de privacidad.",
  settings: "Cuenta, privacidad, publicaciones, preferencias y seguridad en un solo lugar.",
  moderation: "Bloqueos, silencios, publicaciones ocultas y tus reportes. La cola de revisión y la salud de comunidad solo aparecen para cuentas con rol de administración."
};

/**
 * Secciones de texto libre. `enlaces` solo puede apuntar a rutas **públicas**:
 * una pantalla de la aplicación exige sesión, y un enlace que rechaza al
 * visitante no es ayuda. Esas pantallas se nombran en la lista de arriba.
 */
export const AYUDA_SECCIONES = [
  {
    id: "recorrido",
    titulo: "Cómo se recorre Kronos",
    parrafos: [
      "Dos accesos están siempre a la mano. Abajo, una barra con cinco destinos —Inicio, Explorar, Crear, Centro de IA y Perfil— que se ve igual en el teléfono que en el escritorio. Arriba, la barra de contexto: el botón que abre el resto de las secciones, el nombre de la pantalla en la que estás y, a la derecha, la búsqueda, Notificaciones, Mensajes y la ayuda de atajos.",
      "Todo lo demás vive en el menú «Secciones»: las pantallas que no caben en la barra inferior y las ocho herramientas de Kairos. Se abre desde la barra de arriba y se cierra con Escape o con el botón «Cerrar menú». Ningún destino aparece dos veces: lo que está en la barra no se repite en el menú.",
      "La búsqueda global (⌘K en Mac, Ctrl+K en Windows y Linux) funciona desde cualquier pantalla y busca personas, temas y publicaciones."
    ]
  },
  {
    id: "cuenta",
    titulo: "Entrar, contraseña y correo",
    parrafos: [
      "Puedes crear una cuenta con correo y contraseña, o entrar con Google donde ese acceso esté activado. Con Google no hay contraseña que recordar; puedes fijarte una después desde Ajustes.",
      "Si olvidaste la contraseña, usa «¿Olvidaste tu contraseña?» en la pantalla de acceso: llega un enlace para restablecerla. Ese enlace caduca y sirve una sola vez. Si no te llega nada, revisa no deseados y pídelo otra vez —el aviso de que no se pudo enviar el correo aparece en la propia pantalla, no se esconde detrás de un «listo».",
      "Verificar el correo es opcional en la mayoría de los despliegues. Algunos lo piden para publicar: si te sale el aviso «Necesitas verificar tu correo antes de publicar», usa el enlace de ese aviso o pide uno nuevo en Verificación de correo. Tu texto y tu borrador no se pierden mientras lo haces."
    ]
  },
  {
    id: "sesiones",
    titulo: "Sesiones y dispositivos",
    parrafos: [
      "En Ajustes > Seguridad y dispositivos ves las sesiones abiertas, con su último uso. Puedes cerrar una o cerrar todas las demás; el cierre es inmediato: el acceso de esa sesión deja de funcionar en cualquier ruta protegida.",
      "En un dispositivo compartido, cierra sesión antes de irte. «Recordar sesión» al entrar es lo que hace que el navegador la guarde; sin marcarla, el acceso vive lo que vive la ventana."
    ]
  },
  {
    id: "privacidad",
    titulo: "Privacidad, datos y borrado",
    parrafos: [
      "Tres controles de privacidad están en Ajustes: mostrar o no tu descripción en tu perfil, mostrar o no tus conteos de seguidos y seguidores, y aparecer o no en Explorar. Los tres están activados por defecto.",
      "Los archivos que subes se sirven por una dirección pública: quien tenga el enlace puede verlos. No es un almacén privado —lo es el feed—, así que lo que no debe ser público no debe publicarse. Las publicaciones en círculos y los mensajes directos no salen de ahí.",
      "Puedes pedir la exportación de tus datos desde Ajustes. Borrar la cuenta está en el mismo lugar y pide una credencial: tu contraseña, o —si entraste con Google y nunca fijaste una— escribir tu propio nombre de usuario. Quien tiene contraseña no puede usar el segundo camino: no son dos formas equivalentes, es una por caso."
    ]
  },
  {
    id: "limites",
    titulo: "Lo que el producto todavía no hace",
    parrafos: [
      "Los apoyos ★ son simbólicos: no hay pasarela de pago y ningún cobro se procesa. La página y el diálogo de apoyos lo dicen en la propia pantalla.",
      "Las herramientas de IA dependen del proveedor configurado. Imagen, guion y locución funcionan; el video se declara «no configurado» hasta que exista proveedor, y los catálogos de voces y de pistas empiezan vacíos porque los publica quien administra la plataforma: no hay relleno inventado.",
      "El Centro de IA escribe, genera y responde. El chat es una herramienta suelta: no arma tareas de varios pasos por su cuenta ni publica sin que se lo pidas.",
      "El tiempo real va sobre una sola instancia. Las salas de audio y video van de navegador a navegador, sin servidor de retransmisión, con lo que dos redes con NAT simétrico pueden no conectar.",
      "La interfaz está en un solo idioma. En Ajustes puedes elegir el idioma en que responden Kairos y el chat; eso no traduce las pantallas."
    ]
  },
  {
    id: "moderacion",
    titulo: "Reportar, bloquear y apelar",
    parrafos: [
      "Desde una publicación o un perfil puedes reportar: spam, acoso, discurso de odio, contenido sexual, violencia, autolesión, desinformación u otro motivo. El reporte queda en tu lista y puedes seguirlo.",
      "Bloquear corta la interacción en las dos direcciones. Silenciar saca a esa persona de tu vista sin avisarle. Ocultar una publicación la retira de tu feed, y volver a mostrarla la devuelve.",
      "Si un reporte tuyo fue descartado, puedes pedir una segunda revisión desde tu lista de reportes: una apelación por reporte. Quien revisa ve el motivo, la conversación y —cuando el contenido pertenece a una cuenta recién creada— ese dato, porque el criterio de «cuenta nueva» ordena la cola, no castiga a nadie por tener la cuenta vieja o nueva."
    ]
  },
  {
    id: "estado",
    titulo: "Estado del servicio y fallos a la vista",
    parrafos: [
      "Hay una página pública de estado, sin necesidad de cuenta. Distingue tres cosas: que el servicio funcione, que esté degradado (contesta, pero algo de lo que depende no está bien) y que no responda. No dice «todo bien» cuando la API no contesta.",
      "Cuando algo falla en una pantalla, el aviso aparece en esa pantalla y se puede reintentar desde ahí. Un fallo de red no se disfraza de carga eterna ni de lista vacía."
    ]
  }
];

/** Enlaces del pie: todo rutas públicas, legibles sin cuenta. */
export const AYUDA_ENLACES = [
  { to: "/estado", label: "Estado del servicio" },
  { to: "/terminos", label: "Términos" },
  { to: "/privacidad", label: "Privacidad" },
  { to: "/cookies", label: "Cookies" },
  { to: "/login", label: "Entrar" },
  { to: "/register", label: "Crear cuenta" }
];

/**
 * La lista de pantallas, derivada del modelo: grupos en el orden del menú, con
 * las sub-herramientas de cada destino. No se escribe a mano para que no pueda
 * quedar desincronizada del menú real.
 */
export function gruposDeAyuda() {
  return NAV_GROUPS.map((grupo) => ({
    id: grupo.id,
    etiqueta: grupo.label,
    destinos: grupo.items.map((item) => ({
      id: item.id,
      emoji: item.emoji,
      etiqueta: item.label,
      texto: AYUDA_PANTALLAS[item.id] || "",
      hijos: (item.children || []).map((hijo) => `${hijo.emoji} ${hijo.label}`)
    }))
  }));
}
