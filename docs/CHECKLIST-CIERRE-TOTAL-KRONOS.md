# KRONOS SPACE — CHECKLIST DE CIERRE TOTAL

> Documento de trabajo del cierre. Cada línea es un ítem terminable.
> Estados: **[V]** verificado en esta sesión · **[P-A]** pendiente ejecutable por Arena · **[P-P]** pendiente que exige credencial/acceso del propietario · **[P-D]** bloqueado por decisión del propietario.
> Regla de lectura: nada se marca hecho por "el código existe". Cada **[V]** tiene comando + resultado en este documento o en el informe de cierre.

---

## ANÁLISIS: QUÉ ES KRONOS SPACE Y DÓNDE ESTÁ

**Composición real del sistema**
- Cliente: React + Vite (SPA con rutas diferidas), sistema de estilos propio `k-*` + kit Radix/shadcn, escenas 3D asíncronas (three/drei) que solo se descargan en la pantalla de acceso.
- Servidor: Express 5 + Mongoose 8 + Socket.IO, con **28 módulos de API montados**: `auth`, `users`, `search`, `admin`, `observability`, `export`, `live`, `support`, `mcp`, `posts`, `messages`, `conversations`, `notifications`, `moderation`, `drafts`, `collections`, `circles`, `orbits`, `channels`, `stories`, `capsules`, `pulse`, `analytics`, `ai/images`, `ai/videos`, `ai/scripts`, `ai` (chat) y `federation`.
- Datos: MongoDB con índice/migración gestionados por script y media en disco + copia durable en GridFS.

**Verificado hoy con evidencia (no por existencia de código)**
- `Kronos Space - CI` en verde sobre el commit de trabajo: dependencias, lint, build, sintaxis, pruebas de servidor y cliente, verificación read-only del despliegue real.
- `Kronos Guardian` en verde.
- Navegador real: **Playwright 35/35** (antes 31 pasan / 4 fallan), con los dos servidores levantados automáticamente.
- Pruebas: 491 de servidor (400 pasan, 0 fallan, 91 auto-saltadas por exigir base real), 38 node + 253 Vitest de cliente.
- Base de datos: cadena completa en CI con MongoDB real (inventario → respaldo → migración → validación → índices → huérfanos → `down --to 0` → re-`up`) y ensayos de TTL, rollback y restore: pasos 11-18 en verde.
- Producción: `https://kronos-space.com/` sirve la aplicación; `https://api.kronos-space.com/api/health` devuelve `ok:true`, base conectada, tiempo real activo, `environment:production`, `build.commit:ee49ebe`.
- Seguridad de superficie: 0 secretos y 0 mocks en el árbol de fuentes.

**Brechas reales que impiden declarar "terminado"**
1. El job E2E con MongoDB real falla en el paso "Suites del cliente" aunque el mismo comando pasa en el job principal de CI: causa sin determinar, log pendiente.
2. La certificación dinámica con datos reales (V03 social, V05 dos clientes de Socket.IO) está corriendo en el job `atlas` y aún no tiene resultado adjunto.
3. Faltan credenciales del propietario para IA, video, correo y Google OAuth.
4. Seis decisiones de alcance sin tomar: Tailwind no compilado, monetización, borrado de cuenta, media privada, federación bidireccional, coste/créditos y herramientas de IA.
5. Aprobaciones visuales pendientes y despliegue del commit final sin confirmar.

---

## T01 — SISTEMA VISUAL Y KIT DE UI

Estado: 2 defectos reales encontrados y corregidos; suite de navegador completa en verde.

- [x] **[V] Botón "subir avatar" del perfil** — tenía `right/bottom` sin `position`, fluía debajo del avatar de 88 px y el `<h2>` de `.profile-info` interceptaba el clic (medido a 320 px: avatar y=206 h=88, botón y=279 h=44). Corregido en `client/src/styles/interface-density.css` (`position: relative` en `.profile-avatar`, `position: absolute` en `.k-profile-avatar-add`). Evidencia: `npx playwright test profile-settings` → 8/8.
- [x] **[V] Kit de diálogos Radix sin geometría** — `components/ui/dialog.jsx` se posicionaba solo con utilidades Tailwind, y este proyecto **no compila Tailwind** (assets construidos: `.fixed{` = 0, `.sr-only{` = 0 ocurrencias). El diálogo quedaba en flujo estático al final del `<body>` (rect y=993, ratio de viewport 0, `position: static`). Corregido declarando `[data-slot="dialog-overlay|content|header|title|description|close|footer"]` en `client/src/styles/design-system.css` con paridad visual a `.k-modal`. Evidencia: sonda en navegador real a 390/1440 px → `position: fixed`, `transform` aplicado, ratio de viewport 1,0, cierre dentro del recuadro.
- [x] **[V] Suite de navegador completa** — `client/playwright.config.js` con dos proyectos (`app` :3000, `design-preview` :3002) y `webServer` que arranca o reutiliza ambos. `npx playwright test` → **35/35 en verde** (antes 31 pasan / 4 fallan).
- [ ] **[P-A] Barrido final de utilidades Tailwind inertes** — recorrer los 8 consumidores del kit y todo `className` con utilidades (ImageEditor, ShortcutsModal, ReportDialog, ProfileFollowDialog, SupportDialog, MenuDrawer, OrbitMap, RouteFallback, `dialog.jsx`) y confirmar por CSS computado en navegador real que ninguna geometría/tipografía depende de utilidades no compiladas. Disparador: cerrar sin clases muertas.
- [ ] **[P-D] Decisión sobre Tailwind** — hoy `client/src/styles/tailwind.css` importa `tailwindcss/utilities.css` sin motor: es deuda silenciosa (el archivo se importa y no produce nada). Opciones: (a) añadir el motor (`@tailwindcss/vite`) y validar visualmente todo, o (b) eliminar la dependencia y el import. Requiere aprobación por ser cambio visual global.
- [ ] **[P-A] Accesibilidad del kit en los 7 consumidores** — foco atrapado, `Escape`, bloqueo de scroll y restauración de foco verificados uno por uno en navegador real; hoy verificado en ShortcutsModal e ImageEditor.
- [ ] **[P-D] Aprobación visual (UI01/UI02)** — sin aprobación recibida en el registro del plan maestro.
- [ ] **[P-A] Regresión de los 2 defectos** — aserción permanente de geometría (botón avatar dentro del recuadro visible; diálogo con ratio de viewport > 0). Disparador: que no puedan volver a introducirse.

---

## T02 — AUTENTICACIÓN Y SESIÓN

- [x] **[V] Almacenamiento bloqueado/denegado** — `client/src/services/authStorage.js` (`tryReadItem` + `dropKey`), guarda en `Onboarding.jsx` (`persistUserLocally()`), `client/src/schemas/index.js` y `client/test/authStorage.test.mjs`. Evidencia: 38 pruebas node + 48 archivos/253 Vitest + especs de navegador con `--disable-local-storage`; mutaciones inversas probadas.
- [ ] **[P-P] Google OAuth real** — variables exactas: `GOOGLE_CLIENT_ID` (servidor) y `VITE_GOOGLE_CLIENT_ID` (cliente, se compila en el build). Sin credencial de Google el botón no puede validarse de extremo a extremo. Disparador: inicio de sesión con cuenta Google real.
- [ ] **[P-P] Correos transaccionales** — `RESEND_API_KEY` y `RESEND_FROM_EMAIL`. Cubre verificación de email y restablecimiento de contraseña. Disparador: recibir el correo real y completar el flujo.
- [ ] **[P-A] Refresco de token en navegador real** — extender la prueba de 401→refresh (hoy cubierta en unitarias) a una sesión de navegador con token caducado.
- [ ] **[P-A] Revocación de sesión con datos reales** — logout invalida el token en todas las rutas protegidas; verificación con MongoDB real (auto-skip local, corre en CI/Atlas).

---

## T03 — NÚCLEO SOCIAL (posts, perfiles, comentarios, follows, feed, notificaciones)

- [ ] **[P-A] Certificación dinámica V03** — crear/leer/editar/borrar, audiencias, comentarios, follow, historial y notificaciones contra backend real. Disparador: job E2E con MongoDB real/Atlas en verde.
- [x] **[V] Audiencias de publicación** — `publicAudienceFilter()` es el único filtro público del outbox y del feed; la regla anterior basada en `visibility` no coincidía con ningún documento. Evidencia: `server/src/modules/federation/federation.routes.js` + contrato.
- [ ] **[P-A] Feed sin N+1** — `server/test/feed-nplus1.e2e.test.js` con `explain` real (corre en CI con MongoDB).
- [ ] **[P-A] Estados vacíos, paginación y error de red en UI** — verificar en navegador real contra backend real (hoy UI probada con respuestas controladas).

---

## T04 — MEDIA Y ARCHIVOS

- [x] **[V] Persistencia dual** — disco (`server/uploads`) + copia durable en GridFS; `/uploads` sirve disco y cae a GridFS. Si la copia duradera falla, se borra el archivo local para no anunciar un upload inexistente.
- [x] **[V] Editor de imagen (recorte) usable** — tras el arreglo del kit, el diálogo queda en viewport y el flujo de recorte se completa (Playwright 8/8, incluida la ruta de fallo con reintento).
- [ ] **[P-A] Límites de subida** — probar rechazo real por tamaño/tipo (multer) y su mensaje en UI.
- [ ] **[P-A] Huérfanos de media** — `scripts/db/media-orphans` corrido en la cadena de CI; verificar informe adjunto del job.
- [ ] **[P-D] Media privada o pública** — hoy `/uploads` es **público por diseño** y la documentación prohíbe describirlo como almacenamiento privado. Si el producto exige media privada: ACL por documento, URLs firmadas y purga de caché. Decisión del propietario.

---

## T05 — KAIROS / IA (proveedores, créditos, costes, herramientas, orquestación)

- [x] **[V] Configuración por capacidad** — `server/src/config/aiProviders.js`: chat→`GEMINI_API_KEY`, imagen y guion→`OPENROUTER_API_KEY`, video→`VIDEO_API_KEY` + `VIDEO_API_URL`. Con la clave ausente `configured:false` (fail-closed, sin fallback silencioso a otro proveedor).
- [x] **[V] Resiliencia de proveedor** — 503 de OpenRouter no reenvía la generación; Gemini con espera acotada y un solo intento (`server/test/ai-request-budget.contract.test.js`).
- [ ] **[P-P] Smoke real contra OpenRouter** — `node scripts/openrouter-smoke.js` con `OPENROUTER_API_KEY` real (último run de CI en verde: 37332549784). Disparador: generación real de imagen/guion.
- [ ] **[P-P] Video real** — `VIDEO_API_KEY` + `VIDEO_API_URL`; sin ellas la capacidad queda declarada como no configurada.
- [ ] **[P-D] Coste y créditos** — hoy no existe libro de coste por usuario ni saldo. Decisión: ¿se exige para "terminado" un registro de consumo (tokens/coste por llamada) o basta el control de presupuesto por reintentos? Si se exige: modelo de consumo + panel + límites.
- [ ] **[P-D] Herramientas/skills y orquestación** — definir el alcance: el chat hoy no expone tool-calling ni registro de skills del producto. Sin decisión, se declara explícitamente "no ofrecido".

---

## T06 — MONETIZACIÓN

- [x] **[V] Sin pasarela y sin promesas falsas** — el apoyo es simbólico en estrellas (★); se retiraron los importes en dólares que prometían un cobro inexistente (`SupportDialog.jsx`). Validación de importe entero 1–1000 probada.
- [ ] **[P-A] Idempotencia del apoyo** — verificar que un doble envío no crea dos transacciones (`SupportTransaction`) y que el estado queda consistente.
- [ ] **[P-D] Decisión de alcance** — si se quiere monetización real: proveedor, claves (`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`), estados de pago, webhooks con verificación de firma, reembolsos y conciliación. Si no: registrar por escrito "fuera de alcance v1". **No se inventa proveedor de pago.**

---

## T07 — SEGURIDAD Y PRIVACIDAD

- [x] **[V] Sin secretos en el árbol** — barrido de patrones (`sk-…`, `AIza…`, `ghp_…`, claves PEM) sobre `server/src`, `client/src` y `scripts`: 0 coincidencias.
- [x] **[V] Sin mocks en código de producto** — barrido `mock|fake|stub|simulated` en `client/src` + `server/src`: 0 coincidencias.
- [ ] **[P-A] Rate limiting real** — provocar 429 en `apiLimiter`/`abuseLimiter`/`authLimiter` y comprobar los encabezados de reintento.
- [x] **[V] CORS/helmet/verificación read-only del despliegue** — el paso "Verify deployed environment (read-only)" pasó en CI sobre el commit de trabajo.
- [ ] **[P-A] Exportación de datos con cuenta real** — solicitar, consultar estado y descargar (`/api/export/request|status|download`).
- [ ] **[P-D] Borrado de cuenta** — hoy **no existe y no se promete** en cliente ni documentación. Decisión: implementarlo (programación, anonimización, purga de media y relaciones) o declararlo como no ofrecido.
- [ ] **[P-D] Media privada** — ver T04 (ACL).

---

## T08 — BASE DE DATOS

- [x] **[V] Cadena completa en CI con MongoDB real** — inventario → respaldo → migración (`validate`/`status`/`dry-run`/`up`/idempotencia) → validación de datos → auditoría de índices → huérfanos de media → `down --to 0` → re-`up`: pasos 11-18 en verde en el run 37571231073.
- [x] **[V] Ensayos destructivos** — TTL con datos vencidos, rollback y reaplicación, restore aislado con fixture loopback: pasos 13-17 en verde.
- [ ] **[P-P] Índices y salud en producción** — auditoría contra el clúster real exige URI de producción; hoy solo evidencia en CI/Atlas `test`. Evidencia exigida: informe de `scripts/db/index-audit` contra producción + `NEEDS_EVIDENCE` si no hay acceso.
- [ ] **[P-P] Restore real de producción** — requiere ventana, respaldo reciente y confirmación explícita del propietario; nunca sobre producción sin ese acuerdo.
- [ ] **[P-A] Job Atlas** — el job `atlas` ya no falla por secreto ausente: `KRONOS_E2E_MONGODB_URI` y `KRONOS_E2E_CLUSTER_ALLOWLIST` están configurados (el paso "Comprobar disponibilidad del secreto" pasa y marca `disponible=true`) y el E2E contra la base fija `test` se está ejecutando. Disparador: adjuntar run id, duración y resultado; si excede el tiempo razonable, revisar la conexión al clúster desde el runner.

---

## T09 — FEDERACIÓN

- [x] **[V] Bandeja de entrada 501 sellada** — `server/test/federation-live-support.contract.test.js` test 045b: con actor existente → 501 `FEDERATION_INBOX_NOT_IMPLEMENTED`, sin `accepted`/`queued`; actor inexistente → 404. Antes esa garantía era solo un comentario.
- [x] **[V] WebFinger / Actor / Outbox / NodeInfo** — estructura RFC 7033 y ActivityStreams 2.0 probada; en producción `https://api.kronos-space.com/api/nodeinfo/2.0` responde JSON real (`software.name: kronos-space`, `usage.users.total: 20`).
- [ ] **[P-D] Alcance de federación bidireccional** — implementar de verdad exige firmas HTTP (RFC 9421/`Signature`), protección de replay, colas de procesamiento y pruebas de interoperabilidad con otra instancia. Si no se aprueba: mantener 501 y declarar públicamente "solo lectura/descubrimiento".
- [ ] **[P-A] Coherencia pública** — el actor anuncia un `inbox` que responde 501; documentar esa limitación donde se describa la federación.

---

## T10 — TIEMPO REAL (Socket.IO, mensajes, live)

- [x] **[V] Autorización de salas** — unión a sala sin membresía rechazada (`LIVE_FORBIDDEN`, `LIVE_NOT_IN_ROOM`); `GET /api/live/rooms/:id` dejó de ser público (`server/test/live-signaling.e2e.test.js`).
- [ ] **[P-A] V05 — dos clientes reales** — DM/grupo/typing/entrega/lectura/reconexión con dos cuentas reales, sin éxito simulado. Corre con MongoDB real (`KRONOS_E2E_MONGODB_URI`); evidencia: job E2E/Atlas.
- [ ] **[P-A] Doble camino REST + evento** — confirmar que el mensaje persistido por REST coincide con el evento recibido por socket.
- [ ] **[P-A] Reconexión tras refresh en navegador real** — no cubierto hoy por Playwright.

---

## T11 — CI/CD Y RELEASE

- [x] **[V] CI principal en verde** — `Kronos Space - CI` run 37573246090 (success) sobre el commit de trabajo: dependencias, lint, build, sintaxis, pruebas de servidor y de cliente, verificación read-only del despliegue.
- [x] **[V] Cron de guardián en verde** — `Kronos Guardian` 37573246088 (success).
- [ ] **[P-A] E2E mongo-real hasta el final** — pasos 1-19 corregidos y verdes (se retiraron `MONGODB_URI` **y** `KRONOS_E2E_MONGODB_URI` del paso sin base para no reejecutar el E2E sobre la base que la propia cadena de migración acababa de reescribir). **Paso 20 "Suites del cliente" falla en ese job y funciona en `ci.yml` con el mismo comando: causa sin determinar, log pendiente de que el run termine.** Siguiente acción exacta: `gh run view --job <id> --log` y reproducir con `NODE_ENV=test` + las variables del job.
- [ ] **[P-P] Disparo manual de workflows** — `gh workflow run` devuelve 403 ("Resource not accessible by integration"): si hace falta una ejecución puntual, debe lanzarla el propietario desde la interfaz de Actions.

---

## T12 — PRODUCCIÓN

- [x] **[V] Frontend productivo** — `https://kronos-space.com/` sirve la aplicación (redirección a `/login`, título y contenido de la plataforma).
- [x] **[V] API productiva respondiendo** — `https://api.kronos-space.com/api/nodeinfo/2.0` devuelve JSON válido con datos reales (20 usuarios) y `/api/health` informa base de datos conectada y tiempo real activo (ver línea siguiente).
- [x] **[V] API productiva sana y trazable** — `https://api.kronos-space.com/api/health` devuelve JSON real: `ok:true`, `database:"connected"`, `realtime:true`, `environment:"production"`, `autoIndex:false` y `build.commit:"ee49ebe"` (`main`), con `startedAt`. El endpoint existe en `server/src/server.js:197-198`. **Nota de medición:** un primer sondeo devolvió el intersticial de arranque de Render (instancia levantando a las 04:48Z), así que la salud debe medirse con reintento y no por un único intento.
- [ ] **[P-P] Despliegue del commit final** — producción sirve hoy `main@ee49ebe`. Tras el merge del cierre, confirmar que `build.commit` del endpoint de salud cambia al commit final (frontend) y que la API desplegada corresponde al mismo árbol.
- [x] **[V] Verificación de configuración desplegada** — paso read-only en CI: salud de la API, encabezados CORS y `VITE_API_URL` compilada en el bundle servido.

---

## T13 — PRUEBAS

- [x] **[V] Servidor** — `npm test --workspace=server`: 491 pruebas, 400 pasan, 0 fallan, 91 auto-saltadas por diseño (exigen `KRONOS_E2E_MONGODB_URI`).
- [x] **[V] Cliente** — 38 pruebas node + 48 archivos / 253 pruebas Vitest, todas en verde.
- [x] **[V] Navegador** — Playwright 35/35 en verde con arranque automático de los dos servidores.
- [ ] **[P-A] Regresión de seguridad de subidas** — archivo sobredimensionado, tipo no permitido y nombre malicioso.

---

## T14 — DOCUMENTACIÓN

- [ ] **[P-A] Corregir afirmación insostenida** — `docs/archivo/INFORME-AUDITORIA-Y-ESTADO-PRODUCCION.md` afirma "VERIFICADO Y LISTO PARA PRODUCCIÓN" sin la evidencia de este cierre: marcarlo como histórico o corregirlo.
- [ ] **[P-A] Actualizar matriz del plan maestro** — `docs/PLAN-MAESTRO-EJECUCION-KRONOS.md`: H11 (501 ahora sellado por prueba), H16 (bundle medido: principal 404,61 kB / CSS 191 kB / chunk 3D asíncrono 962,40 kB que **solo** carga en la pantalla de acceso — medido: `/home` con sesión carga 0 assets 3D), V03/V05 (evidencia E2E), REL01.
- [ ] **[P-A] Documentar deuda y límites** — Tailwind no compilado, federación de solo lectura (501), media pública por diseño, monetización simbólica.
- [x] **[V] Referencias de infraestructura** — `docs/CONTRATO-OPERACION-KRONOS.md` describe dev (`npm run dev`, Vite :3000 + API :5000), preview del build y advertencia del fallback `*.vercel.app`: coincide con lo verificado.

---

## T15 — APROBACIONES Y CREDENCIALES DEL PROPIETARIO (bloquean el cierre, no el trabajo)

- [ ] **[P-D] Aprobación visual y de alcance** — H01–H05, H10, H12, UI01, UI02: sin aprobación registrada.
- [ ] **[P-P] Credenciales de integración**, cada una en el entorno del servidor y/o del build: `OPENROUTER_API_KEY`, `GEMINI_API_KEY`, `VIDEO_API_KEY`, `VIDEO_API_URL`, `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `GOOGLE_CLIENT_ID` y `VITE_GOOGLE_CLIENT_ID` (esta última se compila: exige reconstruir el frontend).
- [ ] **[P-P] Acceso a producción para verificación** — URI de lectura/auditoría del clúster real para índices y salud, y ventana acordada para un restore de prueba.
- [ ] **[P-A] Prueba posterior a cada credencial** — tras colocarla: `node scripts/kronos-doctor.js`, `node scripts/openrouter-smoke.js` y la espec correspondiente en navegador real.

---

## T17 — DURACIÓN DE LAS CORRIDAS (hallazgo del 2026-10-07)

**Pista investigada: `.agents/skills`.** Resultado: **no tienen nada que ver**. Evidencia:
- Ningún workflow, script, configuración de build ni `package.json` menciona `.agents` ni `skills` (barrido sobre `*.yml`, `*.yaml`, `*.json`, `*.js`, `*.mjs`, `*.sh`, `*.toml`: 0 coincidencias).
- Son 25 archivos markdown, 444 KB en total, añadidos en `ee49ebe`; ningún paso de CI los lee.
- No existen `wrangler.toml`, `vercel.json` ni configuración de despliegue en el repositorio: el build de Cloudflare/Vercel se define en sus paneles, fuera de este árbol.
- **No se tocan**: son la documentación de las puertas de realidad del proyecto y no afectan a ninguna ejecución.

**Causa real de que una corrida dure 35+ minutos:**
1. **Ningún workflow tenía `concurrency`** → cada push dejaba viva la corrida anterior. El 2026-10-07 llegó a haber **cuatro** corridas de `kronos-e2e` simultáneas sobre la misma rama.
2. El job `atlas` de todas ellas escribe en la **misma base `test` del mismo clúster**. Cada archivo E2E fotografía los `_id` de toda la base y luego borra lo aparecido durante su ejecución: con varias corridas, cada una borra lo que las otras están afirmando y se arrastran entre sí. Con el clúster limpio el job tarda ~3 minutos; con contención pasó de 33 minutos en el paso 6 (y otra corrida quedó cancelada a los 35).
3. **Ningún job tenía `timeout-minutes`**: nada acotaba una corrida atascada.

**Corregido** (commit sobre los seis workflows):
- `concurrency` por rama en `ci.yml`, `kronos-e2e.yml`, `kronos-guardian.yml`, `smoke-auth.yml`, `smoke-openrouter.yml`, `verify-deploy.yml`; en `pull_request` se cancela la corrida anterior, en `main`/`dispatch` se encola (no aborta una corrida pedida a propósito).
- **Cerradura a nivel de job en `atlas`** (grupo global `kronos-e2e-atlas-cluster-compartido`, `cancel-in-progress: false`): serializa el acceso al clúster compartido **entre ramas distintas**, que el grupo por rama no cubría.
- `timeout-minutes` en todos los jobs: CI 25, `mongo-real` 30, `atlas` 25, guardián 15, smokes 15, verify-deploy 15.
- Validación: los seis archivos parsean correctamente y declaran sus grupos y límites (comprobado con `js-yaml`, no a ojo).

- [ ] **[P-P] Cancelar las 4 corridas obsoletas de `kronos-e2e`** (37575619996, 37574608331, 37573246092, 37571231073): se lanzaron antes de este arreglo, así que no pertenecen a ningún grupo y siguen ocupando el clúster. La integración de Arena no tiene permiso (`gh run cancel` → 403). El propietario puede cerrarlas desde Actions o **dejarlas morir solas**: el tope por job de GitHub es de 6 horas, no indefinido.
- [ ] **[P-A] Verificar en la siguiente corrida** que un push nuevo cancela la anterior y que el job `atlas` no supera los 25 minutos.

---

## T16 — ACTA DE CIERRE (REL01)

Se declara KRONOS SPACE terminado cuando **todas** estas puertas están en verde con evidencia adjunta:

- [ ] CI principal en verde sobre el commit final congelado.
- [ ] Job E2E `mongo-real` completo (21/21 pasos) sobre ese commit.
- [ ] Job `atlas` en verde o, si la guarda lo omite, omitido por escrito con su motivo (nunca silencioso).
- [ ] Playwright 35/35 sobre ese commit.
- [ ] Producción verificada: frontend, API, salud, CORS y `VITE_API_URL` del bundle desplegado.
- [ ] Cadena de base de datos y ensayos (TTL, rollback, restore) en verde sobre ese commit.
- [ ] Pendientes externos enumerados con variable exacta y prueba posterior definida.
- [ ] Barrido NO-MOCK sin coincidencias y sin botones/endpoints decorativos sin declarar.
- [ ] `git diff --check` limpio y sin artefactos experimentales en el árbol.
- [ ] Aprobaciones del propietario registradas (T15) o declaradas explícitamente como aceptadas en riesgo.
