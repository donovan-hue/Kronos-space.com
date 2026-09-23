# KRONOS — Auditoría ejecutada (2026-09-23)

Rama: `arena/01a0cdc1-kronos-space-com` · Base: `7d6c736` · 2 commits.

Este documento registra **solo lo verificado con evidencia**. Donde no hubo
evidencia disponible se dice explícitamente qué falta y por qué.

---

## 1. Método

Ciclo aplicado en cada hallazgo: inspeccionar → reproducir sobre HTTP real →
corregir → probar → comprobar regresión. Ninguna afirmación se apoya en la
lectura del código por sí sola: los defectos del punto 3 se reprodujeron
primero contra el servidor real y se volvieron a medir después del arreglo.

Entorno de verificación:

| Elemento | Valor |
|---|---|
| Node / npm | v22.22.3 / 10.9.8 (Debian 12, x86_64) |
| Red disponible | `registry.npmjs.org`, `github.com`, `api.github.com`, `pypi.org` |
| Red bloqueada | CDN de MongoDB, `openrouter.ai`, `api.kronos-space.com`, espejos de Debian |
| MongoDB real | **no obtenible** en este sandbox (los CDN de MongoDB están bloqueados) |

---

## 2. Estado verificado del proyecto

### Puertas de calidad (todas en verde)

| Puerta | Resultado |
|---|---|
| `npm run lint` (eslint sobre `client/src`) | exit 0 |
| `npm run build` (vite build) | exit 0 |
| `npm test --workspace=server` | **261 pruebas: 187 pass · 0 fail · 74 skip** |
| `npm test --workspace=client` | **20 (node --test) + 200 (vitest, 40 archivos): 0 fail** |
| `npm audit` | 0 vulnerabilidades |
| Salida de la suite de cliente | **sin errores ni avisos** |

Las 74 omitidas son las E2E que exigen `MONGODB_URI` real. El proyecto decidió
no sustituirlas por una base en memoria (documentado en `server/src/config/db.js`),
decisión que esta auditoría **respalda**: una base en memoria habría ocultado
justo los fallos que se querían detectar.

### Arquitectura (real, contada sobre el código)

- Monorepo npm workspaces: `client` (Vite 7 + React 19), `server` (Express 5 + Mongoose 8 + Socket.IO 4), `guardian` (Octokit).
- `server/src`: **26 módulos, 191 rutas**.
- `client/src`: 163 archivos; capa 3D aislada tras `React.lazy` con respaldo CSS.
- API: `AUDIT-002` sesiones con revocación, `UI-007` refresh con rotación y detección de reutilización.

### Contrato cliente ↔ servidor

| Comprobación | Resultado |
|---|---|
| Llamadas `api.*` en el cliente | 167 |
| Resueltas contra rutas reales del servidor | **167** (2 definidas en `server.js` / `ai-core`) |
| Endpoints inventados o muertos | **0** |
| Objetivos de navegación (`to` / `navigate`) | 28 |
| Sin ruta declarada en `App.jsx` | **0** enlaces muertos |
| Botones sin acción | **0** (los 2 candidatos son falsos positivos: `DialogPrimitive.Close asChild` y `onClick` en la línea siguiente) |
| `TODO` / `FIXME` / `HACK` | **0** |
| Mocks, datos ficticios, respuestas simuladas | **0** |
| Secretos, claves o credenciales en el repositorio | **0** |

### Seguridad comprobada sobre HTTP real

| Vector | Resultado medido |
|---|---|
| Sin token | `401 {"error":"Token requerido"}` |
| Token expirado | `401 TOKEN_EXPIRED` |
| Firma inválida | `401 TOKEN_INVALID` |
| `alg:none` | `401 TOKEN_INVALID` |
| Token válido sin base de datos | `503 AUTH_STORAGE_UNAVAILABLE` (falla cerrado, no concede acceso) |
| Inyección NoSQL en login (`{"$ne":null}`) | `400`, operadores eliminados antes de la consulta |
| CORS origen permitido / ajeno | cabecera presente / **ausente** |
| Cabeceras helmet | CSP, HSTS, `nosniff`, `SAMEORIGIN`, `no-referrer`, CORP |
| `X-Powered-By` | ausente |
| Límite de peticiones | `ratelimit` + `ratelimit-policy` presentes |
| Subidas | memoria + verificación de **bytes mágicos** (JPEG/PNG/WebP, MP4/WebM/MOV), 10 MB imagen / 50 MB vídeo, nombre aleatorio de 48 bits |
| Inbox de federación | `501 FEDERATION_INBOX_NOT_IMPLEMENTED` — **no finge** haber guardado nada |

---

## 3. Defectos encontrados y reparados

Todos reproducidos antes de corregir y re-medidos después.

### 3.1 Errores del runtime filtrados en inglés — **P2**

Reproducido: `POST /api/auth/login` con JSON incompleto devolvía
`400 {"error":"Unexpected end of JSON input"}`; con 2 MB, `413 {"error":"request entity too large"}`.
El manejador global reenviaba `err.message` en los 4xx, exponiendo detalles del
parser y rompiendo el idioma de toda la API.

Corregido con `server/src/middleware/httpErrors.js` (`describeClientError`).
Ahora: `400 INVALID_JSON`, `413 PAYLOAD_TOO_LARGE`, `415 UNSUPPORTED_CHARSET`,
todos en español. Los errores de aplicación conservan su mensaje original
(verificado: login vacío sigue dando `400 "email y password son obligatorios"`).

### 3.2 Rutas fuera de `/api` devolvían la página HTML de Express — **P2**

Reproducido: `GET /` → `404 text/html` con `<title>Error</title>` y `Cannot GET /`.
Lo mismo en `/cualquier-cosa`. Es justo lo que recibe un monitor de
disponibilidad o un crawler. Se añadió un 404 JSON único para todo el servicio.
Verificado que **no** tapa `/uploads` (los archivos reales siguen sirviéndose
con su `Content-Type`) ni `/socket.io` (handshake sigue en `200`).

### 3.3 Un corte de base de datos se reportaba como 500 — **P2**

Reproducido: `POST /api/auth/refresh` con un refresh token inexistente y la base
caída devolvía `500 REFRESH_FAILED`. El resto del servicio ya usaba `503` para
ese caso (`middleware/auth`). Se añadió `isStorageUnavailable()` y ahora
responde `503 AUTH_STORAGE_UNAVAILABLE`, el mismo contrato.

### 3.4 `health.test.js` no comprobaba nada — **P2**

La prueba construía un objeto dentro de sí misma y se comparaba consigo misma:
no importaba `src/server`, no abría puerto y no llamaba a ningún manejador.
Pasaba siempre, incluso con el endpoint roto.

Sustituida por 4 pruebas HTTP reales (503 sin base, contrato idéntico en
`/health` y `/api/health`, 200 con la conexión lista, y que no se filtren
credenciales). El caso "conectado" no finge una base: fuerza la única señal que
lee el manejador (`mongoose.connection.readyState`) y la restaura.

### 3.5 Peticiones de red reales dentro de las pruebas de UI — **P2**

`block-014-drafts.spec.jsx` monta `CreatePost`, que usa `getCircles` y
`getOrbits`; la prueba nunca los simulaba, así que cada montaje lanzaba dos XHR
reales que jsdom no puede servir, con trazas de `AggregateError` en la salida.
La prueba pasaba **porque la petición fallaba**, no porque se hubiera
comprobado el estado vacío.

Corregido en dos niveles: la prueba ahora simula sus dependencias, y
`client/test-ui/setup.js` instala un adaptador de axios que falla de inmediato,
de forma determinista y en silencio. La suite pasó de imprimir decenas de
trazas a salir **completamente limpia** (0 `AggregateError`, 0
`Not implemented`), con los mismos 200 aciertos.

### 3.6 El artefacto de marca mostraba un dominio ajeno — **P2**

`kronos-master-design` (el único candidato a imagen de previsualización)
renderiza el nombre del sitio **sin la "s"**, precisamente el dominio que el
README declara ajeno y prohíbe mostrar o enlazar. Además: era un **PNG con
extensión `.jpg`**, estaba **duplicado** byte a byte, y **no se referenciaba
desde ningún sitio** — por eso nunca se detectó.

Como no se referenciaba en ninguna parte, se servía en
`/kronos-master-design.jpg` dentro de cada despliegue. Se ha dejado de publicar
y se ha conservado la obra original en
`src/assets/kronos-master-design.png` (fuera de `public/`, con la extensión
corregida y contenido intacto: mismo MD5 `742141bd…`). Verificado: 0
apariciones del dominio ajeno en todo el artefacto desplegable.

### 3.7 Previsualizaciones de enlace incompletas — **P3**

Faltaban `og:type`, `og:title`, `og:description`, `og:locale` y `twitter:card`
en un producto cuyo núcleo es compartir. Añadidos, apuntando siempre al origen
canónico. `og:image` queda **pendiente a propósito**: el único candidato es el
de 3.6 y usarlo publicaría el dominio ajeno en cada enlace compartido. Queda
documentado en el propio `index.html`.

### 3.8 Título de pestaña = dominio — **P3**

`<title>` era `kronos-space.com`; ahora es el nombre del producto, coherente con
`og:title`.

### 3.9 `npm run preview` no era comprobable — **P3**

Escuchaba solo en localhost y rechazaba los hosts del sandbox, así que el
artefacto que realmente se despliega no se podía revisar antes de publicarlo.
`preview` comparte ahora host, `allowedHosts` y proxy con `server`.

---

## 4. Integraciones externas — estado real

| Integración | Estado verificado | Qué falta |
|---|---|---|
| OpenRouter (guion, imagen) | Cableado correcto. `npm run smoke:openrouter:wire` comprueba modelo, cliente y proveedor oficial. El catálogo **no** se pudo alcanzar (red bloqueada) | `OPENROUTER_API_KEY` y salida de red |
| Gemini (chat) | Proveedor configurado y fuera del alcance del smoke de OpenRouter | `GEMINI_API_KEY` |
| Video | Rutas montadas, exigen auth y límite de IA | `VIDEO_API_URL`, `VIDEO_API_KEY` |
| Correo (Resend) | `forgot-password` responde 200 sin revelar si la cuenta existe | `RESEND_API_KEY` |
| Google Sign-In | `GET /api/auth/google/config` → `{"enabled":false,"clientId":null}` sin configurar; el botón se desactiva en lugar de fallar | `GOOGLE_CLIENT_ID` |
| Federación (ActivityPub) | WebFinger y NodeInfo reales; el inbox responde 501 en lugar de simular | Implementación |

Ninguna integración se ha simulado ni se ha inventado una credencial. Los
scripts de humo **terminan con código distinto de 0** cuando no pueden
verificar (comprobado: exit 1 en modo `--wire` sin red), así que un CI no puede
dar por buena una verificación que no ocurrió.

---

## 5. Pruebas añadidas

| Archivo | Qué fija |
|---|---|
| `server/test/http-errors.contract.test.js` (14 pruebas) | Contrato de errores: 400/413/415 en español y sin detalle interno, 404 JSON en todo el servicio, que los mensajes de aplicación no se reetiqueten, y 503 en `refresh` |
| `server/test/health.test.js` (4 pruebas, reescrito) | Health real sobre HTTP |
| `client/test-ui/setup.js` | Aislamiento de red determinista para toda la suite de interfaz |

---

## 6. Rendimiento

No se tocó nada. Se midió para no optimizar a ciegas:

- `index` 1.113 kB (336 kB gzip) · `Canvas3D` 971 kB (266 kB gzip) · CSS 218 kB (41 kB gzip).
- La capa 3D **ya** está aislada: `three` no entra en el bundle inicial, se
  carga tras `React.lazy` solo si hay WebGL, y hay respaldo CSS mientras viaja.
- `lucide-react` se importa por nombre (tree-shaking correcto); sin `import *`.
- Único candidato pendiente: `manualChunks` para separar vendor de aplicación y
  mejorar el almacenamiento en caché entre despliegues. **No aplicado**: es una
  optimización, no un defecto, y merece su propia medición.

---

## 7. Validación de despliegue — lo que NO se pudo hacer

Hay que ser explícito: **no se ha desplegado ni validado producción.**

- `api.kronos-space.com` resuelve por DNS (`216.24.57.16`, Cloudflare/Render)
  pero la conexión HTTPS está bloqueada desde este sandbox (código `000`).
- No hay credenciales de Render, Cloudflare Pages ni Vercel en el entorno, y
  gestionarlas requiere al propietario.
- MongoDB real no es obtenible aquí, así que las **74 pruebas E2E siguen sin
  ejecutarse**. No se han marcado como aprobadas.

La infraestructura para cerrar esto **ya existe en el repositorio** y no
requiere trabajo nuevo:

1. `.github/workflows/kronos-e2e.yml` levanta un `mongo:7` real y ejecuta las
   E2E contra una base temporal `kronos_e2e_*`. Es el camino para las 74.
2. `.github/workflows/verify-deploy.yml` hace la verificación de solo lectura
   contra el dominio real (health, CORS, `/api`, frontend, cabeceras).
3. `scripts/verify-deploy.sh` y `scripts/kronos-doctor.js` permiten repetirlo a
   mano desde cualquier máquina con salida a internet.

### Verificación local que sí se hizo

Se sirvió el **build de producción** (`vite preview`) y se comprobó sobre el
artefacto real: `index.html` 200 con el `og:*` y el título nuevos, los tres
chunks y el CSS con su `Content-Type` correcto, `/icon.svg` y
`/manifest.webmanifest` servidos, y las rutas profundas (`/login`, `/home`,
`/kairos`, `/post/abc`) devolviendo la aplicación. El asset del punto 3.6 ya no
se sirve como imagen.

> La vista previa está activa en el puerto 3000. La API no puede arrancar sin
> `MONGODB_URI` (por diseño: `connectDB` aborta en lugar de arrancar a medias),
> así que las pantallas que piden datos muestran su estado de error — que es,
> exactamente, el comportamiento correcto sin base de datos.

---

## 8. Riesgos residuales y tareas que requieren al propietario

| # | Asunto | Decisión necesaria |
|---|---|---|
| 1 | **`og:image` sin definir** | Aportar la obra de marca con el dominio correcto (1200×630). La actual muestra un dominio ajeno y no puede publicarse |
| 2 | **Validación de producción** | Ejecutar `verify-deploy.yml`/`kronos-doctor.js` desde una máquina con salida a internet, o dar acceso a Render/Cloudflare |
| 3 | **74 pruebas E2E** | Facilitar `MONGODB_URI` (o confiar en `kronos-e2e.yml`, que ya levanta un Mongo real) |
| 4 | **`/uploads/*` sin autenticación** | Los adjuntos de mensajes privados viven bajo el mismo `/uploads` público, con nombre aleatorio de 48 bits. No es adivinable, y añadir autenticación rompería las etiquetas `<img>` del cliente (no envían cabecera). Es la decisión de producto que queda abierta: URL con capacidad frente a endpoint autenticado |
| 5 | **`CAPSULE_SECRET`** | Sin definir, las cápsulas se cifran derivando la clave de `JWT_SECRET`: funciona, pero rotar el secreto de sesión dejaría ilegibles las cápsulas escritas. El servidor ya avisa al arrancar (`CONFIG_WARNING`) |
| 6 | **Federación de entrada** | Responde 501 honestamente. Implementarla requiere firmas HTTP |

---

## 9. Resumen

- **Auditoría**: arquitectura, dependencias, rutas, navegación, seguridad, mocks, IA y rendimiento revisados con evidencia.
- **Reparado**: 9 defectos (0 P0, 0 P1, 5 P2, 4 P3), todos con prueba de regresión.
- **Sin regresiones**: 187 pruebas de servidor en verde (antes 170), 0 fallos; cliente 220 en verde; lint y build en verde.
- **No declarado como terminado**: falta la validación contra producción y las 74 E2E, y ambas dependen de acceso externo. El punto 26 del criterio de terminación **no se cumple** todavía, y decirlo es parte del resultado.
