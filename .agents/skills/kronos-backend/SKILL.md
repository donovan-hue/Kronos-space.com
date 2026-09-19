---

name: kronos-backend
description: Backend principal de Kronos Space. Diseña, implementa, conecta, depura y mantiene la API Express/Node.js, autenticación, MongoDB, Socket.IO, multimedia e integraciones de IA siguiendo la arquitectura oficial de Kronos.
license: Proprietary
compatibility: Node.js 20+, Express 5+, MongoDB/Mongoose 8+, Socket.IO 4+
environment: Node.js, Express, MongoDB Atlas, Mongoose, Socket.IO, Render
author: Kronos Space
version: 1.0.0
tags:

* kronos
* backend
* node
* express
* mongodb
* mongoose
* socket.io
* api
* security
* production
  paths:
* server/**
* server/src/**
  allowed-tools:
* read
* write
* search

---

# KRONOS BACKEND

## 1. PROPÓSITO

Esta Skill controla todo el desarrollo backend de **Kronos Space**.

Su responsabilidad es mantener un backend:

* funcional;
* seguro;
* modular;
* mantenible;
* conectado con MongoDB;
* conectado con el frontend;
* preparado para producción;
* compatible con Render;
* preparado para Socket.IO;
* preparado para las funciones de IA;
* preparado para multimedia;
* coherente con la arquitectura oficial de Kronos.

El backend NO debe convertirse en un conjunto de rutas aisladas.

Cada funcionalidad debe formar parte de una arquitectura coherente.

---

# 2. ALCANCE DEL BACKEND

El backend de Kronos debe soportar:

1. Autenticación.
2. Autorización.
3. Usuarios.
4. Perfiles.
5. Búsqueda de usuarios.
6. Seguidores.
7. Feed social.
8. Publicaciones.
9. Likes.
10. Comentarios.
11. Mensajes privados.
12. Socket.IO.
13. Notificaciones.
14. Multimedia.
15. Generación de imágenes.
16. Generación de videos.
17. Generación de guiones.
18. Historial de generación.
19. Configuración de usuario.
20. Integraciones externas.
21. Logs.
22. Manejo global de errores.
23. Validación.
24. Seguridad.
25. Preparación para producción.

El alcance funcional oficial de Kronos permanece congelado.

No crear funcionalidades fuera del proyecto sin autorización explícita.

---

# 3. ARQUITECTURA CANÓNICA

La arquitectura backend oficial es:

```text
Frontend
   ↓
HTTP / WebSocket
   ↓
Express
   ↓
Middleware
   ↓
Route
   ↓
Controller / Handler
   ↓
Service
   ↓
Mongoose Model
   ↓
MongoDB Atlas
```

Para eventos en tiempo real:

```text
Frontend
   ↓
Socket.IO
   ↓
Authentication
   ↓
Room / Event Handler
   ↓
Service
   ↓
MongoDB
   ↓
Socket Event
   ↓
Frontend
```

Para IA:

```text
Frontend
   ↓
API
   ↓
Auth
   ↓
Validation
   ↓
AI Controller
   ↓
AI Service
   ↓
External AI Provider
   ↓
Result
   ↓
Database / Storage
   ↓
Frontend
```

Nunca saltarse capas sin una razón técnica clara.

---

# 4. ESTRUCTURA DEL BACKEND

La estructura preferida es modular por dominio.

Ejemplo:

```text
server/
├── src/
│   ├── server.js
│   ├── app.js
│   │
│   ├── config/
│   │
│   ├── middleware/
│   │
│   ├── modules/
│   │   ├── auth/
│   │   ├── users/
│   │   ├── posts/
│   │   ├── messages/
│   │   ├── notifications/
│   │   ├── ai/
│   │   └── media/
│   │
│   ├── services/
│   ├── sockets/
│   ├── utils/
│   └── errors/
│
├── package.json
└── .env
```

No mover archivos existentes únicamente por estética.

Antes de reorganizar una carpeta existente:

1. comprobar imports;
2. comprobar rutas;
3. comprobar referencias;
4. comprobar deployment;
5. comprobar tests;
6. comprobar frontend.

La estabilidad tiene prioridad sobre una refactorización estética.

---

# 5. SERVER.JS

`server.js` debe encargarse principalmente de iniciar el servidor.

Responsabilidades:

* cargar variables de entorno;
* crear/inicializar aplicación;
* conectar infraestructura necesaria;
* inicializar Socket.IO cuando corresponda;
* escuchar en el puerto configurado.

Evitar colocar lógica de negocio en `server.js`.

No convertir `server.js` en un archivo monolítico.

---

# 6. APP.JS

Cuando exista una separación entre `app.js` y `server.js`, `app.js` debe concentrar la configuración HTTP de Express.

Debe incluir, según corresponda:

```text
helmet
compression
cors
express.json
express.urlencoded
routes
404 handler
global error handler
```

Orden recomendado:

```text
security middleware
↓
body parsing
↓
CORS
↓
application middleware
↓
routes
↓
404
↓
global error handler
```

El orden de middleware importa.

No colocar el error handler antes de las rutas.

---

# 7. VARIABLES DE ENTORNO

Nunca introducir secretos directamente en código.

Ejemplos:

```env
PORT=
MONGODB_URI=
JWT_SECRET=
OPENAI_API_KEY=
GOOGLE_API_KEY=
CLIENT_URL=
```

Los nombres reales existentes en el proyecto tienen prioridad.

Antes de crear una nueva variable:

1. buscar si ya existe;
2. reutilizarla si representa el mismo recurso;
3. verificar Render;
4. verificar Vercel si el frontend necesita una variable equivalente.

Nunca duplicar secretos innecesariamente.

Nunca imprimir secretos en logs.

---

# 8. MONGODB

MongoDB Atlas es la base de datos oficial de Kronos.

Mongoose es la capa oficial de acceso.

Reglas:

* utilizar schemas claros;
* utilizar índices cuando correspondan;
* validar referencias;
* evitar consultas innecesarias;
* evitar N+1 queries;
* utilizar `lean()` cuando sea apropiado;
* limitar resultados;
* paginar colecciones grandes;
* no devolver campos privados innecesarios.

La base de datos debe conservar consistencia.

---

# 9. MODELOS

Cada modelo debe representar una entidad real.

Ejemplos:

```text
User
Post
Message
Conversation
Notification
Generation
Media
```

No crear modelos duplicados para la misma entidad.

Antes de crear un modelo:

1. buscar modelos existentes;
2. revisar referencias;
3. revisar rutas;
4. revisar frontend;
5. reutilizar si ya existe.

Los nombres de modelos deben mantenerse consistentes.

---

# 10. RUTAS

Las rutas deben representar recursos de la API.

Ejemplos:

```text
GET    /api/posts
GET    /api/posts/:postId

POST   /api/posts
POST   /api/posts/:postId/like
POST   /api/posts/:postId/comments
```

Las rutas deben ser:

* predecibles;
* consistentes;
* REST-friendly;
* protegidas cuando corresponda;
* validadas.

No colocar lógica empresarial compleja directamente en las rutas si existe una capa de servicio adecuada.

---

# 11. AUTENTICACIÓN

La autenticación actual de Kronos utiliza JWT.

El flujo esperado es:

```text
Login
↓
JWT
↓
Frontend
↓
Authorization: Bearer TOKEN
↓
Auth Middleware
↓
req.user
↓
Protected Route
```

Formato:

```http
Authorization: Bearer <token>
```

El middleware de autenticación debe:

1. obtener el header;
2. verificar el formato;
3. extraer el token;
4. verificar JWT;
5. validar identidad;
6. colocar el usuario autenticado en `req.user`;
7. rechazar tokens inválidos.

Nunca confiar en un `userId` enviado por el frontend cuando la identidad puede obtenerse del JWT.

---

# 12. AUTORIZACIÓN

Autenticación y autorización son conceptos diferentes.

Autenticación:

```text
¿Quién eres?
```

Autorización:

```text
¿Puedes hacer esto?
```

Ejemplo:

Un usuario autenticado no necesariamente puede editar una publicación de otro usuario.

Siempre comprobar propiedad cuando corresponda.

---

# 13. VALIDACIÓN

Toda entrada externa debe validarse.

Fuentes:

* `req.body`;
* `req.params`;
* `req.query`;
* headers;
* eventos Socket.IO;
* archivos.

Validar:

* tipos;
* longitud;
* formato;
* IDs;
* valores permitidos;
* existencia;
* permisos.

Nunca confiar en la validación del frontend.

El backend siempre debe validar nuevamente.

---

# 14. OBJECTID

Para IDs MongoDB utilizar validación segura.

Ejemplo:

```js
mongoose.Types.ObjectId.isValid(id)
```

Nunca ejecutar una consulta MongoDB con un ID claramente inválido.

Responder con error HTTP apropiado.

---

# 15. RESPUESTAS API

Las respuestas deben ser consistentes.

Ejemplo exitoso:

```json
{
  "post": {}
}
```

Ejemplo de error:

```json
{
  "error": "Mensaje descriptivo"
}
```

No devolver estructuras diferentes para la misma operación sin necesidad.

El frontend debe poder consumir la API de forma predecible.

---

# 16. CÓDIGOS HTTP

Usar códigos HTTP apropiados.

Referencia:

```text
200 OK
201 Created
204 No Content
400 Bad Request
401 Unauthorized
403 Forbidden
404 Not Found
409 Conflict
422 Unprocessable Entity
429 Too Many Requests
500 Internal Server Error
```

No utilizar `200` para todos los errores.

No utilizar `500` para errores provocados por el usuario.

---

# 17. MANEJO DE ERRORES

El backend debe tener manejo centralizado de errores.

Los errores internos no deben revelar:

* secretos;
* stack traces en producción;
* credenciales;
* información interna de MongoDB;
* variables de entorno;
* detalles de proveedores privados.

Los logs internos pueden contener información técnica útil, pero sin secretos.

---

# 18. ASYNC/AWAIT

Las operaciones asíncronas deben manejar errores correctamente.

Evitar:

```js
async function handler(req, res) {
  const result = await databaseCall();
}
```

si el framework/proyecto no garantiza el manejo de errores async.

Utilizar el mecanismo de manejo de errores existente en Kronos.

No duplicar `try/catch` innecesariamente cuando un middleware centralizado ya cubre el caso.

---

# 19. RED SOCIAL

El backend social debe soportar:

```text
Posts
Likes
Comments
Profiles
Following
Feed
User Search
```

El flujo de publicaciones es:

```text
Frontend
↓
POST /api/posts
↓
Auth
↓
Validation
↓
Post creation
↓
MongoDB
↓
Normalized response
↓
Frontend
```

El flujo de likes debe mantener consistencia incluso cuando varios usuarios interactúan simultáneamente.

Preferir operaciones atómicas de MongoDB cuando sea necesario.

---

# 20. POSTS

Las publicaciones deben:

* tener autor;
* tener contenido validado;
* registrar timestamps;
* permitir likes;
* permitir comentarios;
* respetar permisos;
* devolver información consistente.

El backend debe limitar la cantidad de publicaciones devueltas.

Para feeds grandes implementar paginación cuando corresponda.

No cargar indefinidamente toda la colección.

---

# 21. COMENTARIOS

Los comentarios deben:

* estar vinculados a una publicación;
* tener usuario;
* tener contenido;
* tener fecha;
* validar longitud;
* validar publicación;
* respetar autenticación.

Nunca aceptar un comentario sin usuario autenticado.

---

# 22. LIKES

Los likes deben ser idempotentes a nivel lógico.

Un usuario no debe generar múltiples likes duplicados sobre el mismo post.

Cuando se utilicen arrays de usuarios:

```text
likes
```

debe garantizarse que el usuario aparezca una sola vez.

Para operaciones concurrentes utilizar operaciones MongoDB seguras.

---

# 23. USUARIOS Y PERFILES

Las operaciones de usuario deben distinguir entre:

```text
usuario autenticado
otro usuario
```

No exponer:

* password hash;
* JWT;
* secretos;
* tokens;
* información privada.

El perfil público debe devolver únicamente información destinada a otros usuarios.

---

# 24. FOLLOW

El sistema de seguidores debe mantener consistencia.

Antes de modificar seguidores:

1. autenticar usuario;
2. validar target;
3. impedir auto-follow si la regla del producto lo prohíbe;
4. comprobar estado;
5. actualizar de forma segura;
6. devolver estado final.

No confiar únicamente en el estado visual del frontend.

---

# 25. MENSAJES PRIVADOS

Los mensajes pertenecen a conversaciones privadas.

Arquitectura:

```text
User
↓
Conversation
↓
Messages
```

Cada mensaje debe asociarse con:

* conversación;
* remitente;
* contenido;
* fecha;
* estado cuando corresponda.

Nunca permitir que un usuario lea mensajes de una conversación a la que no pertenece.

La autorización de conversación es obligatoria.

---

# 26. SOCKET.IO

Socket.IO se utiliza para funciones en tiempo real.

Principalmente:

* mensajes;
* notificaciones;
* estados de presencia cuando corresponda;
* eventos sociales que requieran tiempo real.

Flujo:

```text
Socket connection
↓
Authentication
↓
User identification
↓
Room
↓
Event
↓
Authorization
↓
Service
↓
Database
↓
Emit
```

No confiar en el cliente para decidir a qué conversación puede entrar.

---

# 27. SOCKET AUTHENTICATION

El socket debe autenticar al usuario.

No permitir:

```text
socket.emit("message", {
  senderId: "otro_usuario"
})
```

como mecanismo de identidad.

La identidad debe derivarse del socket autenticado.

El servidor decide quién es el remitente.

---

# 28. SOCKET EVENTS

Los eventos deben tener nombres consistentes.

Ejemplo:

```text
message:send
message:new
message:read

notification:new
notification:read
```

No crear nombres diferentes para la misma acción.

Antes de añadir un evento:

1. buscar eventos existentes;
2. revisar frontend;
3. comprobar rooms;
4. comprobar autorización.

---

# 29. NOTIFICACIONES

Las notificaciones deben poder originarse por eventos como:

```text
like
comment
follow
message
```

El backend debe ser la fuente de verdad.

El frontend puede mostrar la notificación, pero no inventar que ocurrió.

Cuando sea necesario:

```text
Database
+
Socket.IO
```

deben mantenerse sincronizados.

---

# 30. MULTIMEDIA

Los archivos deben pasar por:

```text
Upload
↓
Validation
↓
Storage
↓
Database reference
↓
API response
```

Validar:

* tipo MIME;
* extensión;
* tamaño;
* nombre;
* usuario;
* destino.

Nunca confiar únicamente en la extensión enviada por el cliente.

No almacenar archivos arbitrarios sin validación.

---

# 31. MULTER

Si Kronos utiliza Multer:

* definir límites;
* validar tipos;
* evitar nombres inseguros;
* no aceptar archivos ilimitados;
* manejar errores de upload;
* limpiar archivos temporales cuando corresponda.

No permitir que un usuario controle libremente rutas del servidor.

---

# 32. IA

El backend es responsable de proteger las claves de proveedores de IA.

Nunca enviar:

```text
OPENAI_API_KEY
GOOGLE_API_KEY
```

al navegador.

El flujo correcto:

```text
Frontend
↓
Kronos API
↓
Auth
↓
Validation
↓
AI Service
↓
Provider
```

Las llamadas a proveedores deben estar aisladas de las rutas cuando la complejidad lo justifique.

---

# 33. IA DE IMÁGENES

El sistema debe recibir:

```text
prompt
configuration
user
```

validar la solicitud y enviarla al proveedor correspondiente.

Debe controlar:

* límites;
* errores;
* timeout;
* costos;
* estado;
* resultado.

No asumir que el proveedor siempre responde correctamente.

---

# 34. IA DE VIDEO

La generación de video puede ser asíncrona.

Arquitectura recomendada:

```text
Request
↓
Create Generation
↓
Provider
↓
Processing
↓
Status
↓
Completed / Failed
```

Estados posibles:

```text
queued
processing
completed
failed
```

El frontend no debe tener que mantener el estado únicamente en memoria.

---

# 35. IA DE GUIONES

El generador de guiones debe recibir parámetros estructurados cuando corresponda.

Ejemplos:

```text
genre
tone
duration
characters
setting
concept
```

El backend debe validar esos valores antes de enviarlos al modelo.

El resultado debe poder devolverse y, si el diseño lo requiere, almacenarse como historial.

---

# 36. SERVICIOS

Cuando una operación crezca demasiado, mover la lógica a un service.

Ejemplo:

```text
posts.routes.js
        ↓
posts.service.js
        ↓
Post model
```

El service debe contener lógica reutilizable.

No crear services artificiales para operaciones triviales.

La arquitectura debe ser práctica, no burocrática.

---

# 37. NO DUPLICAR LÓGICA

Nunca copiar la misma lógica en:

```text
route A
route B
socket A
socket B
```

si puede reutilizarse.

Ejemplos de lógica reutilizable:

```text
validateObjectId()
normalizePost()
authorizeConversation()
createNotification()
generateAIContent()
```

Una fuente de verdad es preferible.

---

# 38. SEGURIDAD

Aplicar como mínimo:

```text
Helmet
CORS
JWT
Input validation
Rate limiting cuando corresponda
Body limits
File limits
Authorization
Secret protection
Safe errors
```

No introducir vulnerabilidades conocidas.

Prestar especial atención a:

* IDOR;
* privilege escalation;
* injection;
* path traversal;
* unrestricted uploads;
* token leakage;
* insecure Socket.IO events.

---

# 39. CORS

El backend debe permitir únicamente los orígenes necesarios.

En producción:

```text
Vercel frontend
        ↓
Render backend
```

La configuración debe utilizar variables de entorno cuando corresponda.

No abrir:

```text
Access-Control-Allow-Origin: *
```

si el flujo de autenticación requiere una configuración restrictiva.

---

# 40. LOGGING

Los logs deben servir para diagnosticar.

Ejemplo:

```text
KRONOS_POST_CREATE_ERROR
KRONOS_AUTH_ERROR
KRONOS_SOCKET_ERROR
KRONOS_AI_GENERATION_ERROR
```

Los mensajes deben identificar la operación.

Nunca registrar:

```text
password
JWT
API key
secret
```

---

# 41. RENDIMIENTO

Evitar:

* consultas sin índices;
* colecciones completas innecesarias;
* payloads enormes;
* múltiples queries redundantes;
* llamadas IA innecesarias;
* uploads sin límites.

Utilizar:

```text
indexes
limits
pagination
lean()
projection
atomic updates
```

cuando corresponda.

---

# 42. PRODUCCIÓN EN RENDER

El backend debe funcionar correctamente en Render.

Comprobar:

```text
npm install
npm run build
npm start
```

cuando esos scripts existan.

El servidor debe escuchar el puerto proporcionado por:

```js
process.env.PORT
```

No asumir un puerto fijo en producción.

---

# 43. NODE.JS

El proyecto actualmente declara una versión de Node mediante `package.json`.

Render puede ejecutar una versión distinta si la configuración del servicio o plataforma lo determina.

Cuando exista un problema de compatibilidad:

1. revisar `package.json`;
2. revisar lockfile;
3. revisar configuración de Render;
4. revisar logs;
5. alinear la versión soportada.

No cambiar la versión de Node arbitrariamente durante una implementación funcional.

---

# 44. DEPENDENCIAS

Antes de instalar una dependencia:

1. comprobar si ya existe una equivalente;
2. comprobar compatibilidad;
3. comprobar necesidad real;
4. revisar impacto en producción.

No añadir paquetes por comodidad si puede resolverse con dependencias existentes.

Después de añadir una dependencia:

```text
package.json
+
lockfile
```

deben permanecer sincronizados.

---

# 45. CAMBIOS DE API

Si se cambia un endpoint:

1. revisar frontend;
2. revisar consumidores;
3. revisar Socket.IO si aplica;
4. revisar documentación;
5. mantener compatibilidad cuando sea posible.

Nunca cambiar silenciosamente:

```text
route
method
request body
response body
authentication
```

sin actualizar todos los consumidores.

---

# 46. FLUJO DE IMPLEMENTACIÓN

Cada nueva funcionalidad backend debe seguir:

```text
1. Identificar módulo
2. Revisar código existente
3. Reutilizar componentes
4. Definir contrato API
5. Implementar validación
6. Implementar autorización
7. Implementar lógica
8. Conectar MongoDB
9. Conectar Socket.IO si corresponde
10. Conectar frontend
11. Manejar errores
12. Probar
13. Revisar seguridad
14. Revisar deployment
```

No saltarse autenticación o validación para avanzar rápido.

---

# 47. CAMBIOS EN MODELOS

Si una funcionalidad requiere modificar MongoDB:

```text
Model
↓
Service
↓
Route
↓
Frontend
```

deben revisarse juntos.

No cambiar únicamente el schema esperando que todo lo demás se adapte automáticamente.

Revisar:

* documentos existentes;
* consultas;
* índices;
* populate;
* respuestas API;
* frontend.

---

# 48. BACKWARD COMPATIBILITY

Cuando sea posible, preservar APIs existentes.

Si una modificación rompe el contrato:

1. identificar consumidores;
2. actualizar consumidores;
3. verificar producción;
4. probar flujo completo.

No dejar endpoints parcialmente incompatibles.

---

# 49. PRUEBAS MÍNIMAS

Cada funcionalidad backend debe comprobar:

### Caso exitoso

```text
request válido
↓
respuesta correcta
```

### Sin autenticación

```text
401
```

### Sin autorización

```text
403
```

### Datos inválidos

```text
400 / 422
```

### Recurso inexistente

```text
404
```

### Error interno

```text
500
```

### Concurrencia

Cuando la operación pueda ejecutarse simultáneamente.

---

# 50. DEBUGGING

Cuando exista un error:

```text
Frontend
↓
Network
↓
HTTP status
↓
Response
↓
Render logs
↓
Route
↓
Middleware
↓
Service
↓
MongoDB
```

Para Socket.IO:

```text
Browser
↓
socket connection
↓
auth
↓
event
↓
server handler
↓
service
↓
emit
```

No modificar múltiples capas simultáneamente sin identificar el origen.

---

# 51. REGLA DE ARCHIVO COMPLETO

Cuando una modificación importante afecte un archivo existente, la implementación preferida es entregar el **archivo completo definitivo**, listo para reemplazar.

Evitar instrucciones ambiguas como:

```text
busca algo parecido
cambia una parte
agrega esto por ahí
```

Siempre que sea viable proporcionar:

```text
ruta exacta
+
contenido completo final
```

Esto reduce errores de integración.

---

# 52. NO ROMPER LO EXISTENTE

Antes de modificar backend existente:

* conservar endpoints funcionales;
* conservar nombres de variables existentes cuando no sea necesario cambiarlos;
* conservar contratos compatibles;
* conservar imports válidos;
* conservar middleware funcional;
* conservar integración MongoDB;
* conservar integración Render.

Una mejora no debe destruir otra funcionalidad.

---

# 53. FRONTEND ↔ BACKEND

Toda API nueva debe tener consumidor real o propósito definido dentro de Kronos.

Mapa conceptual:

```text
React
↓
Axios / Socket.IO
↓
VITE_API_URL
↓
Render API
↓
Express
↓
MongoDB / AI / Storage
```

El backend debe devolver exactamente lo que el frontend necesita.

No enviar datos privados innecesarios.

---

# 54. 18 PANTALLAS

El backend debe terminar conectado con las 18 pantallas oficiales de Kronos.

Cada pantalla debe tener:

```text
UI
↓
API
↓
Auth
↓
Database / Service
```

cuando corresponda.

No considerar una pantalla terminada si únicamente tiene datos simulados cuando el flujo real ya debe existir.

---

# 55. GUARDIAN / KAIROS

El sistema Guardian/Kairos queda explícitamente reservado para la etapa final del proyecto.

No introducirlo prematuramente.

Cuando llegue su fase:

```text
Production
↓
Guardian/Kairos
↓
Monitoring
↓
Alerts
↓
Audit log
```

Hasta entonces, mantener el backend preparado para integrarlo sin crear dependencias innecesarias.

---

# 56. REGLAS DE IMPLEMENTACIÓN KRONOS

Siempre:

* reutilizar antes de crear;
* validar antes de consultar;
* autenticar antes de ejecutar;
* autorizar antes de modificar;
* proteger secretos;
* usar MongoDB correctamente;
* mantener contratos API;
* manejar errores;
* pensar en concurrencia;
* considerar producción.

Nunca:

* confiar en el frontend;
* exponer secretos;
* duplicar lógica innecesariamente;
* crear rutas duplicadas;
* aceptar archivos ilimitados;
* permitir acceso a recursos ajenos;
* introducir cambios de alcance;
* romper endpoints existentes.

---

# 57. CRITERIO DE TERMINADO

Una funcionalidad backend se considera terminada únicamente cuando:

```text
[ ] Route creada
[ ] Authentication correcta
[ ] Authorization correcta
[ ] Validation correcta
[ ] Service correcto
[ ] MongoDB conectado
[ ] Response consistente
[ ] Error handling
[ ] Security revisada
[ ] Frontend conectado
[ ] Socket.IO conectado si corresponde
[ ] Production compatible
[ ] No rompe funcionalidades existentes
```

---

# 58. CHECKLIST DE PRODUCCIÓN

Antes de considerar estable el backend:

```text
[ ] MongoDB Atlas conectado
[ ] MONGODB_URI configurado
[ ] JWT_SECRET configurado
[ ] AI secrets protegidos
[ ] CORS configurado
[ ] PORT dinámico
[ ] Error handler activo
[ ] Helmet activo
[ ] Compression activo
[ ] Upload limits
[ ] Body limits
[ ] Auth funcionando
[ ] API funcionando
[ ] Socket.IO funcionando
[ ] Logs limpios
[ ] No secrets en código
[ ] No secrets en logs
[ ] Render deployment estable
```

---

# 59. REGLA MAESTRA

**El backend de Kronos Space debe ser una única plataforma coherente, no una colección de funciones independientes.**

Cada modificación debe considerar:

```text
API
+
Auth
+
Security
+
MongoDB
+
Socket.IO
+
Frontend
+
Production
```

cuando esos componentes participen en el flujo.

La prioridad siempre es:

**funcionalidad real → seguridad → consistencia → estabilidad → rendimiento → mantenimiento.**

No cambiar el alcance oficial de Kronos Space.

