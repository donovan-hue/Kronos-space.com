# Checklist de pendientes — red social y Kairos

> Inventario derivado **solo del código** de este checkout (`c3d9ab4`), no de
> `README.md` ni de las descripciones de `docs/`. Cada punto lleva el archivo y
> la línea que lo prueban; cuando el código ya hace algo, no aparece aquí.
> El documento de deuda (`docs/LIMITES-Y-DEUDA.md`) se usó únicamente como
> hipótesis a verificar: dos de sus afirmaciones ya no son ciertas (§2 los
> uploads públicos y §3 Tailwind) y se marcan abajo.

## Cómo se comprobó

| Comprobación | Resultado |
|---|---|
| `npm ci` | exit 0 |
| `npm run lint` | exit 0, 0 warnings |
| `npm test --workspace=server` | 643 pass / 0 fail / 192 **skip** |
| `npm run test:client` | 66 archivos, 549 tests, exit 0 |
| `npm run build` | exit 0, 87 chunks |
| `npm run barrido:huerfanas` | cupo de 33 reglas CSS sin uso, sin reglas nuevas |
| `grep -r "TODO\|FIXME"` | **0 resultados**: los pendientes no están anotados, hay que deducirlos |

Los 192 tests omitidos del servidor son las suites E2E que necesitan
`KRONOS_E2E_MONGODB_URI` (`.github/workflows/kronos-e2e.yml:542`); hoy ese
secreto está bloqueado del lado de Atlas (`docs/RUNBOOK-BLOQUEADORES-ATLAS-CLOUDFLARE.md`).

---

## 1. Red social

### 1.1 Notificaciones — CERRADO (2026-11-04)

Lo que sigue se implementó y se selló con pruebas. Se deja anotado con su
archivo para que nadie lo reabra creyendo que falta.

- [x] **`save` ya tiene emisor.** `POST /posts/:postId/save` avisa al autor solo
  cuando el guardado se **crea** (el quitar no es noticia; la ruta es un
  toggle): `server/src/modules/posts/posts.routes.js` (bloque del `savedBy`).
- [x] **Todo aviso pasa por `notifySafely`.** `comment`, `like` (las dos rutas),
  `follow`, `repost`, `save`, `event`, `story`, `capsule`, `live` y `report`
  usan el envoltorio que registra en el log sin tumbar la acción.
- [x] **Avisos que faltaban, añadidos:** RSVP de evento (solo al confirmar o
  cambiar de estado, `type: "event"`), invitación a cápsula (antes solo se
  avisaba **al abrirse**; ahora también al invitar), invitación a sala en vivo
  (el evento de socket se perdía si no estabas conectado) y respuesta a
  historia (`type: "story"`, antes solo era un `$push` invisible).
- [x] **Resolución de reporte avisada al denunciante** (`type: "report"`), tanto
  al cerrar el caso (`PATCH /moderation/reports/:id`, solo en la transición a
  estado final) como al revisar su apelación. Antes solo se notificaba al
  **autor** del contenido oculto.
- [x] **Destino del aviso (`ref`).** El modelo guarda `ref: { kind, id }` para
  historia, cápsula, sala y reporte; la UI enlaza al recurso real en lugar de
  mandar al perfil del actor. `notification.service.js` normaliza el `ref` para
  que un valor raro no rompa la escritura por el `enum`.
- [x] **Badge de no leídas en la campana del topbar.** `useUnreadNotifications`
  pide una sola cifra (`limit=1`, la respuesta ya trae `unreadCount` global), la
  mantiene con el socket y la pinta en `AppLayout` con `.k-topbar-badge`,
  actualizando `aria-label`/`title`. *Nota:* la barra inferior no puede
  mostrarlo porque Notificaciones no es uno de sus cinco destinos; se comprobó
  al intentarlo y se descartó.
- [x] **Catálogo y filtros alineados.** `NOTIFICATION_TYPES` suma `event`,
  `story`, `live` y `report`; la pantalla tiene filtros para los tres primeros y
  "Moderación" pide `moderation,report` en una sola consulta. Un test nuevo
  (`block-019-024.contract.test.js`) recorre los módulos y falla si un tipo del
  catálogo se queda sin emisor.

Sigue pendiente de este bloque:

- [ ] **Sin notificación por correo fuera de auth.** `notifications.email` se
  guarda (`server/src/modules/users/users.routes.js:44,58`) pero solo
  verificación y reseteo envían correo (`server/src/modules/auth/auth.routes.js:179`).
  Requiere proveedor/cola de correo por evento, no solo la ruta.
- [ ] **Sin badge en el menú de secciones** (`MenuDrawer.jsx`) ni contador en el
  `title` de la pestaña del navegador: el número solo vive en la campana.
- [ ] **Sin preferencia por tipo**: `notifications.inApp` es un interruptor
  único; no se puede silenciar "guardados" y mantener "comentarios".

### 1.2 Publicaciones — **CERRADO parcialmente (26-11-04)**

Cuatro huecos de esta sección quedaron resueltos y verificados; el resto sigue
abierto y se marca abajo. Lo hecho:

- **Texto con enlaces y menciones.** `client/src/lib/richText.js` interpreta
  `#hashtag`, `@usuario` y URL `http(s)://`; `components/ui/RichText.jsx` los
  pinta trozo a trozo con React (nunca `dangerouslySetInnerHTML`, así que no hay
  HTML del servidor que sanitizar). Conectado en `PostCard.jsx` y
  `PostDetail.jsx`. Decisión: el texto ya no es un enlace que envuelve la
  tarjeta (habría `<a>` anidados); el acceso al detalle es un enlace aparte
  «Abrir publicación». `www.suelto` y los correos se quedan como texto: no se
  inventan enlaces.
- **Pantalla de tema.** Ruta `/hashtag/:tag` (`App.jsx`, lazy `HashtagFeed`),
  hook `useTagFeed` sobre `GET /posts/topic/:tag` con paginación, vacío, error
  con reintento. Los chips de hashtag de `PostCard` y `PostDetail` ya van ahí y
  no a `/explore?q=`. La pantalla es de lectura a propósito: reutilizar
  `PostCard` obligaría a duplicar el estado de likes/guardados/comentarios que
  vive en cada pantalla.
- **Cierre manual de encuesta.** `PATCH /posts/:postId/poll/close` (solo autor,
  403 si no lo es, 409 si ya estaba cerrada) con `poll.closed`/`poll.closedAt`
  en el esquema; el voto rechaza con `code: "POLL_CLOSED"` tanto por cierre
  manual como por `closesAt` vencido, y los votos previos se conservan. En la UI
  el botón «Cerrar encuesta» solo aparece para el autor y mientras siga abierta.
- **Conmutador de modo de feed en el inicio.** `?mode=` validado contra
  `FEED_MODES` en `GET /posts/feed` y `GET /posts` (no en `/vertical`, que no es
  un modo del feed principal). `FeedModeSwitch` en `SocialPage`, con
  `latest|following|interests`, recordado en `localStorage`
  (`kronos.feed.mode`) y sin reescribir `preferences.feed`: el modo es una vista
  de sesión, la preferencia del perfil se sigue editando en Ajustes.
- **`getFeedByRoute` eliminado** del service (era un wrapper sin importadores).

Tests nuevos: `client/test/rich-text.test.mjs` (11), `test-ui/hashtag-feed.spec.jsx`
(5), `test-ui/feed-mode.spec.jsx` (6), 3 casos de cierre de encuesta en
`test-ui/polls.spec.jsx`, y `026:` en `server/test/block-019-024.e2e.test.js`
(cierre + votos tardíos, RSVP de evento terminado, `?mode=`). Los E2E siguen en
skip sin `KRONOS_E2E_MONGODB_URI`.

Sigue abierto en esta sección:

- [ ] **`showSensitive` decorativo**: la propia UI lo admite
  (`Settings.jsx:336-345`); no existe etiquetado de contenido sensible.
- [ ] **Edición de publicación limitada**: el PATCH acepta `content`,
  `hashtags` y `audience` (`posts.routes.js:1207`), pero en el cliente solo se
  edita el texto y únicamente dentro de `PostDetail` (`editingPostId`,
  `client/src/features/users/Profile.jsx:111`); no se puede cambiar audiencia
  después de publicar desde la UI.
- [ ] **Comentarios planos**: sin likes, sin edición, sin reporte directo y a un
  solo nivel de anidación (`server/src/modules/posts/normalizePost.js:30-47`;
  no existe `POST /comments/:id/like` ni `PATCH /comments/:id`).
- [ ] **Video: la receta no se reproduce en el feed.** `trim` y `receta` se
  envían (`client/src/features/social/CreatePost.jsx:675,698`) y solo
  `client/src/lib/videoSequence.js:19-23` los interpreta; el reproductor del
  feed no aplica el corte.
- [ ] **Póster de video como data URL**: se serializa la imagen completa dentro
  del JSON del post (`CreatePost.jsx:561,563`), en vez de subirla y guardar la
  ruta.
- [ ] **Sin subtítulos generados**: `subtitles: []` fijo al publicar
  (`CreatePost.jsx:685,708`); el PATCH `/posts/:id/subtitles`
  (`posts.routes.js:1289`) no tiene UI que lo llame. `MediaViewer.jsx:27-47`
  solo los reproduce si ya vienen.
- [ ] **`PATCH /posts/:id/video-trim`** (`posts.routes.js:1322`) **sin
  consumidor** en el cliente.
- [ ] **Sin tendencias ni sugerencias de a quién seguir** más allá de lo que ya
  hay en Explorar.

### 1.3 Historias — **PARCIAL (26-11-04)**

- [x] **Borrar una historia ya no deja el archivo servido.** `DELETE
  /stories/:storyId` borraba el documento y nada más: el archivo quedaba
  accesible por su URL, igual que pasaba con las publicaciones antes de
  `mediaLifecycle`. Ahora purga la media no referenciada
  (`stories.routes.js`, bloque del `deleteOne`), conservando la copia que use
  otro contenido.
- [x] **Responder ya avisa al autor.** Se cerró en el bloque 1.1
  (`type: "story"` con `ref { kind: "story" }`), no era un hueco de este.
- [ ] **Los documentos expirados no se borran solos.** La expiración es por
  consulta (`Story.js:9,138`; filtro `expiresAt > now` en
  `stories.routes.js:197`) y `GET /stories/me/archive` sigue devolviéndolos
  **a propósito**: el archivo personal es una función, y un índice TTL
  destruiría la historia del autor. Lo que falta es una **política de
  retención** (por ejemplo, borrar a los N días con un barrido, no con TTL),
  no añadir el TTL que el propio modelo rechaza.
- [ ] **Sin stickers, música ni destacados**: el modelo solo tiene `caption`,
  `media` y audiencia (`Story.js:103-145`); no hay colecciones de historias
  destacadas en el perfil (`PROFILE_TABS` en
  `client/src/features/users/ProfileTabs.jsx:3-8`).
- [ ] **El archivo no pagina**: `GET /stories/me/archive` corta en
  `ARCHIVE_LIMIT` (50, `Story.js:31`) sin cursor ni «cargar más», así que a
  partir de la historia 51 el autor ya no puede llegar a las viejas.
- [x] *Verificado y descartado*: el inicio **sí** integra historias —
  `SocialPage.jsx` monta `<StoriesBar />` y `/home` es esa página.

### 1.4 Mensajería y grupos — **CERRADO parcialmente (26-11-04)**

Lo hecho y verificado:

- **Borrar un mensaje propio (DM y grupo).** `DELETE /messages/:messageId` y
  `DELETE /conversations/:id/messages/:messageId`, con la misma regla en un
  solo sitio (`messages/deleteMessage.js`): solo el autor, 403 `NOT_SENDER`
  para el resto, idempotente. Deja **lápida** (`deletedAt`, texto vacío, media
  fuera) en vez de borrar el documento, para no romper el orden del hilo ni
  los acuses; la media se purga con `mediaLifecycle`. Las dos partes se
  enteran por socket (`message:deleted`).
- **Adjuntos de video y audio.** El chat solo aceptaba imágenes aunque el chat
  es donde más se manda un clip o una nota de voz. Ahora usa
  `handleMediaUpload` (mismos límites que publicaciones: imagen 10 MB, video
  50 MB, audio 15 MB), `messageMedia.js` valida por tipo y el mensaje guarda
  `media.kind` (`image|video|audio`) calculado en el servidor. El composer
  previsualiza según el tipo y `MessageList` pinta `<img>`, `<video>` o
  `<audio>`; los mensajes antiguos sin `kind` se resuelven por el MIME.
- **Grupos: renombrar y salir.** `PATCH /conversations/:id` (solo creador,
  403 `NOT_CREATOR`, máximo 60 caracteres rechazado en vez de truncado) y
  `DELETE /conversations/:id/members/me` (cualquier miembro; el creador no,
  `CREATOR_LOCKED`; si el grupo queda sin miembros se elimina). La UI estrena
  edición del nombre en la cabecera y botón «Salir del grupo».
- **`createdBy` vuelve en la respuesta de miembros.** `PATCH /:id/members`
  devolvía `{ _id, name, members }` sin `createdBy`, así que tras añadir o
  quitar a alguien la pantalla perdía el rol del creador y sus botones.
- **El hilo ya no devuelve los 200 mensajes más viejos.** `GET
  /messages/:userId` hacía `sort({ createdAt: 1 }).limit(200)`: en un hilo
  largo, lo recién escrito no aparecía al recargar. Ahora se piden los 200
  últimos y se reordenan.

Tests: `027:` en `block-019-024.contract.test.js` (adjuntos por tipo y límite,
esquema, autorización del borrado con stub, forma de la consulta, rutas de
grupo) y 4 casos E2E en `block-019-024.e2e.test.js` (skip sin Mongo);
`client/test-ui/messaging-1-4.spec.jsx` (9).

Sigue abierto:

- [ ] **Sin búsqueda dentro de mensajes** (ni endpoint ni UI).
- [ ] **Presencia de una sola instancia** (`server/src/modules/messages/presence.js:8-12`).
- [ ] **Sin roles en el grupo**: cualquiera que no sea el creador no puede
  moderar; no hay administradores ni transferencia de propiedad. (Salir y
  renombrar ya existen; el rol sigue siendo binario creador/resto.)

### 1.5 Directos (live) — **CERRADO parcialmente (26-11-04)**

Lo hecho y verificado:

- **TURN configurable.** El cliente llevaba un STUN fijo escrito en el
  componente: funcionaba en casa y fallaba con NAT simétrico, sin nada que un
  operador pudiera cambiar. Ahora `server/src/config/iceServers.js` compone la
  lista desde `LIVE_STUN_URLS` / `LIVE_TURN_URLS` / `LIVE_TURN_USERNAME` /
  `LIVE_TURN_CREDENTIAL` y la entrega por `GET /api/live/ice` (con sesión, y
  con validación de esquema para que nada raro acabe en el SDP). El cliente la
  pide al abrir la pantalla y otra vez antes de cada entrada, porque las
  credenciales de TURN caducan. Sin TURN configurado la interfaz lo dice en vez
  de prometer cobertura; las variables están en `server/.env.example`.
- **`GET /live/rooms` ya no es público ni ignora los bloqueos.** Exigía cero
  sesión y devolvía título, descripción y anfitrión de las salas de cualquiera,
  incluidas las de usuarios que te bloquearon o a quienes bloqueaste. Ahora
  pide sesión y excluye esas cuentas con `getExcludedUserIds`, igual que el
  feed. Además, una sala pública de alguien bloqueado tampoco se abre por su
  id (`GET /rooms/:id` responde 404), que era la puerta de atrás del bloqueo.
- **`maxParticipants` se puede fijar desde la UI** y viaja en la sala
  normalizada. Antes el servidor lo aceptaba (topado en 500) y la interfaz no
  lo enviaba ni lo conocía: nadie podía limitar una sala ni saber su cupo.
- **El cliente escucha `live:room-started`**: una sala nueva aparece en la
  lista sin recargar (y sin duplicar la propia ni anunciar las privadas).
- **`/live?room=<id>` abre esa sala.** La ruta ignoraba la consulta, así que un
  enlace compartido llevaba a la lista. Muestra una tarjeta con «Entrar / Ahora
  no»: no enciende cámara ni micrófono por abrir un enlace.
- **El botón de una invitación ya no se queda bloqueado** tras un fallo: el
  `busy` no se limpiaba porque no había `finally`.

Tests: `028:` en `live-access.contract.test.js` (STUN por defecto, TURN con
credenciales, rechazo de esquemas no-WebRTC, ruta con sesión y filtro de
bloqueos, tope normalizado) y 6 casos nuevos en `client/test-ui/live.spec.jsx`
(17 en total).

Sigue abierto:

- [ ] **El anfitrión que cierra la pestaña deja la sala abierta.** El `beforeunload`
  no llama a `end`, y una sala sigue «activa» hasta que su anfitrión vuelve a
  abrir otra o pulsa Finalizar. Falta un barrido por `endedAt`/latido.
- [ ] **Sin chat de sala, sin grabación y sin expulsar invitados**: no hay
  mensajes en vivo, ni `live:chat`, ni forma de sacar a alguien que ya entró.
- [ ] **Sin moderación del directo**: el único uso de moderación es al invitar
  (`live.routes.js`), no hay corte ni denuncia desde la sala.

### 1.6 Perfil, círculos y guardados
- [ ] **No hay edición de nombre ni biografía.** `PATCH /users/me` acepta
  `displayName` y `bio` (`server/src/modules/users/users.routes.js:282-289`) y
  `usersService.updateProfile` existe (`client/src/services/usersService.js:48`),
  pero **ninguna pantalla lo llama**: no hay input de bio en `Profile.jsx` ni en
  `Settings.jsx` (solo avatar y portada, `Profile.jsx:171,178`).
- [ ] **Sin cambio de contraseña**: no hay ruta en `server/` ni UI; una cuenta
  de Google (`hasPassword: false`, `users.routes.js:192`) queda sin camino para
  fijar contraseña sin pasar por el correo de reseteo.
- [ ] **Sin tema/apariencia**: la sección se titula «Notificaciones y
  apariencia · Avisos, idioma y tema» (`Settings.jsx:299`) y hay un
  `appearance: "system"` por defecto (`Settings.jsx:14`), pero **no existe
  ningún control** que lo cambie ni código que lo lea (`grep appearance
  client/src` devuelve solo esas dos líneas y una regla CSS).
- [ ] **Sin idioma real**: el selector dice que no traduce pantallas
  (`Settings.jsx:316-327`); el valor solo se usa para el chat
  (`server/src/modules/ai-core/routes/chat.routes.js:89`).
- [ ] **Sin PWA funcional**: hay manifest e icono
  (`client/public/manifest.webmanifest`) pero **no hay service worker** ni
  `Notification.requestPermission`, así que no hay offline ni push.
- [ ] **Sin SEO compartible**: `client/index.html` no tiene `og:image` (el
  comentario de la línea 27 explica por qué) y `client/vercel.json` no define
  cabeceras de caché ni `robots.txt`.

---

## 2. Kairos / IA

### 2.1 Chat
- [ ] **No hay entrada de chat en la navegación.** `POST /ai/chat` existe
  (`server/src/modules/ai-core/routes/chat.routes.js:69`) y el cliente lo usa
  **solo** para reescribir el borrador de una publicación
  (`client/src/features/social/CreatePost.jsx:219`). No hay pantalla de
  conversación ni historial persistido: `history` viaja en el cuerpo de la
  petición (`chat.routes.js:28-64`) y no se guarda.
- [ ] **El chat no alimenta a Kairos**: `GET /kairos/capacidades`
  (`server/src/modules/ai-core/routes/kairos.routes.js:60`) es la **única**
  ruta de `/api/kairos`; su clave `chat` se devuelve pero `AICenter` no tiene
  tarjeta para ella (`client/src/features/ai/AICenter.jsx:36-72`: solo imagen,
  video, guion, audio, proyectos, plantillas, trabajos, biblioteca, catálogos,
  filtros, historial).
- [ ] **Capacidades declaradas sin profundidad de UI**: `voz`, `musica`,
  `filtros`, `trabajos`, `biblioteca`, `historial` se anuncian en
  `kairos.routes.js:73-99`; filtros vive dentro del estudio de publicación y
  música solo se administra por API (ver 2.4).

### 2.2 Imagen
- [ ] **Una sola variación por generación**: no hay parámetro `n` en
  `server/src/modules/image-ai/` y el estilo se elige de una lista fija de 4
  (`client/src/features/image-ai/ImageGenerator.jsx:10`).
- [ ] **Aspecto fijo**: `OPENROUTER_IMAGE_ASPECT_RATIO`, por defecto `1:1`
  (`docs/CONFIG-ENTORNO.md` y `server/src/config/aiProviders.js`), sin control
  en la pantalla.
- [ ] **`deleteImageGeneration` sin botón** (`client/src/services/aiService.js`):
  no hay forma de borrar una generación desde la biblioteca.

### 2.3 Video
- [ ] **El video generado no se guarda en almacén propio.** Se persiste la URL
  del proveedor (`generation.videoUrl = result.videoUrl`,
  `server/src/modules/video-ai/video.routes.js:61,114`) y nunca se llama a
  `saveBuffer` (no aparece en `server/src/modules/video-ai/`). Si el proveedor
  caduca la URL, la pieza se pierde; tampoco hay copia en GridFS como en el
  resto de media (`server/src/config/storage.js:37-57`).
- [ ] **`getVideoStatus` y `deleteVideoGeneration` sin UI**
  (`client/src/services/aiService.js`): el estado se consulta en bucle interno
  pero no hay borrado desde la pantalla.
- [ ] **Proyectos de guion sin pantalla.** `GET /ai/scripts/projects`,
  `GET /projects/:id` y `GET /projects/:id/export`
  (`server/src/modules/script-ai/script.routes.js:243,281,342`) existen, y el
  cliente solo llama a `createScriptProject`
  (`client/src/features/script-ai/ScriptGenerator.jsx:181`;
  `aiService.js:105-107`): se puede guardar un proyecto y nunca volver a abrirlo.
- [ ] **Sin generación automática de subtítulos** (ver 1.2) y sin recorte
  posterior al render del servidor: el corte se hace en el navegador con
  `MediaRecorder` (`client/src/components/media/MediaStudio.jsx:281,545`) y la
  receta se guarda, pero no hay transcodificación en servidor (0 referencias a
  `ffmpeg` en `server/`).

### 2.4 Audio, catálogos y estudio
- [ ] **Catálogos vacíos por diseño**: el conteo puede ser 0 y así se informa
  (`kairos.routes.js:64-72`); publicar pistas o voces requiere llamar a la API
  a mano (no hay pantalla de administración de catálogos, `docs/PROBADORES.md`
  lo confirma).
- [ ] **Sin libro de coste por usuario**: el único control es el limitador por
  capacidad (`server/src/middleware/aiLimiter.js:58`); no hay saldo ni cuota
  diaria medible.

### 2.5 Flags y capacidades
- [ ] **Los feature flags no se aplican en el servidor**: `isFeatureEnabled`
  está exportado (`server/src/config/featureFlags.js:58`) y **no lo llama
  ningún módulo de rutas** (`grep isFeatureEnabled server/src` solo devuelve su
  definición). En el cliente solo filtran ítems del menú
  (`client/src/navigation/useNavFlags.js:13`), así que apagar `capsules` oculta
  el enlace pero deja la API viva.
- [ ] **Federación de solo lectura**: el inbox responde 501
  (`server/src/modules/federation/federation.routes.js:165-176`), sin firmas
  HTTP ni colas.

---

## 3. Infraestructura y operación

- [ ] **E2E bloqueados**: 192 tests omitidos por falta de
  `KRONOS_E2E_MONGODB_URI` con permisos sobre `test`
  (`.github/workflows/kronos-e2e.yml:542`; causa en
  `docs/RUNBOOK-BLOQUEADORES-ATLAS-CLOUDFLARE.md`). Cierre: `readWrite@test`.
- [ ] **Integración de Cloudflare Workers obsoleta** conectada al repo, sin
  `wrangler.toml` (mismo runbook, §2).
- [ ] **Una sola instancia Socket.IO**: sin `@socket.io/redis-adapter`
  (`grep adapter|redis server/src` = 0), presencia en memoria
  (`server/src/modules/messages/presence.js:8-12`). Escalar a 2 réplicas rompe
  tiempo real.
- [ ] **Media en disco + GridFS, sin CDN**: `fs.writeFileSync` en cada subida
  (`server/src/config/storage.js:43`) con copia a GridFS; no hay purga ni
  política de retención de `uploads/`.
- [ ] **Observabilidad sin consumidor**: solo `GET /api/observability/summary`
  (`server/src/modules/observability/observability.routes.js`) y el cliente no
  tiene pantalla ni panel; `analytics` solo expone `/creator`
  (`server/src/modules/analytics/analytics.routes.js:39`).
- [ ] **MCP sin cliente**: `mcp.routes.js` solo `status` y `me`; no hay
  consumidor en `client/src`.
- [ ] **Administración mínima**: `admin.routes.js` tiene 4 rutas (overview,
  users, role, posts) y `getAdminPosts` (`client/src/services/adminService.js:18`)
  **no tiene pantalla**. No hay suspensión/ban ni bitácora de auditoría de
  acciones administrativas.
- [ ] **Ocultar publicación como moderador sin botón**:
  `hidePostAsModerator` y `restorePostAsModerator`
  (`client/src/services/moderationService.js:141,149`) no se importan en
  ninguna pantalla; solo funciona el ocultado propio (`hidePost`,
  `ModerationCenter.jsx:135` usa `unhidePost`).
- [ ] **Servicios cliente sin llamador** (verificado a mano): `getCapsule`,
  `getStory`, `getMySignals`, `getFeedByRoute`, `getPostsByHashtag`,
  `updateProfile`, `getAdminPosts`, `hidePostAsModerator`,
  `restorePostAsModerator`. Son endpoints vivos sin superficie.
- [ ] **Reglas CSS muertas**: 33 reglas sin uso y 2 que solo consulta un spec
  (`npm run barrido:huerfanas`); no se retiran porque la hoja única es generada
  y el generador no puede correr en este checkout
  (`docs/LIMITES-Y-DEUDA.md` §10).

---

## 4. Seguridad y privacidad

- [ ] **Sin doble factor** (0 resultados de `2fa|totp|otp`); los propios
  documentos legales lo declaran (`client/src/features/legal/legalDocuments.js:61-63`).
- [ ] **Sin captcha ni antispam en registro**: solo limitadores por IP
  (`server/src/middleware/`), sin prueba de humanidad.
- [ ] **Verificación de correo no se envía al registrar**
  (`server/src/modules/auth/auth.routes.js:305`): el correo de verificación
  solo sale por reenvío manual; el registro queda con `emailVerified: false`
  hasta que el usuario lo pida.
- [ ] **El texto legal de media pública está desactualizado respecto al código.**
  `legalDocuments.js:62` y `client/src/features/help/ayuda.js:96` dicen que las
  subidas se sirven por URL sin firma; en realidad `/uploads` pasa por ACL
  (`server/src/middleware/mediaAcl.js`, cookies `kronos_media_token`,
  `Vary: Cookie`). Hay que reescribir el texto, no el código.
- [ ] **Borrado de cuenta sin transacción**: `DELETE /users/me` limpia ~25
  colecciones con `Promise.allSettled` y devuelve 503 para reintentar
  (`server/src/modules/users/users.routes.js:361-488`, `allSettled` en :403): puede quedar a medias.
- [ ] **Rol administrativo recargado en cada petición** (`requireAdmin` hace
  `User.findById`, `server/src/middleware/requireAdmin.js:7`): correcto en
  seguridad, pero es una consulta extra por endpoint protegido y no hay caché.
- [ ] **Sin enlace de reporte desde comentarios** en la UI
  (`REPORT_TARGET_TYPES` incluye `comment` en
  `server/src/modules/moderation/Report.js`, pero ninguna pantalla pasa
  `targetType="comment"`).

---

## Lo que ya está y no hay que volver a pedir

Verificado en código, para no reabrirlo: WebRTC con señalización real
(`Live.jsx:117-277`), TTS con salida a almacén propio, búsqueda con moderación,
audiencia y bloqueos (`search.routes.js:60-134`), Pulso con señales que sí se
aplican (`pulse.routes.js:40-46`), exportación atómica de 7 días
(`export.routes.js:44,85`), copia durable de media en GridFS
(`storage.js:37-57`), ACL de `/uploads` con cookie firmada, moderación completa
(bloqueo, silencio, ocultado, reportes, apelación, salud de la comunidad) y
borrado de cuenta con confirmación por contraseña o por nombre de usuario
(`accountDeletionPolicy.js`).

**Exportación**: hoy entrega publicaciones, comentarios, reacciones, círculos y
perfil (`export.routes.js:100-165`) y la copia de `Settings.jsx:270` promete
exactamente eso; pero quedan fuera mensajes, cápsulas, historias, proyectos,
directos, notificaciones, borradores y reportes. Si se añaden, hay que subir la
promesa en Ajustes en el mismo cambio.
