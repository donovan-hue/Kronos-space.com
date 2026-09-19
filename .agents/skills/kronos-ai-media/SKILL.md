# KRONOS AI MEDIA

## Identidad

**Nombre:** `kronos-ai-media`
**Proyecto:** Kronos Space
**Ruta:** `.agents/skills/kronos-ai-media/SKILL.md`
**Tipo:** AI Image & Video Generation Architecture & Development Skill
**Estado:** Producción

---

# 1. PROPÓSITO

Esta skill controla exclusivamente el área de **generación multimedia mediante IA de Kronos Space**.

Kronos Space está compuesto por tres áreas principales:

```text
KRONOS SOCIAL
KRONOS AI MEDIA
KRONOS AI SCRIPT
```

Esta skill corresponde únicamente a:

```text
KRONOS AI MEDIA
```

Su responsabilidad comprende:

* generación de imágenes mediante IA;
* generación de videos mediante IA;
* prompts multimedia;
* configuración de generaciones;
* procesamiento de generaciones;
* estados de generación;
* resultados multimedia;
* almacenamiento;
* historial;
* integración con backend;
* integración con MongoDB mediante backend;
* integración con Socket.IO cuando corresponda;
* integración frontend ↔ backend;
* control de errores;
* seguridad;
* control de solicitudes;
* preparación para producción.

No debe absorber la lógica perteneciente a:

```text
KRONOS SOCIAL
KRONOS AI SCRIPT
```

---

# 2. REGLA PRINCIPAL DE KRONOS

Toda generación multimedia debe utilizar infraestructura real.

Flujo obligatorio:

```text
Kronos AI Media UI
        ↓
Frontend
        ↓
Kronos Backend
        ↓
AI Service
        ↓
AI Provider
        ↓
Result
        ↓
Storage
        ↓
MongoDB
        ↓
Kronos Frontend
```

El frontend nunca debe comunicarse directamente con proveedores privados de IA.

---

# 3. PROVEEDORES DE IA

El proyecto Kronos ya contempla integración con:

```text
OpenAI
Google GenAI
```

La implementación debe utilizar las dependencias y servicios realmente presentes en el proyecto.

No introducir un proveedor adicional solamente porque sea popular.

No asumir que un modelo, endpoint o capacidad existe.

Antes de implementar:

```text
provider
model
endpoint
request
response
capabilities
limits
```

deben verificarse contra la implementación real del backend y la documentación correspondiente.

---

# 4. UBICACIÓN DE LAS API KEYS

Las credenciales de IA pertenecen exclusivamente al backend.

Nunca colocar en frontend:

```text
OPENAI_API_KEY
GOOGLE_API_KEY
GEMINI_API_KEY
```

ni ninguna otra credencial privada.

Arquitectura:

```text
Frontend
   │
   │ authenticated request
   ▼
Kronos Backend
   │
   ├── OpenAI
   │
   └── Google GenAI
```

El frontend únicamente recibe resultados o estados autorizados.

---

# 5. RESPONSABILIDADES DEL BACKEND

El backend debe controlar:

```text
authentication
authorization
prompt validation
generation validation
provider selection
provider credentials
AI request
provider response
errors
limits
storage
database persistence
generation status
```

El frontend no debe implementar estas responsabilidades.

---

# 6. RESPONSABILIDADES DEL FRONTEND

El frontend controla:

```text
prompt input
generation controls
UI state
loading
processing
preview
result display
history display
user feedback
errors
responsive interface
```

El frontend consume el contrato proporcionado por backend.

---

# 7. ARQUITECTURA DE KRONOS AI MEDIA

La arquitectura conceptual es:

```text
KRONOS AI MEDIA
        │
        ├── Image Generation
        │
        ├── Video Generation
        │
        ├── Generation Status
        │
        ├── Generation Results
        │
        └── Generation History
                 │
                 ▼
          Kronos Backend
                 │
        ┌────────┴────────┐
        ▼                 ▼
   OpenAI             Google GenAI
        │                 │
        └────────┬────────┘
                 ▼
              Storage
                 │
                 ▼
              MongoDB
```

La implementación real debe respetar la estructura existente del repositorio.

---

# 8. SEPARACIÓN DE IMAGEN Y VIDEO

Imagen y video son capacidades relacionadas, pero no deben mezclarse indiscriminadamente.

Separar:

```text
Image Generation
Video Generation
```

Cada una puede tener:

```text
request
validation
processing
status
result
error
```

propios.

No crear una abstracción genérica si termina ocultando diferencias importantes entre imagen y video.

---

# 9. GENERACIÓN DE IMÁGENES

Flujo:

```text
Prompt
   ↓
Frontend Validation
   ↓
Backend Validation
   ↓
AI Service
   ↓
AI Provider
   ↓
Image Result
   ↓
Storage
   ↓
MongoDB
   ↓
Frontend
```

El frontend debe considerar una generación completada solamente cuando el backend confirme el resultado.

No utilizar resultados ficticios.

---

# 10. GENERACIÓN DE VIDEO

El video puede requerir procesamiento prolongado o asíncrono.

Flujo:

```text
Prompt
   ↓
Create Generation
   ↓
Backend
   ↓
AI Provider
   ↓
Generation Job
   ↓
Processing
   ↓
Completed / Failed
   ↓
Storage
   ↓
MongoDB
   ↓
Frontend
```

Nunca asumir que la respuesta inicial contiene inmediatamente el video final.

La implementación debe adaptarse al proveedor realmente utilizado.

---

# 11. ESTADOS DE GENERACIÓN

Los estados deben representar el estado real.

Como mínimo, cuando correspondan:

```text
idle
queued
processing
completed
failed
cancelled
```

No crear estados ficticios que no correspondan al backend.

Ejemplo:

```text
queued
   ↓
processing
   ↓
completed
```

o:

```text
queued
   ↓
processing
   ↓
failed
```

---

# 12. GENERACIONES ASÍNCRONAS

Cuando el proveedor no entregue el resultado inmediatamente:

```text
Create Job
    ↓
Job ID
    ↓
Track Status
    ↓
Completed
    ↓
Retrieve Result
```

El seguimiento debe utilizar únicamente el mecanismo definido por Kronos:

```text
Socket.IO
o
API polling
```

No inventar otro sistema.

---

# 13. SOCKET.IO

Kronos utiliza Socket.IO para funcionalidades de tiempo real.

Cuando AI Media utilice eventos en tiempo real, los eventos deben coincidir exactamente con los definidos en backend.

Conceptualmente:

```text
generation.created
generation.processing
generation.completed
generation.failed
```

Los nombres anteriores son conceptuales.

Los nombres definitivos deben provenir del backend real.

Nunca crear eventos frontend que el servidor no emita.

---

# 14. POLLING

Si una generación requiere polling:

```text
Create Generation
      ↓
Receive Generation ID
      ↓
Request Status
      ↓
Processing
      ↓
Request Status
      ↓
Completed / Failed
```

Debe existir:

```text
maximum attempts
timeout
cleanup
stop on completed
stop on failed
```

Nunca crear polling infinito.

---

# 15. PROMPTS

Los prompts multimedia deben validarse.

Validar:

```text
type
required
trim
minimum length
maximum length
```

El límite definitivo debe coincidir con el backend.

Ejemplo:

```javascript
export function validatePrompt(prompt) {
    if (typeof prompt !== "string") {
        throw new Error("Prompt must be a string");
    }

    const normalized = prompt.trim();

    if (!normalized) {
        throw new Error("Prompt cannot be empty");
    }

    if (normalized.length > 5000) {
        throw new Error("Prompt is too long");
    }

    return normalized;
}
```

La validación frontend nunca reemplaza la validación backend.

---

# 16. CONFIGURACIÓN DE GENERACIÓN

Las opciones deben corresponder a capacidades reales del backend/proveedor.

Ejemplos:

```text
model
aspect ratio
resolution
duration
quality
style
```

No enviar parámetros arbitrarios.

No inventar modelos.

No asumir que una opción disponible para imágenes existe para video.

---

# 17. CONTRATO BACKEND ↔ FRONTEND

Antes de conectar una pantalla AI Media verificar:

```text
HTTP method
endpoint
authentication
request body
response body
generation ID
status
result
errors
```

El frontend debe consumir el contrato real.

No modificar el backend únicamente para acomodar una suposición del frontend.

---

# 18. AUTENTICACIÓN

Las generaciones multimedia pertenecen a usuarios autenticados cuando así lo establezca el backend.

El flujo debe respetar:

```text
Authenticated User
        ↓
Authorized Request
        ↓
AI Generation
```

El backend es la autoridad final.

Nunca confiar únicamente en:

```javascript
isLoggedIn
```

para proteger una generación.

---

# 19. AUTORIZACIÓN

El backend debe controlar que el usuario pueda:

```text
create generation
view generation
view history
delete generation
```

según las reglas reales del proyecto.

El frontend puede ocultar botones, pero eso no constituye seguridad.

---

# 20. CONTROL DE DUPLICADOS

Una generación puede consumir recursos externos.

Por ello debe evitarse:

```text
double click
duplicate submit
duplicate retry
multiple active requests
```

Ejemplo:

```javascript
if (generating) {
    return;
}
```

El backend debe aplicar sus propias protecciones.

---

# 21. ERRORES

La integración debe contemplar como mínimo:

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
timeout
network error
provider error
```

No mostrar al usuario secretos, stack traces ni información privada del proveedor.

---

# 22. ERRORES DE PROVEEDOR

Los errores externos deben ser normalizados por el backend cuando sea necesario.

Frontend:

```text
Provider Error
      ↓
Kronos Error
      ↓
User Message
```

No exponer directamente respuestas técnicas del proveedor si contienen información innecesaria.

---

# 23. CUOTAS Y COSTOS

Las generaciones de IA deben considerarse operaciones reales con consumo de recursos.

Evitar:

```text
automatic generation loops
uncontrolled retries
duplicate requests
infinite polling
```

Los límites deben estar controlados por backend.

Si backend devuelve `429`, el frontend debe manejarlo correctamente.

---

# 24. RESULTADOS

Los resultados deben provenir del backend.

Ejemplo:

```javascript
const resultUrl = generation?.result?.url;
```

No construir manualmente URLs privadas si backend ya proporciona una referencia.

El resultado debe validarse antes de renderizarse.

---

# 25. STORAGE

La multimedia generada debe pasar por el sistema de almacenamiento configurado por Kronos.

Flujo:

```text
AI Provider
      ↓
Kronos Backend
      ↓
Storage
      ↓
Stored Reference
      ↓
MongoDB
```

Las credenciales privadas de storage permanecen en backend.

---

# 26. MONGODB

MongoDB no debe ser accesible directamente desde frontend.

La persistencia debe seguir:

```text
Frontend
   ↓
Backend
   ↓
Mongoose
   ↓
MongoDB
```

La información que puede persistirse incluye, según los modelos reales:

```text
user
generation
type
prompt metadata
status
result reference
createdAt
updatedAt
```

No inventar campos si no existen en el modelo.

---

# 27. HISTORIAL

El historial debe utilizar datos reales persistidos por backend.

Debe separar:

```text
Current Generation
Generation History
```

El historial no debe depender exclusivamente del estado React del navegador.

---

# 28. PAGINACIÓN DEL HISTORIAL

Si el endpoint soporta paginación:

```text
Page 1
   ↓
Load More
   ↓
Page 2
   ↓
Append
```

No reemplazar innecesariamente todo el historial.

Evitar duplicados utilizando el identificador real de generación.

---

# 29. PREVIEW DE IMAGEN

Las imágenes deben renderizarse mediante referencias válidas proporcionadas por backend.

Ejemplo:

```html
<img
    src={imageUrl}
    alt="AI generated result"
/>
```

El `alt` debe ser apropiado para el contexto.

---

# 30. PREVIEW DE VIDEO

Los videos deben utilizar controles accesibles.

Ejemplo:

```html
<video
    controls
    preload="metadata"
>
    <source src={videoUrl} />
</video>
```

No descargar archivos innecesariamente.

---

# 31. CANCELACIÓN

Cuando la arquitectura backend/proveedor lo permita:

```text
Generation
    ↓
Cancel Request
    ↓
Backend
    ↓
Provider
    ↓
Cancelled
```

Ocultar una generación en frontend no equivale a cancelarla.

---

# 32. REINTENTOS

No todas las generaciones deben reintentarse.

Reintentar únicamente cuando:

```text
error is retryable
operation is safe
backend/provider allows retry
```

Nunca reintentar automáticamente errores de validación.

Nunca crear loops de retry.

---

# 33. LIMPIEZA FRONTEND

Cuando el componente AI Media se desmonte:

```text
remove Socket.IO listeners
stop polling
cancel pending requests
release ObjectURLs
clear temporary state
```

cuando corresponda.

---

# 34. ARQUITECTURA FRONTEND

Preferir separación:

```text
AI Media
├── components/
├── hooks/
├── services/
├── types/
├── utils/
└── constants/
```

Ejemplos conceptuales:

```text
PromptInput
ImageGenerator
VideoGenerator
GenerationControls
GenerationProgress
GenerationResult
GenerationHistory
MediaPreview
GenerationError
```

No duplicar componentes existentes en Kronos.

---

# 35. INTEGRACIÓN CON KRONOS FRONTEND

La implementación debe respetar `kronos-frontend`.

Flujo:

```text
Screen
   ↓
Component
   ↓
Hook
   ↓
AI Media Service
   ↓
Kronos Backend
```

No colocar llamadas arbitrarias a proveedores dentro de componentes.

---

# 36. SEPARACIÓN DE KRONOS SOCIAL

AI Media no debe modificar directamente la lógica de:

```text
Feed
Posts
Comments
Likes
Follow
Messages
Notifications
```

Si una generación debe publicarse posteriormente en la red social:

```text
AI Media Result
      ↓
User Action
      ↓
Social Create Post
```

La publicación pertenece a `kronos-social`.

---

# 37. SEPARACIÓN DE KRONOS AI SCRIPT

La generación de:

```text
scripts
screenplays
dialogues
scenes
characters
story structures
```

pertenece a:

```text
KRONOS AI SCRIPT
```

AI Media solamente maneja:

```text
images
videos
multimedia generation
```

No mezclar ambos dominios.

---

# 38. DISEÑO VISUAL KRONOS

La identidad de AI Media debe respetar:

```text
DEEP BLACK
+
BRIGHT COPPER CHROME
```

El cobre cromado brillante es la identidad visual de esta área.

Aplicarlo principalmente a:

```text
buttons
borders
inputs
cards
controls
icons
progress
generation panels
```

No utilizar el plateado de Social como identidad principal de AI Media.

No utilizar el rosa de AI Script como identidad principal de AI Media.

---

# 39. PRODUCCIÓN

La implementación debe ser compatible con la arquitectura de despliegue de Kronos:

```text
Frontend
   ↓
Vercel
   ↓
Kronos Backend
   ↓
Render
   ↓
MongoDB Atlas
```

La configuración concreta debe utilizar las variables de entorno y servicios realmente presentes en el repositorio.

Antes de producción comprobar:

```text
✓ Environment variables
✓ API URL
✓ Authentication
✓ AI provider configuration
✓ Storage
✓ MongoDB
✓ Socket.IO
✓ CORS
✓ Timeouts
✓ Error handling
✓ Build
```

---

# 40. OBJETIVO FINAL

Kronos AI Media debe proporcionar una plataforma real de generación multimedia integrada al ecosistema Kronos:

```text
                         KRONOS SPACE
                                │
              ┌─────────────────┼─────────────────┐
              │                 │                 │
              ▼                 ▼                 ▼
        KRONOS SOCIAL     KRONOS AI MEDIA   KRONOS AI SCRIPT
                                │
                       ┌────────┴────────┐
                       ▼                 ▼
                  IMAGE AI           VIDEO AI
                       │                 │
                       └────────┬────────┘
                                ▼
                         KRONOS BACKEND
                                │
                    ┌───────────┼───────────┐
                    ▼           ▼           ▼
                 OpenAI    Google GenAI   Socket.IO
                                │
                                ▼
                             Storage
                                │
                                ▼
                            MongoDB
                                │
                                ▼
                         KRONOS FRONTEND
```

La prioridad de esta skill es:

**Kronos real → backend real → proveedores reales → generación segura → procesamiento confiable → almacenamiento → MongoDB → tiempo real → frontend integrado → producción.**

No crear funcionalidades ficticias, no introducir proveedores innecesarios, no duplicar arquitectura y no mezclar AI Media con Social o AI Script.
