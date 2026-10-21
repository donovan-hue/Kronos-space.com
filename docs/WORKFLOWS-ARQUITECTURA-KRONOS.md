# KRONOS SPACE — ARQUITECTURA DE WORKFLOWS

Documento de referencia de la automatización. Describe **qué existe**, **por qué**,
**cómo se dispara**, **qué credenciales usa** y **qué NO debe crearse**. Toda
afirmación está contrastada contra los archivos reales de `.github/workflows/` y
contra el repositorio, no contra una intención.

Fecha de esta revisión: 2026-10-17.

---

## 1. TOPOLOGÍA DE SERVICIOS (lo que hay, no lo que podría haber)

| Servicio | Papel | Dominio | Despliega desde |
|---|---|---|---|
| **Vercel** | Cliente web (producción) | `kronos-space.com` | Integración Git: push a `main` → Production; PR → Preview |
| **Cloudflare** | DNS del dominio, CDN/proxy delante de Render y espejo del cliente en Pages | `kronos-space.com` | Integración Git (Cloudflare Pages) |
| **Render** | API (backend Express + Socket.IO) | `api.kronos-space.com` | Integración Git: push a `main` |
| **MongoDB Atlas** | Base de datos | — | No despliega nada: es un servicio gestionado |
| **GitHub Actions** | CI, E2E, verificación y smokes | — | Este repositorio |

Consecuencia de diseño: **Vercel, Cloudflare y Render ya despliegan solos**. No
existe ningún `deploy-vercel.yml` ni `deploy-render.yml` porque añadirlos sería
duplicar un despliegue que ya ocurre y hacerlo peor (dos mecanismos compitiendo
por el mismo entorno). Lo que sí falta en esa cadena es **verificar el resultado
después**, y eso es exactamente `deploy-verify.yml`.

**Detalle verificado:** los despliegues que GitHub registra como *Deployments*
los crea `vercel[bot]` (entornos `Production – kronos-space-com`,
`Preview – kronos-social-ai-client`, etc.). Render **no** registra despliegues en
GitHub, por lo que un evento `deployment_status` cubre el frontend de Vercel y
no el API de Render.

---

## 2. WORKFLOWS EXISTENTES

### 2.1 `ci.yml` — Kronos Space - CI

- **Propósito:** validación general del repositorio. Es la puerta base de
  cualquier PR y de cualquier push a `main`/`develop`.
- **Problema que resuelve:** que un PR no se fusione con dependencias
  inconsistentes, lint roto, build roto, sintaxis de servidor rota o pruebas en
  rojo.
- **Entorno:** ninguno (no toca producción). Al final hace una verificación
  **de solo lectura** del entorno desplegado y publica el informe; ese paso no
  bloquea el merge (`continue-on-error: true`).
- **Triggers:** `push` a `main`/`develop`; `pull_request` (opened, synchronize,
  reopened) hacia `main`/`develop`.
- **Servicios externos:** GitHub (comentario en PR y en commit), la API y el
  frontend de producción en modo lectura.
- **Credenciales:** `secrets.GITHUB_TOKEN` (informes). No usa credenciales de
  producción: solo consulta URLs públicas.
- **Permisos:** `contents: write` (comentar en el commit durante un push) y
  `pull-requests: write` (comentar en el PR). Ambos están justificados por los
  pasos de informe; si se retiran esos pasos, deben retirarse los permisos.
- **Concurrencia:** `kronos-ci-<ref>`; en PR cancela la corrida anterior.
- **Timeout:** 25 min.

### 2.2 `kronos-e2e.yml` — Kronos E2E (MongoDB real)

- **Propósito:** verificación end-to-end contra MongoDB **real** y la cadena
  completa de base de datos (inventario → respaldo verificado → restauración
  probada en otra base → migración → validación → índices → huérfanos →
  `down --to 0` → re-`up` → TTL → rollback).
- **Jobs:**
  - `mongo-real` — contenedor `mongo:7` efímero. **Siempre** corre. Sin dobles,
    sin base en memoria.
  - `atlas` — el mismo E2E contra el clúster Atlas de pruebas, en la base fija
    `test`, fail-closed: sin secreto o sin allowlist **no se ejecuta** y lo dice.
- **Problema que resuelve:** ninguna migración ni índice se da por bueno porque
  "compila"; se prueba sobre datos reales y con restauración demostrada.
- **Triggers:** `workflow_dispatch` + `pull_request` (opened, synchronize,
  reopened) + `push` a `main`.
- **Credenciales:** `secrets.KRONOS_E2E_MONGODB_URI` (usuario dedicado al
  workload `test`) y `vars.KRONOS_E2E_CLUSTER_ALLOWLIST` (host exacto del
  clúster de pruebas). `secrets.JWT_SECRET` con valor de reserva solo para el
  job de Atlas.
- **Permisos:** `contents: read`. (Antes declaraba `contents: write` +
  `pull-requests: write` sin usarlos: corregido.)
- **Concurrencia:** `kronos-e2e-<ref>` (en PR cancela la anterior) **más** una
  cerradura a nivel del job `atlas` con grupo global
  `kronos-e2e-atlas-cluster-compartido`, porque todas las corridas comparten la
  misma base `test` del mismo clúster y se borran los datos entre sí.
- **Timeouts:** 30 min (`mongo-real`), 25 min (`atlas`).

### 2.3 `kronos-guardian.yml` — Kronos Guardian

- **Propósito:** análisis de riesgo del diff de cada PR (Guardian propio en
  `guardian/`).
- **Triggers:** `pull_request` (opened, synchronize, reopened).
- **Credenciales:** `secrets.GITHUB_TOKEN`.
- **Permisos:** job-level `contents: read` + `pull-requests: write` (comenta el
  informe en el PR).
- **Concurrencia:** `kronos-guardian-<ref>`, cancela la anterior.
- **Timeout:** 15 min.
- **Sintaxis:** `find -print0 | xargs -0 -r -n 1 node --check`, con
  `pipefail`: un archivo inválido falla el paso, incluidas rutas con espacios.
- **Riesgo crítico:** tocar las rutas declaradas en `RUTAS_CRITICAS` falla el
  check deliberadamente; no se debe desactivar esa guarda para limpiar un rojo.

### 2.4 `smoke-auth.yml` — Kronos Auth Smoke Test

- **Propósito:** recorrido real de autenticación y de rutas principales contra
  un backend desplegado (`scripts/auth-smoke-test.sh` y `scripts/smoke-test.sh`).
- **Por qué es manual:** **crea un usuario temporal** en la base apuntada por
  `base_url`. No debe correr en cada push.
- **Triggers:** `workflow_dispatch` con input `base_url`.
- **Permisos:** `contents: read` (no declaraba ninguno: heredaba el default del
  repositorio. Corregido).
- **Concurrencia:** `kronos-smoke-auth-<ref>`, cancela la anterior.
- **Timeout:** 15 min.
- **Advertencia operativa:** apuntarlo a producción crea usuarios de prueba en
  la base real. Para verificaciones sin efectos, usar la base de pruebas.

### 2.5 `smoke-openrouter.yml` — Kronos OpenRouter Smoke

- **Propósito:** verificación real del proveedor. Dos fases independientes:
  `provider` (llamada directa a OpenRouter: distingue "el proveedor falla" de
  "nuestro backend falla") y `deployed` (recorrido por la API desplegada).
- **Por qué es manual:** la generación de imagen **factura crédito** y crea
  usuarios temporales.
- **Triggers:** `workflow_dispatch` (inputs `base_url`, `generate_image`,
  `run_deployed`) + `schedule` semanal `0 7 * * 1` (lunes 07:00 UTC) **sin
  generar imágenes**: detecta modelos retirados o parámetros que el proveedor
  deja de aceptar, sin coste.
- **Credenciales:** `secrets.OPENROUTER_API_KEY`. Si falta, en manual **falla
  con mensaje explícito**; en el cron **avisa** y no finge verificación.
- **Permisos:** `contents: read`.
- **Concurrencia:** `kronos-smoke-openrouter-<ref>`, cancela la anterior.
- **Timeouts:** 15 min por job.

### 2.6 `verify-deploy.yml` — Kronos Deploy Verify

- **Propósito:** verificación **bajo demanda** y de solo lectura de un entorno
  desplegado: salud de la API, CORS por origen y URL de API compilada en el
  bundle del frontend.
- **Triggers:** `workflow_dispatch` con inputs `base`, `frontend`, `origins`,
  `frontend_alt`, `report_pr`.
- **Permisos:** `contents: read` + `pull-requests: write` (informe opcional en
  un PR, incluso ya fusionado).
- **Concurrencia:** `kronos-verify-deploy-<ref>`, **sin** cancelar: es una
  consulta que el operador pidió a propósito.
- **Timeout:** 15 min.
- **Resultado:** se publica primero el informe y después se exige
  `steps.verify_deploy.outcome == success`. Fallo, cancelación u omisión no
  certifican un despliegue. El `continue-on-error` del sondeo solo permite
  recoger evidencia; no convierte el resultado global en satisfactorio.

### 2.7 `deploy-verify.yml` — Kronos Post-Deploy Verify

- **Propósito:** verificar el resultado real de cada despliegue exitoso,
  distinguiendo **Production** de **Preview**. No despliega ni escribe datos.
- **Triggers:** `deployment_status` con `state == 'success'` y
  `workflow_dispatch` (consulta manual con URLs explícitas).
- **Producción:** verifica el dominio público y la API compartida con
  `scripts/verify-deploy.sh`: salud, trazabilidad, CORS y bundle.
- **Preview:** `scripts/ci/deployment-target.js` valida el `environment_url`
  del proyecto/equipo Vercel de Kronos; verifica **esa URL**, su bundle y su
  origen CORS contra la API que utiliza. Nunca sustituye la URL por producción
  ni acepta una URL de logs. No ejecuta login ni crea usuarios.
- **Sin falsos verdes:** HTTP 401/403, un bundle 404/HTML, redirección fuera de
  la preview o CORS bloqueado hacen fallar la verificación; no se evade
  autenticación, se amplía CORS ni se usan secretos para ocultar el fallo.
- **Código de confianza:** en eventos automáticos se prefiere la rama
  predeterminada, nunca el SHA/ref recibido en el evento. Durante la primera
  integración, solo el `main` conocido `0c95fc0` sin verificador puede usar
  los dos scripts de la revisión inmutable revisada `b0b6283` (checkout sparse).
  Una revisión desconocida o una consulta manual sin scripts falla, no elige
  otro código a escondidas. Al integrar este cambio, se usa `main` directamente.
  `persist-credentials: false`; `contents: read`; sin credenciales de producción.
- **Concurrencia:** producción conserva su cola, cada preview se aísla por
  deployment ID y cada consulta manual por run ID; ninguna cancela otra.
- **Timeout:** 15 min, con reintentos acotados de arranque/propagación.
- **Evidencia:** resumen y artefacto incluso al fallar; instrucciones de
  reversión solo para producción. Un fallo de preview no ordena revertirla.

**Cambio preparado el 21/10/2026:** el workflow anterior solo admitía
Production y omitía todas las previews correctas. Los registros históricos no
se reescriben; el comportamiento nuevo empieza cuando el cambio se publique
en una ejecución nueva. El arranque inicial admite el respaldo fijo descrito
arriba; no requiere fusionar a ciegas un PR con checks pendientes.

---

### Interpretar rojos y omitidos sin ocultar evidencia

- Las previews exitosas ya tienen un recorrido propio de verificación; los
  `verify-production: skipped` antiguos corresponden al workflow anterior.
- Los eventos `pending`, `in_progress`, `failure` o `error` siguen sin ejecutar
  el sondeo de un despliegue sano; los pasos de reversión se omiten si no hubo
  fallo. Esas omisiones son correctas y no certifican disponibilidad.
- La verificación es distinta del despliegue: consultar también el estado
  de la integración del proveedor.
- Un fallo histórico no describe necesariamente el último commit. Comparar el
  SHA, el entorno y la ejecución más reciente antes de relanzar o revertir.
- Los checks externos `Workers Builds`, `Cloudflare Pages` y `Vercel` no son
  workflows de este repositorio. Una integración obsoleta se desconecta en el
  proveedor, después de confirmar qué servicio sirve el dominio; no se arregla
  sobrescribiendo su estado en GitHub ni quitando DNS a ciegas.
- No borrar ejecuciones ni registros de despliegue para fabricar un panel
  verde. Conservar el fallo y su evidencia; corregir y verificar el nuevo SHA.

### Limpieza segura de ramas y PRs

1. Trabajar con historial completo (`git fetch --unshallow origin main` si el
   clon es superficial) y comparar contra `origin/main` actualizado. Un clon
   superficial puede clasificar ramas ya fusionadas como no integradas.
2. `git merge-base --is-ancestor <sha-rama> origin/main` demuestra integración
   por historial. Si devuelve falso, revisar también `git cherry` y los diffs:
   un squash puede haber incorporado cambios sin conservar los commits.
3. No borrar ramas con commits exclusivos, respaldos ni PRs abiertos sin
   revisar su contenido. Cerrar un PR reemplazado requiere dejar la referencia
   al reemplazo; no equivale a haberlo fusionado.
4. Respetar las reglas de protección del repositorio. No desactivar reglas
   globales para borrar ramas ni mezclar esta limpieza con un despliegue de
   producción no revisado.

---

## 3. TRIGGERS — QUÉ DISPARA QUÉ

| Trigger | Workflow | Acción |
|---|---|---|
| `push` a `main` / `develop` | `ci.yml` | Validación completa + verificación read-only del entorno + informe en el commit |
| `pull_request` (opened/synchronize/reopened) | `ci.yml`, `kronos-e2e.yml`, `kronos-guardian.yml` | Validación, E2E con MongoDB real y análisis de riesgo: son los tres obligatorios para aprobar un PR |
| `deployment_status` (success, Production o Preview) | `deploy-verify.yml` | Verifica el frontend del entorno correcto y la API compartida |
| `schedule` `0 7 * * 1` (UTC) | `smoke-openrouter.yml` | Verificación semanal sin coste del proveedor |
| `workflow_dispatch` | `kronos-e2e.yml`, `smoke-auth.yml`, `smoke-openrouter.yml`, `verify-deploy.yml`, `deploy-verify.yml` | Ejecución manual con inputs explícitos |

**Sin trigger de despliegue a propósito:** no existe ningún workflow que
despliegue. Despliegan Vercel, Cloudflare Pages y Render por integración Git.

### Eventos externos / webhooks / deploy hooks

| Mecanismo | Qué es | En KRONOS |
|---|---|---|
| **Workflow** | Proceso automatizado de jobs y pasos | Los 7 archivos de `.github/workflows/` |
| **Webhook** | Comunicación HTTP entre servicios a causa de un evento | **Entrante:** los que GitHub recibe de Vercel (`deployment_status`, que es lo que consume `deploy-verify.yml`) y **un único receptor en el código de KRONOS**: la bandeja federada de ActivityPub (`POST /api/federation/users/:username/inbox`), que hoy declara `501` sin procesar ni encolar nada. **Saliente:** ninguno (sin endpoints de webhook saliente en `server/src`). |
| **Deploy Hook** | URL que, al invocarla, pide un despliegue | **No se usa ninguno.** No hay URLs de deploy hook en el repositorio ni en los workflows. Si algún día se crea uno (p. ej. en Render para redesplegar sin commit), su URL **es un secreto**: debe vivir en GitHub → Secrets (nunca en un `env` a la vista, nunca en un archivo, nunca en un log). |

**Detalle completo de la superficie de eventos:** [`WEBHOOKS-ARQUITECTURA-KRONOS.md`](./WEBHOOKS-ARQUITECTURA-KRONOS.md) — identidad, endpoints, autenticación, payloads, veredicto de los 14 candidatos e inventario final.

**No confundir:** la URL de un deploy hook no es una variable normal de
configuración; quien la tenga puede provocar despliegues.

---

## 4. ENTORNOS

| Entorno | Dónde vive | Cómo se usa |
|---|---|---|
| **Producción** | Vercel Production, Render Production, Atlas de producción, Cloudflare DNS | Solo `deploy-verify.yml` (lectura) y `ci.yml` (lectura). Ningún workflow escribe en producción. |
| **Preview** | URL `kronos-space-*-oficialkronosspace-1215.vercel.app` anunciada por Vercel | `deploy-verify.yml`: frontend de preview + CORS de ese origen; **API compartida de producción**, sin escribir datos. |
| **Test / E2E** | Contenedor `mongo:7` efímero; clúster Atlas de pruebas en la base fija `test` | `kronos-e2e.yml`. |
| **Local** | `npm run dev` (Vite :3000 + API :5000), MongoDB local | Desarrollo; no hay workflow asociado. |

**Separación estricta de credenciales (verificada):**

- `MONGODB_URI` — producción. **No aparece en ningún workflow** salvo en los
  jobs E2E, donde se define explícitamente a `mongodb://127.0.0.1:27017/…`
  (contenedor efímero). Es decir: el workflow E2E **no puede** tomar por
  accidente la URI de producción.
- `KRONOS_E2E_MONGODB_URI` — Atlas de pruebas. Solo lo lee `kronos-e2e.yml`
  (job `atlas`) y las suites E2E del servidor.
- La guarda `server/test/helpers/e2e-target-guard.js` es **fail-closed**:
  allowlist obligatoria para hosts remotos, bloqueo ante señales de producción
  (`kronos-space.com`, `prod`, `live`, `kronos_social_ai`) y base fija `test`.
- Nombres oficiales y **únicos**: `KRONOS_E2E_MONGODB_URI`,
  `KRONOS_E2E_CLUSTER_ALLOWLIST`, `KRONOS_E2E_RUN_ID`. Las menciones antiguas a
  `E2E_CLUSTER_ALLOWLIST` (sin prefijo) se corrigieron: eran mensajes de ayuda
  que indicaban un nombre inexistente y podían llevar a configurar una variable
  que nadie lee.

---

## 5. VARIABLES Y SECRETS

| Nombre | Tipo | Entorno | Uso | Estado |
|---|---|---|---|---|
| `GITHUB_TOKEN` | Secret (automático) | GitHub | Informes en PR/commit; Guardian | Provis­to por GitHub |
| `KRONOS_E2E_MONGODB_URI` | **Secret** | Test/Atlas | E2E contra el clúster de pruebas | Configurado (el job `atlas` arranca) |
| `KRONOS_E2E_CLUSTER_ALLOWLIST` | **Variable** | Test/Atlas | Host del clúster de pruebas que la guarda acepta | Configurado (el job `atlas` pasa la comprobación) |
| `KRONOS_E2E_RUN_ID` | Variable (interna) | Test | Aísla la corrida | La define el workflow |
| `JWT_SECRET` | Secret | Test | Firma de tokens en E2E | Configurado; con valor de reserva en CI |
| `OPENROUTER_API_KEY` | **Secret** | Test/smoke | Smoke real del proveedor | Configurado (último smoke en verde) |
| `MONGODB_URI` (producción) | Secret | Producción | Vive **solo** en Render | No usado por ningún workflow |
| `CLIENT_URL`, `CORS_ORIGIN` | Variable | Producción | Orígenes permitidos | Vive en Render (no en workflows) |
| `VITE_API_URL` | Variable de build | Producción | URL de la API compilada en el bundle | Vive en Vercel (no en workflows) |

Regla aplicada: **Secret** si permite escribir, autenticar o facturar;
**Variable** si es una URL, una bandera o una allowlist. Ningún secreto se
imprime ni se escribe en archivos dentro de los workflows.

---

## 6. SEGURIDAD DE LOS WORKFLOWS

Correcciones aplicadas en esta revisión:

1. **Permisos innecesarios retirados.** `kronos-e2e.yml` declaraba
   `contents: write` + `pull-requests: write` y no escribe nada en el
   repositorio: ahora `contents: read`.
2. **Permisos ausentes añadidos.** `smoke-auth.yml` no declaraba `permissions` y
   heredaba el valor por defecto del repositorio: ahora `contents: read`.
3. **Fallos enmascarados corregidos.** Dos pasos de `ci.yml` ejecutaban 3 y 14
   `node --check` en serie **sin `set -e`**. En un bloque multilínea el exit code
   del paso es el del **último** comando, así que un archivo roto en medio podía
   pasar desapercibido. Añadido `set -euo pipefail`.
4. **Nombres de credenciales consistentes.** `E2E_CLUSTER_ALLOWLIST` →
   `KRONOS_E2E_CLUSTER_ALLOWLIST` en los mensajes de ayuda.

Revisión de `contents: write`, según lo pedido:

| Workflow | ¿Lo necesita? | Motivo |
|---|---|---|
| `ci.yml` | **Sí** | Publica el informe como comentario de commit en push (API de comentarios de commit). Si se elimina ese paso, debe retirarse el permiso. |
| `kronos-e2e.yml` | **No** | Corregido a `contents: read` |
| `kronos-guardian.yml` | **No** | `contents: read` a nivel de job |
| `smoke-auth.yml`, `smoke-openrouter.yml`, `verify-deploy.yml`, `deploy-verify.yml` | **No** | `contents: read` |

No hay credenciales en el repositorio: barrido de patrones (`sk-…`, `AIza…`,
`ghp_…`, claves PEM) sobre `server/src`, `client/src` y `scripts` → 0
coincidencias. Los inputs de `workflow_dispatch` son de tipo `string`/`boolean`
declarados, y ninguno se interpola en un shell sin comillas.

---

## 7. ROLLBACK

Ningún workflow despliega, así que ninguno revierte automáticamente. La
reversión es **manual y por servicio**, y `deploy-verify.yml` la publica en el
resumen cuando detecta que producción no pasó la verificación.

| Servicio | Cómo se revierte | Automatizable |
|---|---|---|
| Frontend (Vercel) | Panel de Vercel → Deployments → despliegue anterior → *Promote to Production* / *Rollback* | Sí, desde el panel; **no** desde un workflow (no se guardan credenciales de Vercel para evitar un secreto capaz de publicar) |
| API (Render) | Panel de Render → servicio del API → *Rollback* al despliegue anterior, o redeploy del commit bueno | Sí, desde el panel |
| Base de datos (Atlas) | Migraciones hacia atrás con `scripts/db/migrate.js down --to <versión>` **sobre una copia restaurada y verificada**, nunca a ciegas sobre producción | Parcial: la cadena de reversión ya se ensaya en `kronos-e2e.yml` (rollback + reaplicación) |
| Cloudflare (DNS/CDN) | Panel de Cloudflare | Manual |

**Regla:** no se implementa ningún rollback destructivo de datos sin restaurar y
verificar antes. La cadena E2E ya prueba `down --to 0` y la reaplicación sobre
una base restaurada, que es la única evidencia aceptable de que la reversión
funciona.

---

## 8. ARQUITECTURA FINAL

```
ci.yml ──────────────► validación general (lint, build, sintaxis, pruebas)
   │                     + verificación read-only del entorno desplegado
   │
kronos-e2e.yml ──────► MongoDB real: bloques E2E + cadena completa de BD
   ├─ mongo-real          (contenedor efímero, siempre)
   └─ atlas               (clúster de pruebas, fail-closed, cerradura global)

kronos-guardian.yml ─► análisis de riesgo del PR

smoke-auth.yml ──────► autenticación real contra un backend (manual)

smoke-openrouter.yml ► proveedor real (manual con coste) + cron semanal sin coste

vitrina de despliegue (Vercel / Cloudflare Pages / Render) ── integración Git
   │
   └─► deployment_status
          └─ deploy-verify.yml ► verificación post-despliegue de producción

verify-deploy.yml ───► verificación bajo demanda de cualquier entorno
```

### Lo que NO debe crearse (y por qué)

| Servicio | No crear | Motivo |
|---|---|---|
| Vercel | `deploy-vercel.yml` | Ya despliega por integración Git; un workflow que llame a la API de Vercel necesitaría un token capaz de publicar en producción, sin aportar nada que la integración no haga. |
| Render | `deploy-render.yml` | Ídem: Render despliega desde `main`. Tampoco crea Deploy Hooks: no hay nada que disparar. |
| Cloudflare | `cloudflare.yml` | Su función es DNS + CDN + Pages. El DNS no se cambia en cada commit; automatizarlo exigiría un token con permiso sobre el dominio. |
| MongoDB Atlas | `mongodb.yml` | `kronos-e2e.yml` ya ejecuta la cadena completa (migraciones, índices, respaldos, restore, rollback) contra MongoDB real. |
| GitHub | `release.yml` | No hay publicación de artefactos ni paquetes; el despliegue lo hacen los servicios. |
| Cualquiera | Workflow que "verifique" sin tocar nada real | Sería un workflow decorativo. |

---

## 9. VALIDACIÓN

```bash
# Sintaxis YAML de los 7 workflows (no basta con mirarlos)
node -e "..."   # parseo con js-yaml: OK en los 7

# Sintaxis del script de verificación modificado
bash -n scripts/verify-deploy.sh            # OK

# Pruebas del repositorio
npm run lint --workspace=client              # limpio
npm test --workspace=server                  # 491 pruebas, 0 fallos
npm test --workspace=client                  # 38 node + 253 vitest
npx playwright test                          # 35/35
```

Los resultados concretos de esta revisión están en el informe de entrega que
acompaña a este documento.

### Corrección del PR #66 · 21/10/2026

| Fallo reproducido | Corrección |
|---|---|
| `validate` se detenía en auditoría | Vite 7.3.6 → 7.3.7 y follow-redirects 1.16.0 → 1.16.1; se conserva el umbral `--audit-level=low`, incluidas herramientas de desarrollo y Guardian. |
| Pruebas browser aún exigían páginas y controles retirados | Contratos actualizados: catálogo real, alta de proyecto y tablero, capas por teclado, reloj activo sin botón de movimiento; no se desactivan suites. |
| El verificador no existía aún en `main` | Arranque acotado con los dos scripts del SHA fijo `b0b6283`, solo desde el `main` anterior conocido; ningún checkout del SHA arbitrario del deployment. |
| Solo se veía un exit code genérico en los checks | Playwright publica anotaciones de GitHub; el post-deploy anota cada `FALLA`, escapando el contenido HTTP. |

Comando completo de navegador: `CI=1 KRONOS_BROWSER_PRODUCTION=1 npm run test:browser -w client`.
No filtrar a cinco archivos ni tratar un subconjunto aprobado como toda la suite.
Los resultados remotos de esta revisión se consultan en los checks del [PR #66](https://github.com/donovan-hue/Kronos-space.com/pull/66).
