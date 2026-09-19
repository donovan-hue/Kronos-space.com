# KRONOS SCRIPT AI

## 1. IDENTIDAD

* **Nombre:** `kronos-script-ai`
* **Proyecto:** Kronos Space
* **Ruta:** `.agents/skills/kronos-script-ai/SKILL.md`
* **Tipo:** AI Script Generation Architecture & Development Skill
* **Estado:** Producción

---

## 2. PROPÓSITO

Esta skill controla exclusivamente el módulo de **generación de guiones mediante IA** de Kronos Space.

Su responsabilidad incluye:

* generación de guiones;
* creación de historias;
* desarrollo de escenas;
* estructura narrativa;
* personajes;
* diálogos;
* instrucciones de generación;
* configuración del guion;
* procesamiento;
* estados de generación;
* resultados;
* historial;
* almacenamiento;
* MongoDB mediante el backend;
* comunicación Frontend ↔ Backend;
* integración con proveedores de IA;
* validación;
* errores;
* seguridad;
* límites de uso;
* producción.

No controla directamente:

* la red social;
* publicaciones sociales;
* mensajes;
* notificaciones;
* generación multimedia;
* configuración general de la aplicación.

---

# 3. REGLA PRINCIPAL DE ARQUITECTURA

El flujo obligatorio es:

```text
Kronos Script AI UI
        ↓
Frontend
        ↓
Kronos Backend
        ↓
Servicio de IA
        ↓
Proveedor configurado
        ↓
Respuesta de IA
        ↓
Procesamiento/validación
        ↓
MongoDB
        ↓
Frontend
```

El frontend **NO debe comunicarse directamente con las API privadas de IA**.

Las claves y credenciales permanecen exclusivamente en el backend.

---

# 4. RESPONSABILIDAD DEL BACKEND

El backend controla:

* autenticación;
* autorización;
* validación;
* construcción de prompts;
* selección del modelo;
* configuración del proveedor;
* llamada a la IA;
* procesamiento de respuestas;
* normalización de resultados;
* manejo de errores;
* límites;
* cuotas;
* persistencia;
* historial;
* estados;
* seguridad.

El frontend nunca debe asumir que una generación fue exitosa hasta recibir confirmación válida del backend.

---

# 5. RESPONSABILIDAD DEL FRONTEND

El frontend controla:

* formulario del guion;
* selección de opciones;
* entrada de datos;
* selección de género;
* duración;
* tono;
* estructura;
* personajes;
* configuración visual;
* estados de carga;
* procesamiento;
* resultado;
* edición;
* historial;
* errores;
* navegación.

Debe mostrar siempre el estado real proveniente del backend.

---

# 6. ARQUITECTURA INTERNA

La arquitectura debe mantener separación clara:

```text
AI Script Screen
        ↓
Script Components
        ↓
Script Hooks
        ↓
Script Service
        ↓
Kronos Backend
        ↓
Script Controller
        ↓
Script Service
        ↓
AI Provider
        ↓
MongoDB
```

No mezclar lógica de generación con componentes visuales.

---

# 7. GENERACIÓN DE GUIONES

El módulo debe permitir generar guiones profesionales utilizando los datos proporcionados por el usuario.

La generación puede considerar:

* título;
* idea principal;
* género;
* subgénero;
* tono;
* público;
* duración;
* formato;
* personajes;
* conflicto;
* escenario;
* época;
* estilo narrativo;
* estructura;
* instrucciones adicionales.

Solo deben utilizarse parámetros realmente soportados por la implementación.

No inventar opciones que el backend no procese.

---

# 8. ESTRUCTURA NARRATIVA

El sistema debe poder trabajar con estructuras narrativas reales.

Cuando corresponda:

```text
Introducción
↓
Presentación
↓
Conflicto
↓
Desarrollo
↓
Clímax
↓
Resolución
```

La estructura definitiva dependerá de la configuración seleccionada y de la implementación real.

No imponer una estructura cuando el usuario haya seleccionado otra.

---

# 9. FORMATO PROFESIONAL

El resultado debe estar organizado para facilitar su utilización por creadores.

Puede incluir:

* título;
* logline;
* sinopsis;
* personajes;
* escenas;
* acciones;
* diálogos;
* transiciones;
* notas narrativas;
* instrucciones de producción cuando correspondan.

No agregar elementos ficticios solamente para hacer parecer profesional el resultado.

---

# 10. PERSONAJES

Los personajes deben poder manejar información estructurada.

Ejemplo conceptual:

```text
Personaje
├── Nombre
├── Edad
├── Rol
├── Personalidad
├── Objetivo
├── Conflicto
├── Motivación
└── Relaciones
```

La estructura definitiva debe coincidir con el contrato real del backend.

No inventar campos MongoDB.

---

# 11. ESCENAS

Las escenas deben poder representar, cuando corresponda:

* número;
* ubicación;
* interior/exterior;
* momento del día;
* descripción;
* acción;
* personajes;
* diálogos;
* transición.

Ejemplo conceptual:

```text
SCENE 01

INT. LOCATION — NIGHT

Descripción de la escena.

CHARACTER
Diálogo.

Acción.

CHARACTER
Respuesta.
```

El formato definitivo debe respetar la respuesta real del sistema.

---

# 12. PROMPT ENGINEERING

Los prompts deben construirse en el backend.

El frontend envía información estructurada.

El backend transforma esa información en la instrucción final para el modelo.

```text
User Input
    ↓
Validation
    ↓
Prompt Builder
    ↓
AI Provider
    ↓
Response Parser
    ↓
Script Result
```

No colocar secretos ni lógica crítica de prompting exclusivamente en el frontend.

---

# 13. PROVEEDORES DE IA

Kronos utiliza los proveedores realmente configurados en el proyecto.

Actualmente la arquitectura contempla:

* OpenAI;
* Google GenAI.

Antes de implementar un proveedor debe verificarse:

* modelo disponible;
* endpoint;
* formato de solicitud;
* formato de respuesta;
* límites;
* capacidades;
* errores;
* costos;
* compatibilidad con la implementación actual.

No agregar proveedores innecesarios.

---

# 14. API KEYS

Las claves de IA deben existir únicamente en el backend.

Nunca:

```text
NEXT_PUBLIC_OPENAI_KEY
```

ni:

```text
VITE_OPENAI_KEY
```

ni cualquier variable equivalente expuesta al navegador.

Las credenciales deben permanecer en variables privadas del servidor.

---

# 15. CONTRATO FRONTEND ↔ BACKEND

Antes de conectar el frontend se debe conocer el contrato real.

Debe definirse:

```text
METHOD
ENDPOINT
AUTH
REQUEST BODY
RESPONSE BODY
ERROR FORMAT
STATUS
GENERATION ID
```

Ejemplo conceptual:

```text
POST /api/script/generate
```

Pero el endpoint definitivo debe ser el existente en Kronos.

No inventar rutas si ya existe una implementación.

---

# 16. AUTENTICACIÓN

Toda generación asociada a un usuario debe estar protegida mediante el sistema de autenticación real de Kronos.

El backend debe identificar al usuario autenticado.

No confiar en:

```text
userId
```

enviado únicamente desde el frontend.

La identidad debe derivarse de la sesión/token autenticado.

---

# 17. AUTORIZACIÓN

El usuario solo puede:

* crear sus propias generaciones;
* consultar su propio historial;
* modificar recursos que le pertenezcan;
* eliminar recursos autorizados.

Nunca permitir acceso a generaciones de otro usuario mediante manipulación del ID.

---

# 18. VALIDACIÓN DE ENTRADA

Antes de enviar una generación al proveedor:

* validar campos obligatorios;
* validar tipos;
* validar longitudes;
* validar opciones permitidas;
* validar límites;
* limpiar entradas cuando corresponda;
* rechazar datos inválidos.

No enviar solicitudes claramente inválidas al proveedor.

---

# 19. ESTADOS DE GENERACIÓN

Cuando la generación sea asíncrona, debe utilizar estados reales.

Conceptualmente:

```text
idle
queued
processing
completed
failed
cancelled
```

Solo utilizar estados que existan realmente en el backend.

El frontend debe reflejar el estado real.

---

# 20. GENERACIÓN ASÍNCRONA

Si el proveedor o backend requiere procesamiento prolongado:

```text
Request
 ↓
Generation Created
 ↓
Processing
 ↓
AI Provider
 ↓
Result
 ↓
Persistence
 ↓
Completed
```

No mantener innecesariamente una petición HTTP abierta durante procesos largos si la arquitectura real permite procesamiento asíncrono.

---

# 21. SOCKET.IO

Si Kronos utiliza Socket.IO para informar progreso, el módulo puede utilizar eventos como:

```text
script.created
script.processing
script.completed
script.failed
```

Estos nombres son conceptuales.

Los nombres definitivos deben coincidir con los implementados en el backend.

No inventar eventos independientes en frontend.

---

# 22. POLLING

Cuando Socket.IO no esté disponible y el backend proporcione estados consultables, puede utilizarse polling.

Debe tener:

* intervalo controlado;
* máximo de intentos;
* timeout;
* limpieza;
* condición de finalización;
* manejo de errores.

Nunca crear polling infinito.

---

# 23. PREVENCIÓN DE DUPLICADOS

El sistema debe evitar generaciones accidentales duplicadas.

Especialmente cuando:

* el usuario hace doble clic;
* el navegador reintenta;
* existe timeout;
* Socket.IO reconecta;
* el frontend vuelve a montar un componente.

Cuando corresponda utilizar:

* request ID;
* generation ID;
* idempotency key;
* bloqueo temporal del botón.

Solo implementar mecanismos compatibles con el backend real.

---

# 24. HISTORIAL

Cada generación persistida debe poder recuperarse mediante el backend cuando la arquitectura lo contemple.

El historial debe mostrar información real.

No utilizar:

```text
mockScripts
fakeScripts
demoScripts
```

como sustituto de MongoDB en producción.

---

# 25. PAGINACIÓN

El historial debe utilizar paginación cuando pueda crecer considerablemente.

Ejemplo conceptual:

```text
page
limit
cursor
nextCursor
hasMore
```

La implementación definitiva debe coincidir con el backend real.

Evitar descargar todo el historial de un usuario en una sola petición.

---

# 26. EDICIÓN

Si Kronos permite editar un guion generado:

```text
Original Generation
        ↓
User Edit
        ↓
Save
        ↓
Backend Validation
        ↓
MongoDB
```

No guardar directamente desde el navegador en MongoDB.

---

# 27. VERSIONES

Si el sistema implementa versiones:

```text
Script
├── Version 1
├── Version 2
├── Version 3
└── Current Version
```

Las versiones deben estar respaldadas por datos reales.

No simular versiones únicamente en memoria del frontend.

---

# 28. RESPUESTA DE IA

La respuesta del proveedor debe procesarse antes de enviarse al frontend.

```text
Provider Response
        ↓
Validation
        ↓
Normalization
        ↓
Persistence
        ↓
Frontend Response
```

No asumir que la respuesta siempre tendrá el formato esperado.

---

# 29. NORMALIZACIÓN

El backend debe convertir respuestas diferentes de proveedores a un contrato interno consistente cuando sea necesario.

Esto permite:

```text
OpenAI
   ↓
        Kronos Script Format
   ↑
Google GenAI
```

El frontend trabaja con el formato de Kronos, no con formatos internos específicos de cada proveedor.

---

# 30. MANEJO DE ERRORES

El sistema debe contemplar como mínimo:

```text
400 Bad Request
401 Unauthorized
403 Forbidden
404 Not Found
409 Conflict
422 Validation Error
429 Rate Limit
500 Internal Server Error
502 Provider Error
503 Service Unavailable
```

También:

* timeout;
* conexión perdida;
* proveedor no disponible;
* respuesta inválida;
* generación fallida;
* sesión expirada.

Los errores internos sensibles no deben mostrarse directamente al usuario.

---

# 31. NORMALIZACIÓN DE ERRORES DE IA

Los errores del proveedor deben transformarse en errores entendibles por Kronos.

Ejemplo:

```text
Provider Error
      ↓
Backend Error Handler
      ↓
Kronos Error
      ↓
Frontend
```

No exponer:

* API keys;
* headers privados;
* stack traces;
* información interna;
* credenciales.

---

# 32. LÍMITES Y COSTOS

La generación de guiones consume recursos del proveedor.

El backend debe controlar:

* frecuencia;
* límites;
* tamaño de entrada;
* cantidad de generaciones;
* reintentos;
* timeouts.

Nunca implementar reintentos infinitos.

---

# 33. REINTENTOS

Solo repetir una generación cuando el error sea razonablemente recuperable.

Ejemplos posibles:

* timeout;
* error temporal;
* servicio temporalmente no disponible.

No repetir automáticamente errores como:

* entrada inválida;
* autorización;
* contenido rechazado;
* configuración incorrecta.

---

# 34. CANCELACIÓN

La cancelación solo debe existir si el backend/proveedor realmente la soporta.

Si no existe cancelación real:

* no simularla;
* no mostrarla como cancelación real;
* limpiar únicamente el estado del cliente si corresponde.

---

# 35. MONGODB

MongoDB debe ser accesible exclusivamente mediante el backend.

```text
Frontend
   ↓
Backend
   ↓
Mongoose
   ↓
MongoDB Atlas
```

Nunca:

```text
Frontend → MongoDB
```

No crear modelos o campos duplicados si ya existen.

Antes de modificar un modelo:

1. revisar el esquema existente;
2. revisar controladores;
3. revisar servicios;
4. revisar rutas;
5. revisar consumidores frontend;
6. mantener compatibilidad.

---

# 36. SEGURIDAD

La implementación debe respetar:

* autenticación;
* autorización;
* validación;
* rate limiting cuando corresponda;
* protección de credenciales;
* sanitización;
* CORS configurado;
* Helmet;
* manejo seguro de errores;
* límites de payload;
* control de acceso a historial.

No confiar en validaciones exclusivamente frontend.

---

# 37. ARQUITECTURA FRONTEND

La organización recomendada es:

```text
AI Script/
├── components/
├── hooks/
├── services/
├── types/
├── utils/
└── constants/
```

Componentes posibles:

```text
ScriptGenerator
ScriptForm
ScriptSettings
CharacterEditor
SceneEditor
ScriptResult
ScriptHistory
ScriptViewer
ScriptActions
```

Solo crear los componentes que realmente necesite la implementación.

---

# 38. INTEGRACIÓN CON `kronos-frontend`

El flujo debe mantenerse:

```text
Screen
 ↓
Component
 ↓
Hook
 ↓
Script Service
 ↓
Kronos Backend
```

`kronos-script-ai` debe trabajar junto con:

* `kronos-frontend`;
* `kronos-backend`;
* `kronos-mongodb`;
* `kronos-auth-security`;
* `kronos-production`.

No duplicar responsabilidades de esas skills.

---

# 39. SEPARACIÓN DE MÓDULOS

### Social

Pertenece a:

```text
kronos-social
```

### AI Media

Pertenece a:

```text
kronos-ai-media
```

### AI Script

Pertenece a:

```text
kronos-script-ai
```

Si un guion generado se utiliza para crear una imagen o video:

```text
Script AI
   ↓
AI Media
```

Si un guion terminado se publica como contenido social:

```text
Script AI
   ↓
Social Create Post
```

Script AI no debe asumir el control de publicación social ni generación multimedia.

---

# 40. IDENTIDAD VISUAL Y OBJETIVO FINAL

La sección **AI Script** de Kronos debe utilizar exclusivamente su identidad visual definida:

```text
DEEP BLACK
+
PINK CHROME MIRROR
+
MINIMALIST
```

No utilizar como identidad principal:

* cobre de AI Media;
* plata/cromo de Social;
* colores adicionales que rompan la identidad establecida.

El objetivo final es:

```text
KRONOS SPACE
│
├── SOCIAL
│   └── Red Social
│
├── AI MEDIA
│   ├── Image AI
│   └── Video AI
│
└── AI SCRIPT
    ├── Script Generator
    ├── Characters
    ├── Scenes
    ├── Professional Script
    └── Script History
```

Flujo del módulo:

```text
USER
 ↓
KRONOS FRONTEND
 ↓
SCRIPT AI UI
 ↓
SCRIPT SERVICE
 ↓
KRONOS BACKEND
 ↓
AUTH + VALIDATION
 ↓
SCRIPT GENERATION SERVICE
 ↓
OPENAI / GOOGLE GENAI
 ↓
RESPONSE NORMALIZATION
 ↓
MONGODB
 ↓
KRONOS FRONTEND
 ↓
SCRIPT RESULT
```

### PRIORIDADES

1. Arquitectura real de Kronos.
2. Backend real.
3. Proveedores reales.
4. Seguridad.
5. Validación.
6. Generación confiable.
7. Resultado estructurado.
8. Persistencia.
9. Historial.
10. Integración frontend.
11. Integración con las 18 pantallas.
12. Producción.

### REGLA FINAL

No inventar endpoints.

No inventar modelos.

No inventar campos MongoDB.

No inventar proveedores.

No exponer API keys.

No crear datos falsos para producción.

No duplicar lógica existente.

No romper módulos funcionales.

No modificar el alcance de Kronos Space.

Cada implementación debe conectarse con la arquitectura real existente y conservar compatibilidad con el resto del proyecto.

