# Rutas y navegación de Kronos Space

> Documento **escrito a mano**. La fuente de verdad son dos archivos:
> `client/src/App.jsx` (el router) y `client/src/navigation/model.jsx` (el modelo
> de navegación). Si el código y este documento se contradicen, **manda el
> código**; el spec `client/test-ui/navigation-3d.spec.jsx` cruza cada destino
> del modelo contra los `<Route>` reales y falla si aparece un enlace muerto.

## Cómo está organizada la navegación

La navegación lateral se reparte en **cuatro grupos** para que ninguna zona
quede apretada ni huérfana. Cada destino se identifica con un **emoji** y su
nombre: no hay descripciones, ni letras sueltas, ni recuadros. El estado
activo se marca con un fondo más claro y el texto en blanco.

| Grupo | Emoji | Destinos |
|---|---|---|
| **Social** | — | Inicio 🏠, Explorar 🔎, Crear ➕, Mensajes 💬, Notificaciones 🔔 |
| **Comunidad** | — | Pulso ⚡, Vertical 🎬, Grupos 👥, Círculos 🎯, En vivo 🔴 |
| **Kairos** | — | Centro de IA ✨ y sus ocho herramientas (🖼️ 🎥 📝 📁 🎞️ 🎙️ 🕘 📼) |
| **Cuenta** | — | Cápsulas ⏳, Analítica 📊, Guardados 🔖, Perfil 👤, Configuración ⚙️, Moderación 🛡️ |

- **Barra móvil (≤ 700 px)**: Inicio, Explorar, Crear, Mensajes y Perfil.
- **Cajón «Secciones»**: el resto de destinos, agrupados igual que la barra
  lateral. Se abre desde el botón de la cabecera y se cierra con Escape.
- **Grupos** es el destino de comunidad (`/conversations`). **Órbitas y Canales
  ya no existen**: eran la misma idea que Grupos con dos nombres.
- La sección activa la calcula una sola función, `getCurrentSection()`, en
  `navigation/model.jsx`. La usan la barra lateral, la barra móvil y el
  cajón, de modo que los tres marcan siempre lo mismo.

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
