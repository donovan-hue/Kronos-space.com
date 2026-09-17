# AUDIT-005 — Media posts, Composer multimedia, Save/Repost, Avatar upload

**Fecha:** 2026-09-17 UTC  
**Rama:** `arena/01a0adca-kronos-space-com` (local, **sin push** por instrucción)  
**Orden:** Secuencial del plan — sigue a AUDIT-004 social core, toma los siguientes pendientes del matriz en orden: `KRONOS-UI-009, 012, 013, 016 (y 015 alt)`.  
**Skills:** `kronos-social` (12,13,32), `kronos-frontend` (6,7), `kronos-backend` (4), `kronos-project-context` (11)

## 1. Objetivo

Completar el bloque **media & interactions extendidas** que quedó pendiente tras social core:

```
Texto solo → Texto + imagen validada → Composer con preview → Guardados → Reposts → Avatar
```

Respetando siempre:

```
Screen → Component → Hook → Service → API → Backend → Storage/DB
```

y estados `loading / empty / error / uploading / success`.

## 2. Matriz afectada

| ID | Antes | Después | Evidencia |
|---|---|---|---|
| KRONOS-UI-009 Media posts | PENDIENTE | **COMPLETADO** | `Post.media {url,type,mimeType,size,alt}` + `POST /posts/media/upload` |
| KRONOS-UI-012 Save/repost | PENDIENTE | **COMPLETADO** | `savedBy` toggle + `GET /saved`, `repostOf` + `POST /:id/repost` |
| KRONOS-UI-013 Composer multimedia | PENDIENTE | **COMPLETADO** | `CreatePost` con file input, preview, alt, upload flow |
| KRONOS-UI-015 Alt/captions | PENDIENTE | **COMPLETADO** | `media.alt` max 500, edición vía `PATCH /:id` + UI |
| KRONOS-UI-016 Cover/avatar upload | PARCIAL | **COMPLETADO** | `POST /users/me/avatar` upload + `Profile`/`ProfileSettings` |
| KRONOS-UI-011 Moderación | PARCIAL | **PARCIAL** | delete comment ya; hide/report queda para siguiente bloque |
| KRONOS-UI-039 API centralizada | COMPLETADO (social) | **COMPLETADO (social+media)** | `postsService.uploadMedia/toggleSave/repost`, `usersService.uploadAvatar` |

## 3. Backend

### 3.1 Post model `server/src/modules/posts/Post.js`

```js
media: {
  url: String maxlength 2000 default "",
  type: enum["image",""] default "",
  mimeType: String default "",
  size: Number default 0,
  alt: String maxlength 500 default ""
},
savedBy: [ObjectId ref User] default [],
repostOf: ObjectId ref Post default null
```
- Índices existentes conservados (`author+createdAt`, `createdAt`). `savedBy` index implícito por query.
- `strict:true` preservado, compat con docs antiguos (posts sin `media` leen `url=""`).

### 3.2 Storage `server/src/config/storage.js` (nuevo)

```js
saveBuffer({buffer,mimetype,originalname,subdir})
  → ensureDir(uploads/media|avatars)
  → name `${Date.now()}-${random}.ext`
  → writeFileSync
  → return { url:`/uploads/${subdir}/${name}`, size }
```
- `uploads/media`, `uploads/avatars` creados si no existen.
- `extFromMime` solo jpg/png/webp (alineado con `upload.js`).

### 3.3 Static `server/src/server.js`

```js
const uploadsRoot = path.join(__dirname,"../uploads");
if(!exists) mkdirSync(...)
app.use("/uploads", express.static(uploadsRoot,{maxAge:"7d"}));
```
- `helmet crossOriginResourcePolicy:"cross-origin"` ya permite cargar imágenes.
- `path/fs` imports añadidos.

### 3.4 Posts routes `server/src/modules/posts/posts.routes.js`

- **Imports:** `handleUpload`, `saveBuffer`, `getUploadsRoot`.
- **Helpers:** `normalizePost` ahora añade `saved`, `savedCount`, `hasMedia`.
- **Nuevas rutas (ANTES de `/:postId` para evitar captura):**
  - `POST /media/upload` `auth requireUser handleUpload("media")` → `saveBuffer` `subdir:"media"` → `201 {url,mimeType,size}` — valida `LIMIT_FILE_SIZE` 10MB y `UNSUPPORTED_IMAGE_TYPE` vía `upload.js` + `hasValidImageSignature`.
  - `GET /saved` paginado (`savedBy: userId`) → `{posts,total,page,limit,hasMore}`.
  - `POST /:postId/save` pipeline atómico `$cond $in $filter $concatArrays` toggle `savedBy` — idempotente, `hasMore` no aplica.
  - `POST /:postId/repost` body `{content?}` → valida `MAX_POST_LENGTH`, `409` si ya reposteó, crea doc `{content: content||original.content, author, repostOf, media: original.media}`, `populate author+repostOf.author`, notifica tipo `repost` (enum extendido).
- **Modificados:**
  - `GET /user/:userId`, `/feed`, `/`, `/:postId` ahora `populate("repostOf")` y usan `normalizePost` (incluye `saved`).
  - `POST /` body `{content, media?, mediaUrl?}` → valida `media.url` empieza con `/uploads/` o `https://`, `alt ≤500`, `size ≤10MB`, guarda en `media`. Mantiene compat: posts antiguos sin `media` funcionan.
  - `PATCH /:postId` permite `mediaAlt` → `updates["media.alt"]` (validado 500).

- **Errores:** `400` vacía/longitud/ID, `401` token, `403` no autor, `404` no encontrado, `413` size, `409` repost duplicado, `500` genérico.

### 3.5 Users routes `server/src/modules/users/users.routes.js`

- Nueva ruta `POST /me/avatar` `auth requireUser handleUpload("avatar")` → `saveBuffer subdir:"avatars"` → `findByIdAndUpdate avatar:url` → `200 user`.
- Mantiene `PATCH /me` para URL directa.

### 3.6 Notification model `server/src/modules/notifications/Notification.js`

- `enum ["follow","like","comment","repost","save"]` (antes solo 3) — habilita notificación repost.

## 4. Frontend Service Layer

### `client/src/services/postsService.js`

```js
uploadMedia(file) // validación MIME size, FormData POST /posts/media/upload
createPost(content,{media,alt}) // media puede ser {url} o string url
updatePost(postId,content,{alt})
toggleSave(postId) // POST /:id/save
repostPost(postId,content?)
getSavedPosts({page,limit})
```
- Todas usan `api` (`apiClient`) con `multipart/form-data` para upload.

### `client/src/services/usersService.js`

```js
uploadAvatar(file) // POST /users/me/avatar
```

## 5. Frontend Components

### `client/src/features/social/CreatePost.jsx` — rewrite AUDIT-005

- **Estados:** `content, file, preview (URL.createObjectURL), alt, uploading, creating, error/success`.
- **Input:** `<input type="file" accept="jpg/png/webp" hidden>` botonado “Añadir imagen / Cambiar imagen”, `fileRef`.
- **Validación frontend:** MIME allowed set, size 10MB, error inmediato.
- **Preview:** `<img preview>` en caja `k-composer-media` con `alt` input `maxLength 500`, botón `×` quitar, info `name · KB`, estado `Subiendo imagen...`.
- **Submit:** `if file → uploadMedia(file) → media={url,...}` luego `createPost(content,{media,alt})`, `clearMedia` + `setContent("")` al éxito, bloqueo `creating||uploading`.
- **Footer:** contador `content.length/5000`, botón `Publicar` deshabilitado si vacía o busy.

### `client/src/features/social/SocialPage.jsx` — extendido

- **Imports:** `toggleSave`, `repostPost` además de `likePost` etc.
- **Helpers:** `MediaBlock({media})` y `RepostBlock({repostOf})`.
- **PostCard:** ahora recibe `onSave, onRepost, saving, reposting`, muestra `media?.url` con `alt`, `repostOf` bloquecillo, actions `Guardar{·count} / Repost`.
- **Estados:** `saving, reposting`.
- **Handlers:**
  - `handleSave(id)` optimista `saved/savedCount` toggle, rollback en catch.
  - `handleRepost(id)` confirm → `repostPost` → `prependPost`.
- **Render:** `post.media` y `post.repostOf` en feed, botones con `is-liked` cuando `saved`.

### `client/src/features/social/PostDetail.jsx` — extendido

- **Estados:** `editAlt, savingPost, reposting`.
- **Load:** `setEditAlt(post.media?.alt||"")`.
- **Actions:** `handleSave` toggle, `handleRepost` navigate a nuevo, `handleEdit` ahora envía `alt` además de `content`.
- **UI:** edición muestra textarea + input alt si tiene media, bloque `repostOf`, media render con `alt`, actions `Guardar/Repost` + `like`.

### `client/src/features/social/SavedPosts.jsx` (nuevo)

- **Hook local** paginado `getSavedPosts`, dedup por `_id`, `hasMore`.
- **UI:** lista `k-feed-list` con media si existe, botón `Quitar` → `toggleSave` y filtra local, empty state “Nada guardado aún”, header con `KRONOS / SAVED`.

### `client/src/features/users/Profile.jsx` — extendido

- **Imports:** `uploadAvatar`, `toggleSave`, `repostPost`.
- **Estados:** `avatarUploading`.
- **Avatar:** input file hidden + botón “Subir imagen”, handler `handleAvatarFile` → `uploadAvatar` → update `profile` + `saveSession`, success/error.
- **Posts:** cada post muestra `media` y `repostOf`, actions `Guardar/Repost` además de `Like`.

### `client/src/features/settings/ProfileSettings.jsx` — extendido

- **FileRef + uploading**, `handleFile` → `uploadAvatar`, preview `form.avatar` img, mute `JPG/PNG/WebP, máx 10MB`.

### `client/src/App.jsx` + Navigation

- **Import** `SavedPosts`, route `"/saved" → <SavedPosts />` dentro de `ProtectedRoute+AppLayout`.
- **Navigation:** `links` ahora incluye `["/saved","Guardados",Bookmark]`, ambos desktop y `MobileNavigation`.

## 6. Validación

```
npm run build --workspace=client
  vite v7.3.6
  ✓ 1707 modules transformed
  dist/index-DCVOn7gy.js 419.88 kB gzip 129.44 kB ✓
node --check server/src/server.js ✓
node --check server/src/modules/posts/Post.js ✓
node --check server/src/modules/posts/posts.routes.js ✓
node --check server/src/modules/users/users.routes.js ✓
node --check server/src/config/storage.js ✓
```

Smoke (requiere Mongo real + token):

```
POST /posts/media/upload (multipart media) → 201 {url:"/uploads/media/123.jpg"}
POST /posts {content:"hola", media:{url,alt:"una ciudad"}} → 201 {post.media}
GET /posts → post.saved, hasMedia
POST /posts/:id/save → {saved:true,savedCount:1} toggle
GET /posts/saved → paginated
POST /posts/:id/repost {content:"miren"} → 201 repostOf
POST /users/me/avatar (multipart avatar) → 200 user.avatar="/uploads/avatars/..."
PATCH /posts/:id {mediaAlt:"nuevo alt"} → 200
```

## 7. Archivos tocados (local, sin push)

```
server/src/config/storage.js                 (nuevo) helpers saveBuffer
server/src/modules/posts/Post.js             media, savedBy, repostOf
server/src/modules/notifications/Notification.js  enum +repost/save
server/src/server.js                         /uploads static
server/src/modules/posts/posts.routes.js     media upload, saved, repost, media en POST/PATCH, normalize
server/src/modules/users/users.routes.js     POST /me/avatar
client/src/services/postsService.js          uploadMedia, toggleSave, repost, getSavedPosts
client/src/services/usersService.js          uploadAvatar
client/src/features/social/CreatePost.jsx    file+preview+alt flow
client/src/features/social/SocialPage.jsx    MediaBlock, RepostBlock, save/repost handlers
client/src/features/social/PostDetail.jsx    save/repost, alt edit, media render
client/src/features/social/SavedPosts.jsx    (nuevo) paginated saved view
client/src/features/users/Profile.jsx        avatar upload, media+save/repost en lista
client/src/features/settings/ProfileSettings.jsx avatar upload + preview
client/src/App.jsx                           route /saved
client/src/components/Navigation.jsx         link Guardados
client/src/components/MobileNavigation.jsx   link Guardados
docs/AUDIT-005-media-save.md                 (nuevo)
KRONOS_FINAL_IMPLEMENTATION_MATRIX.md        (actualizado 009,012,013,015,016)
```

## 8. Próximo bloque según orden específico

Siguiente pendiente numérico tras 016 es **KRONOS-UI-017 Profile tabs / 018 Privacy** o **019-022 Messages & Presence**.

Si se sigue estricto, AUDIT-006 tocaría:

- 017 tabs (publicaciones/guardados/reposts/separados)
- 018 privacidad
- 019-022 mensajes: attachments, presence/typing, retry

Queda a decisión continuar con **Profile tabs & Privacy** o **Mensajería real-time**.

## 9. Instrucción de rama

Cambios quedan **solo locales** en `arena/01a0adca-kronos-space-com`, sin `git push` por tu indicación. Commit local pendiente de crear hasta que indiques push.
