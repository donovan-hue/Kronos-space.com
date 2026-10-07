# T8 — Mapa de Bases de Datos Atlas

> Fecha: 2026-10-07 · Rama: `arena/c6f3af64-kronos-space-com`
> Status: READ-ONLY AUDIT — no se eliminó nada.

---

## Clasificación de bases de datos

### PRODUCCIÓN

| Base de datos | Variable | Propósito | Quién la usa |
|---|---|---|---|
| `kronos-space-com` | `MONGODB_URI` (Render) | Base de datos principal de producción. Contiene todos los datos reales de usuarios, posts, mensajes, generaciones, etc. | Servidor desplegado en Render (`api.kronos-space.com`) |
| `kronos_social_ai` | `MONGODB_URI` (ejemplo) | Nombre alternativo documentado en `.env.example`. Posible nombre anterior de producción. | Documentación legacy |

**RIESGO DE ELIMINAR: CRÍTICO — datos reales de usuarios.**

---

### E2E (Pruebas contra Atlas)

| Base de datos | Variable | Propósito | Quién la usa |
|---|---|---|---|
| `test` | `KRONOS_E2E_MONGODB_URI` (secret GitHub) | Base fija para E2E contra Atlas. Los tests crean y limpian datos aquí. | Workflow `kronos-e2e.yml` (job "E2E contra Atlas"), `assertE2ETarget` fail-closed |

**RIESGO DE ELIMINAR: BAJO — es una base de pruebas reutilizable. Los datos se limpian entre corridas. Pero contiene residuos históricos (ver abajo).**

---

### CI LOCAL (Ephemeral)

| Base de datos | Variable | Propósito | Quién la usa |
|---|---|---|---|
| `kronos_ci_chain` | `MONGODB_URI` / `KRONOS_E2E_MONGODB_URI` (CI local) | Base efímera para la cadena CI local (MongoDB en `127.0.0.1:27017`). Se crea y destruye en cada corrida. | Workflow `kronos-e2e.yml` (job CI local) |
| `kronos_restore` | `MONGODB_TARGET_URI` (CI local) | Destino para pruebas de restauración de backup. Efímera. | Workflow `kronos-e2e.yml` (job "Restauración probada") |
| `kronos_restore_proof` | `--target-uri` (CI local) | Destino de la prueba de restauración verificada. Efímera. | Workflow `kronos-e2e.yml` |
| `kronos_ensayo` | `MONGODB_URI` (CI local) | Base para pruebas de migración. Efímera. | Workflow `kronos-e2e.yml` (jobs de migración) |
| `kronos_ensayo_rollback` | `MONGODB_URI` (CI local) | Base para pruebas de rollback. Efímera. | Workflow `kronos-e2e.yml` |
| `kronos_rollback_restore` | `--target-uri` (CI local) | Destino de restauración rollback. Efímera. | Workflow `kronos-e2e.yml` |
| `kronos_migration_test` | `--target-uri` (CI local) | Base para pruebas de migración target. Efímera. | Workflow `kronos-e2e.yml` |

**RIESGO DE ELIMINAR: NULO — todas son efímeras y se crean en CI local.**

---

## Residuos históricos en `test` (Atlas)

La base `test` en Atlas fue usada durante el desarrollo iterativo del proyecto. Además de los datos E2E actuales, puede contener colecciones residuales de funcionalidades que ya no existen en el código:

### Colecciones que NO tienen modelo en el código actual

Las siguientes colecciones fueron mencionadas en auditorías anteriores como presentes en `test` pero **ya no tienen schema/modelo** en `server/src/modules/`:

| Colección residual | Origen probable | Estado del código | Acción propuesta |
|---|---|---|---|
| `wallets` / `wallet` | Iteración temprana de Wallet/Kronos Token | NO existe en código actual. No hay ruta, modelo ni servicio. | **ELIMINABLE** — residual sin referencia |
| `marketplace` / `products` | Iteración temprana de Marketplace | NO existe en código actual. | **ELIMINABLE** — residual sin referencia |
| `orders` / `transactions` (no SupportTransaction) | Iteración temprana de Marketplace | NO existe como modelo de marketplace. `SupportTransaction` es diferente y SÍ existe. | **ELIMINABLE** si no corresponde a `SupportTransaction` |
| `tokens` / `kronostokens` | Iteración temprana de Kronos Token | NO existe en código actual. | **ELIMINABLE** — residual sin referencia |
| Cualquier colección web3 | Experimento temprano | NO existe en código actual. | **ELIMINABLE** |

### Verificación

```bash
# En el código actual:
grep -rn "wallet\|Wallet\|marketplace\|Marketplace" server/src/ --include="*.js"
# Resultado: 0 coincidencias relevantes (solo environment/production helpers)
```

**No hay ningún modelo, ruta, servicio o import de wallet/marketplace/product/order/token-web3 en el código actual.**

---

## Colecciones ACTuales en producción (27 modelos)

```
users, posts, stories, messages, conversations, drafts,
scripts, scriptprojects, imagegenerations, videogenerations,
notifications, savedcollections, feedsignals, seenposts,
hiddenposts, blocks, mutes, reports, circles, orbits,
capsules, channels, channelmessages, livesupport (live rooms),
mcpservicecredentials, supporttransactions, refreshtokens
```

+ GridFS: `kronosUploads.files`, `kronosUploads.chunks`

---

## Recomendaciones de limpieza

### Eliminar sin riesgo (base `test` en Atlas):

1. Colecciones wallet/marketplace/product/order/token residuales
2. Cualquier colección que no aparezca en la lista de 27 modelos activos
3. Documentos E2E antiguos (los tests se limpian entre corridas)

### NO eliminar:

1. `kronos-space-com` — PRODUCCIÓN
2. `test` (la base en sí) — necesaria para E2E contra Atlas
3. Colecciones listadas arriba — datos activos

### Requiere verificación adicional:

1. `kronos_social_ai` — confirmar si es un alias de producción o un nombre antiguo
2. Cualquier otra DB en Atlas no listada aquí — inspeccionar con `show dbs`

---

## Acción requerida

Para ejecutar la limpieza física se necesita:

1. Acceso de lectura a Atlas (`db.getCollectionNames()` sobre `test`)
2. Identificar exactamente qué colecciones residen en `test`
3. Confirmar con Donovan cuáles eliminar
4. Ejecutar `db.<collection>.drop()` solo con autorización explícita
