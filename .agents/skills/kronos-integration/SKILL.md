# KRONOS INTEGRATION

## 1. IDENTIDAD

**Name:** `kronos-integration`
**Project:** Kronos Space
**Path:** `.agents/skills/kronos-integration/SKILL.md`
**Type:** Full-Stack Integration & End-to-End Validation Skill
**Status:** Producción

---

## 2. PROPÓSITO

Esta skill tiene como objetivo garantizar que todas las partes de **Kronos Space** funcionen como un único sistema.

Debe validar y conectar:

* Frontend
* Backend
* MongoDB Atlas
* Autenticación
* Autorización
* API
* Socket.IO
* Multimedia
* AI Media
* AI Script
* Social Network
* Vercel
* Render
* Configuración de producción
* Las 18 pantallas

Su función principal es detectar y resolver problemas de integración.

---

## 3. REGLA PRINCIPAL

La integración real debe seguir este principio:

```text
USUARIO
↓
KRONOS FRONTEND
↓
API / SOCKET.IO
↓
KRONOS BACKEND
↓
SERVICES / CONTROLLERS
↓
MONGOOSE
↓
MONGODB ATLAS
```

Para funciones de inteligencia artificial:

```text
USUARIO
↓
FRONTEND
↓
KRONOS BACKEND
↓
AI SERVICE
↓
AI PROVIDER
↓
KRONOS BACKEND
↓
MONGODB / STORAGE
↓
FRONTEND
```

Nunca se debe conectar directamente el frontend con servicios privados que deban permanecer protegidos en backend.

---

## 4. ALCANCE

Esta skill trabaja únicamente sobre integración.

Debe evitar:

* Cambiar el alcance del proyecto.
* Crear funcionalidades que no estén contempladas.
* Reemplazar arquitectura existente sin necesidad.
* Crear endpoints ficticios.
* Crear modelos ficticios.
* Crear eventos Socket.IO ficticios.
* Inventar variables de entorno.
* Duplicar lógica existente.

---

## 5. PRINCIPIO NO ROMPER

Antes de modificar cualquier integración:

1. Identificar qué existe.
2. Identificar qué consume esa pieza.
3. Identificar quién depende de ella.
4. Confirmar el contrato real.
5. Aplicar el cambio mínimo necesario.
6. Validar los consumidores afectados.

La prioridad es:

```text
NO ROMPER LO QUE YA FUNCIONA
```

---

## 6. MAPA GENERAL DE KRONOS

La arquitectura global debe mantenerse conceptualmente así:

```text
                    KRONOS SPACE
                           │
             ┌─────────────┼─────────────┐
             │             │             │
          SOCIAL        AI MEDIA      AI SCRIPT
             │             │             │
             └─────────────┼─────────────┘
                           │
                     KRONOS BACKEND
                           │
          ┌────────────────┼────────────────┐
          │                │                │
       MongoDB          Socket.IO       AI Providers
          │                │                │
          └────────────────┼────────────────┘
                           │
                    FRONTEND / USERS
```

---

## 7. FRONTEND → BACKEND

Cada función del frontend debe tener una integración real.

Validar:

* URL.
* Método HTTP.
* Headers.
* Autenticación.
* Body.
* Query parameters.
* Path parameters.
* Response.
* HTTP status.
* Error response.
* Loading state.
* Success state.
* Error state.

Nunca asumir que una función está conectada solamente porque existe un botón o formulario.

---

## 8. BACKEND → DATABASE

Las operaciones de datos deben seguir:

```text
Route
↓
Controller
↓
Service
↓
Model
↓
MongoDB Atlas
```

Cuando la arquitectura existente utilice una variante válida, debe respetarse.

No debe agregarse acceso directo a MongoDB desde el frontend.

---

## 9. CONTRATOS API

Todo contrato debe verificarse contra el código real.

Debe comprobarse:

```text
METHOD
ENDPOINT
AUTH
PARAMETERS
REQUEST BODY
RESPONSE
STATUS CODES
ERROR FORMAT
```

Ejemplo conceptual:

```text
Frontend
POST /api/...
        ↓
Backend Route
        ↓
Controller
        ↓
Service
        ↓
Database / Provider
```

El endpoint real siempre debe obtenerse del repositorio.

Nunca inventar endpoints para completar una integración.

---

## 10. AUTENTICACIÓN

Validar el flujo completo:

```text
REGISTER
↓
LOGIN
↓
TOKEN / SESSION
↓
FRONTEND STORAGE / SESSION
↓
AUTH REQUEST
↓
BACKEND MIDDLEWARE
↓
USER
```

Comprobar:

* Registro.
* Login.
* Hash de contraseña.
* JWT/session.
* Expiración.
* Middleware.
* Usuario autenticado.
* Rutas protegidas.
* Logout.
* Errores de autenticación.

---

## 11. AUTORIZACIÓN

No basta con comprobar que el usuario está autenticado.

También debe verificarse:

```text
¿EL USUARIO TIENE PERMISO?
```

Validar especialmente:

* Editar recursos propios.
* Eliminar recursos propios.
* Modificar perfil.
* Acceder a conversaciones.
* Acceder a contenido privado.
* Crear contenido.
* Ejecutar funciones AI.
* Acceder a información protegida.

---

## 12. MONGODB ATLAS

Validar la cadena:

```text
Frontend
↓
Backend
↓
Mongoose
↓
MongoDB Atlas
```

Comprobar:

* Conexión.
* Modelos reales.
* Schemas.
* Relaciones.
* Queries.
* Updates.
* Deletes.
* Índices.
* Paginación.
* Validaciones.
* Manejo de errores.

Nunca inventar:

* Collections.
* Models.
* Fields.
* References.

---

## 13. SOCIAL NETWORK

La integración social debe cubrir:

* Feed.
* Posts.
* Likes.
* Comments.
* Profiles.
* Follow.
* Explore.
* Create Post.
* Messages.
* Conversations.
* Notifications.
* Settings.

Cada acción visual debe tener un flujo real cuando corresponda.

---

## 14. FEED

Validar:

```text
Feed Screen
↓
Frontend Hook / Service
↓
API
↓
Backend
↓
MongoDB
↓
Posts
↓
Frontend
```

Comprobar:

* Loading.
* Empty state.
* Error.
* Pagination.
* Refresh.
* Duplicates.
* Ordering.
* Authentication.

---

## 15. POSTS

Validar:

```text
Create
Read
Update
Delete
Like
Comment
```

Debe existir consistencia entre:

* UI.
* API.
* Backend.
* Database.

No permitir que el frontend muestre un estado que contradiga el backend.

---

## 16. COMMENTS

Validar:

* Obtener comentarios.
* Crear comentario.
* Eliminar comentario cuando corresponda.
* Usuario propietario.
* Contador.
* Actualización de UI.
* Errores.
* Paginación cuando exista.

---

## 17. PROFILE

Validar:

* Obtener perfil.
* Datos públicos.
* Datos privados.
* Posts.
* Followers.
* Following.
* Follow/unfollow.
* Edición de perfil.
* Imagen/avatar cuando corresponda.

---

## 18. EXPLORE

Validar:

```text
Search / Explore
↓
Frontend
↓
API
↓
Backend
↓
MongoDB
↓
Results
```

Evitar búsquedas falsas o datos hardcodeados en producción.

---

## 19. MESSAGES

La mensajería debe funcionar mediante:

```text
User A
↓
Frontend
↓
Socket.IO / API
↓
Backend
↓
Conversation
↓
User B
```

Validar:

* Connection.
* Authentication.
* Rooms.
* Conversations.
* Send message.
* Receive message.
* Persistence.
* Reconnection.
* Cleanup.
* Duplicate events.

---

## 20. SOCKET.IO

Los nombres de eventos deben ser exactamente los existentes en el proyecto.

Validar:

* Connection.
* Disconnect.
* Authentication.
* Rooms.
* Emit.
* Listen.
* Cleanup.
* Reconnect.
* Error handling.

Nunca inventar nombres de eventos para solucionar un problema sin revisar primero el backend.

---

## 21. NOTIFICATIONS

Validar:

```text
EVENT
↓
BACKEND
↓
NOTIFICATION
↓
DATABASE
↓
SOCKET/API
↓
FRONTEND
```

Debe mantenerse sincronizado:

* Notification count.
* Notification list.
* Read state.
* Real-time updates.

---

## 22. MULTIMEDIA

Validar:

```text
File
↓
Frontend
↓
Upload
↓
Backend
↓
Multer / Storage
↓
Database
↓
URL
↓
Frontend
```

Comprobar:

* MIME type.
* File size.
* Upload errors.
* Storage.
* URLs.
* Cleanup.
* Persistence.

No depender de almacenamiento local del servidor para recursos que deban sobrevivir a reinicios o redeploys.

---

## 23. AI MEDIA

La integración debe respetar:

```text
AI Media UI
↓
Frontend
↓
Backend
↓
AI Service
↓
Provider
↓
Processing
↓
Storage / MongoDB
↓
Frontend
```

Validar:

* Prompt.
* Parameters.
* Authentication.
* Generation.
* Processing state.
* Completed state.
* Failed state.
* Results.
* History.
* Errors.
* Cost/limits.

---

## 24. AI SCRIPT

La integración debe respetar:

```text
Script UI
↓
Frontend
↓
Backend
↓
Script Service
↓
AI Provider
↓
Normalization
↓
MongoDB
↓
Frontend
```

Validar:

* Form.
* Parameters.
* Validation.
* Generation.
* Structured response.
* Persistence.
* History.
* Errors.
* Versions cuando existan.
* Integration with AI Media/Social when implemented.

---

## 25. AI SECURITY

Las credenciales de proveedores deben permanecer en backend.

Nunca permitir:

```text
NEXT_PUBLIC_OPENAI_KEY
VITE_OPENAI_KEY
```

ni equivalentes.

Las API keys no deben aparecer en:

* Frontend.
* GitHub.
* Logs.
* Responses.
* Screenshots.
* Public configuration.

---

## 26. FRONTEND STATES

Toda integración importante debe contemplar:

```text
IDLE
↓
LOADING
↓
SUCCESS
```

y:

```text
IDLE
↓
LOADING
↓
ERROR
```

Cuando exista procesamiento asíncrono:

```text
QUEUED
↓
PROCESSING
↓
COMPLETED
```

o:

```text
QUEUED
↓
PROCESSING
↓
FAILED
```

---

## 27. ERROR CONTRACT

Los errores del backend deben poder ser interpretados correctamente por el frontend.

Validar:

```text
400
401
403
404
409
422
429
500
502
503
```

cuando sean utilizados realmente por el sistema.

También:

* Timeout.
* Network error.
* Provider error.
* Session error.
* Database error.

No ocultar errores importantes detrás de mensajes genéricos cuando el sistema necesite información específica para recuperarse.

---

## 28. PAGINACIÓN

Cuando exista contenido paginado:

```text
Frontend
↓
page / cursor
↓
Backend
↓
Database
↓
Results
↓
Frontend
```

Validar:

* First page.
* Next page.
* End of results.
* Duplicate prevention.
* Loading.
* Refresh.
* Error recovery.

---

## 29. 18 PANTALLAS

La integración final debe comprobar las **18 pantallas reales del proyecto**.

Cada pantalla debe clasificarse como:

```text
CONNECTED
PARTIAL
DISCONNECTED
BROKEN
```

Una pantalla no se considera terminada solamente por tener UI.

Debe comprobarse:

```text
SCREEN
↓
COMPONENT
↓
HOOK / STATE
↓
SERVICE
↓
API / SOCKET
↓
BACKEND
↓
DATABASE / PROVIDER
```

cuando corresponda.

---

## 30. NAVEGACIÓN

Validar:

* Routes.
* Protected routes.
* Public routes.
* Redirects.
* Login flow.
* Logout flow.
* Deep links.
* Navigation state.
* Missing routes.
* Broken links.

No crear rutas duplicadas.

---

## 31. FRONTEND ↔ BACKEND TYPES

Cuando existan tipos, interfaces, schemas o contratos compartidos, deben mantenerse sincronizados.

Detectar:

* Fields missing.
* Fields renamed.
* Wrong types.
* Wrong optional values.
* Wrong response shape.
* Deprecated fields.

No inventar campos para hacer desaparecer un error.

---

## 32. VARIABLES DE ENTORNO

Las variables utilizadas deben corresponder exactamente con las que consume el código.

Validar:

```text
Development
Production
Vercel
Render
Local
```

Nunca crear nombres alternativos solamente para solucionar una configuración rota sin revisar primero el código.

---

## 33. VERCEL ↔ RENDER

La arquitectura de despliegue debe mantenerse conceptualmente:

```text
Vercel
Frontend
   ↓
Render
Backend
   ↓
MongoDB Atlas
```

Validar:

* Frontend API URL.
* Backend CORS.
* Production domain.
* Environment variables.
* HTTPS.
* Backend availability.
* Database connectivity.

Nunca dejar `localhost` o `127.0.0.1` como endpoint de producción.

---

## 34. CORS

Validar:

```text
Frontend Origin
↓
Backend CORS
↓
Allowed Origin
```

Comprobar:

* Development.
* Production.
* Credentials cuando correspondan.
* Socket.IO CORS.

No utilizar `*` indiscriminadamente cuando el sistema requiera credenciales.

---

## 35. BUILD INTEGRATION

Antes de considerar una integración terminada:

```bash
npm install
npm run build
```

y cuando los scripts existan:

```bash
npm start
```

También validar:

```bash
npm run dev
```

para desarrollo cuando corresponda.

---

## 36. DEPENDENCIAS

Comprobar que cada dependencia utilizada:

* Está instalada.
* Está importada correctamente.
* Tiene una versión compatible.
* Está incluida en el entorno correcto.
* No está duplicada innecesariamente.

No agregar dependencias solamente para ocultar problemas de arquitectura.

---

## 37. INTEGRATION TEST

Cada flujo crítico debe probarse de extremo a extremo.

Formato:

```text
ACTION
↓
REQUEST
↓
BACKEND
↓
DATABASE / PROVIDER
↓
RESPONSE
↓
UI UPDATE
```

Ejemplo:

```text
Create Post
↓
POST
↓
Auth Middleware
↓
Controller
↓
Service
↓
MongoDB
↓
Response
↓
Feed Update
```

---

## 38. REGRESSION CHECK

Después de modificar una integración, comprobar los módulos relacionados.

Especialmente:

```text
Auth
Social
Messages
Notifications
Uploads
AI Media
AI Script
MongoDB
Socket.IO
Navigation
```

No asumir que un cambio aislado no afecta otras áreas.

---

## 39. CRITERIOS DE APROBACIÓN

Una integración se considera terminada únicamente cuando:

* El frontend utiliza contratos reales.
* El backend responde correctamente.
* MongoDB funciona correctamente.
* Auth funciona.
* Authorization funciona.
* Socket.IO funciona cuando corresponde.
* Multimedia funciona cuando corresponde.
* AI Media funciona cuando corresponde.
* AI Script funciona cuando corresponde.
* Los errores son manejados.
* Las 18 pantallas están conectadas según su función.
* No existen endpoints ficticios.
* No existen datos falsos de producción.
* No existen secretos expuestos.
* Build funciona.
* Deploy puede validarse.
* No se rompió funcionalidad existente.

---

## 40. OBJETIVO FINAL

El objetivo de `kronos-integration` es convertir las diferentes partes de **Kronos Space** en un sistema realmente conectado.

La arquitectura final debe conservar:

```text
KRONOS SPACE
│
├── SOCIAL
│
├── AI MEDIA
│
└── AI SCRIPT
        │
        ↓
     FRONTEND
        │
        ↓
     BACKEND
        │
   ┌────┼────┐
   ↓    ↓    ↓
Mongo Socket AI
DB     .IO Providers
```

La regla final es:

```text
NO FAKE CONNECTIONS
NO INVENTED CONTRACTS
NO EXPOSED SECRETS
NO BROKEN FLOWS
NO SCOPE CHANGES
NO UNNECESSARY REFACTORING

REAL FRONTEND
+
REAL BACKEND
+
REAL DATABASE
+
REAL SOCKET.IO
+
REAL AI
+
REAL DEPLOYMENT
=
KRONOS SPACE PRODUCTION
```

**Prioridad absoluta:**

> NO ROMPER LO QUE YA FUNCIONA.

> CONECTAR LO QUE FALTA.

> VALIDAR TODO EL FLUJO END-TO-END.

> NO DECLARAR TERMINADO SIN EVIDENCIA.

