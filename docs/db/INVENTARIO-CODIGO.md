# Inventario de acceso a datos (generado)

Generado por `node scripts/db/code-inventory.js --markdown` el 2026-10-24T09:01:08.870Z.
No editar a mano: se regenera con el código.

## Operaciones detectadas

| Operación | Tipo | Apariciones |
|---|---|---:|
| `find` | lectura | 97 |
| `findOne` | lectura | 53 |
| `findById` | lectura | 81 |
| `countDocuments` | lectura | 53 |
| `distinct` | lectura | 2 |
| `exists` | lectura | 19 |
| `aggregate` | lectura | 8 |
| `populate` | lectura | 118 |
| `lean` | lectura | 193 |
| `create` | escritura | 28 |
| `insertOne` | escritura | 4 |
| `updateOne` | escritura | 24 |
| `updateMany` | escritura | 16 |
| `findOneAndUpdate` | escritura | 16 |
| `findByIdAndUpdate` | escritura | 22 |
| `findOneAndDelete` | escritura | 7 |
| `deleteOne` | escritura | 9 |
| `deleteMany` | escritura | 27 |
| `save` | escritura | 16 |
| `driverDirecto` | acceso directo | 48 |

Endpoints detectados: **192** en 124 archivos de `server/src`.

## Colecciones y endpoints que dependen de ellas

| Colección | Dominio | Archivos | Endpoints |
|---|---|---:|---:|
| `users` | identidad | 21 | 135 |
| `refreshtokens` | auth | 0 | 0 |
| `sessionrevocations` | auth | 0 | 0 |
| `posts` | social | 13 | 80 |
| `stories` | social | 4 | 22 |
| `drafts` | social | 4 | 17 |
| `savedcollections` | social | 2 | 20 |
| `circles` | social | 7 | 58 |
| `messages` | mensajería | 5 | 26 |
| `conversations` | mensajería | 4 | 20 |
| `notifications` | notificaciones | 3 | 16 |
| `blocks` | moderación | 3 | 32 |
| `mutes` | moderación | 3 | 32 |
| `hiddenposts` | moderación | 3 | 32 |
| `reports` | moderación | 3 | 36 |
| `capsules` | cápsulas | 2 | 21 |
| `seenposts` | pulso | 2 | 17 |
| `feedsignals` | pulso | 2 | 17 |
| `liverooms` | live | 2 | 8 |
| `supporttransactions` | soporte | 2 | 16 |
| `imagegenerations` | kairos | 5 | 17 |
| `videogenerations` | kairos | 2 | 18 |
| `scripts` | kairos | 2 | 24 |
| `scriptprojects` | kairos | 2 | 24 |
| `projects` | proyectos | 3 | 31 |
| `musictracks` | estudio | 4 | 17 |
| `voices` | estudio | 3 | 16 |
| `mcpservicecredentials` | integraciones | 1 | 0 |

## Detalle por colección

### `users` (User)

Archivos: `src/middleware/requireAdmin.js`, `src/modules/admin/admin.routes.js`, `src/modules/ai-core/routes/chat.routes.js`, `src/modules/analytics/analytics.routes.js`, `src/modules/auth/auth.routes.js`, `src/modules/auth/session.routes.js`, `src/modules/capsules/capsules.routes.js`, `src/modules/circles/circles.routes.js`, `src/modules/conversations/conversations.routes.js`, `src/modules/export/export.routes.js`, `src/modules/federation/federation.routes.js`, `src/modules/live/live.routes.js`, `src/modules/messages/messages.routes.js`, `src/modules/moderation/moderation.routes.js`, `src/modules/notifications/notification.service.js`, `src/modules/posts/audience.service.js`, `src/modules/posts/posts.routes.js`, `src/modules/search/search.routes.js`, `src/modules/stories/stories.routes.js`, `src/modules/support/support.routes.js`, `src/modules/users/users.routes.js`

Endpoints:

- `GET (sin montar)/overview`
- `GET (sin montar)/users`
- `PATCH (sin montar)/users/:userId/role`
- `GET (sin montar)/posts`
- `POST (sin montar)/chat`
- `GET (sin montar)/creator`
- `POST (sin montar)/register`
- `POST (sin montar)/login`
- `GET (sin montar)/google/config`
- `POST (sin montar)/google`
- `GET (sin montar)/me`
- `POST (sin montar)/forgot-password`
- `POST (sin montar)/reset-password`
- `POST (sin montar)/verify-email/request`
- `POST (sin montar)/verify-email`
- `GET (sin montar)/verify-email`
- `GET (sin montar)/session`
- `POST (sin montar)/refresh`
- `GET (sin montar)/sessions`
- `DELETE (sin montar)/sessions/:familyId`
- `DELETE (sin montar)/sessions`
- `POST (sin montar)/logout`
- `GET (sin montar)/token`
- `GET (sin montar)`
- `POST (sin montar)`
- `GET (sin montar)/:capsuleId`
- `POST (sin montar)/:capsuleId/seal`
- `POST (sin montar)/:capsuleId/cancel`
- `POST (sin montar)/:capsuleId/messages`
- `POST (sin montar)/:capsuleId/invite`
- `DELETE (sin montar)/:capsuleId`
- `GET (sin montar)`
- `POST (sin montar)`
- `PATCH (sin montar)/:circleId`
- `DELETE (sin montar)/:circleId`
- `GET (sin montar)/:circleId/members`
- `POST (sin montar)/:circleId/members`
- `DELETE (sin montar)/:circleId/members/:userId`
- `POST (sin montar)`
- `GET (sin montar)`
- `GET (sin montar)/:conversationId/messages`
- `POST (sin montar)/:conversationId/messages`
- `PATCH (sin montar)/:conversationId/read`
- `PATCH (sin montar)/:conversationId/members`
- `DELETE (sin montar)/:conversationId`
- `GET (sin montar)/status`
- `POST (sin montar)/request`
- `GET (sin montar)/download`
- `GET (sin montar)/.well-known/webfinger`
- `GET (sin montar)/.well-known/nodeinfo`
- `GET (sin montar)/api/nodeinfo/2.0`
- `GET (sin montar)/api/federation/users/:username`
- `GET (sin montar)/api/federation/users/:username/outbox`
- `POST (sin montar)/api/federation/users/:username/inbox`
- `POST (sin montar)/rooms`
- `GET (sin montar)/rooms`
- `GET (sin montar)/rooms/mine`
- `GET (sin montar)/rooms/:id`
- `PATCH (sin montar)/rooms/:id/join`
- `PATCH (sin montar)/rooms/:id/leave`
- `PATCH (sin montar)/rooms/:id/end`
- `POST (sin montar)/rooms/:id/invite`
- `POST (sin montar)/media/upload`
- `GET (sin montar)`
- `GET (sin montar)/:userId`
- `POST (sin montar)/:userId`
- `PATCH (sin montar)/:userId/delivered`
- `PATCH (sin montar)/:userId/read`
- `GET (sin montar)/blocks`
- `POST (sin montar)/blocks/:userId`
- `DELETE (sin montar)/blocks/:userId`
- `GET (sin montar)/mutes`
- `POST (sin montar)/mutes/:userId`
- `DELETE (sin montar)/mutes/:userId`
- `GET (sin montar)/hidden`
- `POST (sin montar)/hidden/:postId`
- `DELETE (sin montar)/hidden/:postId`
- `POST (sin montar)/reports`
- `GET (sin montar)/reports`
- `GET (sin montar)/reports/queue`
- `PATCH (sin montar)/reports/:reportId`
- `POST (sin montar)/posts/:postId/hide`
- `DELETE (sin montar)/posts/:postId/hide`
- `POST (sin montar)/reports/:reportId/appeal`
- `PATCH (sin montar)/reports/:reportId/appeal`
- `GET (sin montar)/health`
- `GET (sin montar)/overview`
- `POST (sin montar)/media/upload`
- `GET (sin montar)/saved`
- `POST (sin montar)/:postId/save`
- `POST (sin montar)/:postId/repost`
- `POST (sin montar)/:postId/poll/vote`
- `POST (sin montar)/:postId/event/rsvp`
- `GET (sin montar)/user/:userId`
- `GET (sin montar)/feed`
- `GET (sin montar)/vertical`
- `GET (sin montar)`
- `GET (sin montar)/topic/:tag`
- `GET (sin montar)/:postId`
- `POST (sin montar)`
- `PATCH (sin montar)/:postId`
- `PATCH (sin montar)/:postId/subtitles`
- `PATCH (sin montar)/:postId/video-trim`
- `DELETE (sin montar)/:postId`
- `POST (sin montar)/:postId/comments`
- `DELETE (sin montar)/:postId/comments/:commentId`
- `POST (sin montar)/:postId/reaction`
- `POST (sin montar)/:postId/like`
- `POST (sin montar)/:postId/remix`
- `GET (sin montar)`
- `GET (sin montar)`
- `POST (sin montar)`
- `GET (sin montar)/me/archive`
- `GET (sin montar)/:storyId`
- `DELETE (sin montar)/:storyId`
- `POST (sin montar)/:storyId/view`
- `GET (sin montar)/:storyId/views`
- `POST (sin montar)/:storyId/reply`
- `GET (sin montar)/:storyId/replies`
- `POST (sin montar)/tip`
- `GET (sin montar)/creator/:userId`
- `GET (sin montar)/history`
- `PATCH (sin montar)/me/privacy`
- `PATCH (sin montar)/me/preferences`
- `GET (sin montar)/me`
- `GET (sin montar)/search`
- `GET (sin montar)/:id/followers`
- `GET (sin montar)/:id/following`
- `GET (sin montar)/username/:username`
- `GET (sin montar)/:id`
- `POST (sin montar)/:id/follow`
- `PATCH (sin montar)/me`
- `POST (sin montar)/me/avatar`
- `POST (sin montar)/me/cover`
- `DELETE (sin montar)/me`

### `refreshtokens` (RefreshToken)

Archivos: —

### `sessionrevocations` (SessionRevocation)

Archivos: —

### `posts` (Post)

Archivos: `src/config/mediaLifecycle.js`, `src/middleware/mediaAcl.js`, `src/modules/admin/admin.routes.js`, `src/modules/analytics/analytics.routes.js`, `src/modules/collections/collections.routes.js`, `src/modules/export/export.routes.js`, `src/modules/federation/federation.routes.js`, `src/modules/moderation/moderation.routes.js`, `src/modules/moderation/moderation.service.js`, `src/modules/posts/posts.routes.js`, `src/modules/pulse/pulse.routes.js`, `src/modules/search/search.routes.js`, `src/modules/users/users.routes.js`

Endpoints:

- `GET (sin montar)/overview`
- `GET (sin montar)/users`
- `PATCH (sin montar)/users/:userId/role`
- `GET (sin montar)/posts`
- `GET (sin montar)/creator`
- `GET (sin montar)`
- `POST (sin montar)`
- `PATCH (sin montar)/:collectionId`
- `DELETE (sin montar)/:collectionId`
- `GET (sin montar)/:collectionId/posts`
- `POST (sin montar)/:collectionId/posts/:postId`
- `DELETE (sin montar)/:collectionId/posts/:postId`
- `GET (sin montar)/status`
- `POST (sin montar)/request`
- `GET (sin montar)/download`
- `GET (sin montar)/.well-known/webfinger`
- `GET (sin montar)/.well-known/nodeinfo`
- `GET (sin montar)/api/nodeinfo/2.0`
- `GET (sin montar)/api/federation/users/:username`
- `GET (sin montar)/api/federation/users/:username/outbox`
- `POST (sin montar)/api/federation/users/:username/inbox`
- `GET (sin montar)/blocks`
- `POST (sin montar)/blocks/:userId`
- `DELETE (sin montar)/blocks/:userId`
- `GET (sin montar)/mutes`
- `POST (sin montar)/mutes/:userId`
- `DELETE (sin montar)/mutes/:userId`
- `GET (sin montar)/hidden`
- `POST (sin montar)/hidden/:postId`
- `DELETE (sin montar)/hidden/:postId`
- `POST (sin montar)/reports`
- `GET (sin montar)/reports`
- `GET (sin montar)/reports/queue`
- `PATCH (sin montar)/reports/:reportId`
- `POST (sin montar)/posts/:postId/hide`
- `DELETE (sin montar)/posts/:postId/hide`
- `POST (sin montar)/reports/:reportId/appeal`
- `PATCH (sin montar)/reports/:reportId/appeal`
- `GET (sin montar)/health`
- `GET (sin montar)/overview`
- `POST (sin montar)/media/upload`
- `GET (sin montar)/saved`
- `POST (sin montar)/:postId/save`
- `POST (sin montar)/:postId/repost`
- `POST (sin montar)/:postId/poll/vote`
- `POST (sin montar)/:postId/event/rsvp`
- `GET (sin montar)/user/:userId`
- `GET (sin montar)/feed`
- `GET (sin montar)/vertical`
- `GET (sin montar)`
- `GET (sin montar)/topic/:tag`
- `GET (sin montar)/:postId`
- `POST (sin montar)`
- `PATCH (sin montar)/:postId`
- `PATCH (sin montar)/:postId/subtitles`
- `PATCH (sin montar)/:postId/video-trim`
- `DELETE (sin montar)/:postId`
- `POST (sin montar)/:postId/comments`
- `DELETE (sin montar)/:postId/comments/:commentId`
- `POST (sin montar)/:postId/reaction`
- `POST (sin montar)/:postId/like`
- `POST (sin montar)/:postId/remix`
- `GET (sin montar)`
- `POST (sin montar)/seen/:postId`
- `POST (sin montar)/signal`
- `GET (sin montar)/signals`
- `GET (sin montar)`
- `PATCH (sin montar)/me/privacy`
- `PATCH (sin montar)/me/preferences`
- `GET (sin montar)/me`
- `GET (sin montar)/search`
- `GET (sin montar)/:id/followers`
- `GET (sin montar)/:id/following`
- `GET (sin montar)/username/:username`
- `GET (sin montar)/:id`
- `POST (sin montar)/:id/follow`
- `PATCH (sin montar)/me`
- `POST (sin montar)/me/avatar`
- `POST (sin montar)/me/cover`
- `DELETE (sin montar)/me`

### `stories` (Story)

Archivos: `src/config/mediaLifecycle.js`, `src/middleware/mediaAcl.js`, `src/modules/stories/stories.routes.js`, `src/modules/users/users.routes.js`

Endpoints:

- `GET (sin montar)`
- `POST (sin montar)`
- `GET (sin montar)/me/archive`
- `GET (sin montar)/:storyId`
- `DELETE (sin montar)/:storyId`
- `POST (sin montar)/:storyId/view`
- `GET (sin montar)/:storyId/views`
- `POST (sin montar)/:storyId/reply`
- `GET (sin montar)/:storyId/replies`
- `PATCH (sin montar)/me/privacy`
- `PATCH (sin montar)/me/preferences`
- `GET (sin montar)/me`
- `GET (sin montar)/search`
- `GET (sin montar)/:id/followers`
- `GET (sin montar)/:id/following`
- `GET (sin montar)/username/:username`
- `GET (sin montar)/:id`
- `POST (sin montar)/:id/follow`
- `PATCH (sin montar)/me`
- `POST (sin montar)/me/avatar`
- `POST (sin montar)/me/cover`
- `DELETE (sin montar)/me`

### `drafts` (Draft)

Archivos: `src/config/mediaLifecycle.js`, `src/middleware/mediaAcl.js`, `src/modules/drafts/drafts.routes.js`, `src/modules/users/users.routes.js`

Endpoints:

- `GET (sin montar)`
- `POST (sin montar)`
- `PATCH (sin montar)/:draftId`
- `DELETE (sin montar)/:draftId`
- `PATCH (sin montar)/me/privacy`
- `PATCH (sin montar)/me/preferences`
- `GET (sin montar)/me`
- `GET (sin montar)/search`
- `GET (sin montar)/:id/followers`
- `GET (sin montar)/:id/following`
- `GET (sin montar)/username/:username`
- `GET (sin montar)/:id`
- `POST (sin montar)/:id/follow`
- `PATCH (sin montar)/me`
- `POST (sin montar)/me/avatar`
- `POST (sin montar)/me/cover`
- `DELETE (sin montar)/me`

### `savedcollections` (SavedCollection)

Archivos: `src/modules/collections/collections.routes.js`, `src/modules/users/users.routes.js`

Endpoints:

- `GET (sin montar)`
- `POST (sin montar)`
- `PATCH (sin montar)/:collectionId`
- `DELETE (sin montar)/:collectionId`
- `GET (sin montar)/:collectionId/posts`
- `POST (sin montar)/:collectionId/posts/:postId`
- `DELETE (sin montar)/:collectionId/posts/:postId`
- `PATCH (sin montar)/me/privacy`
- `PATCH (sin montar)/me/preferences`
- `GET (sin montar)/me`
- `GET (sin montar)/search`
- `GET (sin montar)/:id/followers`
- `GET (sin montar)/:id/following`
- `GET (sin montar)/username/:username`
- `GET (sin montar)/:id`
- `POST (sin montar)/:id/follow`
- `PATCH (sin montar)/me`
- `POST (sin montar)/me/avatar`
- `POST (sin montar)/me/cover`
- `DELETE (sin montar)/me`

### `circles` (Circle)

Archivos: `src/modules/circles/circles.routes.js`, `src/modules/drafts/drafts.routes.js`, `src/modules/export/export.routes.js`, `src/modules/posts/audience.service.js`, `src/modules/posts/posts.routes.js`, `src/modules/stories/stories.routes.js`, `src/modules/users/users.routes.js`

Endpoints:

- `GET (sin montar)`
- `POST (sin montar)`
- `PATCH (sin montar)/:circleId`
- `DELETE (sin montar)/:circleId`
- `GET (sin montar)/:circleId/members`
- `POST (sin montar)/:circleId/members`
- `DELETE (sin montar)/:circleId/members/:userId`
- `GET (sin montar)`
- `POST (sin montar)`
- `PATCH (sin montar)/:draftId`
- `DELETE (sin montar)/:draftId`
- `GET (sin montar)/status`
- `POST (sin montar)/request`
- `GET (sin montar)/download`
- `POST (sin montar)/media/upload`
- `GET (sin montar)/saved`
- `POST (sin montar)/:postId/save`
- `POST (sin montar)/:postId/repost`
- `POST (sin montar)/:postId/poll/vote`
- `POST (sin montar)/:postId/event/rsvp`
- `GET (sin montar)/user/:userId`
- `GET (sin montar)/feed`
- `GET (sin montar)/vertical`
- `GET (sin montar)`
- `GET (sin montar)/topic/:tag`
- `GET (sin montar)/:postId`
- `POST (sin montar)`
- `PATCH (sin montar)/:postId`
- `PATCH (sin montar)/:postId/subtitles`
- `PATCH (sin montar)/:postId/video-trim`
- `DELETE (sin montar)/:postId`
- `POST (sin montar)/:postId/comments`
- `DELETE (sin montar)/:postId/comments/:commentId`
- `POST (sin montar)/:postId/reaction`
- `POST (sin montar)/:postId/like`
- `POST (sin montar)/:postId/remix`
- `GET (sin montar)`
- `POST (sin montar)`
- `GET (sin montar)/me/archive`
- `GET (sin montar)/:storyId`
- `DELETE (sin montar)/:storyId`
- `POST (sin montar)/:storyId/view`
- `GET (sin montar)/:storyId/views`
- `POST (sin montar)/:storyId/reply`
- `GET (sin montar)/:storyId/replies`
- `PATCH (sin montar)/me/privacy`
- `PATCH (sin montar)/me/preferences`
- `GET (sin montar)/me`
- `GET (sin montar)/search`
- `GET (sin montar)/:id/followers`
- `GET (sin montar)/:id/following`
- `GET (sin montar)/username/:username`
- `GET (sin montar)/:id`
- `POST (sin montar)/:id/follow`
- `PATCH (sin montar)/me`
- `POST (sin montar)/me/avatar`
- `POST (sin montar)/me/cover`
- `DELETE (sin montar)/me`

### `messages` (Message)

Archivos: `src/config/mediaLifecycle.js`, `src/middleware/mediaAcl.js`, `src/modules/conversations/conversations.routes.js`, `src/modules/messages/messages.routes.js`, `src/modules/users/users.routes.js`

Endpoints:

- `POST (sin montar)`
- `GET (sin montar)`
- `GET (sin montar)/:conversationId/messages`
- `POST (sin montar)/:conversationId/messages`
- `PATCH (sin montar)/:conversationId/read`
- `PATCH (sin montar)/:conversationId/members`
- `DELETE (sin montar)/:conversationId`
- `POST (sin montar)/media/upload`
- `GET (sin montar)`
- `GET (sin montar)/:userId`
- `POST (sin montar)/:userId`
- `PATCH (sin montar)/:userId/delivered`
- `PATCH (sin montar)/:userId/read`
- `PATCH (sin montar)/me/privacy`
- `PATCH (sin montar)/me/preferences`
- `GET (sin montar)/me`
- `GET (sin montar)/search`
- `GET (sin montar)/:id/followers`
- `GET (sin montar)/:id/following`
- `GET (sin montar)/username/:username`
- `GET (sin montar)/:id`
- `POST (sin montar)/:id/follow`
- `PATCH (sin montar)/me`
- `POST (sin montar)/me/avatar`
- `POST (sin montar)/me/cover`
- `DELETE (sin montar)/me`

### `conversations` (Conversation)

Archivos: `src/middleware/mediaAcl.js`, `src/modules/conversations/conversations.routes.js`, `src/modules/users/users.routes.js`, `src/realtime/registerSocketHandlers.js`

Endpoints:

- `POST (sin montar)`
- `GET (sin montar)`
- `GET (sin montar)/:conversationId/messages`
- `POST (sin montar)/:conversationId/messages`
- `PATCH (sin montar)/:conversationId/read`
- `PATCH (sin montar)/:conversationId/members`
- `DELETE (sin montar)/:conversationId`
- `PATCH (sin montar)/me/privacy`
- `PATCH (sin montar)/me/preferences`
- `GET (sin montar)/me`
- `GET (sin montar)/search`
- `GET (sin montar)/:id/followers`
- `GET (sin montar)/:id/following`
- `GET (sin montar)/username/:username`
- `GET (sin montar)/:id`
- `POST (sin montar)/:id/follow`
- `PATCH (sin montar)/me`
- `POST (sin montar)/me/avatar`
- `POST (sin montar)/me/cover`
- `DELETE (sin montar)/me`

### `notifications` (Notification)

Archivos: `src/modules/notifications/notification.service.js`, `src/modules/notifications/notifications.routes.js`, `src/modules/users/users.routes.js`

Endpoints:

- `GET (sin montar)`
- `PATCH (sin montar)/read-all`
- `PATCH (sin montar)/:notificationId/read`
- `PATCH (sin montar)/me/privacy`
- `PATCH (sin montar)/me/preferences`
- `GET (sin montar)/me`
- `GET (sin montar)/search`
- `GET (sin montar)/:id/followers`
- `GET (sin montar)/:id/following`
- `GET (sin montar)/username/:username`
- `GET (sin montar)/:id`
- `POST (sin montar)/:id/follow`
- `PATCH (sin montar)/me`
- `POST (sin montar)/me/avatar`
- `POST (sin montar)/me/cover`
- `DELETE (sin montar)/me`

### `blocks` (Block)

Archivos: `src/modules/moderation/moderation.routes.js`, `src/modules/moderation/moderation.service.js`, `src/modules/users/users.routes.js`

Endpoints:

- `GET (sin montar)/blocks`
- `POST (sin montar)/blocks/:userId`
- `DELETE (sin montar)/blocks/:userId`
- `GET (sin montar)/mutes`
- `POST (sin montar)/mutes/:userId`
- `DELETE (sin montar)/mutes/:userId`
- `GET (sin montar)/hidden`
- `POST (sin montar)/hidden/:postId`
- `DELETE (sin montar)/hidden/:postId`
- `POST (sin montar)/reports`
- `GET (sin montar)/reports`
- `GET (sin montar)/reports/queue`
- `PATCH (sin montar)/reports/:reportId`
- `POST (sin montar)/posts/:postId/hide`
- `DELETE (sin montar)/posts/:postId/hide`
- `POST (sin montar)/reports/:reportId/appeal`
- `PATCH (sin montar)/reports/:reportId/appeal`
- `GET (sin montar)/health`
- `GET (sin montar)/overview`
- `PATCH (sin montar)/me/privacy`
- `PATCH (sin montar)/me/preferences`
- `GET (sin montar)/me`
- `GET (sin montar)/search`
- `GET (sin montar)/:id/followers`
- `GET (sin montar)/:id/following`
- `GET (sin montar)/username/:username`
- `GET (sin montar)/:id`
- `POST (sin montar)/:id/follow`
- `PATCH (sin montar)/me`
- `POST (sin montar)/me/avatar`
- `POST (sin montar)/me/cover`
- `DELETE (sin montar)/me`

### `mutes` (Mute)

Archivos: `src/modules/moderation/moderation.routes.js`, `src/modules/moderation/moderation.service.js`, `src/modules/users/users.routes.js`

Endpoints:

- `GET (sin montar)/blocks`
- `POST (sin montar)/blocks/:userId`
- `DELETE (sin montar)/blocks/:userId`
- `GET (sin montar)/mutes`
- `POST (sin montar)/mutes/:userId`
- `DELETE (sin montar)/mutes/:userId`
- `GET (sin montar)/hidden`
- `POST (sin montar)/hidden/:postId`
- `DELETE (sin montar)/hidden/:postId`
- `POST (sin montar)/reports`
- `GET (sin montar)/reports`
- `GET (sin montar)/reports/queue`
- `PATCH (sin montar)/reports/:reportId`
- `POST (sin montar)/posts/:postId/hide`
- `DELETE (sin montar)/posts/:postId/hide`
- `POST (sin montar)/reports/:reportId/appeal`
- `PATCH (sin montar)/reports/:reportId/appeal`
- `GET (sin montar)/health`
- `GET (sin montar)/overview`
- `PATCH (sin montar)/me/privacy`
- `PATCH (sin montar)/me/preferences`
- `GET (sin montar)/me`
- `GET (sin montar)/search`
- `GET (sin montar)/:id/followers`
- `GET (sin montar)/:id/following`
- `GET (sin montar)/username/:username`
- `GET (sin montar)/:id`
- `POST (sin montar)/:id/follow`
- `PATCH (sin montar)/me`
- `POST (sin montar)/me/avatar`
- `POST (sin montar)/me/cover`
- `DELETE (sin montar)/me`

### `hiddenposts` (HiddenPost)

Archivos: `src/modules/moderation/moderation.routes.js`, `src/modules/moderation/moderation.service.js`, `src/modules/users/users.routes.js`

Endpoints:

- `GET (sin montar)/blocks`
- `POST (sin montar)/blocks/:userId`
- `DELETE (sin montar)/blocks/:userId`
- `GET (sin montar)/mutes`
- `POST (sin montar)/mutes/:userId`
- `DELETE (sin montar)/mutes/:userId`
- `GET (sin montar)/hidden`
- `POST (sin montar)/hidden/:postId`
- `DELETE (sin montar)/hidden/:postId`
- `POST (sin montar)/reports`
- `GET (sin montar)/reports`
- `GET (sin montar)/reports/queue`
- `PATCH (sin montar)/reports/:reportId`
- `POST (sin montar)/posts/:postId/hide`
- `DELETE (sin montar)/posts/:postId/hide`
- `POST (sin montar)/reports/:reportId/appeal`
- `PATCH (sin montar)/reports/:reportId/appeal`
- `GET (sin montar)/health`
- `GET (sin montar)/overview`
- `PATCH (sin montar)/me/privacy`
- `PATCH (sin montar)/me/preferences`
- `GET (sin montar)/me`
- `GET (sin montar)/search`
- `GET (sin montar)/:id/followers`
- `GET (sin montar)/:id/following`
- `GET (sin montar)/username/:username`
- `GET (sin montar)/:id`
- `POST (sin montar)/:id/follow`
- `PATCH (sin montar)/me`
- `POST (sin montar)/me/avatar`
- `POST (sin montar)/me/cover`
- `DELETE (sin montar)/me`

### `reports` (Report)

Archivos: `src/modules/admin/admin.routes.js`, `src/modules/moderation/moderation.routes.js`, `src/modules/users/users.routes.js`

Endpoints:

- `GET (sin montar)/overview`
- `GET (sin montar)/users`
- `PATCH (sin montar)/users/:userId/role`
- `GET (sin montar)/posts`
- `GET (sin montar)/blocks`
- `POST (sin montar)/blocks/:userId`
- `DELETE (sin montar)/blocks/:userId`
- `GET (sin montar)/mutes`
- `POST (sin montar)/mutes/:userId`
- `DELETE (sin montar)/mutes/:userId`
- `GET (sin montar)/hidden`
- `POST (sin montar)/hidden/:postId`
- `DELETE (sin montar)/hidden/:postId`
- `POST (sin montar)/reports`
- `GET (sin montar)/reports`
- `GET (sin montar)/reports/queue`
- `PATCH (sin montar)/reports/:reportId`
- `POST (sin montar)/posts/:postId/hide`
- `DELETE (sin montar)/posts/:postId/hide`
- `POST (sin montar)/reports/:reportId/appeal`
- `PATCH (sin montar)/reports/:reportId/appeal`
- `GET (sin montar)/health`
- `GET (sin montar)/overview`
- `PATCH (sin montar)/me/privacy`
- `PATCH (sin montar)/me/preferences`
- `GET (sin montar)/me`
- `GET (sin montar)/search`
- `GET (sin montar)/:id/followers`
- `GET (sin montar)/:id/following`
- `GET (sin montar)/username/:username`
- `GET (sin montar)/:id`
- `POST (sin montar)/:id/follow`
- `PATCH (sin montar)/me`
- `POST (sin montar)/me/avatar`
- `POST (sin montar)/me/cover`
- `DELETE (sin montar)/me`

### `capsules` (Capsule)

Archivos: `src/modules/capsules/capsules.routes.js`, `src/modules/users/users.routes.js`

Endpoints:

- `GET (sin montar)`
- `POST (sin montar)`
- `GET (sin montar)/:capsuleId`
- `POST (sin montar)/:capsuleId/seal`
- `POST (sin montar)/:capsuleId/cancel`
- `POST (sin montar)/:capsuleId/messages`
- `POST (sin montar)/:capsuleId/invite`
- `DELETE (sin montar)/:capsuleId`
- `PATCH (sin montar)/me/privacy`
- `PATCH (sin montar)/me/preferences`
- `GET (sin montar)/me`
- `GET (sin montar)/search`
- `GET (sin montar)/:id/followers`
- `GET (sin montar)/:id/following`
- `GET (sin montar)/username/:username`
- `GET (sin montar)/:id`
- `POST (sin montar)/:id/follow`
- `PATCH (sin montar)/me`
- `POST (sin montar)/me/avatar`
- `POST (sin montar)/me/cover`
- `DELETE (sin montar)/me`

### `seenposts` (SeenPost)

Archivos: `src/modules/pulse/pulse.routes.js`, `src/modules/users/users.routes.js`

Endpoints:

- `GET (sin montar)`
- `POST (sin montar)/seen/:postId`
- `POST (sin montar)/signal`
- `GET (sin montar)/signals`
- `PATCH (sin montar)/me/privacy`
- `PATCH (sin montar)/me/preferences`
- `GET (sin montar)/me`
- `GET (sin montar)/search`
- `GET (sin montar)/:id/followers`
- `GET (sin montar)/:id/following`
- `GET (sin montar)/username/:username`
- `GET (sin montar)/:id`
- `POST (sin montar)/:id/follow`
- `PATCH (sin montar)/me`
- `POST (sin montar)/me/avatar`
- `POST (sin montar)/me/cover`
- `DELETE (sin montar)/me`

### `feedsignals` (FeedSignal)

Archivos: `src/modules/pulse/pulse.routes.js`, `src/modules/users/users.routes.js`

Endpoints:

- `GET (sin montar)`
- `POST (sin montar)/seen/:postId`
- `POST (sin montar)/signal`
- `GET (sin montar)/signals`
- `PATCH (sin montar)/me/privacy`
- `PATCH (sin montar)/me/preferences`
- `GET (sin montar)/me`
- `GET (sin montar)/search`
- `GET (sin montar)/:id/followers`
- `GET (sin montar)/:id/following`
- `GET (sin montar)/username/:username`
- `GET (sin montar)/:id`
- `POST (sin montar)/:id/follow`
- `PATCH (sin montar)/me`
- `POST (sin montar)/me/avatar`
- `POST (sin montar)/me/cover`
- `DELETE (sin montar)/me`

### `liverooms` (LiveRoom)

Archivos: `src/modules/live/live.routes.js`, `src/realtime/registerSocketHandlers.js`

Endpoints:

- `POST (sin montar)/rooms`
- `GET (sin montar)/rooms`
- `GET (sin montar)/rooms/mine`
- `GET (sin montar)/rooms/:id`
- `PATCH (sin montar)/rooms/:id/join`
- `PATCH (sin montar)/rooms/:id/leave`
- `PATCH (sin montar)/rooms/:id/end`
- `POST (sin montar)/rooms/:id/invite`

### `supporttransactions` (SupportTransaction)

Archivos: `src/modules/support/support.routes.js`, `src/modules/users/users.routes.js`

Endpoints:

- `POST (sin montar)/tip`
- `GET (sin montar)/creator/:userId`
- `GET (sin montar)/history`
- `PATCH (sin montar)/me/privacy`
- `PATCH (sin montar)/me/preferences`
- `GET (sin montar)/me`
- `GET (sin montar)/search`
- `GET (sin montar)/:id/followers`
- `GET (sin montar)/:id/following`
- `GET (sin montar)/username/:username`
- `GET (sin montar)/:id`
- `POST (sin montar)/:id/follow`
- `PATCH (sin montar)/me`
- `POST (sin montar)/me/avatar`
- `POST (sin montar)/me/cover`
- `DELETE (sin montar)/me`

### `imagegenerations` (ImageGeneration)

Archivos: `src/config/mediaLifecycle.js`, `src/middleware/mediaAcl.js`, `src/modules/image-ai/image.routes.js`, `src/modules/image-ai/image.service.js`, `src/modules/users/users.routes.js`

Endpoints:

- `GET (sin montar)/history`
- `POST (sin montar)/generate`
- `POST (sin montar)/upload`
- `DELETE (sin montar)/:id`
- `PATCH (sin montar)/me/privacy`
- `PATCH (sin montar)/me/preferences`
- `GET (sin montar)/me`
- `GET (sin montar)/search`
- `GET (sin montar)/:id/followers`
- `GET (sin montar)/:id/following`
- `GET (sin montar)/username/:username`
- `GET (sin montar)/:id`
- `POST (sin montar)/:id/follow`
- `PATCH (sin montar)/me`
- `POST (sin montar)/me/avatar`
- `POST (sin montar)/me/cover`
- `DELETE (sin montar)/me`

### `videogenerations` (VideoGeneration)

Archivos: `src/modules/users/users.routes.js`, `src/modules/video-ai/video.routes.js`

Endpoints:

- `PATCH (sin montar)/me/privacy`
- `PATCH (sin montar)/me/preferences`
- `GET (sin montar)/me`
- `GET (sin montar)/search`
- `GET (sin montar)/:id/followers`
- `GET (sin montar)/:id/following`
- `GET (sin montar)/username/:username`
- `GET (sin montar)/:id`
- `POST (sin montar)/:id/follow`
- `PATCH (sin montar)/me`
- `POST (sin montar)/me/avatar`
- `POST (sin montar)/me/cover`
- `DELETE (sin montar)/me`
- `POST (sin montar)/generate`
- `GET (sin montar)/history`
- `GET (sin montar)/:id/status`
- `GET (sin montar)/:id`
- `DELETE (sin montar)/:id`

### `scripts` (Script)

Archivos: `src/modules/script-ai/script.routes.js`, `src/modules/users/users.routes.js`

Endpoints:

- `POST (sin montar)/generate`
- `POST (sin montar)/projects`
- `GET (sin montar)/projects`
- `DELETE (sin montar)/projects/:id`
- `GET (sin montar)/projects/:id/export`
- `GET (sin montar)/projects/:id`
- `GET (sin montar)/history`
- `PUT (sin montar)/projects/:id`
- `PUT (sin montar)/:id`
- `GET (sin montar)/:id`
- `DELETE (sin montar)/:id`
- `PATCH (sin montar)/me/privacy`
- `PATCH (sin montar)/me/preferences`
- `GET (sin montar)/me`
- `GET (sin montar)/search`
- `GET (sin montar)/:id/followers`
- `GET (sin montar)/:id/following`
- `GET (sin montar)/username/:username`
- `GET (sin montar)/:id`
- `POST (sin montar)/:id/follow`
- `PATCH (sin montar)/me`
- `POST (sin montar)/me/avatar`
- `POST (sin montar)/me/cover`
- `DELETE (sin montar)/me`

### `scriptprojects` (ScriptProject)

Archivos: `src/modules/script-ai/script.routes.js`, `src/modules/users/users.routes.js`

Endpoints:

- `POST (sin montar)/generate`
- `POST (sin montar)/projects`
- `GET (sin montar)/projects`
- `DELETE (sin montar)/projects/:id`
- `GET (sin montar)/projects/:id/export`
- `GET (sin montar)/projects/:id`
- `GET (sin montar)/history`
- `PUT (sin montar)/projects/:id`
- `PUT (sin montar)/:id`
- `GET (sin montar)/:id`
- `DELETE (sin montar)/:id`
- `PATCH (sin montar)/me/privacy`
- `PATCH (sin montar)/me/preferences`
- `GET (sin montar)/me`
- `GET (sin montar)/search`
- `GET (sin montar)/:id/followers`
- `GET (sin montar)/:id/following`
- `GET (sin montar)/username/:username`
- `GET (sin montar)/:id`
- `POST (sin montar)/:id/follow`
- `PATCH (sin montar)/me`
- `POST (sin montar)/me/avatar`
- `POST (sin montar)/me/cover`
- `DELETE (sin montar)/me`

### `projects` (Project)

Archivos: `src/modules/projects/projects.routes.js`, `src/modules/script-ai/script.routes.js`, `src/modules/users/users.routes.js`

Endpoints:

- `GET (sin montar)`
- `POST (sin montar)`
- `GET (sin montar)/:projectId`
- `PATCH (sin montar)/:projectId`
- `DELETE (sin montar)/:projectId`
- `POST (sin montar)/:projectId/versions`
- `DELETE (sin montar)/:projectId/versions/:versionId`
- `POST (sin montar)/generate`
- `POST (sin montar)/projects`
- `GET (sin montar)/projects`
- `DELETE (sin montar)/projects/:id`
- `GET (sin montar)/projects/:id/export`
- `GET (sin montar)/projects/:id`
- `GET (sin montar)/history`
- `PUT (sin montar)/projects/:id`
- `PUT (sin montar)/:id`
- `GET (sin montar)/:id`
- `DELETE (sin montar)/:id`
- `PATCH (sin montar)/me/privacy`
- `PATCH (sin montar)/me/preferences`
- `GET (sin montar)/me`
- `GET (sin montar)/search`
- `GET (sin montar)/:id/followers`
- `GET (sin montar)/:id/following`
- `GET (sin montar)/username/:username`
- `GET (sin montar)/:id`
- `POST (sin montar)/:id/follow`
- `PATCH (sin montar)/me`
- `POST (sin montar)/me/avatar`
- `POST (sin montar)/me/cover`
- `DELETE (sin montar)/me`

### `musictracks` (MusicTrack)

Archivos: `src/middleware/mediaAcl.js`, `src/modules/ai-core/routes/kairos.routes.js`, `src/modules/music/music.routes.js`, `src/modules/users/users.routes.js`

Endpoints:

- `GET (sin montar)/capacidades`
- `GET (sin montar)`
- `GET (sin montar)/:trackId`
- `POST (sin montar)`
- `PATCH (sin montar)/me/privacy`
- `PATCH (sin montar)/me/preferences`
- `GET (sin montar)/me`
- `GET (sin montar)/search`
- `GET (sin montar)/:id/followers`
- `GET (sin montar)/:id/following`
- `GET (sin montar)/username/:username`
- `GET (sin montar)/:id`
- `POST (sin montar)/:id/follow`
- `PATCH (sin montar)/me`
- `POST (sin montar)/me/avatar`
- `POST (sin montar)/me/cover`
- `DELETE (sin montar)/me`

### `voices` (Voice)

Archivos: `src/middleware/mediaAcl.js`, `src/modules/users/users.routes.js`, `src/modules/voices/voices.routes.js`

Endpoints:

- `PATCH (sin montar)/me/privacy`
- `PATCH (sin montar)/me/preferences`
- `GET (sin montar)/me`
- `GET (sin montar)/search`
- `GET (sin montar)/:id/followers`
- `GET (sin montar)/:id/following`
- `GET (sin montar)/username/:username`
- `GET (sin montar)/:id`
- `POST (sin montar)/:id/follow`
- `PATCH (sin montar)/me`
- `POST (sin montar)/me/avatar`
- `POST (sin montar)/me/cover`
- `DELETE (sin montar)/me`
- `GET (sin montar)`
- `POST (sin montar)`
- `POST (sin montar)/locucion`

### `mcpservicecredentials` (McpServiceCredential)

Archivos: `src/middleware/mcpAuth.js`

