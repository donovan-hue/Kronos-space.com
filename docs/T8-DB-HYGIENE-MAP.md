# T8 — Mapa de Bases de Datos Atlas

> Fecha: 2026-10-07 · Rama: `arena/c6f3af64-kronos-space-com`
> Status: READ-ONLY AUDIT — no se eliminó nada.
> Método: rastreo de referencias en código, scripts, workflows, tests y docs.
> Limitación: sin acceso directo a Atlas en esta sesión. La clasificación se
> basa en evidencia de código; la verificación final de colecciones requiere
> `show dbs` y `db.getCollectionNames()` contra el clúster real.

---

## 1. Clasificación por base de datos

### 1.1 PRODUCCIÓN — NO ELIMINAR

| Base de datos | Variable | Evidencia | Rol |
|---|---|---|---|
| `kronos-space-com` | `MONGODB_URI` (Render) | `scripts/backup-verify.js:40` — `PRODUCTION_DATABASE = "kronos-space-com"` · Test `backup-verification.test.js:178` — `assert.equal(PRODUCTION_DATABASE, "kronos-space-com")` · `test/helpers/e2e-database.js:7` — PROTECTED_DATABASES · Logs de despliegue: "MongoDB conectado (kronos-space-com)" | **Base activa de producción** — usuarios, posts, mensajes, generaciones |
| `kronos_social_ai` | `MONGODB_URI` (legacy) | `test/helpers/e2e-target-guard.js:37` — regex protegida · `test/e2e-target-guard.test.js:98` — PROTECTED_DATABASES incluye kronos_social_ai · `test/drill-production-guard.test.js:35` — "la guarda reconoce kronos_social_ai" · `test/production-readonly-diagnostics.test.js:27` — URI de producción · `test/migration-confirm-guard.test.js:23` — BASE_REAL = kronos_social_ai | **Nombre anterior o alternativo de producción** — Protegida como producción en TODAS las guardas |

**RIESGO DE ELIMINAR: ⛔ CRÍTICO — datos reales de usuarios**

> **Nota:** `kronos_social_ai` podría ser la misma base que `kronos-space-com`
> (renombrada) o una base de producción legacy. NO eliminar sin confirmar en Atlas.
> Las guardas de protección del código (e2e-target-guard, drill-production-guard,
> migration-confirm-guard) tratan a AMBAS como producción.

---

### 1.2 E2E (Pruebas contra Atlas)

| Base de datos | Variable | Evidencia | Rol |
|---|---|---|---|
| `test` | `KRONOS_E2E_MONGODB_URI` (GitHub secret) | `.github/workflows/kronos-e2e.yml:475` — `KRONOS_E2E_MONGODB_URI: ${{ secrets.KRONOS_E2E_MONGODB_URI }}` · `server/test/helpers/e2e-target-guard.js` — base fija `test` permitida · `docs/WORKFLOWS-ARQUITECTURA-KRONOS.md:211` — "base fija `test`" | **Base E2E compartida** — Los tests crean y limpian datos entre corridas. Puede contener residuos de iteraciones anteriores. |

**RIESGO DE ELIMINAR: BAJO — es reutilizable. Pero puede contener colecciones residuales de funcionalidades experimentales (ver §2).**

---

### 1.3 CI LOCAL — Efímeras (solo existen dentro de MongoDB local en GitHub Actions)

| Base de datos | Variable en workflow | Workflow | Propósito |
|---|---|---|---|
| `kronos_ci_chain` | `MONGODB_URI` + `KRONOS_E2E_MONGODB_URI` | `kronos-e2e.yml:70-71` | Cadena CI local. Se crea y destruye por corrida. |
| `kronos-space-com` (local) | `MONGODB_URI` | `kronos-e2e.yml:268` | Simulación local de producción para backup/restore. NO es la base real. |
| `kronos_restore` | `MONGODB_TARGET_URI` | `kronos-e2e.yml:269,277` | Destino de restauración de backup. |
| `kronos_restore_proof` | `--target-uri` | `kronos-e2e.yml:244` | Prueba de restauración verificada. |
| `kronos_ensayo` | `MONGODB_URI` | `kronos-e2e.yml:310,331,358,378` | Base para pruebas de migración. |
| `kronos_ensayo_rollback` | `MONGODB_URI` | `kronos-e2e.yml:394` | Pruebas de rollback. |
| `kronos_migration_test` | `--target-uri` | `kronos-e2e.yml:343` | Target de migración. |
| `kronos_rollback_restore` | `--target-uri` | `kronos-e2e.yml:413` | Destino de restauración rollback. |

**RIESGO DE ELIMINAR: NULO — no existen en Atlas. Solo en MongoDB local de CI.**

---

## 2. Colecciones en `test` (Atlas) — Clasificación

> **IMPORTANTE:** Sin acceso a Atlas en esta sesión, no puedo enumerar las
> colecciones reales. La siguiente clasificación se basa en el código actual.

### Colecciones ACTIVAS en el código (27 modelos Mongoose)

```
users, posts, stories, messages, conversations, drafts,
scripts, scriptprojects, imagegenerations, videogenerations,
notifications, savedcollections, feedsignals, seenposts,
hiddenposts, blocks, mutes, reports, circles, orbits,
capsules, channels, channelmessages, liverooms,
mcpservicecredentials, supporttransactions, refreshtokens
```

GridFS: `kronosUploads.files`, `kronosUploads.chunks`

### Colecciones POSIBLEMENTE residuales en `test`

> **NO confirmadas sin acceso a Atlas.** Basado en auditorías históricas del
> proyecto que mencionan colecciones wallet/marketplace/token que ya no existen
> en el código.

| Colección mencionada en auditorías previas | Estado en código actual | Clasificación | Acción |
|---|---|---|---|
| `wallets` | **0 referencias** en `server/src/` — no hay modelo, ruta, servicio | RESIDUAL (si existe) | NO ELIMINAR hasta confirmar con `show dbs` |
| `marketplace` / `products` | **0 referencias** en `server/src/` | RESIDUAL (si existe) | NO ELIMINAR hasta confirmar con `show dbs` |
| `orders` | **0 referencias** en `server/src/` | RESIDUAL (si existe) | NO ELIMINAR hasta confirmar con `show dbs` |
| `tokens` / `kronostokens` | **0 referencias** en `server/src/` (distinto de refreshtokens que SÍ existe) | RESIDUAL (si existe) | NO ELIMINAR hasta confirmar con `show dbs` |
| Cualquier colección web3 | **0 referencias** en `server/src/` | RESIDUAL (si existe) | NO ELIMINAR hasta confirmar |

### Colecciones de sistema/infraestructura (NO eliminar)

| Colección | Propósito | Referencia |
|---|---|---|
| `kronos_migration_lock` | Lock distribuido de migraciones | `server/src/migrations/runner.js:28` |
| `kronos_migration_undo` | Registro de IDs para rollback | `docs/db/PLAN-MIGRACION-OPTIMIZACION.md:74` |

---

## 3. Verificación pendiente de Atlas

Para completar este mapa se necesita ejecutar:

```javascript
// Conectado a Atlas con read access:
show dbs

// Para cada DB:
use <dbname>
db.getCollectionNames()

// Especialmente para 'test':
use test
db.getCollectionNames()
```

### Resultado esperado

Para cada colección encontrada en `test`:
- Si está en la lista de 27 modelos activos → **E2E** (necesaria)
- Si es `kronosUploads.*` → **E2E** (GridFS)
- Si es `kronos_migration_*` → **INFRA** (migraciones)
- Si coincide con wallet/marketplace/product/order/token-web3 → **RESIDUAL** (evaluar eliminación)
- Si no coincide con nada conocido → **DESCONOCIDA** (no eliminar)

---

## 4. Resumen de clasificación

| Categoría | Bases de datos | ¿En Atlas? | Riesgo |
|---|---|---|---|
| **PRODUCCIÓN** | `kronos-space-com`, `kronos_social_ai` | Sí | ⛔ CRÍTICO |
| **E2E** | `test` | Sí | Bajo (limpiar residuos) |
| **CI LOCAL** | `kronos_ci_chain`, `kronos_restore`, `kronos_restore_proof`, `kronos_ensayo`, `kronos_ensayo_rollback`, `kronos_migration_test`, `kronos_rollback_restore` | **NO** (solo MongoDB local) | Nulo |

---

## 5. Acciones requeridas

### Inmediatas (requieren acceso a Atlas):

1. `show dbs` → listar todas las bases reales
2. Para cada base: `db.getCollectionNames()` → enumerar colecciones
3. Comparar con las 27 colecciones activas del código
4. Para colecciones no reconocidas: buscar en git history si tuvieron modelo

### Futuras (con autorización explícita):

1. Eliminar colecciones residuales confirmadas en `test`
2. Confirmar si `kronos_social_ai` y `kronos-space-com` son la misma base
3. Documentar cualquier base adicional encontrada
