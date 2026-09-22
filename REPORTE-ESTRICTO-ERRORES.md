# REPORTE ESTRICTO DE ERRORES — Kronos-space.com

**Fecha:** 2026-09-22 · **Rama auditada:** `arena/01a0c8fc-kronos-space-com` (base `51b4169`) · **Auditor:** Arena Agent Mode
**Alcance:** repo completo (client + server + guardian + scripts + workflows + config). Solo se reporta lo verificado por lectura de código o por prueba ejecutada. Nada inventado.

**Veredicto: NO APTO para producción sin correcciones.** Hay 7 hallazgos críticos y 14 altos. Lo que sí funciona (build, lint, 304 tests en verde) se lista al final para contexto, pero no compensa los puntos de abajo.

**Resumen por severidad:** 🔴 Crítico: 7 · 🟠 Alto: 14 · 🟡 Medio: 16 · 🔵 Bajo: 10 — **Total: 47 hallazgos.**

---

## 🔴 CRÍTICOS (rompen producción, pierden datos o abren seguridad)

### C-1. Los uploads se pierden en cada redespliegue (Render sin almacenamiento persistente)
- **Archivos:** `server/src/config/storage.js`, `server/src/server.js:89-92`, `.gitignore` (`server/uploads/`)
- **Evidencia:** `saveBuffer()` escribe con `fs.writeFileSync` a `server/uploads/{media,avatars,covers}` (disco local efímero). En Render el filesystem se resetea en cada deploy/reinicio → avatares, covers, imágenes y videos desaparecen.
- **Impacto:** pérdida total de media de usuarios en cada despliegue. Pérdida de datos silenciosa.
- **Fix:** migrar a object storage (Cloudflare R2 / S3) con URLs firmadas, o volumen persistente + backup. Como mínimo, documentar que Render borrará los datos.

### C-2. El sanitizador de query params NO funciona en Express 5 (asignación silenciosamente ignorada)
- **Archivo:** `server/src/middleware/inputSanitizer.js:37-39` (`req.query = sanitizeValue(req.query)`)
- **Evidencia (prueba ejecutada):** en Express `5.2.1`, asignar `req.query = {a:1}` no surte efecto: el servidor siguió respondiendo `{"x":"1"}` (query original intacta). `req.query` es getter sin setter efectivo.
- **Impacto:** toda la defensa de `inputSanitizer` sobre query strings (trim + eliminación de claves `$`/`.`) es papel mojado. Cualquier ruta que use `req.query` directo queda sin sanitizar.
- **Fix:** mutar en sitio (`Object.assign` + borrado de claves, o sanitizar por campo en cada ruta / usar `express-mongo-sanitize` compatible con v5). Agregar test de regresión.

### C-3. Bundle de producción gigante sin code-splitting (~2 MB JS)
- **Evidencia (build ejecutado):** `vite build` advierte: `index-CbE1-KI1.js 1.080 kB (gzip 326 kB)` + `Canvas3D 970 kB (gzip 265 kB)`. Vite: *"Some chunks are larger than 500 kB"*.
- **Causa:** `client/src/App.jsx` importa las ~35 pantallas con `import` estático (cero `React.lazy` en rutas). Three.js va en 2 chunks pero el vendor principal sigue monolítico.
- **Impacto:** LCP pésimo en móvil/redes lentas, rebote de usuarios, mala puntuación Core Web Vitals.
- **Fix:** `React.lazy` + `Suspense` por ruta, `manualChunks` (vendor three/query/router separados), auditar con `rollup-plugin-visualizer`.

### C-4. Sin Error Boundary: un solo throw tumba toda la app (pantalla blanca)
- **Evidencia:** no existe ningún componente `ErrorBoundary` en `client/src`; `App.jsx` no envuelve rutas; `main.jsx` monta directo.
- **Impacto:** cualquier excepción de render en cualquier pantalla = app completa en blanco, sin mensaje ni recuperación.
- **Fix:** Error Boundary global + por ruta (con fallback y botón "reintentar").

### C-5. `Content-Type: multipart/form-data` fijado a mano en uploads (rompe el boundary)
- **Archivos:** `client/src/services/postsService.js:67`, `messagesService.js:89`, `usersService.js:69,86` — `headers: { "Content-Type": "multipart/form-data" }` con `FormData`.
- **Evidencia:** al fijar el header sin `boundary`, el navegador/XHR no adjunta el boundary y `multer` no puede parsear el cuerpo ("Boundary not found" → error 400/500 según navegador/versión de axios).
- **Impacto:** subida de imágenes/videos/avatar/cover rota o intermitente según navegador. Es el bug clásico de uploads con axios.
- **Fix:** NO fijar `Content-Type` (dejar que el navegador lo genere con boundary) o usar `api.post(url, form)` sin headers. Agregar test E2E real de upload.

### C-6. Scripts vivos que hacen `git add -A` + commit fijo + push a `main` con `--no-verify`
- **Archivos:** `commit_changes.sh`, `push_changes.py` (raíz del repo).
- **Evidencia:** `cd /workspaces/Kronos-space.com` hardcodeado; `git add -A`; mensaje congelado "Tareas 39-42"; `git push -u origin main`; `push_changes.py` además desactiva GPG (`commit.gpgsign false`), suplanta identidad `Kronos AI <ai@kronos.local>` y commitea con `--no-verify` (salta hooks).
- **Impacto:** si alguien los ejecuta: commitea TODO (incluidos `.env`/secretos si existen), pushea directo a `main` saltando CI/hooks, con identidad falsa. Riesgo de fuga de secretos y de ruptura de rama protegida.
- **Fix:** eliminarlos del repo (o mover a `scripts/archive/` con `exit 1` de guarda). Rotar cualquier secreto que haya podido pasar por ellos.

### C-7. Multer en memoria con videos de 50 MB (DoS por RAM)
- **Archivo:** `server/src/middleware/upload.js` (`multer.memoryStorage()`, `MAX_VIDEO_SIZE = 50MB`).
- **Evidencia:** cada upload vive entero en heap de Node hasta validarse y escribirse a disco. N uploads concurrentes = N×50 MB.
- **Impacto:** con pocos uploads simultáneos el proceso OOM-killea (Render reinicia el contenedor). DoS barato para cualquiera con cuenta.
- **Fix:** `diskStorage` (streaming a tmp) + validación por stream, o subida directa a R2/S3 con URL prefirmada; limitar concurrencia de uploads por IP/usuario.

---

## 🟠 ALTOS (seguridad seria, escalabilidad o funcionalidad rota probable)

### A-1. Sin `Content-Security-Policy` en el frontend + JWT en `localStorage` = robo de sesión vía XSS
- **Evidencia:** `client/index.html` no tiene CSP (ni meta ni headers de Vercel/Pages en repo — no hay `vercel.json`/`_headers`); `client/src/services/authStorage.js` guarda access+refresh token en `localStorage` legible por JS. Cualquier XSS (p. ej. render de contenido de post/URL externa) exfiltra ambos tokens (refresh válido 30 días).
- **Fix:** CSP estricta (`default-src 'self'`, allowlist para GSI/Resend/media) + considerar cookies `httpOnly`+`SameSite` para refresh; como mínimo `style-src/script-src` acotados y auditoría de renders de HTML.

### A-2. Rate limit inútil detrás de Render con el default `TRUST_PROXY=0`
- **Evidencia:** `server/src/server.js:66-69` solo confía en proxy si `TRUST_PROXY=1`; `server/.env.example` trae `TRUST_PROXY=0`. Sin él, `req.ip` es la IP del proxy de Render → todos los usuarios comparten el mismo bucket (300 req/15 min) → un usuario agota el cupo global (autonegación de servicio) y el `authLimiter` no frena credential-stuffing distribuido.
- **Fix:** en producción exigir `TRUST_PROXY=1` (falla arranque si `NODE_ENV=production` y no está definido, igual que ya se hace con `CLIENT_URL`).

### A-3. Socket.IO con reintentos infinitos y token obsoleto
- **Archivos:** `client/src/services/socket.js` (`reconnectionAttempts: Infinity`, sin handler de `connect_error`); `client/src/App.jsx:125-132` (reconecta solo cuando cambia `user`, no cuando rota el token).
- **Impacto:** (1) con token expirado/revocado el cliente reintenta PARA SIEMPRE contra el backend (batería + carga inútil, posible baneo por rate-limit); (2) tras renovar el access token, el socket sigue autenticado con el token viejo hasta recargar la página → desconexiones `AUTH_INVALID` no recuperadas.
- **Fix:** reconectar socket al renovar token; backoff con tope + `connect_error(AUTH_*)` → renovar una vez y parar; `disconnectSocket()` al limpiar sesión (ya se hace) + test.

### A-4. Arrays Mongo sin cota: `followers/following/likes/comments/savedBy/readBy`
- **Evidencia:** `server/src/modules/users/User.js` (`followers/following` sin límite); `server/src/modules/posts/Post.js` (`likes/savedBy/comments/reactions` sin `maxlength`/cota); `server/src/modules/messages/Message.js` (`readBy` sin cota).
- **Impacto:** documentos que crecen hasta el límite BSON de 16 MB → escrituras fallan; `relationshipList` (`users.routes.js:88-136`) carga el documento entero con TODOS los ids y pagina en memoria → usuario con 100k seguidores = respuesta de MBs y OOM.
- **Fix:** colecciones/conteos separados para relaciones (o `$slice` + conteos), paginación en DB, tope de comentarios embebidos + colección de comentarios si hace falta.

### A-5. Feed con 4–5 `populate` + `countDocuments` sin índices que cubran el filtro
- **Evidencia:** `server/src/modules/posts/posts.routes.js:645-760` — `.populate("author").populate("comments.user").populate("repostOf").populate(lineage…)` + `countDocuments(filter)` por request. `populate("repostOf")` sin `select` trae el documento completo; `comments.user` popula TODOS los comentarios del post. Índices existentes (`Post.js:509-516`) solo cubren `author+createdAt` y `createdAt`, no `moderation.hidden`+audiencia+órbita.
- **Impacto:** latencia del feed crece con el tamaño de la base; posts virales = respuestas enormes.
- **Fix:** `select` en todos los populate, límite de comentarios poblados, índice compuesto acorde al filtro real, caché de feed caliente.

### A-6. `GET /api/auth/session` devuelve `followers` + `following` completos
- **Evidencia:** `server/src/modules/auth/session.routes.js:52-53` `PUBLIC_USER_FIELDS` incluye `followers following` (arrays completos de ObjectIds). Contradice la propia regla del proyecto ("perfil público sin exponer arrays", Tarea 41).
- **Impacto:** cada hidratación de sesión descarga MBs potenciales + expone grafo social completo.
- **Fix:** devolver solo conteos (`followersCount/followingCount`) e `isFollowing`.

### A-7. Notificaciones: 2–5 queries por evento, sin cola ni batch
- **Evidencia:** `server/src/modules/notifications/notification.service.js` — por cada like/comment/follow: `findById` prefs + `isBlockedBetween` + `create` + 2 `populate`.
- **Impacto:** un post viral (miles de likes) = decenas de miles de queries secuenciales en el request caliente. Degrada escritura de reacciones.
- **Fix:** cola (BullMQ/in-memory job) + batch, proyección mínima, índice ya existente OK.

### A-8. Enlaces de correo apuntan al puerto equivocado si falta `CLIENT_URL`
- **Evidencia:** `server/src/modules/auth/auth.routes.js:64` fallback `http://localhost:5173`, pero el frontend dev corre en **3000** (`client/vite.config.js:17`, `server.js:389`).
- **Impacto:** correos de verificación/reset con enlaces rotos (puerto 5173 muerto) en cualquier entorno sin `CLIENT_URL`.
- **Fix:** fallback `http://localhost:3000` o mejor: error 503 explícito si falta `CLIENT_URL` al enviar correos.

### A-9. Doble `.env.example` divergente (uno con fences Markdown que rompen `dotenv`)
- **Evidencia:** `server/.env.example` vs `server/env.example` difieren (`diff` verificado): el segundo envuelve todo en ` ```env ` (si alguien lo copia tal cual, la primera/última línea corrompe el parseo), y trae defaults distintos (`OPENROUTER_MODEL=openrouter/free` vs vacío, `VIDEO_MODEL=video-generation` vs vacío, falta `JWT_EXPIRES_IN`/rate limits).
- **Impacto:** configuración ambigua; riesgo de copiar el archivo equivocado y desplegar con valores distintos a los probados.
- **Fix:** eliminar uno, dejar `server/.env.example` como única fuente.

### A-10. Sin infraestructura como código: no hay `Dockerfile`, `render.yaml`, `vercel.json`
- **Evidencia:** búsqueda en raíz: ninguno existe. El deploy (Render API + Vercel/Pages frontend) vive solo en dashboards.
- **Impacto:** deploys no reproducibles, drift de config, imposible auditar headers/CSP/rewrites; sumado a A-1 (sin CSP) y C-1 (sin storage), el entorno real es desconocido desde el repo.
- **Fix:** agregar `render.yaml` (+ disco o R2), `vercel.json` con headers de seguridad, documentar variables.

### A-11. Carrera en rotación de refresh exprime "reuse detection" contra usuarios legítimos
- **Evidencia:** `server/src/modules/auth/session.service.js:rotateRefreshToken` — emite el nuevo refresh ANTES de revocar el anterior (`issueRefreshToken` → `updateOne revokedAt:null`); dos tabs concurrentes con el mismo refresh válido generan 2 refresh vivos y el segundo `updateOne` no hace match → el siguiente uso dispara `REFRESH_REUSED` → **revoca la familia completa** (logout de todos los dispositivos).
- **Impacto:** logout masivo por una carrera legítima (2 tabs), indistinguible de un robo.
- **Fix:** transacción/atómico (`findOneAndUpdate` con `revokedAt:null` primero, luego emitir), ventana de gracia para el token recién rotado (`replacedBy` + tolerancia de ~10s).

### A-12. Exportación "1 por semana" guardada en un `Map` en memoria
- **Evidencia:** `server/src/modules/export/export.routes.js:14` `lastExportRequests = new Map()`.
- **Impacto:** se pierde al reiniciar (bypass del límite), no funciona con >1 instancia, crece sin cota (leak).
- **Fix:** persistir en Mongo con TTL.

### A-13. Presencia online en memoria (no sobrevive a 2 instancias ni a reinicios)
- **Evidencia:** `server/src/modules/messages/presence.js` (memoria de proceso) + `server.js:280-300`.
- **Impacto:** con >1 instancia en Render, usuarios "online" fantasma / presencia parcial. Reinicio = todos offline sin aviso.
- **Fix:** adapter Redis para socket.io + presencia con TTL, o documentar "1 sola instancia".

### A-14. Password policy mínima (solo ≥8) + registro sin verificación ni captcha
- **Evidencia:** `server/src/modules/auth/auth.routes.js` (`password.length < 8` como única regla); `emailVerified` no bloquea nada; sin captcha/rate por email.
- **Impacto:** cuentas `Password123!` + registro masivo por bots (el `authLimiter` es por IP, no por email).
- **Fix:** regla de complejidad mínima + check de contraseñas filtradas (k-anonimity HIBP) + exigir verificación para acciones sensibles + captcha en registro.

---

## 🟡 MEDIOS (deuda seria, bugs probables, fragile-by-design)

| # | Hallazgo | Evidencia | Impacto / Fix |
|---|----------|-----------|---------------|
| M-1 | `mediaUrl()` revienta sin `window` (default param `window.location.origin`) | `client/src/services/mediaUrl.js:4` | `ReferenceError` en SSR/tests node/Workers. Fix: `typeof window !== "undefined" ? window.location.origin : "http://localhost:3000"`. |
| M-2 | `liveService.js` 100% muerto (0 imports) pero la API `/api/live` viva | `grep` verificado: solo se referencia a sí mismo | Código muerto o feature a medias (salas live sin UI). Eliminar o terminar. |
| M-3 | Ruta `*` redirige en silencio (no existe página 404) | `client/src/App.jsx:236-239` | Oculta deep-links rotos, confunde analytics/SEO. Fix: página 404 real. |
| M-4 | `ProtectedRoute` sin estado de carga (parpadeo a `/login` en cada recarga) | `client/src/routes/ProtectedRoute.jsx`, `App.jsx:86-123` hidratación async | Redirect visible a login aunque haya sesión válida. Fix: `status === "loading"` → skeleton. |
| M-5 | `server.js` carga `dotenv` sin `path` (depende del cwd) | `server/src/server.js:1` vs `scripts/kronos-doctor.js` (sí usa path a `server/.env`) | `node server/src/server.js` desde raíz no carga `server/.env`. Fix: `config({ path: …/server/.env })`. |
| M-6 | `setInterval` de cápsulas como side-effect del `require` | `server/src/server.js:52-56` (fuera de `startServer`) | Importar `app` en tests/scripts crea timers. Fix: mover dentro de `startServer()`. |
| M-7 | Paginación `skip/limit` sin cursor ni tope global sensato | `posts.routes.js` (`parsePagination`), search, admin | `skip` grande = escaneo; Fix: cursor `_id+createdAt` para feeds. |
| M-8 | Tests cliente hacen red real (ruido `AggregateError`/XHR en jsdom) | Salida de `npm test --workspace=client` (177 pass pero con errores de red logueados) | Specs frágiles/lentos (40s). Fix: mockear `api`/axios en todos los specs. |
| M-9 | 70/197 tests de servidor se skipean sin `MONGODB_URI` (CI `validate` no los corre) | `npm test --workspace=server`: `pass 127, skipped 70` | El CI verde de `validate` cubre solo 64%. El E2E real solo corre en PRs (`kronos-e2e.yml`). Fix: servicio mongo también en `ci.yml` o dejar claro el gate. |
| M-10 | Permisos excesivos `contents: write` en CI | `.github/workflows/ci.yml:11-13`, `kronos-e2e.yml:29-31` | Solo comentan (necesitan `pull-requests: write` + `contents: read`). Endurecer. |
| M-11 | `inputSanitizer` trimea passwords y muta payloads en silencio | `server/src/middleware/inputSanitizer.js` (trim universal; drop de claves `$`/`.`) | Reduce espacio de claves; puede romper payloads legítimos sin aviso. Fix: no tocar `password*`, loguear drops. |
| M-12 | JWT access de 7 días + refresh de 30 días sin lifetime absoluto ni validación de contexto | `session.service.js` (`DEFAULT_EXPIRES_IN=7d`, `30d`; `userAgent/ip` se guardan pero nunca se validan) | Ventana de abuso larga ante robo. Fix: access ≤15 min–24 h, re-auth para acciones sensibles. |
| M-13 | PWA incompleta: manifest solo con icono SVG | `client/public/manifest.webmanifest`, `client/index.html:20` (`apple-touch-icon` → `/icon.svg`) | iOS/Android no instalan PWA con solo SVG. Fix: PNG 192/512 + maskable + screenshots. |
| M-14 | Fallback de API `*.vercel.app` genérico + inconsistente con `LEGACY_PUBLIC_HOSTS` | `client/src/services/apiUrl.js:21-24` vs `publicUrl.js:9-12` | Cualquier deploy del código en Vercel apunta a la API de prod; hosts nuevos no redirigen a canónico. Fix: allowlist explícita. |
| M-15 | `node engines 20.x` pero dev/entorno en Node 22 (warnings `EBADENGINE` en `npm ci`) | `server/package.json:6-8`, sin `.nvmrc` | Divergencia local/CI. Fix: `.nvmrc` + alinear engines (o `>=20`). |
| M-16 | `Conversations.jsx` acumula listeners `socket.once` en cada `connect` | `client/src/features/messages/Conversations.jsx:397-410` (`joinRoom()` registra `once` sin limpiar los anteriores) | Reconexiones repetidas apilan handlers. Fix: `off` antes de `once` o registrar una sola vez. |

## 🔵 BAJOS (higiene, consistencia, pulido)

| # | Hallazgo | Evidencia |
|---|----------|-----------|
| B-1 | Imagen duplicada byte-a-byte `kronos-master-design.jpg` (349 KB ×2, md5 idéntico) | `client/public/` + `client/src/assets/` (verificado `md5sum`). Quitar una. |
| B-2 | Alias `@/hooks` en `components.json` apunta a `src/hooks/` que NO existe | `client/components.json:22`, `ls client/src/hooks` → no existe. |
| B-3 | `aiLimiter` usa `max` deprecado (funciona —verificado 429 OK— pero inconsistente) | `server/src/middleware/aiLimiter.js:6` vs `limit` en `server.js`. Unificar a `limit`. |
| B-4 | 20 `<button>` sin `type` (3 submit implícitos en forms funcionan, pero frágil) | `Channels.jsx:151`, `Circles.jsx:206`, `Orbits.jsx:45` (+17 fuera de forms). Explicitar `type`. |
| B-5 | `<title>kronos-space.com</title>` en minúsculas, sin OG image ni Twitter cards | `client/index.html:24`. SEO/previews pobres. |
| B-6 | Meta `apple-mobile-web-app-capable` deprecada | `client/index.html:11`. Usar `mobile-web-app-capable`. |
| B-7 | `guardian/` sin lockfile + CI `npm ci \|\| npm install` | `guardian/package.json`, `kronos-guardian.yml`. Builds no reproducibles. |
| B-8 | Health público expone estado de DB; sin test de headers de seguridad | `server.js:129-141`. Agregar asserts de `helmet`/CORS en suite. |
| B-9 | `ToastProvider` programa `setTimeout` sin cleanup al desmontar | `client/src/components/feedback/ToastProvider.jsx:20`. Leak menor. |
| B-10 | Capsule secret con salt fijo + fallback a `JWT_SECRET` (rotación = pérdida) | `server/src/modules/capsules/capsule.crypto.js`. Documentado pero frágil; planificar KMS/rotación. |

---

## ✅ Lo que SÍ está bien (verificado, no es cortesía)

- `npm run lint --workspace=client` → **limpio (0 errores)**. `node --check` de todo `server/src` → OK.
- `vite build` → OK (10.7s) con chunks 3D separados (`Canvas3D`/`Effects3D` en lazy).
- Server: **127 pass / 0 fail** (70 skipped sin DB — ver M-9). Cliente: **177/177 specs pass** (35 archivos).
- `npm audit` (prod y total) → **0 vulnerabilidades**. Dependencias razonablemente al día (solo minors/majors no críticos pendientes).
- Auth sólida en lo estructural: revocación por `jti`+TTL, refresh rotativo con reuse-detection, rate limits diferenciados, Google SI verificado con `google-auth-library`, uploads con validación de firma mágica (no solo MIME), `helmet`+CORS allowlist, `requestId`/métricas, errores sin filtrar secretos.
- Socket handshake replica revocación HTTP + verificación de membresía antes de `conversation:join`. Limpieza de listeners correcta en `Messages.jsx`.
- No hay `TODO`/`FIXME`/`console.log` de debug en `src` (solo logs operacionales), ni `dangerouslySetInnerHTML`/`eval`.

## 🛠️ Plan de remediación sugerido (orden)

1. **Hoy:** C-6 (borrar scripts), A-9 (unificar `.env.example`), C-5 (quitar `Content-Type` manual), A-8 (puerto 3000).
2. **Esta semana:** C-2 (sanitizer Express 5), C-1+C-7 (storage real R2/S3 + disk streaming), A-2 (TRUST_PROXY en prod), A-1 (CSP), C-4 (Error Boundary), A-3 (socket+token).
3. **Sprint:** C-3 (code-splitting), A-4+A-5+A-6+A-7 (modelo relacional/feed/notificaciones), A-10 (IaC), A-11 (refresh atómico), A-12/A-13 (persistir export/presencia).
4. **Higiene:** M-1…M-16, B-1…B-10, E2E con mongo en `ci.yml`, `.nvmrc`, PNGs PWA, título/OG.

## 📎 Cómo se verificó (reproducible)

```bash
npm ci                                  # OK (warnings EBADENGINE Node 22 vs engines 20.x)
npm run lint --workspace=client         # limpio
npm run build --workspace=client        # OK + warning chunks >500 kB (1.08 MB + 970 kB)
npm test --workspace=server             # 127 pass / 0 fail / 70 skipped (sin MONGODB_URI)
npm test --workspace=client             # 177/177 pass (35 specs, ~40 s, ruido XHR AggregateError)
npm audit && npm audit --omit=dev       # 0 vulnerabilidades
node --check server/src/**/*.js         # todo OK
# Pruebas ad-hoc: req.query inmutable en Express 5.2.1 (sanitizer inerte);
# aiLimiter con `max` sí limita (429 verificado, solo deprecado);
# md5 duplicado de kronos-master-design.jpg; 20 <button> sin type (3 en forms);
# liveService sin imports; @/hooks inexistente; `Sesión` en auth.js es UTF-8 válido (falsa alarma de mojibake).
```

*Fin del reporte. 47 hallazgos verificables, 0 suposiciones.*
