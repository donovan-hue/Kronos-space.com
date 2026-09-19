---

name: kronos-architect
description: >
Arquitecto principal de Kronos Space. Usar cuando una tarea
implique diseñar, conectar, modificar o validar la arquitectura
Frontend ↔ API ↔ Backend ↔ MongoDB ↔ Socket.IO ↔ servicios de IA
↔ almacenamiento multimedia ↔ despliegue. Esta Skill mantiene una
arquitectura coherente, evita dependencias incorrectas, duplicación
de lógica, cambios de alcance y conexiones improvisadas.

compatibility: >
Kronos Space. Compatible con agentes de desarrollo que trabajen
sobre el repositorio completo y necesiten tomar decisiones
arquitectónicas antes de modificar código.

version: 1.0.0

tags:

* kronos
* architect
* architecture
* frontend
* backend
* api
* mongodb
* socketio
* ai
* realtime
* production

---

# KRONOS ARCHITECT

## 1. PROPÓSITO

Esta Skill funciona como el arquitecto principal de Kronos Space.

Su responsabilidad es asegurar que cada nueva funcionalidad o modificación
respete la arquitectura completa del sistema.

Debe determinar:

* dónde debe vivir cada funcionalidad;
* qué módulo debe modificarse;
* qué endpoint necesita;
* qué modelo de MongoDB interviene;
* qué pantalla consume la funcionalidad;
* cuándo usar HTTP;
* cuándo usar Socket.IO;
* cuándo utilizar un servicio externo;
* cómo proteger autenticación y autorización;
* cómo manejar archivos multimedia;
* cómo conectar frontend y backend;
* cómo mantener compatibilidad con producción.

Nunca debe resolver una modificación arquitectónica agregando código
directamente en una capa incorrecta solamente porque sea más rápido.

---

# 2. REGLA PRINCIPAL

Antes de diseñar o modificar una conexión importante:

1. Identificar la funcionalidad.
2. Identificar la pantalla que la utiliza.
3. Identificar el endpoint o canal realtime.
4. Identificar el módulo backend.
5. Identificar el modelo de datos.
6. Identificar servicios externos.
7. Definir el flujo completo.
8. Verificar autenticación.
9. Verificar errores.
10. Verificar producción.
11. Implementar.
12. Revisar el impacto sobre las demás capas.

La arquitectura debe mantenerse de extremo a extremo.

---

# 3. ARQUITECTURA CANÓNICA DE KRONOS

El flujo principal debe seguir esta dirección:

```text
USUARIO
  ↓
REACT FRONTEND
  ↓
UI / FEATURE
  ↓
API CLIENT / HTTP
  ↓
EXPRESS API
  ↓
ROUTE
  ↓
CONTROLLER / HANDLER
  ↓
SERVICE / BUSINESS LOGIC
  ↓
MONGOOSE MODEL
  ↓
MONGODB ATLAS
```

Para tiempo real:

```text
REACT FRONTEND
  ↕
SOCKET.IO CLIENT
  ↕
SOCKET.IO SERVER
  ↕
BACKEND BUSINESS LOGIC
  ↕
MONGODB
```

Para IA:

```text
REACT
  ↓
KRONOS API
  ↓
AI SERVICE
  ↓
AI PROVIDER
  ↓
RESULTADO
  ↓
KRONOS API
  ↓
FRONTEND
```

Para multimedia:

```text
FRONTEND
  ↓
UPLOAD ENDPOINT
  ↓
VALIDACIÓN
  ↓
MEDIA PROCESSING
  ↓
STORAGE
  ↓
URL / IDENTIFICADOR
  ↓
MONGODB
  ↓
FRONTEND
```

---

# 4. CAPAS DEL SISTEMA

## 4.1 FRONTEND

Tecnología principal:

* React
* React Router
* Axios
* Vite

Responsabilidades:

* renderizar interfaces;
* manejar navegación;
* capturar acciones del usuario;
* mostrar estados;
* consumir API;
* mantener estado visual;
* manejar formularios;
* conectar Socket.IO;
* mostrar resultados de IA.

El frontend NO debe:

* conectarse directamente a MongoDB;
* contener secretos;
* contener claves privadas de proveedores;
* ejecutar lógica crítica de autorización;
* decidir permisos de usuario;
* duplicar reglas de negocio del backend.

---

# 5. ORGANIZACIÓN FRONTEND

Las funcionalidades deben organizarse por dominio.

Estructura conceptual:

```text
client/src/
├── App.jsx
├── features/
│   ├── auth/
│   ├── social/
│   ├── users/
│   ├── messages/
│   ├── notifications/
│   └── ai/
├── components/
├── services/
├── hooks/
├── utils/
└── styles/
```

Cuando exista un dominio equivalente en el repositorio actual,
debe reutilizarse antes de crear otro.

No crear:

```text
social2/
social-new/
social-final/
social-old/
```

ni duplicados equivalentes.

---

# 6. API

La API principal utiliza:

```text
/api
```

Las rutas deben organizarse por dominio.

Ejemplo conceptual:

```text
/api/auth
/api/users
/api/posts
/api/messages
/api/notifications
/api/ai
/api/uploads
```

Cada endpoint debe tener una responsabilidad clara.

Ejemplo:

```text
GET    /api/posts
GET    /api/posts/:postId
POST   /api/posts
POST   /api/posts/:postId/comments
POST   /api/posts/:postId/like
```

No crear endpoints duplicados para resolver la misma operación.

---

# 7. BACKEND

Tecnología:

* Node.js
* Express
* Mongoose
* Socket.IO

El backend es responsable de:

* autenticación;
* autorización;
* validación;
* reglas de negocio;
* acceso a MongoDB;
* integración con IA;
* uploads;
* eventos realtime;
* respuestas HTTP;
* manejo centralizado de errores.

El backend es la autoridad del sistema.

El frontend nunca debe considerarse una capa de seguridad.

---

# 8. MÓDULOS BACKEND

La organización debe mantenerse orientada a dominios.

Ejemplo:

```text
server/src/
├── server.js
├── config/
├── middleware/
├── modules/
│   ├── auth/
│   ├── users/
│   ├── posts/
│   ├── messages/
│   ├── notifications/
│   ├── ai/
│   └── uploads/
├── services/
├── sockets/
└── utils/
```

Si el repositorio actual utiliza una estructura diferente,
no debe reorganizarse todo innecesariamente.

La regla es:

> Adaptar la arquitectura existente cuando sea válida.
> Cambiarla solamente cuando exista una razón técnica real.

---

# 9. MONGODB

MongoDB Atlas es la base de datos principal.

Mongoose debe utilizarse como capa de acceso.

Regla:

```text
Frontend
  ↓
API
  ↓
Backend
  ↓
Mongoose
  ↓
MongoDB
```

Nunca:

```text
Frontend → MongoDB
```

Los modelos deben representar dominios reales.

Dominios principales:

* User
* Post
* Message
* Notification
* AI generation
* Media
* configuración/preferencias cuando sean necesarias

No crear modelos duplicados para la misma entidad.

---

# 10. REGLAS DE MODELOS

Cada modelo debe:

* validar datos;
* tener índices cuando sean necesarios;
* utilizar referencias correctamente;
* evitar almacenar información innecesaria;
* respetar timestamps cuando corresponda;
* mantener nombres consistentes.

Para relaciones:

```js
ref: "User"
```

debe coincidir exactamente con el nombre registrado del modelo.

Las consultas deben utilizar `populate()` solamente cuando realmente
sea necesario.

Evitar:

* consultas N+1;
* populate excesivo;
* documentos gigantes;
* arrays que puedan crecer indefinidamente sin estrategia;
* duplicación innecesaria de información.

---

# 11. AUTENTICACIÓN

La autenticación debe permanecer centralizada.

Flujo:

```text
LOGIN
 ↓
BACKEND
 ↓
VALIDACIÓN
 ↓
JWT
 ↓
FRONTEND
 ↓
REQUEST AUTHORIZATION
 ↓
BACKEND
 ↓
AUTH MIDDLEWARE
 ↓
USUARIO AUTORIZADO
```

Los endpoints protegidos deben validar el token mediante middleware.

Nunca confiar únicamente en:

```js
localStorage
```

como mecanismo de autorización.

El frontend solamente presenta el estado.

El backend decide:

* quién es el usuario;
* si está autenticado;
* si puede ejecutar la operación;
* qué recursos puede modificar.

---

# 12. AUTORIZACIÓN

La autenticación responde:

> ¿Quién eres?

La autorización responde:

> ¿Puedes hacer esto?

Toda operación sensible debe validar ambas.

Ejemplos:

* editar perfil;
* eliminar publicación;
* editar publicación;
* enviar mensaje;
* acceder a conversaciones;
* modificar configuración;
* generar contenido privado;
* acceder a recursos propios.

Nunca asumir que conocer un `userId` o `postId`
autoriza automáticamente una operación.

---

# 13. SOCKET.IO

Socket.IO se reserva para funcionalidades que realmente necesiten
actualización en tiempo real.

Principal aplicación:

```text
Mensajes privados
```

Flujo conceptual:

```text
USER A
 ↓
SOCKET.IO
 ↓
SERVER
 ↓
VALIDACIÓN
 ↓
GUARDAR MENSAJE
 ↓
EMITIR EVENTO
 ↓
USER B
```

El servidor debe ser la autoridad del evento.

No considerar un mensaje enviado solamente porque el frontend
emitió un evento.

Primero debe existir validación y persistencia cuando corresponda.

Los eventos deben tener nombres claros.

Ejemplo:

```text
message:send
message:new
message:read
message:typing
```

No crear nombres ambiguos como:

```text
data
update
event
thing
```

---

# 14. MENSAJERÍA

La arquitectura de mensajes debe separar:

```text
CONVERSACIÓN
MENSAJE
USUARIO
```

Una conversación debe identificar claramente a sus participantes.

Un mensaje debe contener como mínimo conceptualmente:

```text
conversationId
sender
content
createdAt
```

Opcionalmente:

```text
attachments
readAt
messageType
```

Los usuarios solamente deben poder acceder a conversaciones
de las que formen parte.

---

# 15. RED SOCIAL

La aplicación social debe utilizar el backend real.

Dominios principales:

```text
Feed
Explorar
Perfil
Publicaciones
Comentarios
Likes
Mensajes
Notificaciones
Crear publicación
Configuración
```

Cada pantalla debe consumir el dominio backend correspondiente.

No utilizar datos falsos como solución permanente.

Los mocks solamente pueden utilizarse durante desarrollo controlado.

---

# 16. PUBLICACIONES

Flujo:

```text
Crear publicación
 ↓
POST /api/posts
 ↓
Auth
 ↓
Validación
 ↓
Post model
 ↓
MongoDB
 ↓
Respuesta
 ↓
Feed
```

Detalle:

```text
GET /api/posts/:postId
```

Comentarios:

```text
POST /api/posts/:postId/comments
```

Likes:

```text
POST /api/posts/:postId/like
```

El estado visual:

```text
likesCount
liked
comments
```

debe derivarse de datos reales del backend.

---

# 17. NOTIFICACIONES

Las notificaciones deben ser un dominio separado.

Eventos potenciales:

* nuevo like;
* nuevo comentario;
* nuevo seguidor;
* nuevo mensaje;
* otras acciones relevantes.

La creación de una notificación debe ocurrir en backend.

No confiar en que el frontend cree una notificación por sí solo.

Cuando sea necesario tiempo real:

```text
Backend
 ↓
Socket.IO
 ↓
Frontend
```

La persistencia debe realizarse antes de considerar la notificación
como registrada.

---

# 18. IA

Kronos contiene tres áreas principales de IA:

```text
AI Center
├── Imagen
├── Video
└── Guiones
```

La IA debe estar abstraída detrás del backend.

Nunca exponer claves privadas de proveedores al navegador.

Arquitectura:

```text
React
 ↓
POST /api/ai/...
 ↓
Auth
 ↓
Validación
 ↓
AI service
 ↓
Provider
 ↓
Resultado
 ↓
Persistencia
 ↓
React
```

Los proveedores externos no deben quedar acoplados directamente
a los componentes React.

---

# 19. IA DE IMAGEN

El módulo de imagen debe permitir conceptualmente:

```text
prompt
 ↓
validación
 ↓
provider
 ↓
resultado
 ↓
media
 ↓
frontend
```

La arquitectura debe permitir cambiar de proveedor sin tener que
reescribir toda la interfaz.

Los nombres de proveedores y claves deben permanecer en backend/configuración.

---

# 20. IA DE VIDEO

El video tiene mayor costo computacional y puede ser asíncrono.

Cuando una generación no sea inmediata:

```text
REQUEST
 ↓
JOB
 ↓
PROCESSING
 ↓
PROVIDER
 ↓
RESULTADO
 ↓
STORAGE
 ↓
STATUS
```

Estados recomendados conceptualmente:

```text
queued
processing
completed
failed
```

El frontend debe mostrar el estado real.

No simular procesamiento mediante temporizadores como solución definitiva.

---

# 21. IA DE GUIONES

El generador de guiones debe estar separado del generador visual.

Entrada conceptual:

```text
idea
genre
tone
duration
characters
setting
instructions
```

Salida:

```text
script
```

La lógica de generación debe residir en backend.

La interfaz solamente recopila parámetros y presenta resultados.

---

# 22. MULTIMEDIA

Los archivos multimedia no deben manejarse como simples strings
sin validación.

Antes de aceptar un archivo:

1. validar autenticación;
2. validar tamaño;
3. validar MIME/type;
4. validar extensión cuando corresponda;
5. generar nombre seguro;
6. almacenar;
7. registrar referencia;
8. devolver identificador/URL segura.

Nunca confiar exclusivamente en:

```text
filename
```

proporcionado por el usuario.

---

# 23. VARIABLES DE ENTORNO

Las claves privadas pertenecen al backend.

Ejemplos conceptuales:

```text
MONGODB_URI
JWT_SECRET
OPENAI_API_KEY
GOOGLE_API_KEY
```

Nunca:

```text
VITE_SECRET
```

para secretos privados.

Las variables `VITE_*` son potencialmente visibles en el cliente.

---

# 24. VERCEL + RENDER

Arquitectura de producción:

```text
USUARIO
  ↓
VERCEL
  ↓
REACT FRONTEND
  ↓
RENDER
  ↓
EXPRESS API
  ↓
MONGODB ATLAS
```

Servicios externos:

```text
RENDER
 ├── Backend
 └── Socket.IO

VERCEL
 └── Frontend

MONGODB ATLAS
 └── Database
```

Las URLs deben configurarse mediante variables de entorno.

Nunca hardcodear URLs de producción en múltiples archivos.

---

# 25. CORS

CORS debe permitir solamente los orígenes necesarios.

Durante desarrollo puede existir:

```text
localhost
```

En producción debe utilizarse el dominio real del frontend.

No utilizar:

```js
origin: "*"
```

como solución permanente para una API autenticada.

---

# 26. DIRECCIÓN DE DEPENDENCIAS

Regla obligatoria:

```text
UI
 ↓
API client
 ↓
API
 ↓
Business logic
 ↓
Database / external services
```

Nunca permitir:

```text
Database → React
```

ni:

```text
React component → MongoDB
```

ni:

```text
React component → private AI provider
```

ni:

```text
Model → UI
```

Las dependencias deben fluir hacia abajo.

---

# 27. REUTILIZACIÓN

Antes de crear:

* endpoint;
* modelo;
* componente;
* hook;
* servicio;
* utilidad;
* middleware;

buscar primero si ya existe uno equivalente.

Si existe:

```text
REUTILIZAR
```

Si necesita cambios:

```text
EXTENDER
```

Solamente crear uno nuevo cuando realmente sea un dominio diferente.

---

# 28. CONTRATOS API

Cada endpoint debe tener un contrato claro.

Ejemplo:

```text
REQUEST
{
  content: "..."
}
```

Respuesta:

```text
{
  post: {...}
}
```

Los errores deben mantener una estructura consistente.

Ejemplo:

```text
{
  error: "Mensaje descriptivo"
}
```

El frontend debe leer el contrato real.

No crear contratos diferentes para la misma operación.

---

# 29. MANEJO DE ERRORES

Toda capa debe manejar errores apropiadamente.

Frontend:

```text
loading
success
error
empty
```

Backend:

```text
validation
authentication
authorization
not found
database
provider
unexpected
```

Nunca ocultar silenciosamente errores críticos.

Los logs deben permitir identificar:

```text
qué falló
dónde falló
por qué falló
```

No registrar secretos.

---

# 30. CAMBIOS ARQUITECTÓNICOS

Antes de realizar un cambio que afecte varias capas,
definir internamente:

```text
FEATURE
 ↓
SCREEN
 ↓
FRONTEND FILES
 ↓
API ROUTE
 ↓
BACKEND MODULE
 ↓
MODEL
 ↓
EXTERNAL SERVICE
 ↓
DEPLOYMENT
```

Si una funcionalidad afecta solamente una capa,
no modificar otras innecesariamente.

---

# 31. MATRIZ DE IMPACTO

Clasificar cambios:

### BAJO

Ejemplos:

* texto;
* label;
* placeholder;
* estilo local.

### MEDIO

Ejemplos:

* componente;
* endpoint existente;
* formulario;
* consulta.

### ALTO

Ejemplos:

* nuevo modelo;
* autenticación;
* Socket.IO;
* cambio de contrato API;
* almacenamiento;
* proveedor de IA;
* arquitectura de despliegue.

Los cambios de alto impacto requieren revisar todas las dependencias
afectadas antes de implementarlos.

---

# 32. CAMBIOS DE BASE DE DATOS

Cuando una modificación cambia el modelo:

1. identificar documentos existentes;
2. evaluar compatibilidad;
3. revisar índices;
4. revisar consultas;
5. revisar populate;
6. revisar endpoints;
7. revisar frontend;
8. verificar producción.

No romper documentos existentes sin estrategia de migración.

---

# 33. CAMBIOS DE API

Si cambia una respuesta:

```text
Backend
 ↓
Frontend
```

deben revisarse ambos lados.

No cambiar silenciosamente:

```text
post
```

por:

```text
data
```

si el frontend depende del contrato anterior.

Los contratos deben permanecer estables salvo modificación intencional.

---

# 34. NUEVA FUNCIONALIDAD

Para cada nueva funcionalidad, utilizar esta plantilla mental:

```text
1. ¿Qué pantalla la necesita?

2. ¿Qué acción ejecuta?

3. ¿Es HTTP o realtime?

4. ¿Qué endpoint necesita?

5. ¿Qué middleware necesita?

6. ¿Qué datos necesita?

7. ¿Qué modelo interviene?

8. ¿Necesita servicio externo?

9. ¿Qué respuesta recibe frontend?

10. ¿Qué errores pueden ocurrir?

11. ¿Qué seguridad necesita?

12. ¿Qué archivos deben modificarse?

13. ¿Qué pruebas deben ejecutarse?

14. ¿Afecta producción?
```

---

# 35. MAPA DE CONEXIÓN

El mapa general de Kronos debe mantenerse conceptualmente así:

```text
                    KRONOS SPACE
                           │
        ┌──────────────────┼──────────────────┐
        │                  │                  │
        ▼                  ▼                  ▼
    RED SOCIAL          AI CENTER        SCRIPT AI
        │                  │                  │
        │          ┌───────┴───────┐          │
        │          ▼       ▼       ▼          │
        │       IMAGE    VIDEO   SERVICES     │
        │
        ▼
   EXPRESS API
        │
   ┌────┼───────────────┐
   │    │       │       │
   ▼    ▼       ▼       ▼
 USERS POSTS  MESSAGES NOTIFICATIONS
   │    │       │       │
   └────┴───────┴───────┘
              │
              ▼
          MONGOOSE
              │
              ▼
        MONGODB ATLAS
```

Socket.IO atraviesa principalmente:

```text
MESSAGES
NOTIFICATIONS
REALTIME EVENTS
```

---

# 36. 18 PANTALLAS

La arquitectura debe conservar la meta de conectar las 18 pantallas
del proyecto con backend real.

Cada pantalla debe tener:

```text
SCREEN
 ↓
FEATURE
 ↓
API / SOCKET
 ↓
BACKEND
 ↓
DATABASE / SERVICE
```

No considerar una pantalla terminada solamente porque visualmente
renderiza.

Una pantalla queda funcional cuando:

* navega correctamente;
* carga datos reales;
* ejecuta acciones reales;
* muestra errores;
* respeta autenticación;
* mantiene estados;
* está conectada al backend correspondiente.

---

# 37. REGLA DE NO DUPLICACIÓN

Antes de crear algo nuevo:

```text
BUSCAR
 ↓
COMPARAR
 ↓
REUTILIZAR
 ↓
EXTENDER
 ↓
CREAR SOLO SI ES NECESARIO
```

No crear implementaciones paralelas.

Especialmente evitar duplicados de:

* API clients;
* auth helpers;
* Post models;
* User models;
* Socket connections;
* AI services;
* upload handlers.

---

# 38. GUARDIAN / KAIROS

El sistema Guardian/Kairos forma parte del alcance final,
pero su integración debe permanecer para la última etapa.

No adelantarlo para resolver problemas normales del proyecto.

Primero:

```text
FUNCIONALIDAD
 ↓
INTEGRACIÓN
 ↓
PRUEBAS
 ↓
PRODUCCIÓN
```

Después:

```text
GUARDIAN / KAIROS
```

El Guardian debe integrarse cuando el sistema principal esté estable.

---

# 39. REGLA DE ALCANCE

Esta Skill NO puede inventar nuevas aplicaciones principales.

El alcance permanece:

```text
1. RED SOCIAL
2. IA DE IMAGEN/VIDEO
3. IA DE GUIONES
```

No convertir Kronos en:

* marketplace;
* sistema bancario;
* CRM;
* plataforma educativa;
* aplicación empresarial distinta.

Las nuevas ideas deben evaluarse contra el alcance existente.

---

# 40. PROTOCOLO DE IMPLEMENTACIÓN

Cuando el usuario solicite implementar una funcionalidad:

### PASO 1

Identificar archivos afectados.

### PASO 2

Definir flujo:

```text
Frontend → API → Backend → DB/Service
```

### PASO 3

Implementar primero la dependencia backend necesaria cuando sea
requerida para que el frontend pueda consumirla correctamente.

### PASO 4

Implementar frontend.

### PASO 5

Conectar estados:

```text
loading
success
error
empty
```

### PASO 6

Verificar autenticación.

### PASO 7

Verificar contrato API.

### PASO 8

Verificar integración.

### PASO 9

Revisar cambios.

### PASO 10

Cerrar la tarea solamente cuando la funcionalidad esté realmente conectada.

---

# 41. ARCHIVOS COMPLETOS

Cuando sea más seguro reemplazar un archivo completo,
preferir entregar el archivo completo y definitivo.

Evitar instrucciones ambiguas como:

```text
cambia unas líneas
```

cuando exista riesgo de que el usuario copie una modificación parcial
incorrectamente.

Cuando sea posible indicar:

```text
ARCHIVO
RUTA
ACCIÓN
CÓDIGO FINAL
```

---

# 42. REVISIÓN ARQUITECTÓNICA

Después de modificar varias capas verificar:

```text
[ ] Frontend compila
[ ] Backend inicia
[ ] Endpoint responde
[ ] Auth funciona
[ ] MongoDB responde
[ ] Socket.IO funciona cuando corresponde
[ ] Errores están controlados
[ ] No existen secretos en frontend
[ ] Contratos coinciden
[ ] Producción no se rompe
```

---

# 43. CRITERIOS DE TERMINADO

Una tarea arquitectónica está terminada cuando:

```text
✓ Código implementado
✓ Dependencias conectadas
✓ API funcionando
✓ Base de datos integrada
✓ Frontend conectado
✓ Auth validada
✓ Errores controlados
✓ No hay duplicación innecesaria
✓ No rompe funcionalidades existentes
✓ Compatible con producción
```

Un componente visual aislado NO equivale a funcionalidad terminada.

---

# 44. FORMATO DE DECISIÓN ARQUITECTÓNICA

Cuando una decisión importante sea necesaria, utilizar:

```text
DECISIÓN
¿Qué se necesita?

UBICACIÓN
¿Dónde debe implementarse?

FLUJO
¿Cómo viajan los datos?

DEPENDENCIAS
¿Qué componentes intervienen?

SEGURIDAD
¿Qué debe protegerse?

RIESGO
¿Qué puede romperse?

IMPLEMENTACIÓN
¿Qué archivos cambian?

VALIDACIÓN
¿Cómo se comprueba?

RESULTADO
¿Qué queda conectado?
```

---

# 45. REGLA DE COMPATIBILIDAD

Antes de cambiar una pieza existente preguntar:

```text
¿Qué depende de esto?
```

Buscar dependencias en:

* imports;
* rutas;
* llamadas API;
* modelos;
* middleware;
* Socket.IO;
* variables de entorno;
* componentes;
* deployment.

Nunca reemplazar una pieza crítica sin revisar sus consumidores.

---

# 46. DEPURACIÓN ARQUITECTÓNICA

Cuando algo falle, seguir el flujo:

```text
UI
 ↓
REQUEST
 ↓
NETWORK
 ↓
ROUTE
 ↓
MIDDLEWARE
 ↓
HANDLER
 ↓
SERVICE
 ↓
DATABASE / PROVIDER
```

Encontrar la primera capa donde aparece el error.

No parchear únicamente el síntoma del frontend
si el problema real está en backend.

---

# 47. PRODUCCIÓN

Todo cambio importante debe ser compatible con:

```text
GitHub
 ↓
Render
 ↓
Backend
```

y:

```text
GitHub
 ↓
Vercel
 ↓
Frontend
```

con:

```text
MongoDB Atlas
```

como base de datos.

Antes de considerar terminado un cambio de producción,
verificar variables de entorno y URLs.

---

# 48. PROHIBIDO

No hacer:

* cambios de alcance;
* duplicar módulos;
* duplicar modelos;
* conectar frontend directamente a MongoDB;
* exponer API keys;
* confiar en autorización del frontend;
* crear endpoints innecesarios;
* usar mocks como solución final;
* introducir servicios externos sin necesidad;
* modificar arquitectura completa por una funcionalidad pequeña;
* integrar Guardian/Kairos antes de tiempo;
* romper contratos API existentes sin revisar consumidores.

---

# 49. REGLA DE ORO

La arquitectura de Kronos debe poder explicarse siempre como:

```text
PANTALLA
   ↓
FEATURE
   ↓
API
   ↓
BACKEND
   ↓
BUSINESS LOGIC
   ↓
DATABASE / AI / STORAGE
   ↓
RESPUESTA
   ↓
PANTALLA
```

Si no se puede explicar claramente ese recorrido,
la funcionalidad todavía no está arquitectónicamente terminada.

---

# 50. OBJETIVO FINAL

Construir Kronos Space como un sistema coherente donde:

```text
FRONTEND
      ↕
BACKEND
      ↕
MONGODB
      ↕
REALTIME
      ↕
AI
      ↕
MEDIA
```

funcionen como una sola plataforma.

La prioridad arquitectónica es:

1. estabilidad;
2. seguridad;
3. integración;
4. mantenibilidad;
5. escalabilidad;
6. experiencia de usuario;
7. producción.

No agregar complejidad sin beneficio real.

No cambiar el alcance.

No duplicar soluciones.

No romper lo que ya funciona.

Construir sobre la arquitectura existente hasta completar Kronos.

