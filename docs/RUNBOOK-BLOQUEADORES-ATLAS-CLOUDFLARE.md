# Runbook — bloqueadores externos del PR #52 (Atlas y Cloudflare)

Estado a fecha 2026-10-08 · PR #52 · SHA auditado `d2f6d97240311d2fe4697786d1f16b687f1f2232`

Este documento no cambia código, permisos, secretos, DNS ni despliegues. Describe
las acciones que solo pueden hacer los administradores de cada servicio y cómo
verificar cada una después.

## Resumen de estado

| Bloqueador | Estado | Evidencia |
|---|---|---|
| E2E contra Atlas (run `37849393108`, job `113558251814`) | BLOCKED_EXTERNAL | Job en `failure`: `user is not allowed to do action [listCollections] on [test.]` |
| Cloudflare Workers Builds (`kronos-space-com`, check `113558232665`) | BLOCKED_EXTERNAL | `Preview creation failed: This Worker does not exist on your account.` |
| Cloudflare Pages (check `113558418861`) | PASS | Despliegue `d8bc112e` en verde para `d2f6d97` |
| API Render (`/health`) | PASS | 200 JSON, `database: connected`, commit `4278b64` (`main`) |

## 1. MongoDB Atlas — permiso del usuario E2E

**Causa:** el helper `server/test/helpers/e2e-database.js` llama a `db.collections()`
(`listCollections`) sobre la base `test` al inicio de cada suite. El usuario del
secreto `KRONOS_E2E_MONGODB_URI` no tiene un rol válido sobre `test`.

**Requisito mínimo (lo que debe hacer el administrador de Atlas):**
- Usuario: el **usuario E2E dedicado** (el del secreto `KRONOS_E2E_MONGODB_URI`). No usar el usuario de producción.
- Rol: **`readWrite` únicamente sobre la base `test`**.
- No conceder `root`, `dbAdmin`, `dbOwner`, `clusterAdmin` ni roles sobre otras bases.
- No rotar ni imprimir credenciales como parte de este cambio, salvo que el administrador lo decida por separado.

**Verificación después del cambio (sin exponer secretos):**
1. Confirmar en Atlas, en *Database Access*, que el usuario E2E tiene solo `readWrite@test`.
2. Reejecutar el job:
   `gh run rerun 37849393108 --job 113558251814`
3. Obtener el resultado del job nuevo:
   `gh run view <NUEVO_RUN_ID> --json jobs --jq '.jobs[] | select(.name|test("Atlas")) | .conclusion'`
4. Si falla, buscar el **primer** error causal en las anotaciones del job. No ampliar privilegios automáticamente.

**Criterio de cierre:** el job termina con `success` y el resumen TAP muestra `# fail 0`.
Hasta entonces Atlas permanece **BLOCKED_EXTERNAL**.

**Riesgo registrado (no resuelto aquí):** `clearNewDocuments` elimina colecciones nuevas
de la base `test` compartida. El grupo de concurrencia del job lo mitiga, pero no lo
elimina. Requiere decisión aparte.

## 2. Cloudflare Workers Builds — integración obsoleta

**Verificación en el repositorio (sin cambios):**
- No existe `wrangler.toml`, `wrangler.jsonc` ni configuración de Workers.
- La topología documentada (`docs/WORKFLOWS-ARQUITECTURA-KRONOS.md`) define solo
  Vercel (cliente), Cloudflare Pages (espejo del cliente) y Render (API).
- El check falla desde `2deba2f` y no existía en la base `4278b64`.

**Conclusión:** la integración *Workers Builds* conectada al repositorio no corresponde
a ningún despliegue vigente. Es una integración obsoleta de la cuenta de Cloudflare.

**Acción del administrador de Cloudflare:**
1. Abrir *Workers & Pages* en la cuenta de Cloudflare.
2. Localizar la integración Git de *Workers Builds* asociada a `donovan-hue/Kronos-space.com`
   (proyecto `kronos-space-com`).
3. Desconectar el repositorio de esa integración, o eliminar la integración si no tiene otro uso.
4. **No** tocar el proyecto de Cloudflare Pages ni los registros DNS.

**Verificación después:**
1. En el siguiente push o reejecución, el check `Workers Builds: kronos-space-com` debe
   desaparecer o no volver a aparecer como fallo:
   `gh api repos/donovan-hue/Kronos-space.com/commits/<SHA>/check-runs --jq '.check_runs[] | select(.name|test("Workers")) | .conclusion'`
2. Confirmar que `Cloudflare Pages` sigue en `success`:
   `gh api repos/donovan-hue/Kronos-space.com/commits/<SHA>/check-runs --jq '.check_runs[] | select(.name=="Cloudflare Pages") | .conclusion'`

**Criterio de cierre:** desconexión confirmada por el administrador y ausencia de fallos
de Workers Builds en un SHA posterior, con Pages en `success`.

**No se elimina nada del repositorio por inferencia.** El repositorio no contiene
configuración que la integración use.

## 3. Estado de la API Render

- `https://api.kronos-space.com/health` → 200 JSON, `database: connected`, commit `4278b645f3bd947447b0b7b02f12fb06682f5f9b`, `startedAt 2026-10-08T22:07:43Z`.
- `https://api.kronos-space.com/api/health` → 200 JSON con parámetro de consulta. Sin él, la herramienta de lectura devolvió una página en caché "Application loading". Esa página no refleja el estado actual.
- Pendiente: revisar en el panel de Render el último despliegue y los logs de arranque. Este repositorio no tiene acceso a ese panel.

## 4. Criterios para declarar GO

GO para el cierre de producción solo si se cumplen todos:
1. Job de Atlas en `success` tras el permiso `readWrite@test`, con SHA y run registrados.
2. Workers Builds desconectado y ausente de fallos en un SHA posterior.
3. Cloudflare Pages en `success`.
4. API Render sano y revisado en su panel.

Mientras falte cualquiera, el veredicto es **NO-GO**.
