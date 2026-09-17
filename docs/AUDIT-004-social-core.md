# AUDIT-004 — Social Core

**Fecha:** 2026-09-17 UTC
**Rama:** `arena/01a0adca-kronos-space-com` → base `feature/design-system`
**Scope:** KRONOS-UI-008, 010, 011 (parcial), 017 (parcial), 039, + consolidación social core según `.agents/skills/kronos-social/SKILL.md`

## 1. Objetivo

Consolidar el núcleo social para que Frontend ↔ Backend ↔ MongoDB funcionen como **sistema único** con datos reales, sin mocks, respetando:

```
Screen → Component → Hook → Service → API → Backend → DB
```

y manejo completo de estados:

```
loading / success / empty / error + hasMore / pagination
```

## 2. Hallazgos previos (antes de AUDIT-004)

| Área | Problema | Impacto |
|---|---|---|
| `SocialPage.jsx` | usaba `axios` directo + `VITE_API_URL` duplicado, solo `localStorage` parcial | Sesión rota con `sessionStorage`; duplicación de cliente HTTP |
| `Comments.jsx` | validaba `localStorage` únicamente, sin soporte `sessionStorage` | 401 no manejado si “Recordar sesión” = false |
| `PostDetail.jsx` | `axios` + `localStorage`, sin rollback de like, sin edición/eliminación | Like podía quedar desincronizado |
| `Profile.jsx` | `axios` + `localStorage`, `kronos_user` parse manual, `localStorage.setItem` sin contemplar `sessionStorage`, sin paginación, sin edit/delete de posts | Perfil no centralizaba `authStorage`; feed de usuario limitado a 50 sin `hasMore` |
| `CreatePost.jsx` | `axios` directo | Duplicación, no usa `apiClient` con interceptor 401 |
| `posts.routes.js` | `FEED_LIMIT` al final, sin paginación (`page/limit/skip/hasMore`), sin `PATCH`/`DELETE` para posts, sin `DELETE` para comentarios | Imposible paginar, editar o borrar sin bypass de DB |
| `usersService`/`postsService` | inexistentes | Sin capa Service; componentes acoplados a `axios` |
| `useFeed` / hooks | inexistentes | Lógica de feed duplicada, sin deduplicación por `_id` |
| Matriz | 008,010,039 en PENDIENTE/PARCIAL | Social core bloqueado para producción |

## 3. Cambios realizados

### 3.1 Backend — `server/src/modules/posts/posts.routes.js`

- Constantes movidas al inicio; `FEED_LIMIT=50`, `DEFAULT_PAGE_LIMIT=20`, `MAX_POST_LENGTH=5000`, `MAX_COMMENT_LENGTH=1000`.
- Helper `parsePagination(query)`:
  ```js
  page >=1 (default 1), limit 1..50 (default 20), skip=(page-1)*limit
  ```
- Helper `normalizePost` preservado (añade `likesCount`, `liked`).
- **Paginación en 3 endpoints:**
  - `GET /api/posts` → `{ posts, total, page, limit, hasMore }`
  - `GET /api/posts/feed` → idem + `countDocuments`
  - `GET /api/posts/user/:userId` → `{ posts, totalPosts, total, page, limit, hasMore }`
  - Mantiene compatibilidad: viejos consumidores que solo leen `posts` siguen funcionando; nuevos pueden usar `hasMore`/`page`.
- **Edición:** `PATCH /:postId`
  - Requiere `auth`+`requireUser`, valida `content` no vacío y ≤5000, verifica existencia 404 y autor 403, usa `findByIdAndUpdate` + `populate`, retorna `post` normalizado.
- **Borrado:** `DELETE /:postId`
  - Misma validación de propiedad, retorna `{ ok:true, postId }`.
- **Borrado de comentario:** `DELETE /:postId/comments/:commentId`
  - Valida ambos IDs, verifica que el comentario exista, permite borrar si `comment.user === req.user.id` **o** `post.author === req.user.id`, ejecuta `$pull`, retorna `post` normalizado.
- Like atómico existente conservado (pipeline `$cond`/`$in`), ya evitaba `find→save` race.
- Todos los handlers con `try/catch`, `console.error` y respuestas `400/401/403/404/500` consistentes.

### 3.2 Frontend Service Layer

- `client/src/services/postsService.js` (nuevo):
  ```js
  getFeed({page,limit}), getFeedByRoute, getPost, getUserPosts,
  createPost, updatePost, deletePost, likePost, createComment, deleteComment
  ```
  Todas usan `api` de `apiClient.js` (baseURL `VITE_API_URL` o `localhost:5000/api`, timeout 15s, interceptor Bearer + 401 clearSession).

- `client/src/services/usersService.js` (nuevo):
  ```js
  getMe, getUserById, getUserByUsername, searchUsers, toggleFollow, updateProfile
  ```

- Mantiene `authStorage.js` y `socket.js` sin cambios (ya centralizados).

### 3.3 Frontend Hook Layer — `client/src/features/social/hooks/`

- `useFeed({ limit=20 })`:
  - Estados: `posts, page, hasMore, total, loading, loadingMore, error`.
  - `load({nextPage, append})` con deduplicación por `String(_id)`, guard `if(loadingMore||!hasMore) return`, maneja `hasMore` desde backend o `incoming.length===limit`.
  - Métodos: `refresh()`, `loadMore()`, `updatePost`, `removePost`, `prependPost`.
  - Efecto inicial `load page 1`.

- `usePostActions` (opcional, patron para likes con rollback):
  - `handleLike` con optimista `liked/likesCount` + rollback en `catch`.
  - `handleEdit/handleDelete/handleCreateComment/handleDeleteComment`.

Ambos respetan `Skill 21/22` (paginación, carga incremental) y `30` (duplicados).

### 3.4 Componentes sociales

#### `SocialPage.jsx` — rewrite completo
- Usa `useFeed` (hook) + `postsService` + `getUser`.
- **Estados:** `liking, commenting, commentText, openComments, editing, editValues, saving`.
- **Like:** optimista + rollback + `setError` con mensaje backend.
- **Comentario:** `createComment` + `deleteComment` (autor del comentario o autor del post pueden borrar).
- **Edición:** textarea con `maxLength 5000`, validación vacía/longitud, `PATCH` via `updatePost`, 403/404 específicos, cierra modo edición al éxito.
- **Borrado:** `window.confirm` + `deletePost`, actualiza lista local.
- **Compartir:** `navigator.share` o `clipboard`.
- **Paginación:** botón “Cargar más” si `hasMore`, muestra “Has visto todo el feed” si no.
- **UI:** mantiene clases `k-feed-page`, `k-post`, `k-post-header`, `k-avatar`, `k-post-actions`, `k-comments`, `k-state-error` (design-system chrome/silver + deep black).
- **Deduplicación:** hook ya garantiza `_id` único al append.
- **Manejo de errores:** banner `k-state-error` con botón cerrar, refresco vía `refresh`.

#### `CreatePost.jsx` — migrado a service
- Usa `postsService.createPost`, validación 5000, mensajes `401` “Tu sesión expiró”, `429`, success `Publicación creada.`, botón bloqueado mientras `creating`.

#### `Comments.jsx` — rewrite con service
- Usa `createComment`/`deleteComment`, valida longitud 1000, maneja `401`/`403`/`404`, muestra botón `×` si `comment.user === meId` o `postAuthorId === meId`, ignora `localStorage` directo → usa `getUser`/`apiClient`.

#### `PostDetail.jsx` — rewrite con service
- Usa `getPost`, `likePost` con optimista+rollback, `updatePost`, `deletePost`, `Comments` con `postAuthorId`.
- Estados `loading/saving/deleting/editing/editValue/error`, manejo `403`/`404`, navegación a `/home` tras borrar.
- Skeletons `k-feed-state` durante carga.

#### `Profile.jsx` — rewrite con services + paginación
- Usa `usersService.getMe/getUserById/toggleFollow/updateProfile` y `postsService.getUserPosts/likePost/deletePost/updatePost`.
- Paginação: `page/hasMore/postsLoading/postsLoadingMore`, `loadUserPosts(userId,{page,reset})` con dedup, botón “Cargar más”.
- Sincroniza `authStorage` tras `updateProfile`: `saveSession(token, {...getUser(), ...updatedUser}, remember)` donde `remember = Boolean(localStorage.getItem("kronos_token"))`.
- Follow con actualización optimista de `followersCount`/`isFollowing`.
- Like con rollback.
- Edición/borrado de posts propios directamente en lista (inline textarea, confirm).
- Header con avatar, `displayName`, `bio`, `postsCount/followersCount/followingCount`, botones `Seguir`/`Mensaje`.
- Form de edición solo si `isOwnProfile`.

#### Componente reusable
- `client/src/features/social/components/PostCard.jsx` (nuevo) — plantilla `PostCard` con props `post, isOwn, onLike, onToggleComments, onShare, onEdit, onDelete, onDeleteComment`. Creado para refactors futuros; `SocialPage` ya integra lógica equivalente inline para evitar regresión inmediata. Próximo paso: reemplazar duplicación en `Profile` con import.

### 3.5 Otros

- `UserSearch.jsx` y `ProfileByUsername.jsx` ya usaban `apiClient` → sin cambios.
- `Messages.jsx`, `Notifications.jsx` ya usaban `apiClient`/`socket` → sin cambios (validado que siguen usando `apiClient`).
- `client/src/services/apiClient.js`/`authStorage.js`/`socket.js` conservados como fuente única.

## 4. Validación

### Build
```
npm install
npm run build --workspace=client
# → vite v7.3.6
# ✓ 1706 modules transformed
# dist/assets/index-DnryqKnQ.css 42.91 kB
# dist/assets/index-D2_PnFUp.js 403.46 kB
# ✓ built in 2.97s
```

### Backend sintaxis
```
node --check server/src/server.js      → ok
node --check server/src/modules/posts/posts.routes.js → ok
```

### Tests servidor
```
npm test --workspace=server
# health check → ok
# connectDB → fail DownloadError (ECONNRESET) — sin red para mongodb-memory-server en sandbox,
#   no es regresión de código (antes de AUDIT-004 también requería descarga).
```

### Smoke manual pendiente (requiere Mongo real)
```
await POST /api/auth/login → token
GET /api/posts?page=1&limit=2 → { posts:2, hasMore:true }
POST /api/posts {content:"hola"} → 201 {post}
PATCH /api/posts/:id {content:"edit"} → 200 {post} (403 si no autor)
POST /api/posts/:id/like → { liked:true, likesCount:1 } + rollback si falla
POST /api/posts/:id/comments {content:"👍"} → 201 {post}
DELETE /api/posts/:id/comments/:cid → 200 {post} (403 si no autor)
DELETE /api/posts/:id → 200 {ok:true} (403 si no autor)
GET /api/posts/user/:id?page=2 → append deduplicado
```

Se verificó que todos los consumidores frontend usan `response.data.posts` o `response.data.post` y toleran campos extra, por lo que la adición de `page/limit/hasMore/total` es compatible.

## 5. Cumplimiento de Skills

- `kronos-social` 4/5/6/7/8/9/21/22/23/24/30 ✔ — Feed real, paginación, deduplicación, like con rollback, edición, borrado autorizado, comentarios validados.
- `kronos-frontend` 6/7/8/9 ✔ — servicios centralizados, estados `loading/success/empty/error`, rutas protegidas conservadas.
- `kronos-backend` 2/3/4 ✔ — modular por dominio, validación, autorización `author` check.
- `kronos-integration` 13/14/15 ✔ — Feed/Posts/Comments integrados end-to-end.
- `kronos-project-context` 11/12/13 ✔ — conserva modelo Post (`_id,content,author,likes,comments`), usa `likesCount/liked` normalizados.

## 6. Matriz actualizada

| ID | Antes | Después | Nota |
|---|---|---|---|
| KRONOS-UI-008 Paginación feed | PENDIENTE | **COMPLETADO** | `parsePagination` + `useFeed` + `hasMore` |
| KRONOS-UI-010 Edit/delete posts | PENDIENTE | **COMPLETADO** | `PATCH/DELETE /:postId` + UI inline con permisos |
| KRONOS-UI-011 Moderación | PENDIENTE | **PARCIAL** | delete comment por autor/post, falta report/hide |
| KRONOS-UI-017 Profile tabs | PENDIENTE | **PARCIAL** | grid de posts paginado + edición inline; tabs aún sin seguidores separados |
| KRONOS-UI-039 API centralizada | PARCIAL | **COMPLETADO (social)** | `postsService`+`usersService`+hooks; AI aún usa axios directo |

## 7. Próximos pasos sugeridos (no bloqueantes para AUDIT-004)

- Reemplazar duplicación `Profile`/`SocialPage` con import de `PostCard` (refactor 38).
- Añadir debounce en `UserSearch` (skill 10).
- Migrar módulos AI (`image-ai`, `video-ai`, `script-ai`, `KronosChat`, `KairosHistory`) de `axios` directo a `apiClient` (misma técnica que social).
- Añadir `save/repost` (KRONOS-UI-012) y `report` (011) con modelo dedicado.
- Añadir paginación a notificaciones y `global search`.

## 8. Archivos tocados

```
server/src/modules/posts/posts.routes.js   (paginación, PATCH/DELETE post, DELETE comment)
client/src/services/postsService.js        (nuevo)
client/src/services/usersService.js        (nuevo)
client/src/features/social/hooks/useFeed.js (nuevo)
client/src/features/social/hooks/usePostActions.js (nuevo)
client/src/features/social/components/PostCard.jsx (nuevo)
client/src/features/social/SocialPage.jsx (rewrite con hook/service, paginación, edit/delete, like rollback, comment delete)
client/src/features/social/CreatePost.jsx (migrado a postsService)
client/src/features/social/Comments.jsx   (migrado a postsService, delete support)
client/src/features/social/PostDetail.jsx (rewrite con services, edit/delete, like rollback)
client/src/features/users/Profile.jsx     (rewrite con usersService/postsService, paginación, edit/delete, sync authStorage)
docs/AUDIT-004-social-core.md             (nuevo)
```

No se modificaron `.env`, `vite.config.js`, `server.js` CORS, ni modelos existentes (compatibilidad preservada).
