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
| `npm test --workspace=server` | 678 pass / 0 fail / 203 **skip** (881 tests) |
| `npm run test:client` | 95 node + 76 archivos vitest, 0 fail |
| `npm run build` | exit 0, 94 chunks (máx 407953 B, tope 500000) |
| `npm run barrido:huerfanas` | cupo de 33 reglas CSS sin uso, sin reglas nuevas |
| `grep -r "TODO\|FIXME"` | **0 resultados**: los pendientes no están anotados, hay que deducirlos |

El PR #78 queda con **todos los checks en verde**: `build`, `validate`,
`Umbrales de cobertura`, `browser`, `guardian-check`, los dos E2E (mongo:7 y
Atlas), Cloudflare Pages y Vercel. El job `browser` llevaba roto desde el
refactor de cabecera de `main` (`b0bc1e2`): el spec pulsaba un botón de atajos
que ya no existe y comparaba «Notificaciones» por nombre exacto cuando la
campana anuncia ahora el número de no leídas. Arreglado en `036ef6f`.

Los 203 tests omitidos del servidor son las suites E2E que necesitan
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
- [x] **Contador de no leídas en el menú de secciones.**
  `MenuDrawer.jsx` lee `useUnreadNotifications` (el mismo hook de la campana,
  misma caché) y pinta la cifra en la fila de Notificaciones, capada en «99+» y
  con «sin leer» para lectores de pantalla. Quien navega por el menú ya no
  entra a mirar: ve que hay algo esperando.
- [ ] **Sin contador en el `title` de la pestaña del navegador**: la cifra vive
  en la campana y en el menú, pero la pestaña en segundo plano no avisa.
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
- [x] **La receta de video se reproduce en el feed.** `client/src/lib/videoTrim.js`
  + `components/media/VideoTrim.jsx` aplican `media.edit.corte` (y el legado
  `media.trim`) al `<video>` real: al cargar saltan al inicio del tramo y al
  llegar al final pausan, así que ya no se ve el trozo que se quiso cortar.
  `fin: 0` significa «hasta el final» y un tramo inválido se descarta entero en
  vez de dejar un video irreproducible. Sin recorte no monta oyentes.
- [ ] **Póster de video como data URL**: se serializa la imagen completa dentro
  del JSON del post (`CreatePost.jsx:561,563`), en vez de subirla y guardar la
  ruta.
- [ ] **Sin subtítulos generados**: `subtitles: []` fijo al publicar
  (`CreatePost.jsx:685,708`); el PATCH `/posts/:id/subtitles`
  (`posts.routes.js:1289`) no tiene UI que lo llame. `MediaViewer.jsx:27-47`
  solo los reproduce si ya vienen.
- [ ] **`PATCH /posts/:id/video-trim`** (`posts.routes.js`) **sin
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
- [x] **El archivo pagina y lo dice.** `GET /stories/me/archive` acepta
  `page`/`limit` y devuelve `total` (solo en la primera página: contarlo en cada
  desplazamiento es un recorrido completo que no cambia mientras se pagina) y
  `hayMas`. La pantalla encabeza «N de M historias» y ofrece «Cargar más»; al
  eliminar una, el total baja, porque decir «1 de 2» tras borrar sería mentira.
  Antes cortaba en silencio y no se podía distinguir «faltan» de «no hay».
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

### 1.6 Perfil, círculos y guardados — **CERRADO parcialmente (26-11-04)**

Lo hecho y verificado:

- **Nombre visible y biografía editables.** `PATCH /users/me` los aceptaba
  desde el principio y **ninguna pantalla lo llamaba**. Ahora el perfil propio
  tiene «Editar perfil» con ambos campos (con el valor actual precargado,
  límites 100/500 validados en cliente y servidor) y, al guardar, actualiza el
  caché del perfil y la copia local de la sesión para que el nombre nuevo se
  vea en la barra superior sin recargar.
- **Cambio de contraseña (y creación de la primera).** No existía ni la ruta.
  `PATCH /api/users/me/password` valida con una función pura
  (`passwordPolicy.js`: mínimo 8, máximo 128 caracteres/**72 bytes** porque
  bcrypt trunca en silencio, confirmación, actual correcta y distinta) y revoca
  los refresh tokens de las **demás** sesiones: si alguien cambia la contraseña
  porque su cuenta estaba comprometida, dejar los refresh vivos anularía el
  cambio. Cubre el caso de Google (`hasPassword: false`): fija la primera
  contraseña sin pasar por el correo de reseteo, que sin proveedor de correo no
  llega.
- **Apariencia real.** Ajustes prometía «Ajustes, idioma y tema» y guardaba
  `appearance: "system"` en estado local; el campo no existía en el esquema y
  nada lo leía. Ahora está en `preferences.appearance` (`light|dark|system`,
  validado en la ruta de preferencias) y `client/src/lib/themePreference.js`
  aplica `data-k-theme` en `<html>` **antes de hidratar** (sin destello). El
  tema oscuro, que es la identidad, no cambia ni un valor; el claro se define
  con los mismos tokens y overrides acotados a texto y superficies, respetando
  la auditoría de paleta neutra. `system` sigue al dispositivo en vivo.
  Si el guardado falla, el tema se revierte en lugar de quedarse a medias.

Tests: `029:` en `block-009-015.contract.test.js` (esquema y ruta de
apariencia, reglas de contraseña incluido el corte de 72 bytes, cuenta sin
contraseña, revocación de sesiones) y `client/test-ui/profile-account-1-6.spec.jsx`
(10: tema, apariencia con reversión, contraseña, cuenta de Google) más 3 casos
de edición de perfil en `profile-block.spec.jsx`.

Sigue abierto:

- [ ] **Sin idioma real**: el selector dice que no traduce pantallas; el valor
  solo se usa para el chat (`ai-core/routes/chat.routes.js`). Sin i18n, elegir
  English no cambia la interfaz.
- [ ] **Sin PWA funcional**: hay manifest e iconos
  (`client/public/manifest.webmanifest`) pero no hay service worker ni
  `Notification.requestPermission`: no hay offline ni push.
- [ ] **Sin SEO compartible**: `client/index.html` no tiene `og:image` y
  `client/vercel.json` no define caché ni `robots.txt`.

---

## 2. Kairos / IA

### 2.1 Chat — **CERRADO parcialmente (26-11-04)**

Lo hecho y verificado:

- **El chat tiene pantalla propia.** Antes `POST /ai/chat` solo existía para
  que el compositor reescribiera un borrador desde
  `client/src/features/social/CreatePost.jsx`. Ahora hay bandeja e hilo en
  `client/src/features/ai/KairosChat.jsx` (303 líneas) con dos rutas lazy en
  `client/src/App.jsx:158-159` (`/kairos/chat` y `/kairos/chat/:conversationId`).
  La bandeja lista, crea, renombra y borra; el hilo muestra rol, error por
  mensaje, `role="log"`/`aria-live` y `Enter` envía / `Shift+Enter` salta línea.
- **Conversaciones persistentes.** `POST /ai/chat`
  (`server/src/modules/ai-core/routes/chat.routes.js:71`) acepta
  `conversationId` opcional y guarda los mensajes; con hilo, el historial sale
  de la base (`effectiveHistory`, líneas 114-117: últimos `MAX_HISTORY_ITEMS`
  con `estado === "ok"`) y **se ignora el que mande el cliente**, así que ya no
  hace falta reenviar todo en cada petición. Sin `conversationId` el
  comportamiento es el antiguo, y el compositor sigue funcionando igual.
- **Una respuesta que el proveedor no da queda registrada.** Si `chat()` falla
  se guardan el mensaje del usuario y un asistente `estado:"error"` con el
  motivo (`chat.routes.js:136`), se reescribe el hilo y se relanza el error al
  cliente; el fallo es visible en la conversación en vez de evaporarse.
- **CRUD de conversaciones, siempre acotado al dueño.**
  `GET/POST /ai/chat/conversations` y `GET/PATCH/DELETE /ai/chat/conversations/:id`
  (`chat.routes.js:233-345`), todos con `auth` + `requireUser` y filtrando por
  `user: req.user.id`; una conversación ajena responde 404, no 403. La bandeja
  se proyecta sin `messages` y con `preview` de 160 caracteres, orden
  `lastMessageAt` desc y tope de 50.
- **Modelo nuevo** `server/src/modules/ai-core/ChatConversation.js`: mensajes
  embebidos con `estado`, `error` y `model`; `personality` y `language`
  congeladas al crear el hilo (cambiar el tono en Ajustes no reescribe lo ya
  hablado); `MAX_MESSAGES = 200` → `409 CONVERSATION_FULL`; índice
  `{user:1, lastMessageAt:-1}` y **sin** índice suelto en `user` (el compuesto
  lo cubre). Registrado en `server/src/db/registry.js` (dominio `ai`, sensible)
  y borrado en cascada al eliminar la cuenta
  (`server/src/modules/users/users.routes.js`).
- **El chat ya alimenta a Kairos**: `AICenter` tiene tarjeta «Chat»
  (`client/src/features/ai/AICenter.jsx:45`, `capacidad: "chat"`) que lee
  `GET /kairos/capacidades` como las demás, y `chat` estaba anunciado en
  `kairos.routes.js:79` sin destino hasta ahora.
- **Títulos sin pedir nada**: el primero se deriva del primer mensaje
  (`titleFrom()`, `chat.routes.js:227`, normaliza espacios y recorta a 120 con
  `…`) y se puede renombrar después (`PATCH`, tope 120).

Tests: `030:` ×4 en `server/test/kairos.contract.test.js` (esquema y estado,
las seis rutas con auth, historial tomado de la base, borrado de cuenta) y
`client/test-ui/kairos-chat.spec.jsx` ×7 (bandeja, vacío, hilo, error por
mensaje, envío sin reenviar `history`, crear desde la bandeja, 409).

Sigue abierto:

- [ ] **Capacidades declaradas sin profundidad de UI**: `voz`, `musica`,
  `filtros`, `trabajos`, `biblioteca`, `historial` se anuncian en
  `server/src/modules/ai-core/routes/kairos.routes.js:80-99`; filtros vive
  dentro del estudio de publicación y música solo se administra por API (ver
  2.4). No hay pantalla para trabajos, biblioteca ni historial.
- [ ] **Sin streaming ni cancelar**: la respuesta llega de golpe y no se puede
  interrumpir ni reintentar el último mensaje desde el hilo.
- [ ] **Sin adjuntos ni contexto del estudio**: el chat solo habla texto; no
  puede referirse a una publicación, imagen o video concretos.
- [ ] **Sin búsqueda en el hilo** ni navegación entre conversaciones más allá
  de las 50 más recientes.

### 2.2 Imagen — **CERRADO parcialmente (26-11-04)**

Lo hecho y verificado:

- **Encuadre elegible y de verdad enviado.** Antes el aspecto era la variable
  `OPENROUTER_IMAGE_ASPECT_RATIO` (un valor para todo el servidor) y
  `buildImageRequestBody` solo sabía mandar `size`. Ahora la ruta acepta
  `aspectRatio` de un catálogo cerrado —`1:1, 4:5, 3:4, 9:16, 4:3, 3:2, 16:9`—
  (`server/src/modules/image-ai/image.capabilities.js:14-21`), responde
  `400 INVALID_IMAGE_ASPECT_RATIO` fuera de él (`image.routes.js`) y el
  servicio traduce el encuadre a píxeles con `sizeForAspectRatio()` cuando el
  modelo declara `size`, o lo manda como `aspect_ratio` cuando solo declara
  eso. Antes, un modelo que solo conoce `aspect_ratio` recibía siempre el 1:1
  del entorno; ahora recibe el encuadre pedido.
- **Hasta cuatro variaciones por generación.** La ruta valida
  `variations` 1-4 (`MAX_IMAGE_VARIATIONS`, `400 INVALID_IMAGE_VARIATIONS`),
  `buildImageRequestBody` añade `n` **solo si el modelo lo declara** y, si no,
  lo dice en `decisions` en vez de mandarlo a ciegas. Todas las imágenes se
  descargan y se guardan en almacén propio (`persistProviderImage` por cada
  una), se persisten en `variants` y la respuesta trae `urls`/`variants`
  además de `url` (que sigue siendo la principal, para no romper a nadie).
  Si una variación falla al persistirse después de otras correctas, se
  devuelven las buenas con un `message` que lo explica; si fallan todas, la
  generación se marca `failed` como antes.
- **El modelo recuerda con qué se hizo**: `ImageGeneration` guarda
  `aspectRatio` y `variations` (`ImageGeneration.js`), así que «Reutilizar»
  desde el historial restaura el encuadre y el número de variaciones, no solo
  el prompt (`KairosHistory.jsx`, `ImageGenerator.jsx`).
- **La pantalla deja de mentir**: `ImageGenerator` tiene «Encuadre» y
  «Variaciones», muestra las imágenes devueltas en una tira seleccionable
  (`.k-ai-variants` / `.k-ai-variant`) y avisa cuando el proveedor dio menos de
  las pedidas. El esquema de cliente (`client/src/schemas/index.js`) valida
  los mismos valores que el servidor.
- **La biblioteca dice cuántas variaciones tiene cada imagen**
  (`MediaLibrary.jsx`), en vez de esconder las demás.

Tests: 3 contratos nuevos en `server/test/openrouter.contract.test.js`
(cuerpo con `size`/`aspect_ratio`/`n`, catálogo y tamaños coherentes con cada
encuadre, validación y persistencia leídas del código) y 5 en
`client/test-ui/kairos-image-variants.spec.jsx` (valores por defecto, envío de
encuadre y variaciones, selección de variante, proveedor que devuelve menos,
reutilización desde el historial).

Sigue abierto:

- [ ] **Sin estilos propios ni prompts guardados**: el estilo sigue siendo uno
  de cuatro (`ALLOWED_STYLES` en `image.service.js`) y no hay presets del
  usuario ni biblioteca de prompts.
- [ ] **Sin edición de una imagen existente** (inpainting/outpainting,
  referencias): `/ai/images/upload` guarda la imagen pero no hay ruta que la
  use como `input_references`, aunque el modelo declare ese parámetro.
- [ ] **La biblioteca no agrupa por generación**: cada variación se ve como
  una entrada suelta (`MediaLibrary.jsx` lista generaciones, no grupos), así
  que una generación de cuatro ocupa cuatro filas del historial con el mismo
  prompt.

### 2.3 Video — **CERRADO parcialmente (26-11-04)**

Lo hecho y verificado:

- **El video generado ya se guarda en almacén propio.** Antes se persistía la
  URL del proveedor tal cual (`video.routes.js:61,114`) y no había ni una
  llamada a `saveBuffer` en todo `video-ai/`: si el proveedor caducaba la URL,
  la pieza del usuario desaparecía. Ahora
  `server/src/modules/video-ai/video.storage.js` descarga el resultado y lo
  escribe en `/uploads/media` con copia en GridFS (el mismo `saveBuffer` que el
  resto de media), y se hace **en los dos caminos**: cuando el proveedor
  termina en la misma petición y cuando termina en el sondeo
  (`ensureStoredVideo`). `providerVideoUrl` conserva la del proveedor solo para
  diagnóstico y `stored` evita volver a descargar en cada consulta.
- **Una sola política de descarga para imagen y video.** La guarda de imagen
  (https público, nada de redirecciones, tope leído en streaming, sin
  direcciones privadas) vivía dentro de `image.service.js`; copiarla para video
  habría dejado dos versiones de la misma regla. Se movió a
  `server/src/config/aiResultDownload.js`, que ahora usan las dos capacidades, y
  la imagen conserva sus códigos de error públicos
  (`IMAGE_RESULT_INVALID/TOO_LARGE/UNAVAILABLE`) a través de un adaptador: su
  contrato y sus pruebas no cambian. El módulo no inventa códigos —los recibe
  del llamador— porque `ai-proveedor-503.contract.test` exige que todo código
  lanzado tenga entrada en `middleware/aiError`.
- **El formato se decide por firma de archivo**, no por la URL ni el
  `content-type` del proveedor: MP4/MOV por la caja `ftyp`, WebM por el EBML y
  GIF animado (varios proveedores devuelven eso como video corto). Un HTML
  disfrazado se rechaza con `VIDEO_RESULT_INVALID` en vez de guardarse y
  servirse desde nuestro dominio. Tope de 200 MB, por encima del de subida.
- **Borrar un trabajo borra su copia** (`purgeUnreferencedMedia`, que respeta
  publicaciones que aún la usan). Antes no había nada que limpiar; ahora
  dejarlo sería basura invisible.
- **Los proyectos de guion se pueden reabrir.** `GET /ai/scripts/projects`,
  `GET /projects/:id`, `PUT`, `DELETE` y `GET /projects/:id/export` existían y
  el cliente solo llamaba a «guardar»: se creaba un proyecto y no había forma
  de volver a verlo. Ahora `ScriptProjects.jsx` los lista, los **abre en el
  editor** (restaura estructura y parámetros), los exporta a `.txt` y `.json`,
  los elimina y, si el proyecto está abierto, «Actualizar proyecto» lo edita en
  lugar de crear una copia con otro id (`PUT /ai/scripts/projects/:id`).
- **`getVideoStatus` y el borrado ya estaban conectados** a
  `VideoGenerator`/`VideoJobs`; lo que faltaba de verdad en ese punto era la
  copia propia, y es lo que se hizo.

Tests: 6 contratos en `server/test/block-025-030.contract.test.js` (firma de
formato, descarga y guardado con URL propia, resultado ya almacenado, rechazo
de destinos privados y cuerpos no-video, persistencia en los dos caminos y
limpieza al borrar, rutas y cliente de proyectos) y 6 en
`client/test-ui/kairos-script-projects.spec.jsx`.

Sigue abierto:

- [ ] **Sin subtítulos automáticos** (ver 1.2) y sin transcodificación en
  servidor: el corte se hace en el navegador con `MediaRecorder`
  (`client/src/components/media/MediaStudio.jsx`) y no hay `ffmpeg` en
  `server/`. La copia propia guarda el video tal como lo dio el proveedor.
- [ ] **Sin recorte posterior al render**: recortar un video ya generado exige
  volver a procesarlo, y hoy eso solo ocurre en el cliente.
- [ ] **La copia propia se descarga en la petición del sondeo**: un video de
  cientos de MB bloquea esa respuesta (hasta 120 s). Con cola de trabajos
  propia dejaría de ser un problema; hoy el tope de 200 MB lo acota.

### 2.4 Audio, catálogos y estudio — **CERRADO parcialmente (26-11-04)**

Lo hecho y verificado:

- **Los catálogos se pueden llenar desde la aplicación.** `POST /api/music` y
  `POST /api/voices` existen desde el principio con `requireAdmin`
  (`music.routes.js:128`, `voices.routes.js:124`) y **ninguna pantalla los
  llamaba**: publicar una pista o registrar una voz exigía curl, y por eso el
  estudio mostraba «todavía no hay pistas publicadas» sin que hubiera forma de
  arreglarlo desde el producto. Ahora hay pantalla en `/admin/catalogos`
  (`client/src/features/admin/CatalogAdmin.jsx`, protegida con el mismo
  `AdminRoute` que `/admin`), con los servicios `publicarPista` y
  `registrarVoz`, enlace desde Ajustes para administradores y el catálogo
  actual listado con su audio reproducible.
- **Libro de consumo por usuario.** El único control del gasto era el
  limitador por capacidad (`middleware/aiLimiter.js`): cuenta intentos por IP
  en 15 minutos, no trabajo, y una imagen cuesta lo mismo que un mensaje. Ahora
  `AiUsage` (`server/src/modules/ai-core/AiUsage.js`) guarda una fila por
  operación imputada a la cuenta, y las cinco rutas facturables la escriben:
  chat (`chat.routes.js`), imagen (`image.routes.js`, unidades = variaciones
  guardadas de verdad), video (`video.routes.js`, al aceptar el trabajo), guion
  (`script.routes.js`) y voz (`voices.routes.js`, unidades = caracteres
  convertidos, que es lo que factura el TTS). Los fallos se anotan con
  `estado:"error"` y `units: 0`: no consumen cuota, pero explican el mes.
- **El libro mide coste, no contenido**: no guarda prompts ni resultados, así
  que no crea una segunda copia de datos personales. Se borra con la cuenta
  (`AiUsage.deleteMany` en el borrado) y está declarado en
  `server/src/db/registry.js` (dominio `ai`, sensible).
- **`GET /api/ai/usage`** devuelve el desglose del mes en curso (desde el día 1
  UTC) por capacidad, **cada una en su propia unidad**; no hay un total único
  porque sumar imágenes con caracteres no significaría nada. El panel
  (`client/src/features/ai/AiUsagePanel.jsx`) aparece en el tablero de Kairos.
- **El registro nunca tumba la operación**: `recordUsage` captura sus propios
  errores y devuelve `null`; si el libro no escribe, la imagen ya generada se
  entrega igual.

Tests: 3 contratos nuevos en `server/test/kairos.contract.test.js` (unidades
por capacidad, que el libro no guarde contenido, periodo mensual; las cinco
rutas anotan y hay resumen; publicación de catálogos con su pantalla) y 6 en
`client/test-ui/kairos-usage-catalogs.spec.jsx` (desglose, reintento, publicar
pista, archivo obligatorio, modelo obligatorio para voz de catálogo, catálogo
vacío).

Segunda tanda, cerrada en la misma sesión:

- [x] **Cuota que mide Y corta.** `AI_QUOTA_<CAPACIDAD>` por entorno (vacío =
  sin límite, que es el default porque no hay precios decididos). La guarda
  `server/src/middleware/cuotaIA.js` se monta en las cinco rutas que gastan
  dinero y responde **402 `CUOTA_AGOTADA`** —no 429 («espera») ni 403 («falta
  permiso»)— *antes* de llamar al proveedor. Cuenta desde la base, no en
  memoria (dos réplicas no comparten contador), y si la base falla **deja
  pasar**: negar el servicio por no poder leer un contador interno convierte un
  problema de medición en una caída. El panel muestra «N de M · quedan K» y
  marca la fila cuando se agota.
- [x] **Voz y pista se pueden editar y retirar.**
  `PATCH`/`DELETE /api/music/:id` (administración) y
  `PATCH`/`DELETE /api/voices/:id`. Regla de propiedad en una sola función
  `puedeEditarVoz`: una grabación propia la manda su dueño aunque no sea
  administrador; el catálogo lo edita solo administración, y `lista`/`modelo`
  los aplica el servidor solo a administración. Una voz ajena responde **404,
  nunca 403**, para no confirmar que existe. El archivo no se sustituye
  editando (sería otro elemento) y al borrar solo desaparece si
  `purgeUnreferencedMedia` confirma que nada más lo usa; la respuesta dice
  `archivoBorrado` y la pantalla lo explica en vez de fingir un borrado.
  Todo desde `/admin/catalogos`, con confirmación explícita.
- [ ] **El estudio no usa el consumo**: `AudioTools` y las pantallas de
  generación no muestran cuánto queda ni cuánto costará la operación antes de
  lanzarla. El panel del tablero ya lo dice; las pantallas de generación
  todavía no.

Sigue abierto:

- [ ] **Sin facturación ni precios**: la cuota es un techo por capacidad, no un
  cobro; no hay planes ni compra de uso extra.

### 2.5 Flags y capacidades — **CERRADO parcialmente (26-11-04)**

El flag ya apaga la función de verdad y no solo el enlace del menú.

- [x] **Los feature flags se aplican en el servidor.** Guarda nueva
  `server/src/middleware/featureFlag.js` → `requireFeatureFlag(nombre)`,
  montada en:

  | flag | dónde queda la guarda |
  |---|---|
  | `capsules` | `registerRoutes.js`, montaje `/api/capsules` |
  | `pulse` | `registerRoutes.js`, montaje `/api/pulse` |
  | `analytics` | `registerRoutes.js`, montaje `/api/analytics` |
  | `vertical` | `posts.routes.js`, `GET /posts/vertical` |
  | `archive` | `stories.routes.js`, `GET /stories/me/archive` |
  | `aiComposer` | `chat.routes.js`, solo el `POST /ai/chat` **sin** `conversationId` |

  Contrato: apagado → **404** con `{ code: "FEATURE_DISABLED", flag }`; 404 y no
  403 porque una función apagada no existe y un 403 confirmaría que está ahí.
  Los tres módulos con router propio se gatean en el punto de montaje (una sola
  lista `MODULE_FLAGS`, se ve de un vistazo qué se apaga con cada flag); las
  rutas sueltas dentro de módulos compartidos se gatean en la ruta. La guarda va
  **después** de `auth`/`requireUser`: un anónimo recibe 401, no un 404 que
  revele la función.
- [x] **Un flag con typo revienta al arrancar** (`FEATURE_FLAG_UNKNOWN`): antes
  `isFeatureEnabled("capsule")` devolvía `false` y habría apagado cápsulas para
  siempre sin que nadie lo notara.
- [x] **El cliente no contradice al servidor.** `client/src/routes/FeatureRoute.jsx`
  convierte el 404 pactado en pantalla «Función no disponible»; montado en
  `/vertical`, `/stories/archive`, `/capsules`, `/pulse` y `/analytics`. Los
  flags se piden una sola vez por carga (`flagsService` comparte la promesa:
  antes menú, barra y cajón podían ver conjuntos distintos) y un fallo de red no
  se cachea.
- [x] **`aiComposer` no apaga el chat.** Comparte ruta con `POST /ai/chat`; el
  flag solo corta la reescritura suelta del compositor (sin `conversationId`).
  El chat con hilo sigue vivo: son dos funciones detrás del mismo POST.
- [x] **Contrato y pruebas**: 3 tests nuevos en
  `server/test/featureflags.contract.test.js` (404 encendido/apagado, typo que
  revienta, y que **todo** `DEFAULT_FLAGS` tenga guarda) + `vertical.contract.test.js`
  actualizado (401 antes que 404) + `client/test-ui/feature-flags-routes.spec.jsx`
  (5 casos: pantalla, aviso, flags en vuelo, promesa compartida, red caída).
- [ ] **Federación de solo lectura**: el inbox responde 501
  (`federation.routes.js:165-176`), sin firmas HTTP ni colas. **Punto abierto
  consciente**: publicar un inbox que acepta actividades sin verificar firma
  sería peor que no tenerlo (falsificar identidad ajena). El 501 dice la verdad
  y el código `FEDERATION_INBOX_NOT_IMPLEMENTED` ya está cubierto por
  `server/test/federation-live-support.contract.test.js:206`. Entrar pide firma
  HTTP, deduplicación por `activity.id` y una cola con reintentos; es un bloque
  propio, no un resto.

---

## 3. Infraestructura y operación

- [ ] **E2E bloqueados**: 203 tests omitidos por falta de
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
