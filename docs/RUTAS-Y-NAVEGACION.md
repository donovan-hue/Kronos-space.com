# Rutas y navegación de Kronos Space

> Documento **escrito a mano**. La fuente de verdad son dos archivos:
> `client/src/App.jsx` (el router) y `client/src/navigation/model.jsx` (el modelo
> de navegación). Si el código y este documento se contradicen, **manda el
> código**; el spec `client/test-ui/navigation-3d.spec.jsx` cruza cada destino
> del modelo contra los `<Route>` reales y falla si aparece un enlace muerto.

## Cómo está organizada la navegación

El shell son **dos capas que consumen el mismo modelo**
(`client/src/navigation/model.jsx`): una barra inferior de cinco destinos y un
menú de secciones con todo lo demás. No hay barra lateral de escritorio. Cada
destino se identifica con un **emoji** y su nombre —el emoji es la marca; los
SVG inline se sacaron del modelo para que no existiera una segunda fuente
visual de lo mismo—, sin descripciones, sin letras sueltas y sin recuadros. El
estado activo se marca con un fondo más claro y el texto en blanco.

| Grupo | Fijado en la barra inferior | En el menú «Secciones» |
|---|---|---|
| **Social** | Inicio 🏠, Explorar 🔎, Crear ➕ | Mensajes 💬, Notificaciones 🔔 |
| **Comunidad** | — | Pulso ⚡, Vertical 🎬, Grupos 👥, Círculos 🎯, En vivo 🔴 |
| **Kairos** | Centro de IA ✨ | sus ocho herramientas (🖼️ 🎥 📝 📁 🎞️ 🎙️ 🕘 📼) |
| **Cuenta** | Perfil 👤 | Cápsulas ⏳, Analítica 📊, Guardados 🔖, Configuración ⚙️, Moderación 🛡️ |

- **Barra inferior** (`components/navigation/TabBar.jsx`, `.k-app-tabbar`):
  los cinco destinos de `TAB_ITEM_IDS`, a **cualquier ancho** —su `display`
  vive en la base de la hoja, no en una media query, así que escritorio y móvil
  ofrecen las mismas cinco salidas. `TAB_ITEM_IDS` es la única lista que decide
  qué se fija abajo: al cambiarla cambian a la vez la barra y lo que el menú
  deja de repetir.
- **Cabecera** (`.k-app-topbar`): botón que abre el menú de secciones, la marca
  `K` junto a la etiqueta de la sección activa, y a la derecha
  `nav.k-app-topbar-actions` con búsqueda global (icono que abre
  `GlobalSearchModal`; ⌘K / Ctrl+K sigue), Notificaciones 🔔, Mensajes 💬 y
  ayuda `?`. Los dos del centro son `NavLink` reales a `/notifications` y
  `/messages` y se marcan cuando la ruta es la suya. **No pintan contador**:
  el no-leídos viaja dentro de las listas de `GET /api/notifications` y del
  agregado de conversaciones, y sin un endpoint ligero no hay nada que mostrar
  en vivo.
- **Menú «Secciones»** (`components/navigation/MenuDrawer.jsx`, Radix Dialog):
  los doce destinos que no están fijados, en los mismos cuatro grupos, más las
  ocho herramientas de Kairos. Un destino fijado **nunca se repite** aquí; de él
  solo se heredan sus `children`, para que ninguna herramienta quede sin acceso
  por no estar repetida. Se abre desde la cabecera y se cierra con Escape o con
  «Cerrar menú», y al cerrar devuelve el foco a su disparador.
- **Feature flags**: Pulso, Vertical, Cápsulas y Analítica pasan por
  `useNavFlags().filterItems`, así que un flag apagado retira el destino de la
  barra y del menú a la vez. Si el servidor no responde, todo queda visible; y
  si las banderas llegaran a apagar los cinco destinos de la barra, Inicio y
  Perfil se pintan igual, para no dejar el shell sin navegación.
- **Grupos** es el destino de comunidad (`/conversations`). **Órbitas y Canales
  ya no existen**: eran la misma idea que Grupos con dos nombres.
- La sección activa la calcula una sola función, `getCurrentSection()`, en
  `navigation/model.jsx`. La usan la barra, la cabecera y el menú, de modo que
  los tres marcan siempre lo mismo; `TabBar.jsx` la reexporta para los
  consumidores históricos del módulo.

## Entrar

| Función | Ruta | Acceso | Permiso |
|---|---|---|---|
| Entrada | `/` | redirige a `/login` o `/home` | Público |
| Iniciar sesión | `/login` | `/login` | Público |
| Crear cuenta | `/register` | `/register` | Público |
| Recuperar contraseña | `/forgot-password` | `/forgot-password` | Público |
| Restablecer contraseña | `/reset-password` | `/reset-password` | Público |
| Verificar correo | `/verify-email` | `/verify-email` | Público |
| Bienvenida | `/onboarding` | `/onboarding` | Sesión |

## Leer sin cuenta

Cinco rutas declaradamente públicas. Viven **fuera** del árbol protegido de
`App.jsx`, antes del comodín `*`, porque el visitante que aún no tiene cuenta
tiene derecho a leer las condiciones, a consultar el estado y a enterarse de qué
hace cada pantalla antes de crearla. No aparecen en `navigation/model.jsx`: el
modelo solo describe destinos de la aplicación, y el spec de navegación no las
exige.

| Función | Ruta | Contenido |
|---|---|---|
| Términos del servicio | `/terminos` | `features/legal/TerminosPage.jsx` |
| Aviso de privacidad | `/privacidad` | `features/legal/PrivacidadPage.jsx` |
| Cookies y almacenamiento | `/cookies` | `features/legal/CookiesPage.jsx` |
| Estado del servicio | `/estado` | `features/status/StatusPage.jsx`, lee `GET /api/health` |
| Centro de ayuda | `/ayuda` | `features/help/AyudaPage.jsx` con el texto en `features/help/ayuda.js` |

- Los tres documentos se escriben desde un solo archivo de datos,
  `features/legal/legalDocuments.js`, y comparten la hoja
  `LegalDocumentPage.jsx`. La versión (`VERSION_LEGAL`) es única para los tres:
  cambiar el tratamiento de datos exige cambiar el documento y su fecha en el
  mismo commit.
- Enlazan desde el pie del acceso (`features/auth/Auth.jsx`) y desde
  Ajustes > Privacidad y datos, y el pie del acceso se ve también en la portada
  del login, no solo con el formulario abierto.
- Sellado por `client/test-ui/legal-and-status.spec.jsx`: las cuatro primeras se
  montan sin sesión (no caen en `/login`), ningún documento sale cascarón y la
  página de estado refleja los tres estados posibles del endpoint de salud.
- El centro de ayuda se escribe con la misma regla que los legales —leo el código,
  no una plantilla— y su lista de pantallas **se genera** recorriendo
  `NAV_GROUPS`: no hay una segunda copia de los destinos que se pueda
  desincronizar. Sellado por `client/test-ui/ayuda-publica.spec.jsx` (7 casos: se
  monta sin sesión, ninguna sección sale cascarón, ningún destino del modelo se
  queda sin explicar, las ocho herramientas de Kairos están listadas, el índice no
  tiene anclas muertas, la tabla de atajos es la del panel de `?` y el texto no
  promete un cobro). Se enlaza desde el pie del acceso, desde el panel de atajos y
  desde el 404.

## La red

El día a día: ver, publicar y conversar.

| Función | Ruta | Acceso | Permiso |
|---|---|---|---|
| Inicio | `/home` | `/home` | Sesión |
| Pulso | `/pulse` | `/pulse` | Sesión |
| Vertical | `/vertical` | `/vertical` | Sesión |
| Explorar | `/explore` | `/explore` | Sesión |
| Publicación | `/post/:id` | `/post/:id` | Sesión |
| Centro de creación | `/create` | `/create` | Sesión |
| Nueva publicación | `/create/post` | `/create/post` | Sesión |
| Archivo de historias | `/stories/archive` | `/stories/archive` | Sesión |
| Guardados | `/saved` | `/saved` | Sesión |

## Comunidad

| Función | Ruta | Acceso | Permiso |
|---|---|---|---|
| Mensajes directos | `/messages`, `/messages/:userId` | `/messages` | Sesión |
| **Grupos** | `/conversations`, `/conversations/:conversationId` | `/conversations` | Sesión |
| Círculos | `/circles` | `/circles` | Sesión |
| En vivo | `/live` | `/live` | Sesión |
| Historias (alias) | `/historias` | redirige a `/stories/archive` | Sesión |

## Kairos

| Función | Ruta | Acceso | Permiso |
|---|---|---|---|
| Centro de IA | `/kairos` | `/kairos` | Sesión |
| Generador de imágenes | `/kairos/image` | `/kairos/image` | Sesión |
| Generador de vídeo | `/kairos/video` | `/kairos/video` | Sesión |
| Generador de guiones | `/kairos/script` | `/kairos/script` | Sesión |
| Estudio de foto y vídeo | `/kairos/studio` | `/kairos/studio` | Sesión |
| Multimedia IA | `/kairos/audio` | `/kairos/audio` | Sesión |
| Catálogos de audio | `/kairos/catalogs` | `/kairos/catalogs` | Sesión |
| Historial | `/kairos/history` | `/kairos/history` | Sesión |
| Trabajos de vídeo | `/kairos/video/jobs` | `/kairos/video/jobs` | Sesión |

## Proyectos y biblioteca

| Función | Ruta | Acceso | Permiso |
|---|---|---|---|
| Proyectos | `/projects` | `/projects` | Sesión |
| Plantillas de formato | `/projects/plantillas` | `/projects/plantillas` | Sesión |
| Tablero del proyecto | `/projects/:projectId` | `/projects/:projectId` | Sesión |
| Biblioteca multimedia | `/library` | `/library` | Sesión |

## Cuenta

| Función | Ruta | Acceso | Permiso |
|---|---|---|---|
| Perfil | `/profile` | `/profile` | Sesión |
| Perfil por nombre | `/profile/:username` | `/profile/:username` | Sesión |
| Perfil por alias | `/u/:username`, `/users/:id` | alias de perfil | Sesión |
| Notificaciones | `/notifications` | `/notifications` | Sesión |
| Configuración | `/settings` | `/settings` | Sesión |
| Configuración de perfil | `/settings/profile` | redirige a `/settings` | Sesión |
| Seguridad | `/settings/security` | redirige a `/settings` | Sesión |
| Moderación | `/moderation` | `/moderation` | Sesión (admin) |
| Apoyo a creador | `/support`, `/support/:userId` | `/support` | Sesión |
| Página no encontrada | `*` | — | Público |

## Alias que se conservan

Estos alias existen para que los enlaces antiguos sigan funcionando; no
aparecen en la navegación porque no son destinos de uso:

| Alias | Redirige a |
|---|---|
| `/feed`, `/social` | `/home` |
| `/search` | `/explore` |
| `/users` | `/explore` |
| `/historias` | `/stories/archive` |
| `/ai`, `/ai/image`, `/ai/script`, `/ai/video`, `/ai/video/jobs` | su equivalente en `/kairos/*` |
| `/settings/profile`, `/settings/security` | `/settings` |

## Lo que se retiró

Estas rutas **ya no existen**. No hay enlaces, servicios, modelos de base de
datos ni pantallas que las atendan:

| Ruta retirada | Motivo |
|---|---|
| `/orbits`, `/orbits/:orbitId` | Órbitas y Grupos eran la misma función: se queda **Grupos** (`/conversations`). |
| `/channels` | Los Canales dependían estructuralmente de una Órbita (`Channel.orbit` era obligatorio): vanished con ella. |
| `/pantallas` | El demo de pantallas y su catálogo (`lib/screenIndex.js`). Este documento es su sustituto. |
| `/funciones`, `/funciones/:featureId` | El directorio por fichas: la navegación real es el modelo de destinos. |

Los datos históricos en MongoDB (`orbits`, `channels`, `channelmessages` y las
publicaciones con `audience.type = "orbit"`) **no se borran**: se quedan como
residuo. La verificación de integridad avisa de ellos con
`posts.audience.legacy-orbit` (aviso, no fallo).

## Reglas de acceso

- Todas las páginas de producto exigen sesión; la administración exige rol
  `admin`, y el backend lo comprueba contra la base de datos, no la interfaz.
- Una ruta no acredita que el proveedor externo esté configurado: el audio
  muestra su configuración real y los catálogos muestran errores, vacíos y
  reintentos sin datos de relleno.
- Abrir audio o apoyos no genera contenido ni crea transacciones: esas
  operaciones requieren confirmación explícita. Los apoyos son créditos
  simbólicos, no pagos.
