# Esquema declarado (generado)

Generado por `node scripts/db/schema-audit.js --markdown` el 2026-10-24T09:01:08.559Z.
No editar a mano: se regenera desde los esquemas Mongoose.

Colecciones: **28** · campos: **321** · índices declarados: **62**.

## Riesgos estructurales detectados sin datos

| Severidad | Colección | Campo | Observación |
|---|---|---|---|
| warning | `users` | `followers` | array sin cota declarada: crece dentro del documento (límite de 16 MB) |
| warning | `users` | `following` | array sin cota declarada: crece dentro del documento (límite de 16 MB) |
| reviewed | `users` | `passwordHash` | campo sensible sin `select: false`, revisado: se lee en el inicio de sesión (auth.routes) y nunca se serializa: la respuesta usa sessionUserPayload |
| reviewed | `refreshtokens` | `tokenHash` | campo sensible sin `select: false`, revisado: colección interna de sesiones: se consulta por filtro y nunca se devuelve al cliente |
| warning | `sessionrevocations` | `createdAt` | sin marca temporal: no se puede ordenar ni paginar por fecha |
| warning | `posts` | `comments` | array sin cota declarada: crece dentro del documento (límite de 16 MB) |
| warning | `posts` | `likes` | array sin cota declarada: crece dentro del documento (límite de 16 MB) |
| warning | `posts` | `reactions` | array sin cota declarada: crece dentro del documento (límite de 16 MB) |
| warning | `posts` | `savedBy` | array sin cota declarada: crece dentro del documento (límite de 16 MB) |
| warning | `circles` | `members` | array sin cota declarada: crece dentro del documento (límite de 16 MB) |
| warning | `conversations` | `members` | array sin cota declarada: crece dentro del documento (límite de 16 MB) |
| warning | `liverooms` | `participants` | array sin cota declarada: crece dentro del documento (límite de 16 MB) |

## `users` — User

Dominio: **identidad** · marcas temporales: sí · **datos sensibles**

Cuentas, perfil público, preferencias y grafo de seguidores.

Retención: Permanente mientras la cuenta exista.

| Campo | Tipo | Reglas | Referencia | Catálogo | Por defecto |
|---|---|---|---|---|---|
| `_id` | ObjectId | — | — | — | — |
| `avatar` | String | recortado | — | — | "" |
| `bio` | String | recortado | — | — | "" |
| `cover` | String | recortado | — | — | "" |
| `createdAt` | Date | — | — | — | — |
| `dataExportRequestedAt` | Date | `select:false` | — | — | `null` |
| `displayName` | String | recortado | — | — | "" |
| `email` | String | obligatorio, único, minúsculas, recortado | — | — | — |
| `emailVerificationExpiresAt` | Date | `select:false` | — | — | `null` |
| `emailVerificationTokenHash` | String | `select:false` | — | — | `null` |
| `emailVerified` | Boolean | — | — | — | `false` |
| `followers` | Array<ObjectId> | — | `User` | — | — |
| `following` | Array<ObjectId> | — | `User` | — | — |
| `googleId` | String | único, `select:false`, recortado | — | — | — |
| `passwordHash` | String | — | — | — | — |
| `passwordResetExpiresAt` | Date | `select:false` | — | — | `null` |
| `passwordResetTokenHash` | String | `select:false` | — | — | `null` |
| `preferences.aiPersonality` | String | — | — | `normal`, `direct`, `sarcastic`, `grumpy` | `normal` |
| `preferences.content.showSensitive` | Boolean | — | — | — | `false` |
| `preferences.feed.interests` | Array<String> | — | — | — | — |
| `preferences.feed.mode` | String | — | — | `latest`, `following`, `interests` | `latest` |
| `preferences.language` | String | — | — | `es-MX`, `en` | `es-MX` |
| `preferences.notifications.email` | Boolean | — | — | — | `false` |
| `preferences.notifications.inApp` | Boolean | — | — | — | `true` |
| `preferences.onboarded` | Boolean | — | — | — | `false` |
| `profilePrivacy.discoverable` | Boolean | — | — | — | `true` |
| `profilePrivacy.showBio` | Boolean | — | — | — | `true` |
| `profilePrivacy.showFollowCounts` | Boolean | — | — | — | `true` |
| `role` | String | indexado | — | `user`, `admin` | `user` |
| `updatedAt` | Date | — | — | — | — |
| `username` | String | obligatorio, único, minúsculas, recortado | — | — | — |

Índices declarados:

- `{"username":1}` · unique=true
- `{"email":1}` · unique=true
- `{"googleId":1}` · unique=true, sparse=true
- `{"role":1}`

## `refreshtokens` — RefreshToken

Dominio: **auth** · marcas temporales: sí · **datos sensibles**

Familias de refresh token con rotación.

Retención: TTL por expiresAt (expireAfterSeconds: 0).

| Campo | Tipo | Reglas | Referencia | Catálogo | Por defecto |
|---|---|---|---|---|---|
| `_id` | String | obligatorio | — | — | — |
| `createdAt` | Date | — | — | — | — |
| `expiresAt` | Date | obligatorio | — | — | — |
| `familyId` | String | obligatorio, indexado | — | — | — |
| `ip` | String | — | — | — | "" |
| `replacedBy` | String | — | — | — | `null` |
| `revokedAt` | Date | — | — | — | `null` |
| `revokedReason` | String | — | — | — | "" |
| `tokenHash` | String | obligatorio | — | — | — |
| `updatedAt` | Date | — | — | — | — |
| `userAgent` | String | — | — | — | "" |
| `userId` | ObjectId | obligatorio, indexado | `User` | — | — |

Índices declarados:

- `{"userId":1}`
- `{"familyId":1}`
- `{"expiresAt":1}` · expireAfterSeconds=0

## `sessionrevocations` — SessionRevocation

Dominio: **auth** · marcas temporales: no · **datos sensibles**

Revocaciones de sesión consultadas en cada handshake.

Retención: TTL por expiresAt (expireAfterSeconds: 0).

| Campo | Tipo | Reglas | Referencia | Catálogo | Por defecto |
|---|---|---|---|---|---|
| `_id` | String | obligatorio | — | — | — |
| `expiresAt` | Date | obligatorio | — | — | — |
| `reason` | String | — | — | — | `logout` |
| `revokedAt` | Date | — | — | — | `(función)` |
| `userId` | ObjectId | indexado | `User` | — | `null` |

Índices declarados:

- `{"userId":1}`
- `{"expiresAt":1}` · expireAfterSeconds=0

## `posts` — Post

Dominio: **social** · marcas temporales: sí

Publicaciones, comentarios, reacciones, encuestas y eventos.

Retención: Permanente hasta borrado del autor.

| Campo | Tipo | Reglas | Referencia | Catálogo | Por defecto |
|---|---|---|---|---|---|
| `_id` | ObjectId | — | — | — | — |
| `audience` | Subdocumento | — | — | — | `(función)` |
| `author` | ObjectId | obligatorio | `User` | — | — |
| `comments` | Array<Subdocumento> | — | — | — | — |
| `content` | String | recortado | — | — | "" |
| `createdAt` | Date | — | — | — | — |
| `event` | Subdocumento | — | — | — | `null` |
| `hashtags` | Array<String> | — | — | — | — |
| `likes` | Array<ObjectId> | — | `User` | — | — |
| `lineage` | Subdocumento | — | — | — | `(función)` |
| `media` | Subdocumento | — | — | — | `(función)` |
| `mediaItems` | Array<Subdocumento> | — | — | — | — |
| `moderation.hidden` | Boolean | indexado | — | — | `false` |
| `moderation.hiddenAt` | Date | — | — | — | `null` |
| `moderation.hiddenBy` | ObjectId | — | `User` | — | `null` |
| `moderation.reason` | String | recortado | — | — | "" |
| `poll` | Subdocumento | — | — | — | `null` |
| `reactions` | Array<Subdocumento> | — | — | — | — |
| `repostOf` | ObjectId | — | `Post` | — | `null` |
| `savedBy` | Array<ObjectId> | — | `User` | — | — |
| `updatedAt` | Date | — | — | — | — |

Índices declarados:

- `{"moderation.hidden":1}`
- `{"author":1,"createdAt":-1}`
- `{"createdAt":-1}`
- `{"hashtags":1,"createdAt":-1}`
- `{"media.type":1,"createdAt":-1,"media.orientation":1}`

## `stories` — Story

Dominio: **social** · marcas temporales: sí

Historias efímeras con archivo personal posterior.

Retención: expiresAt filtra la vista; el documento se conserva como archivo.

| Campo | Tipo | Reglas | Referencia | Catálogo | Por defecto |
|---|---|---|---|---|---|
| `_id` | ObjectId | — | — | — | — |
| `audience` | Subdocumento | — | — | — | `(función)` |
| `author` | ObjectId | obligatorio | `User` | — | — |
| `caption` | String | recortado | — | — | "" |
| `createdAt` | Date | — | — | — | — |
| `expiresAt` | Date | obligatorio, indexado | — | — | — |
| `media` | Subdocumento | obligatorio | — | — | — |
| `replies` | Array<Subdocumento> | — | — | — | — |
| `updatedAt` | Date | — | — | — | — |
| `views` | Array<Subdocumento> | — | — | — | — |

Índices declarados:

- `{"expiresAt":1}`
- `{"author":1,"createdAt":-1}`

## `drafts` — Draft

Dominio: **social** · marcas temporales: sí

Borradores de publicación por autor.

Retención: Hasta publicación o borrado manual.

| Campo | Tipo | Reglas | Referencia | Catálogo | Por defecto |
|---|---|---|---|---|---|
| `_id` | ObjectId | — | — | — | — |
| `audience.circleId` | ObjectId | — | `Circle` | — | `null` |
| `audience.type` | String | — | — | `public`, `followers`, `private`, `circle` | `public` |
| `author` | ObjectId | obligatorio | `User` | — | — |
| `content` | String | recortado | — | — | "" |
| `createdAt` | Date | — | — | — | — |
| `event` | Subdocumento | — | — | — | `null` |
| `media` | Subdocumento | — | — | — | `(función)` |
| `mediaItems` | Array<Subdocumento> | — | — | — | — |
| `poll` | Subdocumento | — | — | — | `null` |
| `updatedAt` | Date | — | — | — | — |

Índices declarados:

- `{"author":1,"updatedAt":-1}`

## `savedcollections` — SavedCollection

Dominio: **social** · marcas temporales: sí

Colecciones de publicaciones guardadas.

Retención: Permanente por usuario.

| Campo | Tipo | Reglas | Referencia | Catálogo | Por defecto |
|---|---|---|---|---|---|
| `_id` | ObjectId | — | — | — | — |
| `createdAt` | Date | — | — | — | — |
| `description` | String | recortado | — | — | "" |
| `name` | String | obligatorio, recortado | — | — | — |
| `owner` | ObjectId | obligatorio | `User` | — | — |
| `posts` | Array<ObjectId> | — | `Post` | — | — |
| `updatedAt` | Date | — | — | — | — |

Índices declarados:

- `{"owner":1,"name":1}` · unique=true
- `{"owner":1,"updatedAt":-1}`

## `circles` — Circle

Dominio: **social** · marcas temporales: sí

Círculos privados de audiencia.

Retención: Permanente por usuario.

| Campo | Tipo | Reglas | Referencia | Catálogo | Por defecto |
|---|---|---|---|---|---|
| `_id` | ObjectId | — | — | — | — |
| `createdAt` | Date | — | — | — | — |
| `description` | String | recortado | — | — | "" |
| `members` | Array<ObjectId> | — | `User` | — | — |
| `name` | String | obligatorio, recortado | — | — | — |
| `owner` | ObjectId | obligatorio | `User` | — | — |
| `updatedAt` | Date | — | — | — | — |

Índices declarados:

- `{"owner":1,"name":1}` · unique=true
- `{"owner":1,"updatedAt":-1}`

## `messages` — Message

Dominio: **mensajería** · marcas temporales: sí · **datos sensibles**

Mensajes directos y de grupo.

Retención: Permanente hasta borrado por los participantes.

| Campo | Tipo | Reglas | Referencia | Catálogo | Por defecto |
|---|---|---|---|---|---|
| `_id` | ObjectId | — | — | — | — |
| `clientMessageId` | String | recortado | — | — | — |
| `conversation` | ObjectId | — | `Conversation` | — | `null` |
| `createdAt` | Date | — | — | — | — |
| `delivered` | Boolean | — | — | — | `false` |
| `media.alt` | String | — | — | — | "" |
| `media.mimeType` | String | — | — | — | "" |
| `media.size` | Number | — | — | — | `0` |
| `media.url` | String | — | — | — | "" |
| `read` | Boolean | — | — | — | `false` |
| `readBy` | Array<ObjectId> | — | `User` | — | — |
| `receiver` | ObjectId | — | `User` | — | `null` |
| `sender` | ObjectId | obligatorio | `User` | — | — |
| `text` | String | recortado | — | — | "" |
| `updatedAt` | Date | — | — | — | — |

Índices declarados:

- `{"sender":1,"receiver":1,"createdAt":-1}`
- `{"conversation":1,"createdAt":1}`
- `{"receiver":1,"createdAt":-1}`
- `{"sender":1,"receiver":1,"clientMessageId":1}` · name="message_sender_receiver_clientMessageId_unique", unique=true, partialFilterExpression={"receiver":{"$type":"objectId"},"clientMessageId":{"$type":"string"}}
- `{"sender":1,"conversation":1,"clientMessageId":1}` · name="message_sender_conversation_clientMessageId_unique", unique=true, partialFilterExpression={"conversation":{"$type":"objectId"},"clientMessageId":{"$type":"string"}}

## `conversations` — Conversation

Dominio: **mensajería** · marcas temporales: sí · **datos sensibles**

Conversaciones de grupo con miembros.

Retención: Permanente hasta borrado.

| Campo | Tipo | Reglas | Referencia | Catálogo | Por defecto |
|---|---|---|---|---|---|
| `_id` | ObjectId | — | — | — | — |
| `createdAt` | Date | — | — | — | — |
| `createdBy` | ObjectId | obligatorio | `User` | — | — |
| `members` | Array<ObjectId> | obligatorio | `User` | — | — |
| `name` | String | recortado | — | — | "" |
| `updatedAt` | Date | — | — | — | — |

Índices declarados:

- `{"createdAt":-1}`
- `{"members":1,"updatedAt":-1}`

## `notifications` — Notification

Dominio: **notificaciones** · marcas temporales: sí

Avisos in-app por destinatario.

Retención: Poda por antigüedad (migración 005, opt-in explícito).

| Campo | Tipo | Reglas | Referencia | Catálogo | Por defecto |
|---|---|---|---|---|---|
| `_id` | ObjectId | — | — | — | — |
| `actor` | ObjectId | obligatorio | `User` | — | — |
| `createdAt` | Date | — | — | — | — |
| `post` | ObjectId | — | `Post` | — | `null` |
| `read` | Boolean | — | — | — | `false` |
| `recipient` | ObjectId | obligatorio | `User` | — | — |
| `type` | String | obligatorio | — | `follow`, `like`, `comment`, `repost`, `save`, `moderation`, `capsule` | — |
| `updatedAt` | Date | — | — | — | — |

Índices declarados:

- `{"recipient":1,"createdAt":-1}`
- `{"recipient":1,"read":1,"createdAt":-1}`

## `blocks` — Block

Dominio: **moderación** · marcas temporales: sí

Bloqueos entre usuarios.

Retención: Permanente hasta desbloqueo.

| Campo | Tipo | Reglas | Referencia | Catálogo | Por defecto |
|---|---|---|---|---|---|
| `_id` | ObjectId | — | — | — | — |
| `blocked` | ObjectId | obligatorio | `User` | — | — |
| `blocker` | ObjectId | obligatorio | `User` | — | — |
| `createdAt` | Date | — | — | — | — |
| `updatedAt` | Date | — | — | — | — |

Índices declarados:

- `{"blocker":1,"blocked":1}` · unique=true
- `{"blocked":1,"blocker":1}`

## `mutes` — Mute

Dominio: **moderación** · marcas temporales: sí

Silencios entre usuarios.

Retención: Permanente hasta quitar el silencio.

| Campo | Tipo | Reglas | Referencia | Catálogo | Por defecto |
|---|---|---|---|---|---|
| `_id` | ObjectId | — | — | — | — |
| `createdAt` | Date | — | — | — | — |
| `muted` | ObjectId | obligatorio, indexado | `User` | — | — |
| `muter` | ObjectId | obligatorio | `User` | — | — |
| `updatedAt` | Date | — | — | — | — |

Índices declarados:

- `{"muted":1}`
- `{"muter":1,"muted":1}` · unique=true

## `hiddenposts` — HiddenPost

Dominio: **moderación** · marcas temporales: sí

Publicaciones ocultas por un usuario concreto.

Retención: Permanente por usuario.

| Campo | Tipo | Reglas | Referencia | Catálogo | Por defecto |
|---|---|---|---|---|---|
| `_id` | ObjectId | — | — | — | — |
| `createdAt` | Date | — | — | — | — |
| `post` | ObjectId | obligatorio, indexado | `Post` | — | — |
| `updatedAt` | Date | — | — | — | — |
| `user` | ObjectId | obligatorio | `User` | — | — |

Índices declarados:

- `{"post":1}`
- `{"user":1,"post":1}` · unique=true
- `{"user":1,"createdAt":-1}`

## `reports` — Report

Dominio: **moderación** · marcas temporales: sí · **datos sensibles**

Reportes y apelaciones de contenido.

Retención: Permanente: registro de decisiones de moderación.

| Campo | Tipo | Reglas | Referencia | Catálogo | Por defecto |
|---|---|---|---|---|---|
| `_id` | ObjectId | — | — | — | — |
| `appeal.createdAt` | Date | — | — | — | `null` |
| `appeal.reviewedAt` | Date | — | — | — | `null` |
| `appeal.status` | String | — | — | `submitted`, `accepted`, `rejected` | `null` |
| `appeal.text` | String | — | — | — | "" |
| `createdAt` | Date | — | — | — | — |
| `details` | String | recortado | — | — | "" |
| `reason` | String | obligatorio | — | `spam`, `harassment`, `hate`, `sexual`, `violence`, `self_harm`, `misinformation`, `other` | — |
| `reporter` | ObjectId | obligatorio | `User` | — | — |
| `resolutionNote` | String | recortado | — | — | "" |
| `resolvedAt` | Date | — | — | — | `null` |
| `resolvedBy` | ObjectId | — | `User` | — | `null` |
| `status` | String | — | — | `pending`, `reviewing`, `resolved`, `dismissed` | `pending` |
| `targetId` | ObjectId | obligatorio | — | — | — |
| `targetOwner` | ObjectId | — | `User` | — | `null` |
| `targetType` | String | obligatorio | — | `user`, `post`, `comment` | — |
| `updatedAt` | Date | — | — | — | — |

Índices declarados:

- `{"status":1,"createdAt":-1}`
- `{"targetType":1,"targetId":1}`
- `{"reporter":1,"createdAt":-1}`

## `capsules` — Capsule

Dominio: **cápsulas** · marcas temporales: sí · **datos sensibles**

Cápsulas del tiempo cifradas con apertura programada.

Retención: Permanente; el contenido está cifrado con CAPSULE_SECRET.

| Campo | Tipo | Reglas | Referencia | Catálogo | Por defecto |
|---|---|---|---|---|---|
| `_id` | ObjectId | — | — | — | — |
| `cancelledAt` | Date | — | — | — | `null` |
| `contributors` | Array<Subdocumento> | — | — | — | — |
| `createdAt` | Date | — | — | — | — |
| `messages` | Array<Subdocumento> | — | — | — | — |
| `openedAt` | Date | — | — | — | `null` |
| `opensAt` | Date | obligatorio | — | — | — |
| `owner` | ObjectId | obligatorio, indexado | `User` | — | — |
| `state` | String | — | — | `draft`, `scheduled`, `opened`, `cancelled` | `draft` |
| `timezone` | String | recortado | — | — | `UTC` |
| `title` | String | obligatorio, recortado | — | — | — |
| `updatedAt` | Date | — | — | — | — |

Índices declarados:

- `{"owner":1}`
- `{"state":1,"opensAt":1}`

## `seenposts` — SeenPost

Dominio: **pulso** · marcas temporales: sí

Marcas de publicación ya vista por usuario.

Retención: Poda por antigüedad (migración 005, opt-in explícito).

| Campo | Tipo | Reglas | Referencia | Catálogo | Por defecto |
|---|---|---|---|---|---|
| `_id` | ObjectId | — | — | — | — |
| `createdAt` | Date | — | — | — | — |
| `post` | ObjectId | obligatorio | `Post` | — | — |
| `seenAt` | Date | — | — | — | `(función)` |
| `user` | ObjectId | obligatorio | `User` | — | — |

Índices declarados:

- `{"user":1,"post":1}` · unique=true

## `feedsignals` — FeedSignal

Dominio: **pulso** · marcas temporales: sí

Señales más/menos por etiqueta y usuario.

Retención: Permanente por usuario.

| Campo | Tipo | Reglas | Referencia | Catálogo | Por defecto |
|---|---|---|---|---|---|
| `_id` | ObjectId | — | — | — | — |
| `createdAt` | Date | — | — | — | — |
| `direction` | String | obligatorio | — | `more`, `less` | — |
| `tag` | String | obligatorio, minúsculas, recortado | — | — | — |
| `user` | ObjectId | obligatorio | `User` | — | — |

Índices declarados:

- `{"user":1,"tag":1}` · unique=true

## `liverooms` — LiveRoom

Dominio: **live** · marcas temporales: sí

Salas en vivo y participantes.

Retención: Histórico de salas finalizadas.

| Campo | Tipo | Reglas | Referencia | Catálogo | Por defecto |
|---|---|---|---|---|---|
| `_id` | ObjectId | — | — | — | — |
| `createdAt` | Date | — | — | — | — |
| `description` | String | recortado | — | — | "" |
| `endedAt` | Date | — | — | — | `null` |
| `host` | ObjectId | obligatorio, indexado | `User` | — | — |
| `isPublic` | Boolean | — | — | — | `true` |
| `maxParticipants` | Number | — | — | — | `100` |
| `participants` | Array<Subdocumento> | — | — | — | — |
| `startedAt` | Date | — | — | — | `(función)` |
| `status` | String | — | — | `active`, `ended` | `active` |
| `title` | String | obligatorio, recortado | — | — | — |
| `type` | String | — | — | `audio`, `video`, `screen` | `audio` |
| `updatedAt` | Date | — | — | — | — |
| `viewersCount` | Number | — | — | — | `0` |

Índices declarados:

- `{"host":1}`
- `{"status":1,"startedAt":-1}`

## `supporttransactions` — SupportTransaction

Dominio: **soporte** · marcas temporales: sí · **datos sensibles**

Registro de apoyos económicos entre usuarios.

Retención: Permanente: registro contable.

| Campo | Tipo | Reglas | Referencia | Catálogo | Por defecto |
|---|---|---|---|---|---|
| `_id` | ObjectId | — | — | — | — |
| `amount` | Number | obligatorio | — | — | — |
| `anonymous` | Boolean | — | — | — | `false` |
| `clientMessageId` | String | recortado | — | — | — |
| `createdAt` | Date | — | — | — | — |
| `creator` | ObjectId | obligatorio | `User` | — | — |
| `message` | String | recortado | — | — | "" |
| `sender` | ObjectId | obligatorio | `User` | — | — |
| `tier` | String | — | — | `stardust`, `meteor`, `supernova`, `custom` | `stardust` |
| `updatedAt` | Date | — | — | — | — |

Índices declarados:

- `{"creator":1,"createdAt":-1}`
- `{"sender":1,"createdAt":-1}`
- `{"sender":1,"creator":1,"clientMessageId":1}` · name="support_sender_creator_clientMessageId_unique", unique=true, partialFilterExpression={"creator":{"$type":"objectId"},"clientMessageId":{"$type":"string"}}

## `imagegenerations` — ImageGeneration

Dominio: **kairos** · marcas temporales: sí

Generaciones de imagen (proveedor, modelo, estado, resultado).

Retención: Poda de generaciones abandonadas (migración 006).

| Campo | Tipo | Reglas | Referencia | Catálogo | Por defecto |
|---|---|---|---|---|---|
| `_id` | ObjectId | — | — | — | — |
| `createdAt` | Date | — | — | — | — |
| `error` | String | — | — | — | "" |
| `imageUrl` | String | — | — | — | "" |
| `model` | String | — | — | — | `gpt-image-1` |
| `negativePrompt` | String | recortado | — | — | "" |
| `prompt` | String | obligatorio | — | — | — |
| `provider` | String | — | — | — | `openrouter` |
| `status` | String | — | — | `queued`, `processing`, `completed`, `failed` | `queued` |
| `style` | String | — | — | `cinematic`, `editorial`, `concept-art`, `photorealistic` | `cinematic` |
| `updatedAt` | Date | — | — | — | — |
| `user` | ObjectId | obligatorio | `User` | — | — |

Índices declarados:

- `{"user":1,"createdAt":-1}`

## `videogenerations` — VideoGeneration

Dominio: **kairos** · marcas temporales: sí

Trabajos de video y su estado.

Retención: Poda de generaciones abandonadas (migración 006).

| Campo | Tipo | Reglas | Referencia | Catálogo | Por defecto |
|---|---|---|---|---|---|
| `_id` | ObjectId | — | — | — | — |
| `createdAt` | Date | — | — | — | — |
| `error` | String | — | — | — | "" |
| `model` | String | — | — | — | `video-generation` |
| `negativePrompt` | String | recortado | — | — | "" |
| `progress` | Number | — | — | — | `0` |
| `prompt` | String | obligatorio | — | — | — |
| `provider` | String | — | — | — | `openai` |
| `providerJobId` | String | indexado, recortado | — | — | "" |
| `status` | String | — | — | `queued`, `processing`, `completed`, `failed` | `queued` |
| `style` | String | recortado | — | — | "" |
| `updatedAt` | Date | — | — | — | — |
| `user` | ObjectId | obligatorio | `User` | — | — |
| `videoUrl` | String | — | — | — | "" |

Índices declarados:

- `{"providerJobId":1}`
- `{"user":1,"createdAt":-1}`

## `scripts` — Script

Dominio: **kairos** · marcas temporales: sí

Guiones generados.

Retención: Permanente por usuario.

| Campo | Tipo | Reglas | Referencia | Catálogo | Por defecto |
|---|---|---|---|---|---|
| `_id` | ObjectId | — | — | — | — |
| `audience` | String | recortado | — | — | "" |
| `createdAt` | Date | — | — | — | — |
| `durationMinutes` | Number | — | — | — | `5` |
| `error` | String | — | — | — | "" |
| `format` | String | — | — | `standard`, `cinematic`, `vertical`, `documentary`, `podcast`, `presentation` | `standard` |
| `genre` | String | — | — | `general`, `drama`, `comedy`, `thriller`, `horror`, `romance`, `action`, `documentary`, `educational` | `general` |
| `model` | String | — | — | — | `openrouter/free` |
| `prompt` | String | obligatorio | — | — | — |
| `provider` | String | — | — | — | `openrouter` |
| `result` | String | — | — | — | "" |
| `status` | String | indexado | — | `queued`, `processing`, `completed`, `failed` | `queued` |
| `structure` | Mixed | — | — | — | `null` |
| `tone` | String | recortado | — | — | "" |
| `type` | String | — | — | `video`, `reel`, `youtube`, `advertisement`, `story`, `presentation`, `custom` | `custom` |
| `updatedAt` | Date | — | — | — | — |
| `user` | ObjectId | obligatorio | `User` | — | — |

Índices declarados:

- `{"status":1}`
- `{"user":1,"createdAt":-1}`

## `scriptprojects` — ScriptProject

Dominio: **kairos** · marcas temporales: sí

Proyectos de guion con estructura.

Retención: Permanente por usuario.

| Campo | Tipo | Reglas | Referencia | Catálogo | Por defecto |
|---|---|---|---|---|---|
| `_id` | ObjectId | — | — | — | — |
| `audience` | String | recortado | — | — | "" |
| `createdAt` | Date | — | — | — | — |
| `durationMinutes` | Number | obligatorio | — | — | — |
| `format` | String | obligatorio, recortado | — | — | — |
| `genre` | String | obligatorio, recortado | — | — | — |
| `result` | String | obligatorio | — | — | — |
| `sourceScript` | ObjectId | — | `Script` | — | `null` |
| `structure` | Mixed | obligatorio | — | — | — |
| `title` | String | obligatorio, recortado | — | — | — |
| `tone` | String | recortado | — | — | "" |
| `type` | String | obligatorio, recortado | — | — | — |
| `updatedAt` | Date | — | — | — | — |
| `user` | ObjectId | obligatorio | `User` | — | — |

Índices declarados:

- `{"user":1,"updatedAt":-1}`

## `projects` — Project

Dominio: **proyectos** · marcas temporales: sí

Proyectos por pieza con escenas, música y versiones comparables.

Retención: Permanente hasta borrado del autor.

| Campo | Tipo | Reglas | Referencia | Catálogo | Por defecto |
|---|---|---|---|---|---|
| `_id` | ObjectId | — | — | — | — |
| `archived` | Boolean | — | — | — | `false` |
| `brief` | String | — | — | — | "" |
| `createdAt` | Date | — | — | — | — |
| `format` | String | — | — | `reel`, `cuadrado`, `portada`, `libre` | `libre` |
| `musicTitle` | String | — | — | — | "" |
| `musicUrl` | String | — | — | — | "" |
| `owner` | ObjectId | obligatorio | `User` | — | — |
| `scenes` | Array<Subdocumento> | — | — | — | — |
| `title` | String | obligatorio, recortado | — | — | — |
| `updatedAt` | Date | — | — | — | — |
| `versions` | Array<Subdocumento> | — | — | — | — |

Índices declarados:

- `{"owner":1,"updatedAt":-1}`

## `musictracks` — MusicTrack

Dominio: **estudio** · marcas temporales: sí

Catálogo de pistas de música subidas al estudio.

Retención: Permanente hasta borrado del autor o administración.

| Campo | Tipo | Reglas | Referencia | Catálogo | Por defecto |
|---|---|---|---|---|---|
| `_id` | ObjectId | — | — | — | — |
| `autor` | String | recortado | — | — | "" |
| `createdAt` | Date | — | — | — | — |
| `duracion` | Number | — | — | — | `0` |
| `etiquetas` | Array<String> | — | — | — | — |
| `licencia` | String | recortado | — | — | "" |
| `mimeType` | String | recortado | — | — | "" |
| `portadaUrl` | String | recortado | — | — | "" |
| `publicada` | Boolean | — | — | — | `false` |
| `size` | Number | — | — | — | `0` |
| `subidaPor` | ObjectId | — | `User` | — | `null` |
| `titulo` | String | obligatorio, recortado | — | — | — |
| `updatedAt` | Date | — | — | — | — |
| `url` | String | obligatorio, recortado | — | — | — |

Índices declarados:

- `{"publicada":1,"createdAt":-1}`

## `voices` — Voice

Dominio: **estudio** · marcas temporales: sí

Catálogo de voces propias y de proveedor en el estudio.

Retención: Permanente hasta borrado del autor o administración.

| Campo | Tipo | Reglas | Referencia | Catálogo | Por defecto |
|---|---|---|---|---|---|
| `_id` | ObjectId | — | — | — | — |
| `configurables` | Array<String> | — | — | — | — |
| `createdAt` | Date | — | — | — | — |
| `descripcion` | String | recortado | — | — | "" |
| `duracion` | Number | — | — | — | `0` |
| `genero` | String | — | — | `femenina`, `masculina`, `neutra`, `` | "" |
| `idioma` | String | recortado | — | — | "" |
| `licencia` | String | recortado | — | — | "" |
| `lista` | Boolean | — | — | — | `false` |
| `mimeType` | String | recortado | — | — | "" |
| `modelo` | String | recortado | — | — | "" |
| `nombre` | String | obligatorio, recortado | — | — | — |
| `registradaPor` | ObjectId | — | `User` | — | `null` |
| `size` | Number | — | — | — | `0` |
| `tipo` | String | — | — | `propia`, `catalogo` | `propia` |
| `updatedAt` | Date | — | — | — | — |
| `url` | String | recortado | — | — | "" |
| `vozProveedor` | String | recortado | — | — | "" |

Índices declarados:

- `{"lista":1,"createdAt":-1}`

## `mcpservicecredentials` — McpServiceCredential

Dominio: **integraciones** · marcas temporales: sí · **datos sensibles**

Credenciales de servicio para conectores MCP.

Retención: Permanente hasta revocación administrativa.

| Campo | Tipo | Reglas | Referencia | Catálogo | Por defecto |
|---|---|---|---|---|---|
| `_id` | ObjectId | — | — | — | — |
| `active` | Boolean | indexado | — | — | `true` |
| `createdAt` | Date | — | — | — | — |
| `expiresAt` | Date | indexado | — | — | `null` |
| `lastUsedAt` | Date | — | — | — | `null` |
| `name` | String | obligatorio, único, recortado | — | — | — |
| `permissions` | Array<String> | — | — | — | — |
| `tokenHash` | String | obligatorio, único, `select:false` | — | — | — |
| `updatedAt` | Date | — | — | — | — |

Índices declarados:

- `{"name":1}` · unique=true
- `{"tokenHash":1}` · unique=true
- `{"active":1}`
- `{"expiresAt":1}`

