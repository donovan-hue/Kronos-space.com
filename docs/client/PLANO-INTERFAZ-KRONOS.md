# KRONOSPACE — Plano en limpio de rutas, pantallas, acciones y navegación

> **Fuente:** código real de `origin/main` (commit `6792b1f`) auditado archivo por
> archivo, más la arquitectura de navegación de la rama de trabajo actual.
> Nada de esto es inventado: cada ruta, botón y endpoint citados existe en el
> código. El documento sirve de base para rediseñar sin romper contratos.

---

## 0. Estructura general

```
client/src/
├── App.jsx                    ← ÚNICA tabla de rutas (declaradas todas aquí)
├── routes/ProtectedRoute.jsx  ← Guarda: sin sesión → /login (recuerando destino)
├── layouts/AppLayout.jsx      ← Shell autenticado (sidebar + topbar + outlet)
├── navigation/model.jsx       ← (rama actual) modelo único de destinos
├── components/…               ← UI compartida (FanNav, MenuDrawer, OrbitMap…)
├── features/<dominio>/*.jsx   ← Una carpeta por dominio de pantalla
├── services/*.js              ← Contratos API (axios `api` + JWT refresh)
└── styles/*.css               ← Skin: negro profundo + verde/blanco + cromo
server/                        ← API Express/Mongo (auth, posts, IA, live…)
```

- **Rutas fuera del shell** (pantalla completa): `/login`, `/register`,
  `/forgot-password`, `/reset-password`, `/verify-email`, `/onboarding`.
- **Rutas dentro del shell** (sidebar + topbar + contenido): todo lo demás.
- **Reglas de acceso:** `ProtectedRoute` exige sesión para todo lo del shell;
  las rutas de auth redirigen a `/home` si YA hay sesión. `/` reparte:
  con sesión → `/home`, sin sesión → `/login`.

---

## 1. Mapa de rutas → pantalla → qué contiene → acciones → API

### Autenticación (sin shell)

| Ruta | Componente | Contiene | Acciones (botones reales) | API |
|---|---|---|---|---|
| `/login` | `features/auth/Auth.jsx` | Marca KRONOSPACE (metal líquido), sistema orbital decorativo, pills «Iniciar sesión»/«Crear cuenta», Google GIS (si hay config), formulario | Submit login; toggle mostrar/ocultar contraseña; enlace «¿Olvidaste tu contraseña?» | `POST /auth/login`, `GET /auth/google/config`, `POST /auth/google` |
| `/register` | `Auth.jsx (mode=register)` | Idéntico + campos usuario/display/confirmar | Submit registro | `POST /auth/register` |
| `/forgot-password` | `ForgotPassword.jsx` | Campo email | «Enviar enlace» | `POST /auth/forgot-password` |
| `/reset-password` | `ResetPassword.jsx` | Token (query) + nueva contraseña | «Restablecer» | `POST /auth/reset-password` |
| `/verify-email` | `VerifyEmail.jsx` | Estado de verificación (auto por token) | reenvío de correo | `POST /auth/verify-email`, `…/request` |
| `/onboarding` | `Onboarding.jsx` | «Bienvenida a Kronos»: elegir órbitas, Pulso inicial, primera publicación | «Empieza por Pulso», «Publicar algo breve», «Ir a mi Inicio» | `GET /orbits`, `POST /pulse`, `POST /posts` |

### Núcleo social (ring 0 «Núcleo»)

| Ruta | Componente | Contiene | Acciones clave | API |
|---|---|---|---|---|
| `/home` | `social/SocialPage.jsx` | Feed cronológico + bandeja historias + accesos (Crear, Kairos, Biblioteca, Órbitas, Configurar feed). Scroll PROPIO en `.k-app-main-column` (fix de esta rama: el drawer ya no desplaza el feed) | Cargar más (infinite), seguir/ignorar sugerencias, «Configura tus intereses» | `GET /posts/feed`, `POST /users/:id/follow`, `GET /users/:id/suggestions`, `POST /feed/preferences`, `GET /stories/tray` |
| `/feed`, `/social` | alias → `/home` | redirección | — | — |
| `/post/:id` | `social/PostDetail.jsx` | Publicación + multimedia + tema; caja de comentarios | Comentar, reaccionar, guardar, compartir, «Editar publicación», «Temas de la publicación» | `GET/PUT/DELETE /posts/:id`, `/comments`, `/reactions`, `/share`, `/save`, `/media/upload` |
| `/create` | `social/CreateHub.jsx` | Centro de creación: idea → crear → destino (paso a paso visible) | «Crear» (imagen/video/guion IA o post), «Compartir», «Volver a Inicio» | navega a `/create/post` o `/kairos/*` |
| `/create/post` | `social/CreatePost.jsx` | Composer completo: texto, fotos, carrusel, encuesta, evento, audiencia (pública/círculos/privada), borradores, recorte temporal | Publicar, borrador guardar/eliminar/«Editar», quitar carrusel/encuesta/evento, «Añadir opción» | `POST /posts`, `GET/PUT/DELETE /drafts`, `/posts/:id/poll`, `/posts/:id/event`, `/poll/vote` |
| `/vertical` | `social/vertical/VerticalFeed.jsx` | Reels: feed vertical de video, «desliza para más» | Subir video, calidad, recargar | `GET /posts/vertical`, `POST /upload` |
| Historias | (tray en Home) + `/stories/archive` → `stories/StoryArchive.jsx` | Archivo de historias propias | ver, expirar, «Ir a Inicio» | `GET /stories/me/archive`, `POST /stories`, `POST /stories/:id/view` |

### Red social (ring 1 «Red»)

| Ruta | Componente | Contiene | Acciones clave | API |
|---|---|---|---|---|
| `/explore`, `/users` | `users/UserSearch.jsx` | Buscador con tabs «Personas / Publicaciones», sugerencias | Buscar (debounce), seguir, «Mensaje», «Ver publicación», scroll-pagina | `GET /search?q=`, `/users/suggestions`, follow, `GET /posts` |
| `/profile`, `/users/:id` | `users/Profile.jsx` | Portada, avatar, bio, stats (Kairos credits), tabs: Publicaciones/Multimedia/Gustos/Muro | Seguir, mensaje, editar perfil, upload avatar/portada/muro, «Más opciones de este perfil», borrar post propio | `GET /users/me/stats`, `POST /users/:id/follow`, `/media/upload` (scope `profile_wall_post`), `DELETE /posts/:id` |
| `/profile/:username` | `users/ProfileByUsername.jsx` | Perfil por @usuario (misma piel) | — (comparte acciones) | `GET /users/:id` |
| `/messages`, `/messages/:userId` | `messages/Messages.jsx` | Directos 1:1: lista de conversaciones recientes + chat; envío de imagen/video con estado | Enviar, retry, descartar, marcar leído | `GET/POST /messages`, `GET /messages/summary`, `PUT /messages/read`, `POST /messages/media/upload`, WebSocket `message:send` |
| `/conversations`, `/conversations/:conversationId` | `messages/Conversations.jsx` | Grupos: lista + chat grupal, rol moderado, invites, enlaces de invitación | Crear grupo, agregar/quitar miembro, renombrar, salir, crear/revocar invite link | `GET/POST/PATCH/DELETE /conversations`, `PUT /conversations/read`, `POST /conversations/accept-invite`, `/moderated` |
| `/channels` | `social/Channels.jsx` | Canales: «Comunidad» y «Anuncios (solo responsables publican)» | Crear canal (nombre/descripción), publicar anuncio, suscribir | `GET/POST /channels` |
| `/circles` | `social/Circles.jsx` | Círculos privados (hasta 100 miembros, privacidad social) | Crear/renombrar/eliminar círculo, añadir/quitar miembros, crear post al círculo | `GET/POST/PATCH/DELETE /circles` |
| `/orbits` | `social/Orbits.jsx` | Órbitas (comunidades): descubrir, unirse, roles Miembro/Moderador, reglas, archivo | Crear órbita, unirse/salir, abrir feed, moderar (mover/retirar/silenciar), archivo | `GET /orbits`, `GET /orbits/archived`, `POST /orbits`, `POST /orbits/:id/join|leave|rules|members/remove` |
| `/orbits/:orbitId` | `social/OrbitFeed.jsx` | Feed de la órbita + «Volver a Órbitas» | publicar en órbita, moderator actions | `GET /orbits/:id/feed`, `POST /orbits/:id/posts`, `POST /posts` (orbitId) |
| `/notifications` | `notifications/Notifications.jsx` | Centro de actividad + filtros | marcar leídas, «Filtrar notificaciones» | `GET /notifications?limit=50` |
| `/live` | `live/Live.jsx` | Salas de audio/video: «Ahora en público», «Tus salas», invitaciones, roles | Crear sala, abrir sala, activar audio/video, invitar/aceptar, dejar | `GET /live/rooms`, `/live/rooms/mine`, `/live/invites`, `POST /live/rooms`, `/live/rooms/:id/join|leave` |

### Archivo personal

| Ruta | Componente | Contiene | Acciones clave | API |
|---|---|---|---|---|
| `/saved` | `social/SavedPosts.jsx` | Guardados + colecciones privadas (ORGANIZAR) | guardar/quitar, crear/editar/renombrar/borrar colección, añadir post a colección, «Volver al feed», carga por scroll | `GET /posts/saved`, `POST/DELETE /posts/:id/save`, `GET/POST/PATCH/DELETE /collections`, `POST/DELETE /collections/:id/items`, `GET /collections/:id/items` |
| `/capsules` | `capsules/Capsules.jsx` | Cápsulas del tiempo (apertura futura, colaboradores) | Crear cápsula (fecha), añadir mensaje, invitar colaborador, eliminar | `GET/POST/DELETE /capsules`, `POST /capsules/:id/messages`, `/collaborators` |
| `/pulse` | `pulse/Pulse.jsx` | «Tu sesión finita»: señal diaria, historial de sesiones | generar/abrir sesión, «Empezar otra sesión», «Abrir en detalle» | `GET /pulse/signal`, `GET /pulse/sessions`, `POST /pulse/session` |

### Kairos · IA (ring 2 «Sistema»)

| Ruta | Componente | Contiene | Acciones | API |
|---|---|---|---|---|
| `/kairos` (alias `/ai`) | `ai/AICenter.jsx` | «Estudio de creación con IA»: accesos a generadores, credit balance | abrir generadores, recargar créditos | `GET /ai/credits`, `GET /ai/images/history` |
| `/kairos/image` | `image-ai/ImageGenerator.jsx` | Prompt + negative + estilo + resultados; últimas generaciones | «Generar imagen», compartir, reutilizar, «Volver a Kairos», «Ver todo» | `POST /ai/images/generate`, `GET /ai/images/history`, `POST /posts` |
| `/kairos/video` | `video-ai/VideoGenerator.jsx` | Generador de video con trabajos/estado | Generar, «Ver estado», reutilizar | `POST /ai/videos/generate`, `GET /ai/videos/jobs` |
| `/kairos/video/jobs` | `video-ai/VideoJobs.jsx` | Cola de trabajos de video (estado/resultado) | — | `GET /ai/videos/jobs` |
| `/kairos/script` | `script-ai/ScriptGenerator.jsx` | Guion: audiencia, formato, duración, editor, proyectos | «Generar y editar guion», guardar proyecto, copiar, eliminar | `POST /ai/scripts/generate`, `GET/POST /ai/scripts/projects`, `DELETE /ai/scripts/projects/:id` |
| `/kairos/history` | `ai/KairosHistory.jsx` | Historial unificado de generaciones | reutilizar, «Abrir Kairos» | `GET /ai/*/history` |
| `/library` | `ai/MediaLibrary.jsx` | Biblioteca multimedia generada (filtro) | descargar/compartir | `GET /ai/images/history` |

### Cuenta y gobierno

| Ruta | Componente | Contiene | Acciones | API |
|---|---|---|---|---|
| `/settings` | `settings/Settings.jsx` | **CUENTA**: tema (Oscura), idioma (Español México/English), «Configura tu inicio» (intereses + orden: Más reciente/cronológico), sesiones activas, export de datos, «Cerrar sesión»; **KAIROS AI**; **Moderación** (link) | Guardar intereses, idioma, tema, revocar sesión, solicitar export/descarga, logout | `GET/PUT /users/me/preferences`, `GET/DELETE /auth/sessions`, `POST /export/request`, `GET /export/status`, `GET /export/download`, `POST /auth/logout`, `GET /feed/preferences` |
| `/settings/profile` | `settings/ProfileSettings.jsx` | Campos de perfil + «Configurar privacidad» | guardar, subir avatar | `PATCH /users/me`, avatar, `GET/POST /privacy` |
| `/settings/security` = `/moderation` | `moderation/ModerationCenter.jsx` | Reportes enviados/pendientes, cola, ocultos, bloqueados, silenciados, salud de comunidad 30 días, apelaciones | reportar perfil, apelar, ver perfil | `GET /moderation/overview|blocks|mutes|reports/queue|hidden|health`, `POST /reports` |
| `/admin` | `admin/AdminCenter.jsx` | Resumen admin: usuarios, posts ocultos, reportes pendientes | buscar usuarios, buscar posts, resolver reporte, acciones admin | `GET /admin/overview|users|posts`, `POST /reports/:id/resolve` |
| `*` | `app/NotFound.jsx` (rama actual) | 404 con acceso al mapa orbital | «Volver al inicio» | — |

---

## 2. Navegación (arquitectura de la rama actual)

- **Modelo único** `src/navigation/model.jsx`: 20 destinos con `{id,label,description,to,icon,flag?,ring}`;
  anillos = jerarquía: `0 Núcleo` (home/pulse/vertical/explore/create),
  `1 Red` (messages/groups→circles·channels·live/circles/orbits/notifications),
  `2 Sistema` (capsules/analytics/saved/profile/kairos/settings/moderation).
  `getCurrentSection(path)` mapea TODA ruta real a su sección (incluidas
  `/search→explore`, `/post/:id→post`, `/admin→settings`, `/library→kairos`).
- **FanNav** (sidebar desktop ≤980+ y barra móvil): mismos ítems del modelo,
  flags aplicadas, cero enlaces muertos (test lo garantiza contra App.jsx).
- **MenuDrawer** («☰ Todas las secciones»): Radix Dialog portalizado, `position:fixed`,
  abre **hacia un lado sin desplazar**: el scroll de la app vive en
  `.k-app-main-column` (clase `k-app-scroll-contained` en `<body>`; el lock de
  Radix sobre body ya no mueve el feed). Cierre: Escape, backdrop, ✕, o click en destino.
- **Mapa orbital (G)**: hub 3D con bucle orbital continuo (ver `flow.css`/`useOrbitLoop`),
  nodos = destinos reales; al señalar (hover/focus) el campo se congela.
- **Buscador (⌘K)**, **Atajos (?)**: Radix Dialog + foco restaurado (`useDialogFocusRestore`).
- **Transiciones**: plan direccional `planSectionShift(prev,next,navType,{zoom})`
  (PUSH entra por +x, POP invierte, zoom del mapa amplifica; reposo si misma
  sección o `?refresh` — nunca se re-reproduce).
- **Preferencia de movimiento**: `lib/motionPreference.js` — default: respeta
  `prefers-reduced-motion` del SO; el conmutador del portón (`MotionToggle`)
  fija `data-k-motion="full|reduced"` en `<html>` (llave que abre/cierra todos
  los bloques reduced del sitio). Persiste en localStorage (`kronos.motion-preference`).

## 3. Sistema de diseño (identidad actual de esta rama)

- **Fondo:** negro profundo absoluto `#000` en portada y shell (la ilusión de
  «no tener fondo»: sin tarjetas ni marcos en el portón; superficies del shell =
  `#020403→#071008` casi-indistinguibles).
- **Acento:** azul → **verde y blanco**. Tokens centralizados en
  `aqua-theme.css` (los nombres `--k-aqua*` se conservan por contrato):
  `--k-aqua #3de892`, `--k-aqua-bright #a9f7c4`, `--k-aqua-deep #159a53`,
  `--k-aqua-blue → #f4fff7` (lo azul se volvió blanco), `--k-aqua-rgb 61,232,146`.
- **Marca/letras:** **metal líquido** (`landing-void.css`): gradiente espejo
  verde-blanco sobre `background-clip: text` con flujo continuo
  (`k-void-liquid`, 11 s, costuras iguales → bucle perfecto) + glow.
- **Movimiento continuo (bucles):** órbitas del portón (3 planos 3D CSS,
  16/30/54 s, perlas cromadas con profundidad por escala/opacidad sincronizada),
  destellos en divisores, halos en CTAs, pista orbital del botón G, y el
  bucle real del mapa orbital. Todo con `transform/scale/opacity/filter`
  (solo GPU-composited) y `aria-hidden`.

## 4. Contrato de datos (no cambiar sin migrar)

Endpoints consumidos hoy (servicios → `api` con JWT + `POST /auth/refresh`):
`auth:*` · `posts:*` (feed/save/poll/event/comments/reactions/share/media-upload) ·
`users:*` (stats/suggestions/follow/blocked/preferences) · `circles|orbits|channels|conversations|messages` ·
`notifications` · `stories` · `collections` · `capsules` · `pulse|live|analytics` ·
`ai:*` (credits/images/videos/scripts/history/projects) · `moderation|admin|reports` ·
`drafts` · `search` · `flags` · `export` · `support/tip` · `uploads/` · `/api`.
WebSocket: `message:send`, `typing`, `direct`, `conversation`, `conversation:typing`.

## 5. Validación existente (tests que protegen este plano)

- `test-ui/navigation-3d.spec.jsx` — el modelo no puede enlazar ruta muerta;
  hub abre/cierra/con foco restaurado; teclado; bucle `orbitFrame`.
- `test-ui/ux-audit.spec.jsx` — skin global no oculta la nav; drawer/dialogs accesibles.
- `test-ui/landing-void.spec.jsx` — portada nueva: vacío orbital + marca + conmutador.
- Suites por feature (`test/*.mjs`) + `test-ui` del cliente (199 tests).
