# KRONOS PRODUCTION

## 1. IDENTIDAD

* **Nombre:** `kronos-production`
* **Proyecto:** Kronos Social AI
* **Ruta:** `.agents/skills/kronos-production/SKILL.md`
* **Tipo:** Production, Deployment & Reliability Skill
* **Estado:** Producción

Esta skill controla la preparación, validación, configuración y despliegue de Kronos Social AI en entornos reales.

---

# 2. PROPÓSITO

Esta skill garantiza que Kronos pueda ejecutarse de forma:

* estable;
* segura;
* reproducible;
* verificable;
* mantenible;
* escalable;
* preparada para producción.

Debe coordinar:

```text
Frontend
Backend
MongoDB
Socket.IO
AI Providers
Storage
Environment Variables
Build
Deployment
Monitoring
```

No debe cambiar el alcance funcional del proyecto.

---

# 3. REGLA PRINCIPAL

**NO declarar producción lista sin evidencia.**

Antes de considerar Kronos terminado:

```text
Código
 ↓
Build
 ↓
Configuración
 ↓
Integraciones
 ↓
Pruebas
 ↓
Deployment
 ↓
Verificación
 ↓
Producción
```

Un deployment exitoso no significa automáticamente que la aplicación esté funcionando correctamente.

---

# 4. ENTORNOS

Separar claramente:

```text
Development
Staging
Production
```

Cuando el proyecto no tenga staging, no inventarlo.

Las configuraciones deben distinguirse mediante variables de entorno y configuración real del proyecto.

Nunca utilizar secretos de producción como valores hardcodeados.

---

# 5. VARIABLES DE ENTORNO

Todas las variables críticas deben estar documentadas y utilizadas correctamente.

Conceptualmente:

```text
DATABASE_URL / MONGODB_URI
JWT_SECRET
OPENAI_API_KEY
GOOGLE_API_KEY
STORAGE credentials
FRONTEND_URL
BACKEND_URL
PORT
NODE_ENV
```

Los nombres definitivos deben coincidir con los utilizados realmente por Kronos.

Nunca inventar variables y asumir que existen.

---

# 6. SECRETOS

Los secretos deben permanecer exclusivamente en los servicios correspondientes.

Nunca:

```text
GitHub repository
frontend bundle
client source
public environment variable
logs
screenshots
documentation
```

No imprimir secretos mediante:

```javascript
console.log(process.env.OPENAI_API_KEY);
```

No incluir valores reales en archivos de configuración versionados.

---

# 7. GIT Y REPOSITORIO

Antes de producción comprobar:

```text
source controlled
working tree
commits
branches
ignored files
secrets
```

El `.gitignore` debe impedir que entren archivos sensibles o generados.

Ejemplos:

```text
.env
.env.*
node_modules/
dist/
build/
coverage/
logs/
```

La lista definitiva debe adaptarse al repositorio.

No ignorar archivos necesarios para producción.

---

# 8. PACKAGE.JSON

Revisar:

* `name`;
* `version`;
* `scripts`;
* `dependencies`;
* `devDependencies`;
* `engines`.

Los scripts reales deben permitir ejecutar:

```bash
npm install
npm run build
npm start
```

cuando correspondan al proyecto.

No agregar scripts ficticios.

---

# 9. NODE.JS

La versión de Node.js debe ser coherente entre:

```text
package.json
Render
desarrollo local
CI/CD
```

Si existe una discrepancia:

1. identificar la versión realmente soportada;
2. revisar dependencias;
3. revisar build;
4. actualizar configuración necesaria;
5. validar localmente;
6. validar deployment.

No cambiar la versión únicamente para ocultar un error.

---

# 10. BUILD

El build de producción debe ejecutarse sin errores.

Comprobar:

```bash
npm install
npm run build
```

cuando el proyecto tenga esos scripts.

Buscar:

* imports rotos;
* módulos faltantes;
* variables inexistentes;
* errores de compilación;
* errores de tipos;
* assets faltantes;
* rutas incorrectas.

Un build fallido impide aprobar producción.

---

# 11. BACKEND STARTUP

El backend debe iniciar correctamente utilizando:

```bash
npm start
```

cuando ese sea el script real.

Verificar:

```text
Express
MongoDB
middleware
routes
Socket.IO
AI services
storage
environment
```

Un servicio no debe depender de archivos locales inexistentes en producción.

---

# 12. FRONTEND STARTUP

El frontend debe:

* generar build;
* cargar correctamente;
* resolver assets;
* resolver rutas;
* comunicarse con backend;
* respetar variables públicas;
* manejar errores.

No utilizar URLs localhost en producción.

---

# 13. RENDER

Cuando el backend esté desplegado en Render, verificar:

```text
Repository
Branch
Build Command
Start Command
Node Version
Environment Variables
Port
Health
Logs
```

El deployment debe utilizar la configuración real del repositorio.

No modificar comandos de Render sin comprobar los scripts existentes.

---

# 14. VERCEL

Cuando el frontend esté desplegado en Vercel, verificar:

```text
Repository
Project
Framework
Build Command
Output
Environment Variables
Domain
API URL
```

La URL del backend debe apuntar al backend real de producción.

Nunca utilizar:

```text
localhost
127.0.0.1
```

como API de producción.

---

# 15. MONGODB ATLAS

Verificar:

```text
connection
database
collections
users
indexes
permissions
network access
```

El backend debe ser el único responsable de acceder a MongoDB.

Flujo:

```text
Vercel Frontend
      ↓
Render Backend
      ↓
Mongoose
      ↓
MongoDB Atlas
```

No conectar el navegador directamente con MongoDB.

---

# 16. CONEXIÓN DE BASE DE DATOS

La aplicación debe manejar correctamente:

```text
connected
connecting
disconnected
error
```

No iniciar operaciones que requieran MongoDB antes de tener la conexión disponible cuando la arquitectura lo exija.

Los errores de conexión deben registrarse sin revelar credenciales.

---

# 17. HEALTH CHECK

Cuando el backend lo soporte, debe existir un mecanismo para comprobar:

```text
service alive
database status
```

Ejemplo conceptual:

```text
GET /health
```

Pero el endpoint definitivo debe coincidir con el backend real.

No inventar endpoints solamente para cumplir esta sección.

---

# 18. API

Antes de producción comprobar:

```text
authentication
users
posts
comments
likes
follow
messages
notifications
uploads
AI Media
AI Script
settings
```

Cada endpoint debe:

* existir;
* responder correctamente;
* validar entradas;
* validar autenticación;
* validar autorización;
* devolver errores coherentes.

---

# 19. AUTENTICACIÓN

Validar en producción:

```text
register
login
session
token
expiration
protected routes
logout
```

Comprobar que:

* las credenciales viajen de forma segura;
* los secretos permanezcan en backend;
* las rutas privadas estén protegidas;
* la expiración de sesión sea manejada.

---

# 20. SOCKET.IO

Verificar:

```text
connection
authentication
CORS
rooms
events
disconnect
reconnect
cleanup
```

Las URLs y configuración deben coincidir entre frontend y backend.

Los nombres de eventos deben ser los reales del proyecto.

No inventar eventos para producción.

---

# 21. MULTIMEDIA

Validar producción para:

```text
image upload
video upload
AI image result
AI video result
preview
storage
URLs
cleanup
```

No depender de almacenamiento temporal local si el recurso debe sobrevivir a reinicios del servidor.

---

# 22. AI PROVIDERS

Antes de producción comprobar:

```text
provider credentials
model
endpoint
request
response
timeouts
limits
errors
cost controls
```

Las API keys deben permanecer en variables privadas del backend.

No permitir llamadas directas desde frontend a proveedores privados.

---

# 23. AI MEDIA

Validar:

```text
image generation
video generation
async jobs
processing
result
storage
history
errors
limits
```

No declarar generación funcional si solamente existe una interfaz visual.

Debe existir una cadena real:

```text
UI
 ↓
Backend
 ↓
Provider
 ↓
Result
 ↓
Storage
 ↓
Database
 ↓
UI
```

---

# 24. AI SCRIPT

Validar:

```text
script generation
prompt validation
provider
response normalization
persistence
history
errors
limits
```

El resultado debe estar respaldado por la implementación real.

No utilizar guiones ficticios como sustituto de la IA en producción.

---

# 25. RED SOCIAL

Validar:

```text
Feed
Explore
Profile
Posts
Comments
Likes
Follow
Create Post
Messages
Notifications
Settings
```

Las operaciones deben utilizar backend real.

No dejar módulos críticos conectados únicamente a mocks.

---

# 26. LAS 18 PANTALLAS

Antes de aprobar producción debe revisarse la integración de las 18 pantallas.

Cada pantalla debe clasificarse:

```text
CONECTADA
PARCIAL
DESCONECTADA
ROTA
NO IMPLEMENTADA
```

Una pantalla solamente visual no se considera terminada.

Debe existir el flujo:

```text
Screen
 ↓
Frontend
 ↓
Backend
 ↓
Database / Provider
```

cuando la funcionalidad lo requiera.

---

# 27. CORS

La configuración de CORS debe permitir únicamente los orígenes necesarios.

No utilizar una configuración abierta permanentemente sin justificación.

Evitar:

```javascript
origin: "*"
```

cuando existan operaciones autenticadas que requieran credenciales.

La configuración definitiva debe coincidir con la arquitectura real.

---

# 28. SEGURIDAD HTTP

Cuando ya estén instalados y utilizados, verificar:

```text
Helmet
CORS
compression
request limits
authentication
authorization
```

No añadir middleware innecesario.

No eliminar protecciones existentes sin una razón técnica.

---

# 29. LOGGING

Los logs de producción deben permitir detectar:

```text
startup
database connection
request failures
AI failures
storage failures
critical errors
```

Nunca registrar:

```text
passwords
tokens
API keys
MongoDB URI
private credentials
```

Los logs deben ser útiles sin revelar información sensible.

---

# 30. ERRORES

Producción debe manejar:

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
database error
network error
provider error
```

El usuario debe recibir mensajes controlados.

No mostrar stack traces internos en la interfaz.

---

# 31. TIMEOUTS

Las operaciones externas deben tener límites razonables.

Aplicar cuando corresponda a:

```text
AI provider
storage
database operations
HTTP requests
Socket connections
```

No permitir operaciones que puedan permanecer abiertas indefinidamente.

---

# 32. RATE LIMITING

Las operaciones sensibles o costosas deben tener protección cuando corresponda:

```text
login
register
AI generation
uploads
messages
search
```

La implementación definitiva debe respetar la arquitectura y dependencias existentes.

No añadir límites arbitrarios que bloqueen funcionalidades legítimas.

---

# 33. COSTOS DE IA

Las generaciones de IA representan consumo real.

Antes de producción comprobar:

```text
limits
quotas
duplicate prevention
timeouts
retry policy
```

Nunca permitir loops de generación automáticos.

Especial atención a:

```text
double submit
automatic retries
polling loops
socket reconnect loops
```

---

# 34. PERFORMANCE

Revisar:

```text
database queries
indexes
pagination
API response size
media size
frontend rendering
Socket.IO
AI processing
```

No realizar optimizaciones masivas sin evidencia.

La estabilidad tiene prioridad.

---

# 35. BACKUPS Y DATOS

Los datos críticos deben contar con las capacidades de recuperación proporcionadas por la infraestructura utilizada.

Comprobar especialmente:

```text
users
posts
messages
notifications
AI history
scripts
```

No asumir que un backup existe sin verificar la configuración real.

---

# 36. DEPLOYMENT

El proceso debe ser reproducible:

```text
GitHub
 ↓
Build
 ↓
Deploy
 ↓
Startup
 ↓
Health
 ↓
Verification
```

Después de cada deployment importante comprobar logs y comportamiento real.

---

# 37. ROLLBACK

Debe existir una forma de regresar a una versión funcional cuando un deployment provoque una regresión.

Antes de cambios críticos:

```text
identify current version
 ↓
deploy new version
 ↓
verify
 ↓
rollback if necessary
```

No considerar rollback solamente como “volver a editar código”.

---

# 38. MONITOREO

Después de producción observar:

```text
errors
latency
database
CPU
memory
restarts
AI failures
Socket.IO
uploads
```

Utilizar las herramientas reales disponibles en Render, Vercel, MongoDB Atlas y el proyecto.

No inventar métricas que la infraestructura no proporcione.

---

# 39. CHECKLIST FINAL

Antes de declarar Kronos listo:

```text
[ ] GitHub actualizado
[ ] Secrets protegidos
[ ] .gitignore correcto
[ ] package.json válido
[ ] Node compatible
[ ] npm install correcto
[ ] Build correcto
[ ] Backend inicia
[ ] Frontend inicia
[ ] MongoDB conectado
[ ] Authentication funcionando
[ ] Authorization funcionando
[ ] API funcionando
[ ] Socket.IO funcionando
[ ] Uploads funcionando
[ ] AI Media funcionando
[ ] AI Script funcionando
[ ] Social funcionando
[ ] 18 pantallas verificadas
[ ] CORS correcto
[ ] Errors controlados
[ ] Logs seguros
[ ] Timeouts configurados
[ ] Límites revisados
[ ] Deployment verificado
[ ] Rollback disponible
[ ] Producción estable
```

---

# 40. OBJETIVO FINAL

`kronos-production` debe garantizar que Kronos Social AI pueda pasar de código a producción mediante un proceso controlado:

```text
                 KRONOS SOCIAL AI
                         │
                         ▼
                    GITHUB
                         │
                         ▼
                  BUILD / VALIDATE
                         │
              ┌──────────┴──────────┐
              ▼                     ▼
          VERCEL                  RENDER
        FRONTEND                 BACKEND
              │                     │
              └──────────┬──────────┘
                         ▼
                    MONGODB ATLAS
                         │
              ┌──────────┼──────────┐
              ▼          ▼          ▼
          SOCIAL      AI MEDIA   AI SCRIPT
              │          │          │
              └──────────┼──────────┘
                         ▼
                    PRODUCTION
```

### PRIORIDADES

1. Seguridad.
2. Integridad del código.
3. Build reproducible.
4. Configuración correcta.
5. Backend estable.
6. Frontend estable.
7. MongoDB estable.
8. APIs funcionando.
9. Socket.IO funcionando.
10. Multimedia funcionando.
11. IA funcionando.
12. 18 pantallas integradas.
13. Deployment verificable.
14. Monitoreo.
15. Recuperación ante fallos.

### REGLA FINAL

No declarar producción lista por apariencia.

No declarar una integración lista sin comprobarla.

No inventar variables.

No inventar endpoints.

No inventar servicios.

No exponer secretos.

No romper funcionalidades existentes.

No cambiar el alcance de Kronos Social AI.

Todo deployment debe ser:

**reproducible → verificable → seguro → estable → reversible → listo para producción.**

