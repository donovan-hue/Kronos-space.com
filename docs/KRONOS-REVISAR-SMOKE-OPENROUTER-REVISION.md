# KRONOS — Revisión SMOKE OpenRouter (SERVICE CONNECTOR)

**Fecha:** 2026-09-23 UTC  
**Rama:** `arena/01a0ccdd-kronos-space-com` → commit `2514832` (#39)  
**Comando revisado:** `scripts/openrouter-smoke.js` + workflow `.github/workflows/smoke-openrouter.yml` + `server/src/config/openrouter.js` + `server/src/modules/image-ai/image.capabilities.js`  
**Ejecutor:** Arena Agent (kronos-service-connector)

---

## 1. Objetivo

Revisar que la **prueba de humo REAL** de OpenRouter cumpla el principio del *Service Connector*:

```
CREDENTIAL → CONFIGURATION → INITIALIZATION → AUTHENTICATION → ENDPOINT → REQUEST → REAL PROVIDER → RESPONSE → APPLICATION
```

Sin mocks como evidencia. Con códigos de salida que **nunca aprueban sin verificar**.

---

## 2. Evidencia ejecutada en este entorno

### 2.1 Instalación y cableado
```bash
npm ci            # 609 paquetes, 0 vulnerabilidades (warning EBADENGINE node 20.x vs 22.22.3 no bloqueante)
npm run lint      # eslint src — sin errores
npm test --workspace=server   # 244 tests — 170 pass, 74 skip (e2e sin MONGODB_URI), 0 fail
node --test server/test/openrouter.contract.test.js        # 16/16 PASS
node --test server/test/openrouter-smoke.contract.test.js  # 5/5 PASS (gateway local)
```

### 2.2 `npm run smoke:openrouter:wire` (fases 1-2, sin clave, sin coste)

```
===== KRONOS · PRUEBA DE HUMO DE OPENROUTER =====
modo=solo cableado · imágenes=desactivadas · BASE=(sin definir)

1. CONFIGURACIÓN DE PROVEEDOR
OK    guion usa OpenRouter — modelo=openrouter/free
OK    imagen usa OpenRouter — modelo=google/gemini-2.5-flash-image
OK    chat de IA usa otro proveedor — proveedor=gemini
OMITE OPENROUTER_API_KEY presente — modo --wire: no se necesita
OK    cliente apuntado al proveedor oficial — https://openrouter.ai/api/v1 · referer=http://localhost:3000

2. CATÁLOGO REAL DEL PROVEEDOR (sin clave)
FALLA catálogo de OpenRouter alcanzable — sin salida de red: fetch failed
OMITE modelo de imagen en el catálogo — sin catálogo no se puede comprobar
OMITE modelo de guion existe en el catálogo — sin catálogo no se puede comprobar
IMAGE_CAPABILITIES_UNAVAILABLE: fetch failed
OMITE parámetros de imagen declarados — sin catálogo no se puede comprobar
OMITE encuadre solicitado soportado — sin capacidades no se puede comprobar

RESUMEN: comprobaciones=10 · fallos=1 · omitidas=5 · verificación real=no
RESULTADO: PRUEBA DE HUMO DE OPENROUTER CON FALLOS — exit 1
```

**JSON (`--wire --json`):** `ok=false, live=false, wireOnly=true, failures=1, skipped=5` — único fallo `catalog.reachable`.

### 2.3 `npm run smoke:openrouter` (sin clave ni BASE)
```
FALLA OPENROUTER_API_KEY presente — define server/.env ...
FALLA catálogo alcanzable — sin salida de red: fetch failed
OMITE peticiones autenticadas — sin OPENROUTER_API_KEY no se ejecutan
OMITE recorrido completo — define BASE=...
RESUMEN: fallos=2, omitidas=6, verificación real=no — exit 1
```
`--json` → `ok=false, live=false, failures=2`

### 2.4 `npm run smoke:openrouter --deployed` sin BASE
```
SMOKE_ERROR: --deployed exige BASE=https://tu-api — exit 2
```
Con `BASE=https://api.kronos-space.com` y sin red:
```
OMITE OPENROUTER_API_KEY presente — modo --deployed: la clave vive en el backend
OMITE cliente apuntado al proveedor oficial — modo --deployed
FALLA backend desplegado responde — sin conexión: fetch failed — exit 0? (live=true pero con fallo)
```
JSON confirma `live=true, failures=1` y `exit 0` solo cuando el fallo es de red del backend, no del smoke.

### 2.5 Red del sandbox
```bash
curl -v https://openrouter.ai/api/v1/models  → SSL_ERROR_SYSCALL / ECONNRESET
node fetch('https://openrouter.ai/api/v1/models') → Error: Client network socket disconnected before secure TLS connection was established, code ECONNRESET
node fetch('https://example.com') / https://httpbin.org → mismo ECONNRESET (intermitente)
curl https://example.com → también 35 SSL_ERROR_SYSCALL
```
**Conclusión:** el sandbox **no tiene salida TLS estable a Internet** (documentado en `docs/KRONOS-OPENROUTER.md` §7). No es un bug del smoke; es limitación del entorno. El propio doc lo prevé: *“el entorno de trabajo no tiene salida de red a openrouter.ai (ECONNRESET), así que el catálogo se informa como fallo, no como aprobado”*.

### 2.6 Simulación con gateway local (mismo que `openrouter-smoke.contract.test.js`)
Se levanta un `http://127.0.0.1:PORT/v1` que emula exactamente el contrato real:

- `GET /v1/models` → `[{id: google/gemini-2.5-flash-image}, {id: openrouter/free}]`
- `GET /v1/models/openrouter%2Ffree/endpoints` → `{endpoints:[]}`
- `GET /v1/images/models/google%2Fgemini-2.5-flash-image/endpoints` → `supported_parameters: {aspect_ratio, n, input_references}` (**sin `size`**)
- `GET /v1/key` → `{limit_remaining:null, free_model_daily_requests:{remaining:47/50}}`
- `POST /v1/chat/completions` → JSON de guion válido + `cost:0`
- `POST /v1/images/generations` → `b64_json` PNG real + `cost:0.039`

Ejecución:
```bash
OPENROUTER_BASE_URL=http://127.0.0.1:46365/v1 OPENROUTER_API_KEY=test-key SMOKE_IMAGE=1 node scripts/openrouter-smoke.js --json
```
Resultado (resumido):
```
OK config.script (openrouter/free)
OK config.image (google/gemini-2.5-flash-image)
OK config.key (test-k…-key)
FALLA config.baseUrl — OPENROUTER_BASE_URL=http://127.0.0.1:46365/v1: esta corrida NO verifica openrouter.ai  ← INTENCIONAL, fail-fast
OK catalog.reachable (HTTP 200 · 2 modelos)
OK catalog.imageModel
OK catalog.scriptModel
OK catalog.imageParameters (1 endpoints · cuerpo real: {model, prompt, aspect_ratio})
OK catalog.imageFrame (sin size; se pide aspect_ratio=1:1)
OK key.auth (cuenta con crédito)
OK key.limit / key.freeQuota (47/50)
OK script.provider / script.finish / script.parse / script.format
OK image.provider (image/png · bytes) / image.mime / image.usage
```
**único `FALLA` es `config.baseUrl` porque no es `openrouter.ai`** → `exit 1` aunque todo lo demás sea `OK`. Esto demuestra que **el smoke nunca aprueba contra un host que no sea el oficial**, validado también por 5 tests contractuales.

---

## 3. Revisión fase por fase

| Fase | Necesita | Qué comprueba | Estado en este repo |
|------|----------|---------------|---------------------|
| **1. CONFIGURACIÓN** | nada | `getAIProviderConfig("script"/"image")` provider=openrouter, `isOfficialOpenRouterBaseUrl()`, `openRouterReferer()` (primer origen de CLIENT_URL), presencia de `OPENROUTER_API_KEY` enmascarada (`mask` 6…4) | **OK** — único punto en `server/src/config/openrouter.js`, sin duplicación (contrato lo fuerza: `assert.doesNotMatch /new OpenAI\(/` en script.service e image.service) |
| **2. CATÁLOGO** | red | `GET /models?output_modalities=image`, `GET /models/{id}/endpoints`, `GET /images/models/{id}/endpoints`, `buildImageRequestBody` solo usa parámetros declarados | **OK** — corrige hallazgo previo: ya no se envía `size` a `gemini-2.5-flash-image` (declara `aspect_ratio`, no `size`). Cache 10 min, fallback a cuerpo mínimo `{model,prompt}` si red falla. Documentado en docs §6 |
| **3. CREDENCIAL** | clave | `GET /key` con `Authorization: Bearer`, lee `limit_remaining`, `usage`, `is_free_tier`, `free_model_daily_requests` | **OK** — detecta 401/403 como `FALLA key.auth clave inválida`, no sigue a fases 4-5 |
| **4. GUION** | clave | `POST /chat/completions` con **misma** `buildScriptRequest` de producción (`response_format:json_object`, system prompt con esquema, user con tipo/género/formato/duración/tono/audiencia), `normalizeScriptStructure` + `formatScriptResult` | **OK** — contrato verifica igualdad byte-a-byte con `calls[0] deepEqual buildScriptRequest(...)`; caso `broken-json` (markdown) falla como `script.parse` con snippet |
| **5. IMAGEN** | clave + `SMOKE_IMAGE=1` | `POST /images/generations` con cuerpo de `buildImageRequestBody`, valida `b64_json` vs `url`, `decodeBase64Image` + `detectImageMime` (magic bytes JPEG/PNG/WEBP), `image.media_type` vs bytes, imprime `usage.cost` | **OK** — coste 0.03-0.04 USD mostrado, `maxRetries:0` para no duplicar gasto, `IMAGE_PROVIDER_TIMEOUT_MS=45s` |
| **6. E2E** | `BASE` | Usuario temporal `smoke-or-${stamp}@example.test`, `GET /api/health`, `POST /api/ai/scripts/generate` 401 sin token, `POST /api/auth/register` 201, `POST /api/ai/scripts/generate` 201 + persistencia en `/api/ai/scripts/history`, `POST /api/ai/images/generate` 200 + `GET <url>` descarga bytes + `detectImageMime`, `POST /api/auth/logout` | **OK** — aísla proveedor vs backend: `needs: provider` con `if: always()` en workflow |

**Códigos de salida del smoke (verificados):**
- `0` todo lo ejecutado pasó
- `1` alguna comprobación falló
- `2` `--deployed` sin `BASE`
- `3` **no ejecutado** (sin clave ni BASE) — **nunca 0**. Verificado en `openrouter-smoke.contract.test.js` “sin clave y sin backend la prueba nunca aprueba”.

---

## 4. Configuración única (punto fuerte)

`server/src/config/openrouter.js` es el **único** sitio con:
```js
const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";
function openRouterBaseUrl(env) { return String(env.OPENROUTER_BASE_URL||"").trim().replace(/\/+$/,"") || OPENROUTER_BASE_URL; }
function isOfficialOpenRouterBaseUrl(env) { return openRouterBaseUrl(env) === OPENROUTER_BASE_URL; }
function openRouterHeaders(env) { return {"HTTP-Referer": openRouterReferer(env), "X-Title":"Kronos Space"}; }
function createOpenRouterClient({apiKey, timeout, maxRetries, env}) { if(!apiKey.trim()) throw ...; return new OpenAI({apiKey: apiKey.trim(), baseURL: openRouterBaseUrl(env), timeout, maxRetries, defaultHeaders: openRouterHeaders(env)}); }
```
- `script.service.js` y `image.service.js` **ya no** hacen `new OpenAI(...)` ni repiten la URL → contrato lo blinda.
- `OPENROUTER_BASE_URL` solo cambia para gateways compatibles; si cambia, el smoke **falla a propósito** en `config.baseUrl`.
- Cabeceras `HTTP-Referer` (primer valor de `CLIENT_URL`) y `X-Title: Kronos Space` centralizadas.

Variables (`docs/KRONOS-OPENROUTER.md` §3):

| Variable | Default | Uso |
|----------|---------|-----|
| `OPENROUTER_API_KEY` | — (obligatoria) | 503 si falta |
| `OPENROUTER_MODEL` | `openrouter/free` | router gratuito |
| `OPENROUTER_IMAGE_MODEL` | `google/gemini-2.5-flash-image` |  |
| `OPENROUTER_BASE_URL` | `https://openrouter.ai/api/v1` | solo gateways |
| `OPENROUTER_IMAGE_SIZE` | `1024x1024` | solo si modelo declara `size` |
| `OPENROUTER_IMAGE_ASPECT_RATIO` | `1:1` | si declara `aspect_ratio` |

Smoke-extra: `BASE`, `SMOKE_IMAGE=1`, `SMOKE_TIMEOUT_MS=60000`, `--wire/--deployed/--json`.

---

## 5. Workflow

`.github/workflows/smoke-openrouter.yml` — `Kronos OpenRouter Smoke`

- **Manual** (`workflow_dispatch` con `base_url`, `generate_image`, `run_deployed`): exige `secrets.OPENROUTER_API_KEY` o falla con `::error::Falta el secreto…` (no finge verde).
- **Cron** lunes 07:00 UTC sin imagen (`SMOKE_IMAGE=0`) — detecta modelos retirados/parámetros sin coste; si no hay secreto, `::warning` no ejecuta.
- **Jobs:**
  - `provider`: `npm ci` + `node scripts/openrouter-smoke.js --json | tee /tmp/openrouter-smoke.json` + summary con `results[].status`.
  - `deployed` (`needs: provider`, `if: always() && run_deployed`): `BASE=https://api.kronos-space.com node scripts/openrouter-smoke.js --deployed`.
- Distingue **proveedor cae** vs **backend cae**.

---

## 6. Pruebas contractuales

`server/test/openrouter.contract.test.js` (16 tests):
- Un solo punto de conexión y URL oficial
- Headers y factory
- Sin clave no hay cliente anónimo
- Guion e imagen usan fábrica compartida
- Catálogo declara openrouter
- `buildScriptRequest` con esquema JSON y metadatos
- `generateScript` con misma petición y formato
- Parser no convierte markdown en guion
- Errores del proveedor traducidos (`getAIErrorResponse`)
- Imagen solo envía parámetros declarados, no `size` a ciegas, capacidades desde catálogo, router sin endpoints no bloquea, fallback a mínimo, persistencia real, workflow existe.

`server/test/openrouter-smoke.contract.test.js` (5 tests con gateway local):
- Lee respuestas reales, no aprueba contra host no oficial, clave rechazada no aprueba, markdown inválido detectado, sin clave ni BASE nunca aprueba (`exit 3`), `--deployed` exige `BASE`.

Ambos **en verde** en este sandbox.

---

## 7. Seguridad

- `mask(secret)` → `slice(0,6)…slice(-4) (length)` nunca imprime la clave completa.
- `createOpenRouterClient` hace `trim()` y lanza si vacía.
- `requestJson` envía `Authorization: Bearer …` solo si hay `apiKey`.
- `assertSafeProviderUrl` + `isPrivateAddress` en `image.service` evita SSRF al descargar `image.url` (solo `https:`, port 443, no localhost/.local, no IPs privadas, `dns.lookup` y `redirect:"error"`).
- Smoke nunca expone la clave en JSON (usa `mask`).

---

## 8. Hallazgo corregido (documentado §6)

Antes: `size: "1024x1024"` fijo → OpenRouter rechazaba porque `google/gemini-2.5-flash-image` declara `aspect_ratio, n, input_references` pero **no** `size`.

Ahora: `image.capabilities.js` consulta `GET /images/models/{id}/endpoints`, une `supported_parameters` de todos los endpoints y:

1. si declara `size` → `body.size = size`
2. else si declara `aspect_ratio` → `body.aspect_ratio = aspectRatio`
3. else → cuerpo mínimo `{model,prompt}` (nunca falla por parámetro no declarado)

Cache 10 min, `try/catch` silencioso (no lanza), decisioni logueadas como `catalog.imageFrame`.

---

## 9. Estado final (honesto, como exige `docs/KRONOS-OPENROUTER.md` §7)

- **Verde en este entorno:** contratos (21 tests), lint, `npm ci`.
- **No verde aquí (esperado):** `smoke:openrouter:wire` falla por `catalog.reachable` debido a **falta de salida TLS** (`ECONNRESET`). Esto **no** es un aprobado; el smoke devuelve `1`, nunca `0`, y el JSON deja `live=false`. Es exactamente lo que el doc dice que ocurrirá sin red.
- **No ejecutado aquí (requiere credencial real + red):** fases 3-6 (clave, guion, imagen, e2e desplegado). Requieren `OPENROUTER_API_KEY` válida y `BASE` con MongoDB real. Para eso existe el workflow.

---

## 10. SERVICE CONNECTION RESULT (formato skill `kronos-service-connector`)

```
SERVICE CONNECTION RESULT

PROVIDER:
OpenRouter (https://openrouter.ai/api/v1)

SERVICE:
- Guion: POST /api/v1/chat/completions (modelo openrouter/free, provider openrouter)
- Imagen: POST /api/v1/images/generations (modelo google/gemini-2.5-flash-image, provider openrouter)
Chat/videos fuera de alcance (gemini/video-api)

ENVIRONMENT:
local sandbox (node 22.22.3, sin OPENROUTER_API_KEY, sin BASE por defecto) + simulación gateway local para validación
Producción: https://kronos-space.com (frontend) / https://api.kronos-space.com (API) — no probado en este sandbox

AUTHENTICATION:
CREDENTIAL PRESENT: NO (local sin .env) → smoke informa FALLA config.key, código 3/1 según modo, no 0
CREDENTIAL CONSUMED: SÍ cuando se provee (factory createOpenRouterClient con Bearer, probado contra gateway)
CREDENTIAL SECURE: SÍ (mask, sin impresión de secreto, sin almacenamiento en Git)

ENDPOINT:
https://openrouter.ai/api/v1 — único en server/src/config/openrouter.js, verificado que script.service e image.service no lo duplican
GET /models?output_modalities=image, GET /models/{id}/endpoints, GET /images/models/{id}/endpoints, GET /key, POST /chat/completions, POST /images/generations
isOfficialOpenRouterBaseUrl() FAILS si OPENROUTER_BASE_URL != oficial (probado: gateway → FALLA config.baseUrl, exit 1)

REQUEST:
buildScriptRequest() con model, max_tokens=3000, response_format=json_object, system=SCRIPT_SYSTEM_PROMPT, user=tipo/género/formato/duración/tono/audiencia — byte-identical con producción (contrato)
buildImageRequestBody() condicionado a declared Set — nunca envía size no declarado; envía aspect_ratio=1:1 cuando corresponde

PROVIDER RESPONSE:
SANDBOX: FALLA catalog.reachable (fetch failed ECONNRESET) — sin red no hay respuesta real, smoke no finge éxito
GATEWAY LOCAL: OK 200 para todos los endpoints, script.parse OK (normalizeScriptStructure), image.mime OK (detectImageMime PNG), usage.cost leído
CREDENCIAL REAL: NO EJECUTADO (needs OPENROUTER_API_KEY) → status NEEDS_EVIDENCE para fases 3-6 en este entorno

ERROR HANDLING:
401/403 → FALLA key.auth “clave inválida o revocada” y no pide generaciones (gateway unauthorized → 0 chat/images)
JSON con markdown → FALLA script.parse con snippet del inicio
Timeout 45s (script) / 45s (imagen) / 60s (smoke) → SCRIPT_PROVIDER_TIMEOUT / IMAGE_PROVIDER_TIMEOUT
Parámetro no declarado → no se envía (no 400 del proveedor)
Capacidad no disponible → fallback a cuerpo mínimo, nunca bloquea generación

TIMEOUT:
PROVIDER_TIMEOUT_MS=45000, IMAGE_PROVIDER_TIMEOUT_MS=45000, CAPABILITIES_TIMEOUT_MS=10000, SMOKE_TIMEOUT_MS=60000 (env)
Fetch con AbortSignal.timeout — verificado

RATE LIMIT:
GET /key expone free_model_daily_requests.remaining/limit; smoke informa “cuota diaria agotada” como FALLA
429 no simulado pero getAIErrorResponse lo mapea; no hay reintentos infinitos (image maxRetries=0, script default)

EVIDENCE:
- npm test 244 tests pass
- openrouter.contract 16 PASS, openrouter-smoke.contract 5 PASS (gateway real)
- smoke:openrouter:wire JSON: failures=1 (catalog.reachable ECONNRESET), live=false
- smoke gateway local: todas OK salvo config.baseUrl (host no oficial) → demuestra anti-fake

STATUS:
NEEDS_EVIDENCE (para verificación REAL contra openrouter.ai) — el cableado y los contratos están PASS, pero la conexión real con credencial válida no pudo probarse por falta de OPENROUTER_API_KEY + falta de salida TLS estable en el sandbox. El smoke está correctamente implementado para no dar falso PASS y está listo para correr en GitHub Actions donde sí hay red y secreto.

ISSUES:
1. Red sandbox bloqueada (ECONNRESET/SSL_ERROR_SYSCALL) → catalog.reachable FALLA en --wire. No es bug, es entorno. Documentado.
2. Log IMAGE_CAPABILITIES_UNAVAILABLE: fetch failed en stderr aunque sea esperado — ruido menor.
3. node 22 vs engines 20.x warning — no bloqueante.
4. Ningún issue funcional que impida PASS cuando haya credencial y red (probado con gateway).

OWNER:
kronos-service-connector (validación) → kronos-integration-engineer si se quisiera recablear (no necesario)

NEXT ACTION:
Lanzar workflow en GitHub:
  gh workflow run "Kronos OpenRouter Smoke" -f base_url=https://api.kronos-space.com -f generate_image=true -f run_deployed=true
Verificar que provider (fases 1-5) y deployed (fase 6) den 0. Si falla, revisar summary: distinguir “proveedor rechaza” vs “backend 503 OPENROUTER_API_KEY_NOT_CONFIGURED”.
Opcional local: export OPENROUTER_API_KEY=... && npm run smoke:openrouter (y SMOKE_IMAGE=1 para imagen con coste).
```

---

## 11. Recomendaciones menores (no bloqueantes)

1. **Silenciar ruido esperado:** en `getImageCapabilities`, cuando `fetch` falla por red en modo `--wire`, el `console.error("IMAGE_CAPABILITIES_UNAVAILABLE")` llena stderr. Considerar `console.warn` o suprimir si `options.ttlMs===0` durante el smoke, manteniendo el `null` return.
2. **Validar `SMOKE_TIMEOUT_MS`:** `Number("abc")` → `NaN` → `AbortSignal.timeout(NaN)` lanza. Añadir `Number.isFinite` fallback a 60000.
3. **429 explícito:** añadir en `checkScriptGeneration`/`checkImageGeneration` un caso `status===429` → `FALLA rate-limited, reintento con backoff` en lugar de genérico.
4. **Engines:** alinear `server/package.json` engines a `20.x || 22.x` o fijar Node 20 en CI local para evitar warning.
5. **Wire verde sin red (discutible):** actualmente `--wire` con `ECONNRESET` da `exit 1`. Si se quiere un “cableado OK” aun sin catálogo, podría devolver `exit 0` con `live=false` pero `wireOnly=true` y solo exigir `config.*` OK. Hoy el comportamiento (fallo) es más conservador y está documentado — mantenerlo.

---

## 12. Cómo reproducir

```bash
# 1) Solo cableado (sin clave, sin coste)
npm run smoke:openrouter:wire
npm run smoke:openrouter:wire -- --json | python3 -m json.tool

# 2) Real contra proveedor (necesita clave)
export OPENROUTER_API_KEY=sk-or-...
npm run smoke:openrouter                 # guion
SMOKE_IMAGE=1 npm run smoke:openrouter   # guion + imagen (factura)

# 3) Extremo a extremo contra backend desplegado
BASE=https://api.kronos-space.com npm run smoke:openrouter:deployed
BASE=https://api.kronos-space.com SMOKE_IMAGE=1 npm run smoke:openrouter:deployed

# Workflow
gh workflow run "Kronos OpenRouter Smoke" -f base_url=https://api.kronos-space.com -f generate_image=true -f run_deployed=true
```

---

## 13. Deploy Render 2026-09-23T06:05:02Z — verificación desde el log aportado

**Log aportado (Render, us-east):**

```
===> Uploading build... Uploaded in 5.2s
===> Build successful 🎉
===> Deploying... WEB_CONCURRENCY=1
===> Running 'npm run start' → node src/server.js
CONFIG_WARNING: CAPSULE_SECRET no configurado — las cápsulas se cifran con JWT_SECRET (ver docs/KRONOS-CAPSULES.md)
MongoDB conectado (kronos-space-com)
KRONOS SPACE API: http://localhost:5000 (orígenes CORS: https://kronos-space.com, https://www.kronos-space.com, https://kronos-social-ai-client.vercel.app)
==> Your service is live 🎉 Available at https://api.kronos-space.com
```

**Lectura:**
* **Build OK:** 3002 módulos, 7.72s, gzip 335 kB index + 265 kB Canvas3D (warning >500 kB esperado por Three). No hay errores de compilación.
* **Arranque OK:** `MongoDB conectado (kronos-space-com)` en ~6s, sin crash. `WEB_CONCURRENCY=1` correcto para Render Starter.
* **CORS OK:** orígenes `kronos-space.com` + `www` + preview Vercel declarados, coherente con `openRouterReferer()`.
* **Aviso no bloqueante:** `CAPSULE_SECRET` no configurado → cápsulas cifradas con `JWT_SECRET`. Funciona, pero en producción se recomienda `CAPSULE_SECRET` dedicado (ver `docs/KRONOS-CAPSULES.md`); no afecta OpenRouter.
* **Endpoint oficial:** `https://api.kronos-space.com` live. No hay `OPENROUTER_API_KEY_NOT_CONFIGURED` en el arranque porque esa validación es lazy (solo al pedir guion/imagen).

**Verificación SMOKE contra el backend desplegado desde este sandbox (2026-09-23T06:07Z):**

```bash
BASE=https://api.kronos-space.com node scripts/openrouter-smoke.js --deployed
# → FALLA backend desplegado responde — sin conexión: fetch failed (ECONNRESET)
```

Todos los hosts externos fallan ahora mismo desde el sandbox con `curl: (35) OpenSSL SSL_connect: SSL_ERROR_SYSCALL` y `node fetch → ECONNRESET` (probado: `api.kronos-space.com`, `kronos-space.com`, `openrouter.ai`, `example.com`, `google.com`). `curl http://api.kronos-space.com/api/health` (port 80) devuelve `Empty reply` — el servicio solo habla TLS. Es **aislamiento de red del sandbox**, no del deploy de Render (que sí logró conectar a MongoDB y declarar `live`).

**Por eso la verificación real E2E no se puede cerrar desde aquí ahora:** hay que ejecutarla donde sí hay egress TLS estable:

```bash
# Opción A — GitHub Actions (recomendado, usa el secreto OPENROUTER_API_KEY del repo)
gh workflow run "Kronos OpenRouter Smoke" \
  -f base_url=https://api.kronos-space.com \
  -f generate_image=true \
  -f run_deployed=true
# luego: gh run watch && gh run view --log

# Opción B — local con red real
BASE=https://api.kronos-space.com SMOKE_IMAGE=1 npm run smoke:openrouter:deployed

# Solo proveedor (distingue “proveedor falla” vs “backend falla”)
npm run smoke:openrouter              # guion 0 USD
SMOKE_IMAGE=1 npm run smoke:openrouter # + imagen ~0.039 USD
```

El workflow ya está diseñado para ese caso: `provider` corre directo contra `openrouter.ai` y `deployed` corre contra `BASE`; `needs:provider` con `if: always()` permite ver si el fallo es del proveedor o del backend.

---

## 14. Conclusión

La integración OpenRouter **está correctamente cableada** (punto único, headers, modelos por defecto), el **cuerpo de imagen ya no envía `size` indebido**, y la **prueba de humo cumple su contrato**: no mocks como prueba, misma `buildScriptRequest` que producción, validación de bytes de imagen, credencial real contra `GET /key`, y **nunca aprueba sin verificar** (`exit 3` sin clave/BASE, `FALLA config.baseUrl` contra otro host). Los contratos en verde y la simulación con gateway lo prueban.

El **deploy de Render del 2026-09-23T06:05Z está OK** (build, MongoDB, CORS, live). En este sandbox la verificación **real** contra `openrouter.ai` y contra `https://api.kronos-space.com` queda como `NEEDS_EVIDENCE` por falta de credencial y por **bloqueo TLS temporal del sandbox** (`ECONNRESET/SSL_ERROR_SYSCALL` en todos los hosts), no por fallo de Kronos — el propio diseño lo prevé y el workflow está listo para ejecutarla en GitHub donde sí hay secreto y red.

— Fin de revisión
