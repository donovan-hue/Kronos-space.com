# KRONOS SOCIAL

## Identidad

**Nombre:** `kronos-social`
**Proyecto:** Kronos Space
**Ruta:** `.agents/skills/kronos-social/SKILL.md`
**Tipo:** Social Network Architecture & Development Skill
**Estado:** Producción

---

# 1. PROPÓSITO

Esta skill controla toda la funcionalidad de la red social de Kronos Space.

Su responsabilidad comprende:

* Feed;
* publicaciones;
* perfiles;
* exploración;
* comentarios;
* interacciones;
* mensajes privados;
* notificaciones;
* creación de publicaciones;
* configuración relacionada con la red social;
* navegación social;
* integración frontend ↔ backend;
* actualización de datos;
* comunicación en tiempo real.

Toda funcionalidad debe utilizar datos y servicios reales del proyecto.

---

# 2. ARQUITECTURA SOCIAL

La arquitectura debe seguir:

```text
Social Screen
      ↓
Social Component
      ↓
Social Hook
      ↓
Social Service
      ↓
API
      ↓
Backend
      ↓
Database
```

Para funcionalidades en tiempo real:

```text
Social Screen
      ↓
Hook
      ↓
Socket Manager
      ↓
Socket.IO
      ↓
Backend
```

No colocar lógica de negocio compleja directamente dentro de las pantallas.

---

# 3. ÁREAS SOCIALES

La red social está compuesta por:

```text
HOME / FEED
EXPLORE
PROFILE
POST
COMMENTS
MESSAGES
NOTIFICATIONS
CREATE POST
SETTINGS
```

Todas deben quedar conectadas con el backend correspondiente.

---

# 4. FEED

El Feed debe utilizar publicaciones reales.

Flujo:

```text
Request Feed
      ↓
Backend
      ↓
Posts
      ↓
Frontend State
      ↓
Post Components
```

Debe soportar:

* carga inicial;
* actualización;
* estado vacío;
* errores;
* publicaciones nuevas;
* interacción con publicaciones;
* comentarios;
* información del autor.

Nunca utilizar publicaciones ficticias como sustituto de la API.

---

# 5. PUBLICACIONES

Cada publicación debe manejar como mínimo:

```text
author
content
media
createdAt
likes
comments
```

La estructura exacta debe respetar el modelo y respuesta reales del backend.

El componente de publicación no debe asumir propiedades inexistentes.

Antes de renderizar datos opcionales:

```javascript
const authorName = post?.author?.name ?? "Usuario";
```

Las operaciones deben confirmar el resultado del backend.

---

# 6. LIKE

El Like debe seguir:

```text
User Action
     ↓
Validation
     ↓
API Request
     ↓
Backend
     ↓
Database
     ↓
Response
     ↓
Frontend State
```

Los cambios optimistas solamente deben utilizarse cuando puedan revertirse correctamente.

Si falla la petición:

```text
Optimistic State
      ↓
Request Failed
      ↓
Rollback
```

Nunca mostrar permanentemente un Like que el backend rechazó.

---

# 7. COMENTARIOS

Los comentarios deben estar conectados con publicaciones específicas.

Flujo:

```text
Post
 ↓
Load Comments
 ↓
Render
 ↓
Create Comment
 ↓
Backend
 ↓
Update Comments
```

Validar:

* publicación válida;
* usuario autenticado;
* contenido;
* longitud;
* respuesta del servidor.

No permitir comentarios vacíos.

---

# 8. PERFIL

El perfil debe separar:

```text
Profile Information
Posts
Followers
Following
Actions
```

Debe soportar estados:

```text
loading
success
empty
error
```

La información del perfil debe obtenerse desde backend.

No duplicar datos del usuario en múltiples estados globales sin necesidad.

---

# 9. FOLLOW

Las acciones de seguimiento deben utilizar el endpoint real.

Flujo:

```text
Follow / Unfollow
       ↓
API
       ↓
Backend
       ↓
Database
       ↓
Response
       ↓
UI Update
```

La interfaz debe reflejar el resultado confirmado por el servidor.

---

# 10. EXPLORE

Explore debe permitir descubrir contenido y usuarios mediante los servicios reales del proyecto.

Debe contemplar:

```text
Search
 ↓
Validation
 ↓
Request
 ↓
Results
```

La búsqueda debe manejar:

* texto vacío;
* loading;
* resultados;
* ausencia de resultados;
* errores;
* cancelación o debounce cuando corresponda.

No ejecutar una petición por cada pulsación cuando el endpoint no lo requiera.

---

# 11. CREACIÓN DE PUBLICACIONES

El proceso debe ser:

```text
Create Screen
      ↓
Validate Form
      ↓
Select Media
      ↓
Validate Media
      ↓
Upload
      ↓
Create Post
      ↓
Backend Confirmation
      ↓
Update Feed
```

El botón de publicación debe bloquearse durante el envío.

Debe evitarse la creación duplicada por doble clic.

---

# 12. MULTIMEDIA SOCIAL

Las publicaciones multimedia deben utilizar el sistema de almacenamiento definido por Kronos.

Validar en frontend:

```text
file exists
MIME type
extension
size
```

El backend debe realizar nuevamente las validaciones.

El frontend debe mostrar:

```text
preview
uploading
success
error
```

No considerar el archivo subido hasta recibir confirmación.

---

# 13. MENSAJES PRIVADOS

Los mensajes privados deben funcionar con:

```text
REST/API
+
Socket.IO
```

El historial inicial debe cargarse mediante backend.

Después:

```text
Socket Connection
       ↓
Message Event
       ↓
State Update
       ↓
UI
```

No depender exclusivamente de Socket.IO para recuperar conversaciones anteriores.

---

# 14. CONVERSACIONES

Una conversación debe mantener:

```text
conversationId
participants
messages
lastMessage
timestamps
```

La estructura exacta debe respetar el backend.

No crear conversaciones duplicadas cuando ya existe una conversación válida entre los participantes según las reglas del backend.

---

# 15. ENVÍO DE MENSAJES

Flujo:

```text
Compose
 ↓
Validate
 ↓
Send
 ↓
Backend
 ↓
Socket/Event
 ↓
Update UI
```

Validar:

* conversación;
* usuario;
* contenido;
* longitud;
* estado de conexión.

El mensaje debe marcarse como enviado únicamente cuando el sistema confirme la operación.

---

# 16. RECEPCIÓN DE MENSAJES

Los eventos Socket.IO deben:

1. validar el evento;
2. identificar la conversación;
3. evitar duplicados;
4. actualizar el estado;
5. actualizar indicadores necesarios.

Los listeners deben limpiarse al desmontar componentes.

Nunca registrar el mismo listener repetidamente.

---

# 17. NOTIFICACIONES

Las notificaciones sociales deben manejar:

```text
new notification
read notification
notification history
unread count
```

El contador debe mantenerse sincronizado con el backend.

Los eventos en tiempo real no deben generar duplicados.

Para evitar duplicados utilizar identificadores únicos de notificación.

---

# 18. TIPOS DE NOTIFICACIÓN

El frontend debe poder representar las notificaciones soportadas por backend, por ejemplo:

```text
like
comment
follow
message
system
```

La lista definitiva depende de los eventos y modelos reales de Kronos.

No inventar tipos que no existan en backend.

---

# 19. ESTADO SOCIAL

El estado debe dividirse por responsabilidad.

Conceptualmente:

```text
Social State
├── currentUser
├── feed
├── profile
├── comments
├── conversations
├── messages
└── notifications
```

Evitar un único estado gigante para toda la aplicación.

---

# 20. SINCRONIZACIÓN

Cuando una acción modifique datos sociales:

```text
Backend Confirmation
        ↓
Update Local State
        ↓
Affected Components
        ↓
UI
```

No recargar toda la aplicación para cada operación.

Actualizar solamente los datos afectados cuando sea seguro hacerlo.

---

# 21. PAGINACIÓN

Cuando los endpoints soporten paginación, el frontend debe respetarla.

Ejemplo conceptual:

```text
Page 1
 ↓
Load More
 ↓
Page 2
 ↓
Append
 ↓
Page 3
```

No sobrescribir publicaciones anteriores al cargar páginas posteriores.

Evitar duplicados mediante identificadores únicos.

---

# 22. CARGA INCREMENTAL

Para listas largas:

```text
Initial Data
      ↓
Render
      ↓
Load More
      ↓
Append
```

Debe existir protección contra múltiples solicitudes simultáneas.

Ejemplo:

```javascript
if (loadingMore || !hasMore) {
    return;
}
```

---

# 23. ELIMINACIÓN

Las acciones destructivas deben requerir la autorización correspondiente.

Flujo:

```text
User Action
 ↓
Confirmation
 ↓
API
 ↓
Backend Authorization
 ↓
Delete
 ↓
UI Update
```

La autorización definitiva siempre pertenece al backend.

---

# 24. EDICIÓN

Cuando una publicación o dato social sea editable:

```text
Load Existing Data
 ↓
Edit
 ↓
Validate
 ↓
Submit
 ↓
Backend
 ↓
Update UI
```

No perder datos existentes cuando solamente se modifica un campo.

---

# 25. ERRORES SOCIALES

Todos los módulos deben manejar:

```text
401
403
404
409
422
429
500
Network Error
```

Los códigos concretos deben adaptarse a los contratos reales del backend.

El usuario debe recibir mensajes comprensibles.

---

# 26. AUTENTICACIÓN

Las acciones sociales privadas requieren una sesión válida.

Antes de realizar:

```text
create post
like
comment
follow
message
notification actions
settings changes
```

debe existir el contexto de autenticación correspondiente.

El backend sigue siendo la autoridad final.

---

# 27. PERMISOS

El frontend puede ocultar acciones no disponibles:

```javascript
if (!canEdit) {
    return null;
}
```

pero nunca debe considerar esto una medida de seguridad.

El backend debe validar:

```text
owner
role
permission
resource
action
```

según corresponda.

---

# 28. DATOS DEL USUARIO

Los datos del usuario deben centralizarse.

Evitar almacenar copias contradictorias del mismo usuario en:

```text
feed
profile
messages
notifications
```

Cuando sea necesario sincronizar información:

```text
Canonical User State
        ↓
Consumers
```

---

# 29. TIEMPO REAL

Los eventos sociales deben tener nombres consistentes con el backend.

Conceptualmente:

```text
post.created
post.updated
post.deleted

comment.created
comment.deleted

notification.created

message.created
message.read

follow.created
follow.removed
```

Los nombres definitivos deben coincidir exactamente con Socket.IO del backend.

No crear eventos frontend que el servidor no emita.

---

# 30. DUPLICADOS

Antes de insertar datos recibidos:

```javascript
const exists = items.some(
    (item) => item.id === incoming.id
);

if (!exists) {
    setItems((current) => [...current, incoming]);
}
```

La comparación debe utilizar el identificador real del modelo.

Esto aplica especialmente a:

* mensajes;
* notificaciones;
* publicaciones;
* comentarios.

---

# 31. DISEÑO SOCIAL

La identidad visual social debe utilizar:

```text
Deep Black
+
Chrome Mirror / Silver
```

Los elementos principales deben mantener consistencia:

```text
buttons
borders
inputs
icons
bars
cards
highlights
```

La apariencia debe permanecer minimalista.

---

# 32. COMPONENTES SOCIALES

Preferir componentes reutilizables:

```text
PostCard
CommentItem
ProfileHeader
UserCard
FollowButton
LikeButton
CommentButton
MessageBubble
ConversationItem
NotificationItem
CreatePostForm
```

Los nombres exactos pueden adaptarse al código existente.

No duplicar componentes que ya tengan una implementación funcional.

---

# 33. VALIDACIÓN FRONTEND

Validar antes de enviar:

```text
required fields
length
format
allowed values
file constraints
```

Pero recordar:

```text
Frontend validation
        ≠
Backend authorization
```

---

# 34. RENDIMIENTO

Evitar:

* recargar el Feed completo después de cada Like;
* solicitudes duplicadas;
* listeners duplicados;
* renderizados innecesarios;
* imágenes innecesariamente grandes;
* estados globales excesivos.

Las optimizaciones deben preservar la estabilidad.

---

# 35. SEGURIDAD

Nunca colocar en frontend:

```text
JWT signing secret
Database credentials
MongoDB URI
OpenAI API key
Google AI API key
private storage credentials
```

Las claves permanecen en backend.

---

# 36. INTEGRACIÓN CON LAS 18 PANTALLAS

Las funcionalidades sociales deben conectarse con las pantallas correspondientes del proyecto.

El resultado esperado es:

```text
Authentication
      ↓
Home
      ↓
Explore
      ↓
Profile
      ↓
Post
      ↓
Comments
      ↓
Messages
      ↓
Notifications
      ↓
Create
      ↓
Settings
```

Cada pantalla debe utilizar los servicios correspondientes y no funcionar como módulo aislado.

---

# 37. REGLA DE BACKEND REAL

Nunca implementar:

```javascript
const fakePosts = [...]
```

como sustituto del backend.

Nunca:

```javascript
setTimeout(() => {
    setMessages(...)
}, 1000);
```

para simular comunicación real.

Nunca inventar respuestas de API.

Toda información persistente debe provenir del sistema real.

---

# 38. REFACTORIZACIÓN

Cuando exista código social duplicado:

1. localizar todas las referencias;
2. identificar comportamiento común;
3. extraer componente/hook/service;
4. reemplazar duplicados;
5. comprobar imports;
6. comprobar comportamiento;
7. ejecutar build.

No romper funcionalidades existentes durante la refactorización.

---

# 39. VALIDACIÓN FINAL

Antes de considerar una funcionalidad social terminada:

```text
✓ Feed
✓ Explore
✓ Profile
✓ Posts
✓ Comments
✓ Likes
✓ Follow
✓ Create Post
✓ Messages
✓ Notifications
✓ Authentication
✓ Authorization
✓ Socket.IO
✓ Multimedia
✓ Loading
✓ Empty states
✓ Errors
✓ Responsive UI
✓ Production build
```

---

# 40. OBJETIVO FINAL

Kronos Social debe funcionar como una red social real y completamente integrada:

```text
                 KRONOS SOCIAL
                       │
        ┌──────────────┼──────────────┐
        │              │              │
       FEED         PROFILE        EXPLORE
        │              │              │
        ├──── POSTS ───┤              │
        │              │              │
        ├── COMMENTS ──┤              │
        │              │              │
        ├──── LIKES ───┤              │
        │              │              │
        ├──── FOLLOW ──┤              │
        │                             │
        ├── MESSAGES                  │
        │                             │
        ├── NOTIFICATIONS             │
        │                             │
        └── CREATE POST ──────────────┘
                       │
                       ▼
                 KRONOS BACKEND
                       │
             ┌─────────┴─────────┐
             ▼                   ▼
          MongoDB            Socket.IO
```

La prioridad es:

**datos reales → integración backend → tiempo real → seguridad → estabilidad → experiencia social → producción.**

