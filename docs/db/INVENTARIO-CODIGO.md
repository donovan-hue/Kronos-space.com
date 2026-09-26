# Inventario de acceso a datos (generado)

Generado por `node scripts/db/code-inventory.js --markdown` el 2026-09-26T13:43:27.261Z.
No editar a mano: se regenera con el código.

## Operaciones detectadas

| Operación | Tipo | Apariciones |
|---|---|---:|
| `find` | lectura | 89 |
| `findOne` | lectura | 51 |
| `findById` | lectura | 84 |
| `countDocuments` | lectura | 53 |
| `distinct` | lectura | 2 |
| `exists` | lectura | 17 |
| `aggregate` | lectura | 8 |
| `populate` | lectura | 121 |
| `lean` | lectura | 187 |
| `create` | escritura | 27 |
| `insertOne` | escritura | 4 |
| `updateOne` | escritura | 25 |
| `updateMany` | escritura | 11 |
| `findOneAndUpdate` | escritura | 16 |
| `findByIdAndUpdate` | escritura | 22 |
| `findOneAndDelete` | escritura | 7 |
| `deleteOne` | escritura | 8 |
| `deleteMany` | escritura | 3 |
| `save` | escritura | 19 |
| `driverDirecto` | acceso directo | 37 |

Endpoints detectados: **193** en 104 archivos de `server/src`.

## Colecciones y endpoints que dependen de ellas

| Colección | Dominio | Archivos | Endpoints |
|---|---|---:|---:|
| `users` | identidad | 22 | 146 |
| `refreshtokens` | auth | 0 | 0 |
| `sessionrevocations` | auth | 0 | 0 |
| `posts` | social | 10 | 67 |
| `stories` | social | 1 | 9 |
| `drafts` | social | 1 | 4 |
| `savedcollections` | social | 1 | 7 |
| `circles` | social | 6 | 45 |
| `orbits` | social | 7 | 49 |
| `channels` | social | 1 | 7 |
| `channelmessages` | social | 1 | 7 |
| `messages` | mensajería | 3 | 20 |
| `conversations` | mensajería | 2 | 7 |
| `notifications` | notificaciones | 2 | 3 |
| `blocks` | moderación | 2 | 19 |
| `mutes` | moderación | 3 | 31 |
| `hiddenposts` | moderación | 2 | 19 |
| `reports` | moderación | 2 | 23 |
| `capsules` | cápsulas | 1 | 8 |
| `seenposts` | pulso | 1 | 4 |
| `feedsignals` | pulso | 1 | 4 |
| `liverooms` | live | 2 | 8 |
| `supporttransactions` | soporte | 1 | 3 |
| `imagegenerations` | kairos | 2 | 4 |
| `videogenerations` | kairos | 1 | 5 |
| `scripts` | kairos | 1 | 11 |
| `scriptprojects` | kairos | 1 | 11 |

## Detalle por colección

### `users` (User)

Archivos: `src/middleware/requireAdmin.js`, `src/modules/admin/admin.routes.js`, `src/modules/ai-core/routes/chat.routes.js`, `src/modules/analytics/analytics.routes.js`, `src/modules/auth/auth.routes.js`, `src/modules/auth/session.routes.js`, `src/modules/capsules/capsules.routes.js`, `src/modules/circles/circles.routes.js`, `src/modules/conversations/conversations.routes.js`, `src/modules/export/export.routes.js`, `src/modules/federation/federation.routes.js`, `src/modules/live/live.routes.js`, `src/modules/messages/messages.routes.js`, `src/modules/moderation/moderation.routes.js`, `src/modules/notifications/notification.service.js`, `src/modules/orbits/orbits.routes.js`, `src/modules/posts/audience.service.js`, `src/modules/posts/posts.routes.js`, `src/modules/search/search.routes.js`, `src/modules/stories/stories.routes.js`, `src/modules/support/support.routes.js`, `src/modules/users/users.routes.js`

Endpoints:

- `GET /api/admin/overview`
- `GET /api/admin/users`
- `PATCH /api/admin/users/:userId/role`
- `GET /api/admin/posts`
- `POST /api/ai/chat`
- `GET /api/analytics/creator`
- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/auth/google/config`
- `POST /api/auth/google`
- `GET /api/auth/me`
- `POST /api/auth/forgot-password`
- `POST /api/auth/reset-password`
- `POST /api/auth/verify-email/request`
- `POST /api/auth/verify-email`
- `GET /api/auth/verify-email`
- `GET /api/auth/session`
- `POST /api/auth/refresh`
- `GET /api/auth/sessions`
- `DELETE /api/auth/sessions/:familyId`
- `DELETE /api/auth/sessions`
- `POST /api/auth/logout`
- `GET /api/auth/token`
- `GET /api/capsules`
- `POST /api/capsules`
- `GET /api/capsules/:capsuleId`
- `POST /api/capsules/:capsuleId/seal`
- `POST /api/capsules/:capsuleId/cancel`
- `POST /api/capsules/:capsuleId/messages`
- `POST /api/capsules/:capsuleId/invite`
- `DELETE /api/capsules/:capsuleId`
- `GET /api/circles`
- `POST /api/circles`
- `PATCH /api/circles/:circleId`
- `DELETE /api/circles/:circleId`
- `GET /api/circles/:circleId/members`
- `POST /api/circles/:circleId/members`
- `DELETE /api/circles/:circleId/members/:userId`
- `POST /api/conversations`
- `GET /api/conversations`
- `GET /api/conversations/:conversationId/messages`
- `POST /api/conversations/:conversationId/messages`
- `PATCH /api/conversations/:conversationId/read`
- `PATCH /api/conversations/:conversationId/members`
- `DELETE /api/conversations/:conversationId`
- `GET /api/export/status`
- `POST /api/export/request`
- `GET /api/export/download`
- `GET //.well-known/webfinger`
- `GET //.well-known/nodeinfo`
- `GET //api/nodeinfo/2.0`
- `GET //api/federation/users/:username`
- `GET //api/federation/users/:username/outbox`
- `POST //api/federation/users/:username/inbox`
- `POST /api/live/rooms`
- `GET /api/live/rooms`
- `GET /api/live/rooms/mine`
- `GET /api/live/rooms/:id`
- `PATCH /api/live/rooms/:id/join`
- `PATCH /api/live/rooms/:id/leave`
- `PATCH /api/live/rooms/:id/end`
- `POST /api/live/rooms/:id/invite`
- `POST /api/messages/media/upload`
- `GET /api/messages`
- `GET /api/messages/:userId`
- `POST /api/messages/:userId`
- `PATCH /api/messages/:userId/delivered`
- `PATCH /api/messages/:userId/read`
- `GET /api/moderation/blocks`
- `POST /api/moderation/blocks/:userId`
- `DELETE /api/moderation/blocks/:userId`
- `GET /api/moderation/mutes`
- `POST /api/moderation/mutes/:userId`
- `DELETE /api/moderation/mutes/:userId`
- `GET /api/moderation/hidden`
- `POST /api/moderation/hidden/:postId`
- `DELETE /api/moderation/hidden/:postId`
- `POST /api/moderation/reports`
- `GET /api/moderation/reports`
- `GET /api/moderation/reports/queue`
- `PATCH /api/moderation/reports/:reportId`
- `POST /api/moderation/posts/:postId/hide`
- `DELETE /api/moderation/posts/:postId/hide`
- `POST /api/moderation/reports/:reportId/appeal`
- `PATCH /api/moderation/reports/:reportId/appeal`
- `GET /api/moderation/health`
- `GET /api/moderation/overview`
- `GET /api/orbits`
- `POST /api/orbits`
- `GET /api/orbits/archived`
- `GET /api/orbits/:orbitId`
- `PATCH /api/orbits/:orbitId`
- `DELETE /api/orbits/:orbitId`
- `POST /api/orbits/:orbitId/join`
- `POST /api/orbits/:orbitId/leave`
- `GET /api/orbits/:orbitId/members`
- `POST /api/orbits/:orbitId/members`
- `PATCH /api/orbits/:orbitId/members/:userId`
- `DELETE /api/orbits/:orbitId/members/:userId`
- `POST /api/posts/media/upload`
- `GET /api/posts/saved`
- `POST /api/posts/:postId/save`
- `POST /api/posts/:postId/repost`
- `POST /api/posts/:postId/poll/vote`
- `POST /api/posts/:postId/event/rsvp`
- `GET /api/posts/user/:userId`
- `GET /api/posts/feed`
- `GET /api/posts/vertical`
- `GET /api/posts`
- `GET /api/posts/topic/:tag`
- `GET /api/posts/:postId`
- `POST /api/posts`
- `PATCH /api/posts/:postId`
- `PATCH /api/posts/:postId/subtitles`
- `PATCH /api/posts/:postId/video-trim`
- `DELETE /api/posts/:postId`
- `POST /api/posts/:postId/comments`
- `DELETE /api/posts/:postId/comments/:commentId`
- `POST /api/posts/:postId/reaction`
- `POST /api/posts/:postId/like`
- `POST /api/posts/:postId/remix`
- `GET /api/search`
- `GET /api/stories`
- `POST /api/stories`
- `GET /api/stories/me/archive`
- `GET /api/stories/:storyId`
- `DELETE /api/stories/:storyId`
- `POST /api/stories/:storyId/view`
- `GET /api/stories/:storyId/views`
- `POST /api/stories/:storyId/reply`
- `GET /api/stories/:storyId/replies`
- `POST /api/support/tip`
- `GET /api/support/creator/:userId`
- `GET /api/support/history`
- `PATCH /api/users/me/privacy`
- `PATCH /api/users/me/preferences`
- `GET /api/users/me`
- `GET /api/users/search`
- `GET /api/users/:id/followers`
- `GET /api/users/:id/following`
- `GET /api/users/username/:username`
- `GET /api/users/:id`
- `POST /api/users/:id/follow`
- `PATCH /api/users/me`
- `POST /api/users/me/avatar`
- `POST /api/users/me/cover`

### `refreshtokens` (RefreshToken)

Archivos: —

### `sessionrevocations` (SessionRevocation)

Archivos: —

### `posts` (Post)

Archivos: `src/modules/admin/admin.routes.js`, `src/modules/analytics/analytics.routes.js`, `src/modules/collections/collections.routes.js`, `src/modules/export/export.routes.js`, `src/modules/federation/federation.routes.js`, `src/modules/moderation/moderation.routes.js`, `src/modules/moderation/moderation.service.js`, `src/modules/posts/posts.routes.js`, `src/modules/pulse/pulse.routes.js`, `src/modules/search/search.routes.js`

Endpoints:

- `GET /api/admin/overview`
- `GET /api/admin/users`
- `PATCH /api/admin/users/:userId/role`
- `GET /api/admin/posts`
- `GET /api/analytics/creator`
- `GET /api/collections`
- `POST /api/collections`
- `PATCH /api/collections/:collectionId`
- `DELETE /api/collections/:collectionId`
- `GET /api/collections/:collectionId/posts`
- `POST /api/collections/:collectionId/posts/:postId`
- `DELETE /api/collections/:collectionId/posts/:postId`
- `GET /api/export/status`
- `POST /api/export/request`
- `GET /api/export/download`
- `GET //.well-known/webfinger`
- `GET //.well-known/nodeinfo`
- `GET //api/nodeinfo/2.0`
- `GET //api/federation/users/:username`
- `GET //api/federation/users/:username/outbox`
- `POST //api/federation/users/:username/inbox`
- `GET /api/moderation/blocks`
- `POST /api/moderation/blocks/:userId`
- `DELETE /api/moderation/blocks/:userId`
- `GET /api/moderation/mutes`
- `POST /api/moderation/mutes/:userId`
- `DELETE /api/moderation/mutes/:userId`
- `GET /api/moderation/hidden`
- `POST /api/moderation/hidden/:postId`
- `DELETE /api/moderation/hidden/:postId`
- `POST /api/moderation/reports`
- `GET /api/moderation/reports`
- `GET /api/moderation/reports/queue`
- `PATCH /api/moderation/reports/:reportId`
- `POST /api/moderation/posts/:postId/hide`
- `DELETE /api/moderation/posts/:postId/hide`
- `POST /api/moderation/reports/:reportId/appeal`
- `PATCH /api/moderation/reports/:reportId/appeal`
- `GET /api/moderation/health`
- `GET /api/moderation/overview`
- `POST /api/posts/media/upload`
- `GET /api/posts/saved`
- `POST /api/posts/:postId/save`
- `POST /api/posts/:postId/repost`
- `POST /api/posts/:postId/poll/vote`
- `POST /api/posts/:postId/event/rsvp`
- `GET /api/posts/user/:userId`
- `GET /api/posts/feed`
- `GET /api/posts/vertical`
- `GET /api/posts`
- `GET /api/posts/topic/:tag`
- `GET /api/posts/:postId`
- `POST /api/posts`
- `PATCH /api/posts/:postId`
- `PATCH /api/posts/:postId/subtitles`
- `PATCH /api/posts/:postId/video-trim`
- `DELETE /api/posts/:postId`
- `POST /api/posts/:postId/comments`
- `DELETE /api/posts/:postId/comments/:commentId`
- `POST /api/posts/:postId/reaction`
- `POST /api/posts/:postId/like`
- `POST /api/posts/:postId/remix`
- `GET /api/pulse`
- `POST /api/pulse/seen/:postId`
- `POST /api/pulse/signal`
- `GET /api/pulse/signals`
- `GET /api/search`

### `stories` (Story)

Archivos: `src/modules/stories/stories.routes.js`

Endpoints:

- `GET /api/stories`
- `POST /api/stories`
- `GET /api/stories/me/archive`
- `GET /api/stories/:storyId`
- `DELETE /api/stories/:storyId`
- `POST /api/stories/:storyId/view`
- `GET /api/stories/:storyId/views`
- `POST /api/stories/:storyId/reply`
- `GET /api/stories/:storyId/replies`

### `drafts` (Draft)

Archivos: `src/modules/drafts/drafts.routes.js`

Endpoints:

- `GET /api/drafts`
- `POST /api/drafts`
- `PATCH /api/drafts/:draftId`
- `DELETE /api/drafts/:draftId`

### `savedcollections` (SavedCollection)

Archivos: `src/modules/collections/collections.routes.js`

Endpoints:

- `GET /api/collections`
- `POST /api/collections`
- `PATCH /api/collections/:collectionId`
- `DELETE /api/collections/:collectionId`
- `GET /api/collections/:collectionId/posts`
- `POST /api/collections/:collectionId/posts/:postId`
- `DELETE /api/collections/:collectionId/posts/:postId`

### `circles` (Circle)

Archivos: `src/modules/circles/circles.routes.js`, `src/modules/drafts/drafts.routes.js`, `src/modules/export/export.routes.js`, `src/modules/posts/audience.service.js`, `src/modules/posts/posts.routes.js`, `src/modules/stories/stories.routes.js`

Endpoints:

- `GET /api/circles`
- `POST /api/circles`
- `PATCH /api/circles/:circleId`
- `DELETE /api/circles/:circleId`
- `GET /api/circles/:circleId/members`
- `POST /api/circles/:circleId/members`
- `DELETE /api/circles/:circleId/members/:userId`
- `GET /api/drafts`
- `POST /api/drafts`
- `PATCH /api/drafts/:draftId`
- `DELETE /api/drafts/:draftId`
- `GET /api/export/status`
- `POST /api/export/request`
- `GET /api/export/download`
- `POST /api/posts/media/upload`
- `GET /api/posts/saved`
- `POST /api/posts/:postId/save`
- `POST /api/posts/:postId/repost`
- `POST /api/posts/:postId/poll/vote`
- `POST /api/posts/:postId/event/rsvp`
- `GET /api/posts/user/:userId`
- `GET /api/posts/feed`
- `GET /api/posts/vertical`
- `GET /api/posts`
- `GET /api/posts/topic/:tag`
- `GET /api/posts/:postId`
- `POST /api/posts`
- `PATCH /api/posts/:postId`
- `PATCH /api/posts/:postId/subtitles`
- `PATCH /api/posts/:postId/video-trim`
- `DELETE /api/posts/:postId`
- `POST /api/posts/:postId/comments`
- `DELETE /api/posts/:postId/comments/:commentId`
- `POST /api/posts/:postId/reaction`
- `POST /api/posts/:postId/like`
- `POST /api/posts/:postId/remix`
- `GET /api/stories`
- `POST /api/stories`
- `GET /api/stories/me/archive`
- `GET /api/stories/:storyId`
- `DELETE /api/stories/:storyId`
- `POST /api/stories/:storyId/view`
- `GET /api/stories/:storyId/views`
- `POST /api/stories/:storyId/reply`
- `GET /api/stories/:storyId/replies`

### `orbits` (Orbit)

Archivos: `src/modules/channels/channels.routes.js`, `src/modules/drafts/drafts.routes.js`, `src/modules/export/export.routes.js`, `src/modules/orbits/orbits.routes.js`, `src/modules/posts/audience.service.js`, `src/modules/posts/posts.routes.js`, `src/modules/search/search.routes.js`

Endpoints:

- `GET /api/channels`
- `POST /api/channels`
- `GET /api/channels/:channelId`
- `POST /api/channels/:channelId/subscribe`
- `DELETE /api/channels/:channelId/subscribe`
- `GET /api/channels/:channelId/messages`
- `POST /api/channels/:channelId/messages`
- `GET /api/drafts`
- `POST /api/drafts`
- `PATCH /api/drafts/:draftId`
- `DELETE /api/drafts/:draftId`
- `GET /api/export/status`
- `POST /api/export/request`
- `GET /api/export/download`
- `GET /api/orbits`
- `POST /api/orbits`
- `GET /api/orbits/archived`
- `GET /api/orbits/:orbitId`
- `PATCH /api/orbits/:orbitId`
- `DELETE /api/orbits/:orbitId`
- `POST /api/orbits/:orbitId/join`
- `POST /api/orbits/:orbitId/leave`
- `GET /api/orbits/:orbitId/members`
- `POST /api/orbits/:orbitId/members`
- `PATCH /api/orbits/:orbitId/members/:userId`
- `DELETE /api/orbits/:orbitId/members/:userId`
- `POST /api/posts/media/upload`
- `GET /api/posts/saved`
- `POST /api/posts/:postId/save`
- `POST /api/posts/:postId/repost`
- `POST /api/posts/:postId/poll/vote`
- `POST /api/posts/:postId/event/rsvp`
- `GET /api/posts/user/:userId`
- `GET /api/posts/feed`
- `GET /api/posts/vertical`
- `GET /api/posts`
- `GET /api/posts/topic/:tag`
- `GET /api/posts/:postId`
- `POST /api/posts`
- `PATCH /api/posts/:postId`
- `PATCH /api/posts/:postId/subtitles`
- `PATCH /api/posts/:postId/video-trim`
- `DELETE /api/posts/:postId`
- `POST /api/posts/:postId/comments`
- `DELETE /api/posts/:postId/comments/:commentId`
- `POST /api/posts/:postId/reaction`
- `POST /api/posts/:postId/like`
- `POST /api/posts/:postId/remix`
- `GET /api/search`

### `channels` (Channel)

Archivos: `src/modules/channels/channels.routes.js`

Endpoints:

- `GET /api/channels`
- `POST /api/channels`
- `GET /api/channels/:channelId`
- `POST /api/channels/:channelId/subscribe`
- `DELETE /api/channels/:channelId/subscribe`
- `GET /api/channels/:channelId/messages`
- `POST /api/channels/:channelId/messages`

### `channelmessages` (ChannelMessage)

Archivos: `src/modules/channels/channels.routes.js`

Endpoints:

- `GET /api/channels`
- `POST /api/channels`
- `GET /api/channels/:channelId`
- `POST /api/channels/:channelId/subscribe`
- `DELETE /api/channels/:channelId/subscribe`
- `GET /api/channels/:channelId/messages`
- `POST /api/channels/:channelId/messages`

### `messages` (Message)

Archivos: `src/modules/channels/channels.routes.js`, `src/modules/conversations/conversations.routes.js`, `src/modules/messages/messages.routes.js`

Endpoints:

- `GET /api/channels`
- `POST /api/channels`
- `GET /api/channels/:channelId`
- `POST /api/channels/:channelId/subscribe`
- `DELETE /api/channels/:channelId/subscribe`
- `GET /api/channels/:channelId/messages`
- `POST /api/channels/:channelId/messages`
- `POST /api/conversations`
- `GET /api/conversations`
- `GET /api/conversations/:conversationId/messages`
- `POST /api/conversations/:conversationId/messages`
- `PATCH /api/conversations/:conversationId/read`
- `PATCH /api/conversations/:conversationId/members`
- `DELETE /api/conversations/:conversationId`
- `POST /api/messages/media/upload`
- `GET /api/messages`
- `GET /api/messages/:userId`
- `POST /api/messages/:userId`
- `PATCH /api/messages/:userId/delivered`
- `PATCH /api/messages/:userId/read`

### `conversations` (Conversation)

Archivos: `src/modules/conversations/conversations.routes.js`, `src/server.js`

Endpoints:

- `POST /api/conversations`
- `GET /api/conversations`
- `GET /api/conversations/:conversationId/messages`
- `POST /api/conversations/:conversationId/messages`
- `PATCH /api/conversations/:conversationId/read`
- `PATCH /api/conversations/:conversationId/members`
- `DELETE /api/conversations/:conversationId`

### `notifications` (Notification)

Archivos: `src/modules/notifications/notification.service.js`, `src/modules/notifications/notifications.routes.js`

Endpoints:

- `GET /api/notifications`
- `PATCH /api/notifications/read-all`
- `PATCH /api/notifications/:notificationId/read`

### `blocks` (Block)

Archivos: `src/modules/moderation/moderation.routes.js`, `src/modules/moderation/moderation.service.js`

Endpoints:

- `GET /api/moderation/blocks`
- `POST /api/moderation/blocks/:userId`
- `DELETE /api/moderation/blocks/:userId`
- `GET /api/moderation/mutes`
- `POST /api/moderation/mutes/:userId`
- `DELETE /api/moderation/mutes/:userId`
- `GET /api/moderation/hidden`
- `POST /api/moderation/hidden/:postId`
- `DELETE /api/moderation/hidden/:postId`
- `POST /api/moderation/reports`
- `GET /api/moderation/reports`
- `GET /api/moderation/reports/queue`
- `PATCH /api/moderation/reports/:reportId`
- `POST /api/moderation/posts/:postId/hide`
- `DELETE /api/moderation/posts/:postId/hide`
- `POST /api/moderation/reports/:reportId/appeal`
- `PATCH /api/moderation/reports/:reportId/appeal`
- `GET /api/moderation/health`
- `GET /api/moderation/overview`

### `mutes` (Mute)

Archivos: `src/modules/moderation/moderation.routes.js`, `src/modules/moderation/moderation.service.js`, `src/modules/users/users.routes.js`

Endpoints:

- `GET /api/moderation/blocks`
- `POST /api/moderation/blocks/:userId`
- `DELETE /api/moderation/blocks/:userId`
- `GET /api/moderation/mutes`
- `POST /api/moderation/mutes/:userId`
- `DELETE /api/moderation/mutes/:userId`
- `GET /api/moderation/hidden`
- `POST /api/moderation/hidden/:postId`
- `DELETE /api/moderation/hidden/:postId`
- `POST /api/moderation/reports`
- `GET /api/moderation/reports`
- `GET /api/moderation/reports/queue`
- `PATCH /api/moderation/reports/:reportId`
- `POST /api/moderation/posts/:postId/hide`
- `DELETE /api/moderation/posts/:postId/hide`
- `POST /api/moderation/reports/:reportId/appeal`
- `PATCH /api/moderation/reports/:reportId/appeal`
- `GET /api/moderation/health`
- `GET /api/moderation/overview`
- `PATCH /api/users/me/privacy`
- `PATCH /api/users/me/preferences`
- `GET /api/users/me`
- `GET /api/users/search`
- `GET /api/users/:id/followers`
- `GET /api/users/:id/following`
- `GET /api/users/username/:username`
- `GET /api/users/:id`
- `POST /api/users/:id/follow`
- `PATCH /api/users/me`
- `POST /api/users/me/avatar`
- `POST /api/users/me/cover`

### `hiddenposts` (HiddenPost)

Archivos: `src/modules/moderation/moderation.routes.js`, `src/modules/moderation/moderation.service.js`

Endpoints:

- `GET /api/moderation/blocks`
- `POST /api/moderation/blocks/:userId`
- `DELETE /api/moderation/blocks/:userId`
- `GET /api/moderation/mutes`
- `POST /api/moderation/mutes/:userId`
- `DELETE /api/moderation/mutes/:userId`
- `GET /api/moderation/hidden`
- `POST /api/moderation/hidden/:postId`
- `DELETE /api/moderation/hidden/:postId`
- `POST /api/moderation/reports`
- `GET /api/moderation/reports`
- `GET /api/moderation/reports/queue`
- `PATCH /api/moderation/reports/:reportId`
- `POST /api/moderation/posts/:postId/hide`
- `DELETE /api/moderation/posts/:postId/hide`
- `POST /api/moderation/reports/:reportId/appeal`
- `PATCH /api/moderation/reports/:reportId/appeal`
- `GET /api/moderation/health`
- `GET /api/moderation/overview`

### `reports` (Report)

Archivos: `src/modules/admin/admin.routes.js`, `src/modules/moderation/moderation.routes.js`

Endpoints:

- `GET /api/admin/overview`
- `GET /api/admin/users`
- `PATCH /api/admin/users/:userId/role`
- `GET /api/admin/posts`
- `GET /api/moderation/blocks`
- `POST /api/moderation/blocks/:userId`
- `DELETE /api/moderation/blocks/:userId`
- `GET /api/moderation/mutes`
- `POST /api/moderation/mutes/:userId`
- `DELETE /api/moderation/mutes/:userId`
- `GET /api/moderation/hidden`
- `POST /api/moderation/hidden/:postId`
- `DELETE /api/moderation/hidden/:postId`
- `POST /api/moderation/reports`
- `GET /api/moderation/reports`
- `GET /api/moderation/reports/queue`
- `PATCH /api/moderation/reports/:reportId`
- `POST /api/moderation/posts/:postId/hide`
- `DELETE /api/moderation/posts/:postId/hide`
- `POST /api/moderation/reports/:reportId/appeal`
- `PATCH /api/moderation/reports/:reportId/appeal`
- `GET /api/moderation/health`
- `GET /api/moderation/overview`

### `capsules` (Capsule)

Archivos: `src/modules/capsules/capsules.routes.js`

Endpoints:

- `GET /api/capsules`
- `POST /api/capsules`
- `GET /api/capsules/:capsuleId`
- `POST /api/capsules/:capsuleId/seal`
- `POST /api/capsules/:capsuleId/cancel`
- `POST /api/capsules/:capsuleId/messages`
- `POST /api/capsules/:capsuleId/invite`
- `DELETE /api/capsules/:capsuleId`

### `seenposts` (SeenPost)

Archivos: `src/modules/pulse/pulse.routes.js`

Endpoints:

- `GET /api/pulse`
- `POST /api/pulse/seen/:postId`
- `POST /api/pulse/signal`
- `GET /api/pulse/signals`

### `feedsignals` (FeedSignal)

Archivos: `src/modules/pulse/pulse.routes.js`

Endpoints:

- `GET /api/pulse`
- `POST /api/pulse/seen/:postId`
- `POST /api/pulse/signal`
- `GET /api/pulse/signals`

### `liverooms` (LiveRoom)

Archivos: `src/modules/live/live.routes.js`, `src/server.js`

Endpoints:

- `POST /api/live/rooms`
- `GET /api/live/rooms`
- `GET /api/live/rooms/mine`
- `GET /api/live/rooms/:id`
- `PATCH /api/live/rooms/:id/join`
- `PATCH /api/live/rooms/:id/leave`
- `PATCH /api/live/rooms/:id/end`
- `POST /api/live/rooms/:id/invite`

### `supporttransactions` (SupportTransaction)

Archivos: `src/modules/support/support.routes.js`

Endpoints:

- `POST /api/support/tip`
- `GET /api/support/creator/:userId`
- `GET /api/support/history`

### `imagegenerations` (ImageGeneration)

Archivos: `src/modules/image-ai/image.routes.js`, `src/modules/image-ai/image.service.js`

Endpoints:

- `GET /api/ai/images/history`
- `POST /api/ai/images/generate`
- `POST /api/ai/images/upload`
- `DELETE /api/ai/images/:id`

### `videogenerations` (VideoGeneration)

Archivos: `src/modules/video-ai/video.routes.js`

Endpoints:

- `POST /api/ai/videos/generate`
- `GET /api/ai/videos/history`
- `GET /api/ai/videos/:id/status`
- `GET /api/ai/videos/:id`
- `DELETE /api/ai/videos/:id`

### `scripts` (Script)

Archivos: `src/modules/script-ai/script.routes.js`

Endpoints:

- `POST /api/ai/scripts/generate`
- `POST /api/ai/scripts/projects`
- `GET /api/ai/scripts/projects`
- `DELETE /api/ai/scripts/projects/:id`
- `GET /api/ai/scripts/projects/:id/export`
- `GET /api/ai/scripts/projects/:id`
- `GET /api/ai/scripts/history`
- `PUT /api/ai/scripts/projects/:id`
- `PUT /api/ai/scripts/:id`
- `GET /api/ai/scripts/:id`
- `DELETE /api/ai/scripts/:id`

### `scriptprojects` (ScriptProject)

Archivos: `src/modules/script-ai/script.routes.js`

Endpoints:

- `POST /api/ai/scripts/generate`
- `POST /api/ai/scripts/projects`
- `GET /api/ai/scripts/projects`
- `DELETE /api/ai/scripts/projects/:id`
- `GET /api/ai/scripts/projects/:id/export`
- `GET /api/ai/scripts/projects/:id`
- `GET /api/ai/scripts/history`
- `PUT /api/ai/scripts/projects/:id`
- `PUT /api/ai/scripts/:id`
- `GET /api/ai/scripts/:id`
- `DELETE /api/ai/scripts/:id`

