# Arquitectura de Webhooks — KRONOS Space

> Auditoría, corrección y cierre de la superficie de **webhooks** de KRONOS Space.
> Fecha: 2026-10-07 · Rama: `arena/0797d985-kronos-space-com` · Base: `ac70766` (sobre `main` `ee49ebe`)
> Documento hermano: [`WORKFLOWS-ARQUITECTURA-KRONOS.md`](./WORKFLOWS-ARQUITECTURA-KRONOS.md) (workflows, jobs y triggers de CI/CD).

**Regla de oro aplicada:** *webhook ≠ workflow ≠ deploy hook*. Un **webhook** es comunicación HTTP disparada por un evento; un **workflow** es un proceso automatizado (GitHub Actions); un **deploy hook** es una URL que, al invocarse, pide un despliegue. No se creó ningún webhook "porque el servicio exista": cada candidato tiene veredicto y motivo en la §16.

---

## 0. Veredicto en una línea

KRONOS tiene **una sola superficie entrante de eventos en su propio código** (la bandeja federada de ActivityPub, hoy deliberadamente inerte con `501`) y **un webhook externo consumido por GitHub** (los eventos `deployment_status` que Vercel envía a Actions, que disparan la verificación post-despliegue). No hay deploy hooks, no hay webhooks duplicados y la auditoría **no justifica crear ningún webhook nuevo**. Se corrigió el único receptor real para que responda con el contrato de errores de la API (`503` reintentable en vez de `500` cuando el almacenamiento no responde) y se fijó con pruebas.

---

## 1. Qué existe hoy (auditoría con evidencia)

Búsquedas realizadas sobre el repositorio completo (excluyendo `node_modules`): `webhook`, `deploy.?hook`, `x-hub-signature`, `hmac`, `svix`, `stripe-signature`, `activitypub`, `inbox`, `callback`, `notify_url`. No existe `vercel.json`, `render.yaml`, `wrangler.toml` ni `.vercel/`: **ningún manifiesto declara webhooks**; la configuración vive en las plataformas.

| # | Superficie de eventos | Origen | Destino | Evento | Entorno | Acción | Auth | Estado |
|---|---|---|---|---|---|---|---|---|
| 1 | **Bandeja federada ActivityPub** — `POST /api/federation/users/:username/inbox` | Cualquier servidor federado (fediverso) | API KRONOS (Render) | Actividad ActivityStreams (`Create`, `Follow`, …) | Producción / local | **Ninguna**: responde `501 FEDERATION_INBOX_NOT_IMPLEMENTED` y no acepta ni encola | Ninguna (no procesa nada; ver §5) | **Existente, inerte por diseño, probado** |
| 2 | **Eventos de despliegue de Vercel** (`deployment_status`) | Vercel (App de GitHub) | GitHub (no toca código de KRONOS) | Deployment iniciado / éxito / fallo / cancelado | Producción y previews | GitHub crea un run de `deploy-verify.yml`; el job se ejecuta **solo** si el entorno empieza por `Production` y el estado es `success` | Firma del proveedor validada por GitHub (`X-Hub-Signature-256`) | **Existente, conectado y observado** (4 eventos reales el 2026-10-07) |
| 3 | **Eventos de plataforma de GitHub** (push, PR, schedule, dispatch) | GitHub | GitHub Actions | push / PR opened-synchronize-reopened / cron / manual | Prod (push `main`) · Test (PR) | Ejecuta los workflows documentados en el doc hermano | Secretos de GitHub | **Existente** (no es un webhook de aplicación: es el disparador de la plataforma) |
| 4 | **Deploy hooks** | — | — | — | — | **No existe ninguno** (ni en proveedores ni en el repositorio) | — | **Ausente y no necesario** (§15) |
| 5 | **Webhooks de proveedores de IA, email, pagos, Atlas, Cloudflare** | — | — | — | — | **No existen y no se necesitan** (§8, §16) | — | **Ausente justificado** |

### 1.1 Detalle del único receptor en código

`server/src/modules/federation/federation.routes.js` monta la federación en `app.use("/", federationRoutes)` **detrás** de los middleware globales de `server/src/server.js`:

```
helmet → cors → express.json({limit:"1mb"}) → inputSanitizer → rate limit /api (300/15 min por IP) → rutas
```

Contrato HTTP verificado (§18): `501` para un actor existente, `404` para un actor inexistente, `400 INVALID_JSON` para cuerpo ilegible, `413 PAYLOAD_TOO_LARGE` por encima de 1 MB, `503 STORAGE_UNAVAILABLE` cuando MongoDB no responde y `429` al superar el límite de tasa. El detalle está fijado por los tests `045b` y `045c` de `server/test/federation-live-support.contract.test.js` (el `045c` es nuevo de esta orden y ejerce la **app real**, no un doble).

---

## 2. Identidad de cada webhook

| Campo | Bandeja federada (`inbox`) | `deployment_status` (Vercel → GitHub) |
|---|---|---|
| **Nombre** | KRONOS Federation Inbox | Vercel Deployment Events |
| **Propósito** | Recibir actividades del fediverso cuando la federación entrante se implemente | Verificar producción después de cada despliegue |
| **Origen** | Servidores ActivityPub externos | App de Vercel para GitHub |
| **Destino** | `api.kronos-space.com` (Render) | GitHub (evento) → `deploy-verify.yml` → Render/Vercel (verificación) |
| **Evento** | POST de actividad ActivityStreams 2.0 | `deployment_status` con estado y entorno |
| **Acción** | Declarar `501` sin efectos (hoy) | Ejecutar `scripts/verify-deploy.sh` y publicar informe |
| **Entorno** | Producción (y local en pruebas) | Filtrado a `Production*` |
| **Servicio relacionado** | API Render + MongoDB Atlas (solo lectura del actor) | GitHub Actions + Render + Vercel |

---

## 3. Desencadenantes auditados (§2 de la orden)

| Evento | ¿Se usa? | Veredicto |
|---|---|---|
| Push | Sí | Dispara `ci.yml` en `main`/`develop` (plataforma GitHub, no webhook de app) |
| Pull Request | Sí | Dispara CI + E2E + Guardian en `opened/synchronize/reopened` |
| Commit | Indirecto | Los comentarios de CI se publican en el commit (API de GitHub) |
| Release | **No** | No existe proceso de publicación de versiones que deba reaccionar |
| Deployment iniciado | **No** | No hay acción útil al arrancar un despliegue (sí al terminar) |
| Deployment exitoso | Sí | `deployment_status` → `deploy-verify.yml` |
| Deployment fallido | **No** | Vercel/Render ya lo marcan en su panel; un run rojo duplicado no aporta (motivo en §16) |
| Deployment cancelado | **No** | Cancelar un despliegue no deja estado que verificar |
| Evento externo (fediverso) | Sí, inerte | La bandeja existe y declara no procesar |
| Evento de proveedor (IA/email/pagos) | **No** | Ningún proveedor integrado envía eventos hacia KRONOS (§8) |
| Evento programado | Sí | `cron 0 7 * * 1` del smoke de OpenRouter (sin generación de imagen: coste 0) |

---

## 4. Endpoint de cada webhook (§3)

| Webhook | URL / ruta | Método | Servicio receptor | Entorno | Puerto | Público/Privado | TLS |
|---|---|---|---|---|---|---|---|
| Bandeja federada | `https://api.kronos-space.com/api/federation/users/:username/inbox` | `POST` | API Express en Render | Producción | 443 (Render → interno) | **Público** (por diseño del protocolo) | HTTPS obligatorio; `helmet` envía HSTS; `app.set("trust proxy", 1)` respeta el proxy TLS del proveedor |
| WebFinger/NodeInfo/Actor/Outbox (soporte de la federación) | `/.well-known/webfinger`, `/.well-known/nodeinfo`, `/api/nodeinfo/2.0`, `/api/federation/users/:username`, `.../outbox` | `GET` | API Express | Producción | 443 | Público | Ídem |
| Deploy verify | No aplica (lo dispara GitHub internamente) | — | — | — | — | — | — |

Verificado en producción el 2026-10-07: `GET https://api.kronos-space.com/api/health` responde `ok:true` con `build.commit=ee49ebe` y `environment="production"`; el WebFinger público responde por el host de API. En local, la app real escuchó en `127.0.0.1` y respondió la matriz completa (§18).

---

## 5. Autenticación (§4)

| Superficie | Mecanismo real | Comentario |
|---|---|---|
| Bandeja federada | **Ninguno, y es correcto hoy**: la ruta no acepta, no encola ni persiste; no hay nada que proteger más allá del límite de tasa | Si algún día procesa: **HTTP Signatures** (draft-cavage / RFC 9421) verificando el actor remoto, con `Date` para anti-replay, y el cuerpo **sin parsear** hasta validar la firma (`express.raw` en esa ruta) |
| MCP (`/api/mcp/status`, `/api/mcp/me`) | Token propio (`middleware/mcpAuth`) | Solo lectura; **no recibe eventos**, no es un webhook |
| `deployment_status` | Firma HMAC de GitHub (`X-Hub-Signature-256`) validada por GitHub antes de emitir el evento | El workflow solo consume el evento ya verificado |

**Nunca** hay secretos, tokens ni API keys en el código (verificado por búsqueda: 0 aciertos en `server/src`, `client/src`, `scripts`). La única clave que KRONOS usaría para un webhook futuro (por ejemplo, un secreto de firma propio) debe vivir como **GitHub Secret** o variable de entorno del servicio, jamás en un archivo del repositorio.

---

## 6. Payload y validación (§5–§6)

- La bandeja **no confía en ningún campo**: no lee `type`, `actor`, `object` ni firma. La única consulta a datos es la búsqueda del usuario de la ruta (`:username`), sanitizada por `inputSanitizer` y validada contra la colección `User`.
- Límites y validación de transporte **activos y verificados**:

| Entrada hostil | Respuesta observada | Código |
|---|---|---|
| JSON ilegible | `400` | `INVALID_JSON` |
| Cuerpo > 1 MB | `413` | `PAYLOAD_TOO_LARGE` |
| Método distinto de POST | `404` | `NOT_FOUND` |
| Actor inexistente | `404` | `NOT_FOUND` (JSON) |
| Almacenamiento caído | `503` | `STORAGE_UNAVAILABLE` (**corregido en esta orden**) |
| Actor existente | `501` | `FEDERATION_INBOX_NOT_IMPLEMENTED` |
| Ráfaga > 300 req/15 min por IP | `429` | límite de tasa global de `/api` |

---

## 7. Acción de cada webhook (§7)

- **Bandeja federada**: hoy *no ejecuta acción alguna* por decisión explícita y probada (`501`, sin `accepted`/`queued`); el objetivo es que jamás **simule** éxito. Antes de que procese cualquier actividad deben existir, en este orden: (1) verificación de firma, (2) anti-replay, (3) validación de esquema del payload, (4) idempotencia por `id` de actividad y (5) una acción con efecto **no destructivo**.
- **`deployment_status`**: dispara la verificación de producción (jobs y pasos en el doc hermano). Es de solo lectura sobre producción: nunca migra, nunca despliega, nunca borra.

---

## 8. Integraciones auditadas (§8)

| Servicio | ¿Webhook hacia KRONOS? | Evidencia / motivo |
|---|---|---|
| **GitHub** | No como app; sí eventos de plataforma | 7 workflows activos; los eventos de PR/push son triggers de Actions, no un endpoint de KRONOS |
| **Vercel** | **Webhook de despliegue:** sí (consumido por GitHub). **Deploy Hook:** no existe | 4 eventos `deployment_status` observados el 2026-10-07 (ids `37582546322`, `37582597831`, `37585243626`, `37585292835`); todos filtrados correctamente por ser *preview*. **Webhook ≠ Deploy Hook**: el primero informa hechos, el segundo los provoca |
| **Render** | No | Registra despliegues en su panel, no publica eventos hacia KRONOS; `api.kronos-space.com` es CNAME a `kronos-space-com-bwu9.onrender.com` |
| **MongoDB Atlas** | **No, y no se necesita** | No hay consumidores de *change streams* (`grep changeStream|\.watch(` → 0 aciertos); el tiempo real de la app es Socket.IO interno. Producción y E2E usan credenciales distintas y base fija `test` con guarda fail-closed |
| **Cloudflare** | **No, y no se necesita** | Auditoría DNS/email real: NS `venkat/aleena.ns.cloudflare.com`; MX `route1-3.mx.cloudflare.net` (**Email Routing en uso**); SPF `v=spf1 include:_spf.mx.cloudflare.net ~all`; DKIM `cf2024-1._domainkey` presente; **DMARC ausente** (§12); `www` → `vercel-dns-017.com` (Vercel); `api` → Render. No hay automatizaciones ni eventos que consumir |
| **APIs externas (IA)** | No | `openai`, `@google/genai` y OpenRouter se consumen **salida**; el video-IA **consulta** al proveedor (`pollVideoJob`), no recibe *callbacks* (`callback|notify_url` → 0 aciertos en los módulos de IA) |
| **Pagos** | No existen | Decisión de alcance abierta en el checklist (`[P-D]`); si se monetiza habría que crear `STRIPE_WEBHOOK_SECRET` y un receptor con firma **antes** de cobrar |
| **Email** | No | No hay proveedor de envío en las dependencias; Cloudflare Email Routing es enrutamiento de entrada |
| **MCP** | No | Solo `GET /api/mcp/status` y `/api/mcp/me` con token; no recibe eventos |

---

## 9. Entornos (§9)

| Entorno | ¿Existe? | Webhooks | Secretos | Garantías |
|---|---|---|---|---|
| **Producción** | Sí | Bandeja federada (inerte) + `deployment_status` | Reales, solo en Render/Vercel/GitHub | HTTPS, HSTS, rate limit, límite de cuerpo; ninguna prueba escribe en producción |
| **Test/E2E** | Sí | Ninguno (no hay receptor de eventos en CI) | `KRONOS_E2E_MONGODB_URI` + `KRONOS_E2E_CLUSTER_ALLOWLIST` (clúster E2E), `JWT_SECRET` de CI | Base fija `test` + guarda fail-closed; los workflows E2E **no** pueden actuar sobre producción (verificado: `MONGODB_URI` se sustituye por `mongodb://127.0.0.1:…`) |
| **Staging** | **No existe** | — | — | No se inventa un entorno para justificar un webhook |
| **Local** | Sí | La app real puede recibir POST en `127.0.0.1` (así se validó §18) | Ninguno | Sin TLS (solo local); nunca apunta a Atlas de producción |

---

## 10. Respuesta HTTP, timeouts y procesamiento (§10)

- Contrato: `2xx` recibido/procesado · `4xx` solicitud inválida del emisor · `5xx` error propio o dependencia no disponible. El receptor responde **en menos de 1 s** en el camino normal; en caída de almacenamiento, ~10 s (agotamiento del *buffering* de Mongoose) y **después** responde `503` reintentable — nunca deja al emisor sin respuesta.
- La bandeja no procesa en segundo plano: **no hay** trabajo diferido que pueda fallar después del `501`, lo que elimina la clase de fallo "respondí 200 y perdí el evento".
- El evento `deployment_status` lo entrega GitHub con su propia política de reintentos a los workflows; el job de verificación tiene `timeout-minutes: 15` y `concurrency: kronos-post-deploy-verify` (sin cancelar en curso), de modo que un reintento no produce verificaciones simultáneas.

---

## 11. Reintentos, backoff e idempotencia (§11–§12)

| Superficie | Reintentos | Idempotencia | Detección de duplicados |
|---|---|---|---|
| Bandeja federada | Los del emisor (típico en ActivityPub) | **Trivialmente idempotente**: no escribe nada, `501` siempre | No aplica hoy; al implementar, deduplicar por `id` de actividad en una colección con índice único |
| `deployment_status` | Los de GitHub | La verificación es **de solo lectura**: repetirla no altera estado | El `deployment.id` de Vercel identifica el hecho; la concurrencia del workflow evita solapes |
| Deploy y migraciones | — | Los despliegues los gobiernan Vercel/Render (commit como identidad) | La migración se ejecuta en el arranque del servicio, no por webhook |

**Regla respetada:** ningún proceso automático cancela operaciones de base de datos (podría dejar datos inconsistentes). El `cancel-in-progress` solo se usa donde el trabajo es reproducible y sin efectos (CI de PR); en el E2E de Atlas y en la verificación post-despliegue está **desactivado**.

---

## 12. Seguridad (§13) — hallazgos

| # | Hallazgo | Severidad | Estado |
|---|---|---|---|
| 1 | El único receptor devolvía `500` genérico sin `code` cuando el almacenamiento no estaba disponible (mentía sobre la causa y trataba un corte temporal como fallo interno) | Media | **Corregido** en esta orden + test `045c` |
| 2 | **Sin registro DMARC** en `kronos-space.com` (`_dmarc` → `ENODATA`) mientras el dominio tiene SPF y DKIM activos y enruta correo con Cloudflare | Media (suplantación de correo) | **Pendiente del propietario**: alta del TXT en Cloudflare (§20) |
| 3 | Sin registros CAA (cualquier CA puede emitir para el dominio) | Baja | Recomendado, no bloqueante |
| 4 | Antes de esta orden, la bandeja respondía `202` simulando aceptación | Alta (falso éxito) | Ya corregido a `501` en `ee49ebe`; **verificado** en esta auditoría |
| 5 | `contents: write` en workflows y credenciales con nombres inconsistentes | Media | Corregido en la orden anterior de workflows (`2797c49`) y documentado aquí por trazabilidad |

Controles vigentes y verificados: HTTPS + HSTS, rate limiting por IP en `/api` (300/15 min, configurable por entorno), límite de cuerpo 1 MB, sanitización de entrada, respuestas sin detalles internos (español, sin *stack*), logs sin secretos ni cuerpos, permisos mínimos en CI, y separación estricta producción/test.

---

## 13. Logs y monitoreo (§14)

Cada petición atraviesa `requestContext`, que asigna un **Request ID** (correlation ID) y lo registra junto al método, la ruta, el estado y el nombre/código del error. Las líneas observadas en la validación:

```
API_ERROR { requestId, method: 'POST', path: '/api/federation/users/astro/inbox', status: 400, name: 'SyntaxError' }
INBOX_ERROR MongooseError: Operation `users.findOne()` buffering timed out after 10000ms
HTTP_SERVER_ERROR { requestId, method: 'POST', path: '…/inbox', status: 503 }
```

No se registran cuerpos de petición, tokens, cabeceras de autorización ni secretos. El `deployment.id` y el `commit` quedan en el evento de GitHub y en los artefactos del workflow de verificación.

---

## 14. Relación WEBHOOK → WORKFLOW → JOB → STEP (§15)

```
EVENTO (deployment_status)
  ↓ WEBHOOK  (Vercel → GitHub: informa el hecho, firmado)
  ↓ VALIDACIÓN  (GitHub verifica la firma del emisor; el workflow filtra entorno Production*)
  ↓ ACCIÓN  (ejecutar verificación de producción)
  ↓ WORKFLOW  .github/workflows/deploy-verify.yml
  ↓ JOB  verify-production   (contents: read · timeout 15 min · concurrencia kronos-post-deploy-verify)
  ↓ STEP  scripts/verify-deploy.sh → /health con reintentos + "ok" en el JSON → informe y artefacto
  ↓ RESULTADO  verde (producción verificada) · rojo + tabla de reversión (producción NO verificada)
```

```
EVENTO (actividad federada entrante)
  ↓ WEBHOOK  (servidor ActivityPub → POST /api/federation/users/:username/inbox)
  ↓ VALIDACIÓN  (límite de tasa · cuerpo ≤ 1 MB · JSON válido · actor existente)
  ↓ ACCIÓN  declarar que no se procesa (501) — sin efectos, sin cola, sin falso éxito
  ↓ WORKFLOW  ninguno (no se delega en CI/CD)
  ↓ RESULTADO  501 observable por el emisor, con `code` estable
```

---

## 15. Deploy Hooks (§16) — auditoría

| Proveedor | Deploy Hook | URL | Entorno | Quién lo invocaría | Autenticación | Motivo |
|---|---|---|---|---|---|---|
| Vercel | **No existe** | — | — | — | — | El proyecto despliega por **integración Git** (`www` → `vercel-dns-017.com`, eventos `deployment_status` reales): un deploy hook duplicaría el disparo |
| Render | **No existe** | — | — | — | — | Igual: Render despliega desde `main` (CNAME `api` → `…onrender.com`) |
| Cloudflare Pages | **No existe** | — | — | — | — | Construye desde el repositorio; ningún proceso de KRONOS necesita provocar su build |

Si alguno llegara a crearse, debe cumplir: URL almacenada como **Secret** (`RENDER_DEPLOY_HOOK_URL`, `VERCEL_DEPLOY_HOOK_URL`), nunca en código, README, logs ni commits; invocación solo desde un workflow con `permissions: contents: read`; y jamás desde un workflow de PR (un PR no despliega producción).

---

## 16. Lista objetivo (§17 de la orden): los 14 candidatos con veredicto

| # | Candidato | Veredicto | Motivo |
|---|---|---|---|
| 1 | GitHub Push Webhook | **No se crea** | Los push ya disparan Actions; un webhook hacia la app exigiría un endpoint que KRONOS no tiene ni necesita |
| 2 | GitHub Pull Request Webhook | **No se crea** | Ídem: PR es trigger nativo de Actions (CI + E2E + Guardian) |
| 3 | GitHub Release Webhook | **No se crea** | No hay proceso de release que reaccione |
| 4 | GitHub Workflow/CI Event | **No se crea** | No hay canal de notificación (Slack/email) ni acción pendiente tras un run; el estado ya vive en GitHub |
| 5 | Vercel Deployment Started | **No se crea** | No hay acción útil al arrancar |
| 6 | Vercel Deployment Ready/Success | **Ya existe y se usa** | `deployment_status` → `deploy-verify.yml` (`Production*` + `success`) |
| 7 | Vercel Deployment Error | **No se crea** | Vercel ya lo señala; un run rojo duplicado no cambia la respuesta del operador |
| 8 | Vercel Deployment Canceled | **No se crea** | Sin estado que verificar |
| 9 | Vercel Deploy Hook | **No se crea** | La integración Git despliega; no hay disparo externo necesario (§15) |
| 10 | Render Deployment Event | **No se crea** | Render no publica eventos hacia KRONOS; el CNAME y `/health` con `build.commit` cubren la trazabilidad |
| 11 | Render Deploy Hook | **No se crea** | Igual que 9 |
| 12 | Atlas Event/Webhook | **No se crea** | Sin *change streams* ni sincronización externa; producción/E2E ya están separadas por credencial y guarda |
| 13 | Cloudflare Event/Webhook | **No se crea** | DNS y Email Routing auditados: no hay automatización que consuma eventos (los hallazgos DMARC/CAA son de configuración, no de eventos) |
| 14 | Provider Webhook (IA/video/email/pagos/MCP) | **No se crea** | Ninguno envía eventos: la IA se consume salida, el video se consulta por *polling*, no hay proveedor de email ni de pagos, y MCP es lectura con token |

---

## 17. Inventario obligatorio (§18 de la orden)

| Webhook | Origen | Destino | Evento | Entorno | Acción | Auth | Estado |
|---|---|---|---|---|---|---|---|
| Bandeja federada | Servidores ActivityPub | API KRONOS (Render) | Actividad AS2 (`POST`) | Prod / local | Declara `501` sin efectos | — (inerte; firma HTTP obligatoria antes de procesar) | Existente y probado |
| Deployment Ready/Success | Vercel | GitHub → Actions | `deployment_status` `success` en `Production*` | Prod | Verificación de producción + informe | Firma de GitHub | Existente, observado en vivo |
| Push | GitHub | Actions | `push` | Prod (`main`) / Test | CI completa | Secretos de GitHub | Existente |
| Pull Request | GitHub | Actions | `opened`/`synchronize`/`reopened` | Test | CI + E2E + Guardian | Secretos de GitHub | Existente |
| Programado | GitHub | Actions | `cron 0 7 * * 1` | Test (sin coste) | Smoke de OpenRouter sin imagen | Secreto del proveedor | Existente |
| — | — | — | — | — | *(No hay más: no se rellenan filas con integraciones inventadas)* | — | — |

---

## 18. Validación ejecutada (§19)

**Local (app real, sin dobles, `server/src/server.js`):**

| Caso | Resultado |
|---|---|
| Payload válido (actor existente) | `501 FEDERATION_INBOX_NOT_IMPLEMENTED` (test `045b`, ya existente) |
| Payload inválido (JSON ilegible) | `400 INVALID_JSON` |
| Payload inválido (2 MB) | `413 PAYLOAD_TOO_LARGE` |
| Método incorrecto (`GET`) | `404 NOT_FOUND` |
| Ruta inexistente (API y fuera de API) | `404 NOT_FOUND` (JSON, no HTML) |
| Almacenamiento caído | `503 STORAGE_UNAVAILABLE` (**antes: `500` genérico sin `code`**) |
| Evento duplicado (mismo `id`, dos POST) | `503`/`501` idénticos, **sin efectos acumulados** |
| Evento desconocido (`type` arbitrario) | Sin cambios de comportamiento: el receptor no interpreta el evento |
| Rate limiting | Límite `/api` verificado con `API_RATE_LIMIT_MAX=3`: 3 respuestas normales y la 4.ª `429` |
| Timeout/errores del receptor | No hay trabajo diferido: la respuesta es síncrona; el caso lento (DB) responde `503` |

**Suite automatizada:** `node --test server/test/federation-live-support.contract.test.js` → **8/8 en verde**, incluido el nuevo `045c`.

**Producción (solo lectura desde este entorno):** `GET /api/health` → `ok:true`, `database: connected`, `environment: production`, `commit: ee49ebe` (main); WebFinger público de la API responde JSON. El paso "Verify deployed environment (read-only)" de CI terminó en verde para `ac70766`. Las sondas POST contra producción **no pudieron ejecutarse desde este entorno** (el sandbox no tiene salida HTTPS directa y la integración de GitHub no permite `workflow_dispatch`); ver §20.

---

## 19. Archivos y configuración (§20)

**Creados**

| Archivo | Motivo |
|---|---|
| `docs/WEBHOOKS-ARQUITECTURA-KRONOS.md` | Este documento: inventario, veredictos y evidencia |

**Modificados**

| Archivo | Cambio |
|---|---|
| `server/src/modules/federation/federation.routes.js` | La bandeja responde `503 STORAGE_UNAVAILABLE` (reintentable, con `code`) cuando el fallo es de almacenamiento, y añade `code: FEDERATION_INBOX_ERROR` al `500` restante. Reutiliza `isStorageUnavailable` de `middleware/httpErrors` (mismo criterio que `session.routes.js`) |
| `server/test/federation-live-support.contract.test.js` | Nuevo test `045c` contra la app real: 400/413/404/503/501 |
| `docs/WORKFLOWS-ARQUITECTURA-KRONOS.md` | Referencia cruzada a este documento (sin duplicar contenido) |

**Eliminados:** ninguno.

**Variables/Secretos**

| Nombre | Tipo | Servicio | Entorno | Uso |
|---|---|---|---|---|
| `KRONOS_E2E_MONGODB_URI` | Secret | GitHub Actions | Test/E2E | Job `atlas` (base fija `test`) |
| `KRONOS_E2E_CLUSTER_ALLOWLIST` | Variable | GitHub Actions | Test/E2E | Guarda fail-closed del destino |
| `JWT_SECRET` | Secret | GitHub Actions / Render | Test / Prod | Firma de sesiones (CI usa un valor de prueba) |
| `OPENROUTER_API_KEY` | Secret | GitHub Actions | Test | Smoke del proveedor |
| `MONGODB_URI` | Secret | **Solo Render** | Prod | Nunca aparece en workflows |
| `MCP_*` (token y permisos) | Secret | Render | Prod | Autenticación de MCP |
| *(futuro)* firma de webhooks entrantes / `STRIPE_WEBHOOK_SECRET` | Secret | Render | Prod | Solo si se implementa la federación entrante o el cobro |

Regla aplicada: **secret** para credenciales o material de firma; **variable** para URLs, banderas y allowlists. La URL de un deploy hook nunca será una variable normal: será un **secret**.

---

## 20. Pendientes del propietario

1. **DMARC (hallazgo §12)**: publicar en Cloudflare, en el DNS de `kronos-space.com`, un TXT `_dmarc` — mínimo viable:
   `v=DMARC1; p=none; rua=mailto:<buzón-de-reportes>; fo=1` (empezar en `p=none` para observar y endurecer a `quarantine`/`reject`). Opcional: publicar CAA.
2. **Verificación de producción del cambio de la bandeja**: se acredita tras el merge a `main` (el clúster de producción sigue en `ee49ebe`). Comprobación mínima:
   `curl -i -X POST https://api.kronos-space.com/api/federation/users/<usuario-existente>/inbox -H 'Content-Type: application/json' -d '{"type":"Create"}'` → `501` con `code`; y con JSON roto → `400 INVALID_JSON`.
3. **Ejecutar `deploy-verify.yml` una vez en producción**: se disparará solo con el primer despliegue `Production*` posterior al merge; si se quiere adelantar, `workflow_dispatch` desde la interfaz de Actions (los *inputs* tienen valores por defecto de producción).
4. **Runs E2E pre-fix**: cancelar en la interfaz de Actions los cuatro runs anteriores al control de concurrencia si siguen vivos (`37571231073`, `37573246092`, `37574608331`, `37575619996`).
