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

### 1.1 Notificaciones: el catálogo promete más de lo que se emite
- [ ] **Tipos declarados sin emisor.** `NOTIFICATION_TYPES` incluye `save`
  (`server/src/modules/notifications/Notification.js:8-16`) y el filtro
  "Guardados" existe en la UI (`client/src/features/notifications/Notifications.jsx:36-44`),
  pero `POST /posts/:postId/save` (`server/src/modules/posts/posts.routes.js:699`)
  no crea ninguna notificación.
- [ ] **Faltan avisos de interacción social con el patrón seguro.** `repost`
  usa `notifySafely` (`posts.routes.js:790`), `comment` y `like` usan
  `createNotification` directo (`posts.routes.js:1448`, `1573`, `1676`) y
  `follow` igual (`server/src/modules/users/users.routes.js:269`): un fallo de
  notificación puede tumbar la acción principal. Unificar en `notifySafely`.
- [ ] **Sin aviso al autor en cuatro flujos:** RSVP a evento
  (`posts.routes.js:835`), invitación a cápsula (`server/src/modules/capsules/capsules.routes.js:384`),
  invitación a sala en vivo (`server/src/modules/live/live.routes.js:395`) y
  respuesta a historia (`server/src/modules/stories/stories.routes.js:370`, solo
  hace `$push` en `story.replies`, sin DM ni aviso).
- [ ] **Sin resolución de apelación notificada** al autor del reporte
  (`server/src/modules/moderation/moderation.routes.js:732`).
- [ ] **Sin notificación por correo fuera de auth.** `notifications.email` se
  guarda (`server/src/modules/users/users.routes.js:44,58`) pero solo
  verificación y reseteo envían correo (`server/src/modules/auth/auth.routes.js:179`).
- [ ] **Sin badge de no leídos.** `useNotifications` expone `unreadCount`
  (`client/src/features/notifications/useNotifications.js:18,117`) pero
  `TabBar.jsx` y `MenuDrawer.jsx` no lo consumen: la pestaña 🔔 nunca muestra
  número (`client/src/navigation/model.jsx:57`).

### 1.2 Publicaciones
- [ ] **Texto sin enlaces ni menciones.** `post.content` se renderiza literal
  (`client/src/features/social/components/PostCard.jsx:280-282`); no hay parser
  de `#hashtag` ni de `@usuario`. Los chips de hashtag sí existen
  (`PostCard.jsx:290-294`).
- [ ] **Pantalla de tema inexistente.** `GET /posts/topic/:tag`
  (`server/src/modules/posts/posts.routes.js:1063`) y
  `postsService.getPostsByHashtag` (`client/src/services/postsService.js:42`)
  no tienen importador: el enlace del hashtag manda a `/explore?q=`, no a un
  listado del tema. Tampoco hay tendencias ni sugerencias de a quién seguir.
- [ ] **`getFeedByRoute` sin uso** (`client/src/services/postsService.js`): la
  ruta de feed por sección existe solo en el service.
- [ ] **Selector de modo de feed solo en Ajustes.** El servidor aplica
  `latest|following|interests` (`posts.routes.js:74-96`) y la preferencia se
  edita en `client/src/features/settings/Settings.jsx:349-360`, pero el inicio
  no tiene conmutador rápido.
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
- [ ] **Encuestas**: el voto solo se bloquea por `closesAt`
  (`posts.routes.js:816`) y `normalizePost` calcula `closed` con la fecha
  (`posts.routes.js` → `normalizePost.js:81`); no hay cierre manual del autor ni
  PATCH de `poll.closed`, aunque `PostCard.jsx:119` ya lee ese campo.
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

### 1.3 Historias
- [ ] **Expiración por consulta, no por TTL**: declarado y real
  (`server/src/modules/stories/Story.js:9,138`; filtro `expiresAt > now` en
  `stories.routes.js:197`). Sin índice TTL los documentos se acumulan.
- [ ] **Responder no abre conversación**: solo inserta en `story.replies`
  (`stories.routes.js:370`), sin DM ni notificación al autor.
- [ ] **Sin stickers, música ni destacados**: el modelo solo tiene `text`,
  `caption` y `media` (`Story.js:103,128`); no hay colecciones de historias
  destacadas en el perfil (`PROFILE_TABS` en
  `client/src/features/users/ProfileTabs.jsx:3-8`).
- [x] *Verificado y descartado*: el inicio **sí** integra historias —
  `SocialPage.jsx:337` monta `<StoriesBar />` y `/home` es esa página
  (`client/src/App.jsx:134`). No es un pendiente.

### 1.4 Mensajería y grupos
- [ ] **No se puede borrar un mensaje**: cero `router.delete` en
  `server/src/modules/messages/messages.routes.js`, cero UI.
- [ ] **DM solo imágenes**: `handleUpload("media")` valida solo MIME de imagen
  (`messages.routes.js:39`; `handleUpload` en `server/src/middleware/upload.js:225-234`)
  y el composer limita a `image/jpeg,image/png,image/webp`
  (`client/src/features/messages/MessageComposer.jsx:166`), mientras las
  publicaciones aceptan MP4/WebM/MOV (`handleMediaUpload`, `upload.js:236`).
- [ ] **Grupos sin roles ni salida**: solo `createdBy` cambia miembros
  (`server/src/modules/conversations/conversations.routes.js:432`), no hay
  abandono voluntario ni edición de `conversation.name`
  (`Conversation.js:12`) — la UI lo muestra (`Conversations.jsx:552`) pero
  nadie lo cambia.
- [ ] **Sin búsqueda dentro de mensajes** (ni endpoint ni UI).
- [ ] **Presencia de una sola instancia** (`server/src/modules/messages/presence.js:8-12`).

### 1.5 Directos (live)
- [ ] **Sin TURN**: solo STUN fijo (`client/src/features/live/Live.jsx:18`), sin
  variable de entorno. Con NAT estricto la conexión no se establece.
- [ ] **Sin chat de sala, sin grabación y sin moderación del directo**
  (`live.routes.js` no tiene mensajes, ni control de invitados expulsados, ni
  corte): el único uso de moderación es al invitar (`live.routes.js:395`).
- [ ] **`GET /live/rooms` es público y sin filtro social**
  (`live.routes.js:120`): lista salas de usuarios bloqueados.
- [ ] **`maxParticipants` no se puede fijar desde la UI**: el servidor lo
  acepta y lo topa en 500 (`live.routes.js:45,87`) pero
  `createLiveRoom` no lo envía (`client/src/services/liveService.js:28-35`).
- [ ] **El cliente no escucha `live:room-started`** (`Live.jsx:272-277`): una
  sala nueva no aparece hasta refrescar.
- [ ] **`getLiveRoomById` sin `catch`** en la invitación (`Live.jsx:616`).

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
