# KRONOS — Checklist pre-producción de la migración controlada

Estado a `3d0fab4` + el commit de esta preparación. **Producción no ha sido
modificada.** Cada punto lleva el comando exacto que lo verifica, el criterio
de aprobación y la evidencia disponible hoy. Un punto crítico sin evidencia
obtenible no se marca PASS: se marca BLOCKED.

Regla de parada: **si cualquier punto crítico no está en PASS, no se ejecuta
la migración de producción.**

Leyenda: **C** = crítico · **PASS** verificado con evidencia · **BLOCKED** no
verificable desde este entorno · **PEND** ejecutable, aún no ejecutado porque
exige acceso a producción.

---

## 1. Commit desplegable correcto — C — **BLOCKED**

```bash
git rev-parse HEAD
gh pr view 46 --json state,mergeable,headRefOid
```

Criterio: el commit que corre en producción coincide con el que se auditó.

Lo que hay: el commit auditado es conocido y CI está verde sobre él. Lo que
falta: **no hay forma de leer qué commit sirve hoy `api.kronos-space.com`.**
El sandbox no tiene salida hacia los dominios KRONOS y `/api/health` no
publica versión ni SHA. Sin eso, «el commit desplegado es el correcto» sería
una suposición.

Para desbloquear: añadir el SHA a `/api/health`, o leerlo en el panel del
hosting.

## 2. CI en verde sobre ese commit — C — **PASS**

```bash
gh pr checks 46
```

Evidencia: 6/6 SUCCESS sobre `3d0fab4`, incluido el job `mongo-real`
(`mongo:7`, check run 108517352586) con E2E 77 pass / 0 fail / 0 skip. Tras
esta preparación: servidor 328 tests (251 pass, 0 fail, 77 skip), cliente
243/243, lint 0, build ✓.

## 3. Respaldo de producción confirmado — C — **BLOCKED**

> **El motor de respaldo JSON no sirve para el volumen de producción.** Medido
> en este repositorio (Node v22.22.3, límite de heap 1954 MB): EJSON canónico
> expande el binario 1,334x, el pico de heap es 4,0x el tamaño binario de la
> colección, y `EJSON.stringify` revienta con `Invalid string length` al pasar
> del tope de cadena de V8 (512 MB), es decir **a partir de ~384 MB de GridFS
> en una sola colección**. `contentChecksum` mantiene además una tercera copia
> del contenido serializado. Usar `mongodump`, que el script ya intenta primero.

```bash
MONGODB_URI='<uri de producción>' node scripts/backup-verify.js \
  --out backups/prod-$(date -u +%Y%m%dT%H%M%SZ)
```

Criterio: salida 0 y `manifest.json` con una entrada por colección.

No ejecutado: este encargo prohíbe expresamente el respaldo de producción.
El procedimiento está auditado y es correcto; falta correrlo.

## 4. El respaldo es verificable y restaurable — C — **BLOCKED**

> **El defecto de la herramienta está cerrado; sigue faltando el respaldo de
> producción.** `verifiedAt` ya no existe: hay tres niveles, y solo `--restore`
> contra una base aislada sella `RESTORE_VERIFIED`. Lo exigen tanto
> `scripts/db/migrate.js` como `server/src/migrations/runner.js`. El modo
> mongodump ya se restaura con `mongorestore` en vez de rechazarse, y los
> índices se recrean y se comparan en los dos modos. Verificado con MongoDB
> real en el job `mongo-real` de `c7754f5`: 135 836 documentos y 61 índices
> restaurados IDÉNTICOS en `kronos_dump_restore`, 135 800 en
> `kronos_migration_test` y 27 160 en `kronos_rollback_restore`.
>
> Sigue BLOCKED por una razón distinta y que no depende del código: **nadie ha
> tomado todavía un respaldo de producción ni lo ha restaurado en una copia de
> ensayo**. Hasta que exista esa prueba sobre datos reales, este punto no es
> PASS.

```bash
node scripts/backup-verify.js --check backups/prod-<sello>
node scripts/backup-verify.js --restore backups/prod-<sello> \
  --target-uri '<uri de la base de ensayo>' --drop-target-collections
```

Criterio: `--check` añade `verifiedAt`; `--restore` termina con recuentos y
`contentSha256` idénticos por colección.

**`--check` por sí solo no vale.** Comprueba checksums de ficheros, no que
los datos vuelvan a entrar en Mongo. La prueba es `--restore`.

Ensayo ya demostrado con TEST DATA: 135.800 → 135.800 documentos, diferencia
0, 27 colecciones, IDÉNTICO.

## 5. Copia de ensayo restaurada desde el respaldo real — C — **PEND**

Mismo comando que el punto 4. La copia de ensayo debe venir **del respaldo de
producción**, no de `seed-staging.js`: sembrar genera 23 de 27 colecciones y
no reproduce ni la distribución ni el volumen reales.

## 6. Conteos antes y después coinciden — C — **PEND**

```bash
node scripts/db/inventory.js --json > /tmp/antes.json
# ... migración ...
node scripts/db/inventory.js --json > /tmp/despues.json
```

Criterio: ninguna colección pierde documentos. Las migraciones 001–005 no
borran; 006 solo con `--allow-data-deletion`.

## 7. Integridad PASS — C — **PEND**

```bash
node scripts/db/validate-data.js
```

Criterio: 0 fallos críticos. En la cadena de ensayo: 20/20 reglas PASS.

## 8. Índices esperados PASS — C — **PEND**

```bash
node scripts/db/index-audit.js
```

Criterio: los 61 índices declarados presentes y sin conflicto de opciones.
En ensayo: COLLSCAN en consultas críticas 24/25 → 0/25.

## 9. Rollback probado sobre la copia de ensayo — C — **BLOCKED**

> **El ensayo ya cubre el borrado por TTL; falta hacerlo sobre datos reales.**
> Crear un índice TTL borra los documentos ya vencidos y `down()` solo retira
> el índice: no los devuelve. El ensayo no lo veía porque la siembra fijaba
> `expiresAt` en el futuro. Ahora `scripts/db/ttl-drill.js` siembra vencidos a
> propósito, acelera el monitor, observa el borrado, comprueba que `dropIndex`
> recupera cero y que el respaldo anterior al índice recupera todo;
> `rollback-drill.js` acepta `--seed-expired`, espera al monitor antes de
> fotografiar el estado y exige `--allow-ttl-deletions` para tolerar la
> pérdida. Ambos superados con MongoDB real en `c7754f5`.
>
> Sigue BLOCKED porque el ensayo corre sobre datos sembrados, no sobre una
> copia de producción, y **nadie ha contado aún cuántos documentos vencidos
> hay en producción**, que es lo que se perdería al aplicar 004.

```bash
node scripts/db/rollback-drill.js
```

Criterio: `down()` deja la base como estaba **y se comprueba**, no basta con
que el comando termine. En ensayo: 61 índices restaurados.

Limitación conocida: `runner.down()` no borra el registro del diario, lo
marca `direction:"down"`.

## 10. `NODE_ENV=production` fijado explícitamente — C — **BLOCKED**

```bash
# en el arranque del servidor:
#   entorno=<valor> autoIndex=<valor>
```

No verificable: no hay manifiesto de despliegue en el repo (13 patrones
buscados, cero resultados), el sandbox no alcanza los dominios y
`/api/health` no publica el entorno.

**Atenuante desde `3d0fab4`:** ya no hace falta que el valor sea exacto para
estar protegido. La clasificación es fail-closed — solo `development` y
`test` se consideran sin datos reales—, así que un `NODE_ENV` ausente o
escrito de otra forma se trata como producción en los cuatro guardias:
índices automáticos, `CLIENT_URL` al arrancar, copia durable de subidas y
confirmación de migraciones. Fijarlo sigue siendo lo correcto; ya no es lo
único que separa producción de un accidente.

## 11. `MONGODB_AUTO_INDEX=false` como guardrail — C — **BLOCKED**

No verificable por la misma razón que el punto 10. Atenuante: con la
clasificación fail-closed, `resolveAutoIndex()` ya devuelve `false` en
producción **aunque la variable no esté definida**; `MONGODB_AUTO_INDEX`
manda en ambos sentidos si se define. Cubierto por `server/test/db.test.js`
(6 tests, 39 casos).

## 12. No existen mocks en el camino de producción — **PASS**

```bash
grep -rn "mongodb-memory-server\|sinon\|proxyquire" server/src scripts | grep -v node_modules
```

Evidencia: sin resultados en código de producción. Las pruebas con Mongo real
usan el servicio `mongo:7` de CI. Se rechazaron FerretDB y cualquier sustituto
en memoria.

## 13. No hay migraciones pendientes sin auditar — C — **PEND**

```bash
node scripts/db/migrate.js status
```

Criterio: las pendientes son exactamente las 6 auditadas (001–006), con
checksum coincidente.

## 14. Criterios de ABORT definidos — **PASS**

Definidos y con parada automática en el código: respaldo sin `verifiedAt`
(`assertBackupAvailable`), checksum de migración alterado
(`MIGRATION_CHECKSUM_MISMATCH`), candado tomado por otra ejecución,
confirmación ausente o de otra base (`MIGRATION_CONFIRMATION_REQUIRED`),
restauración con recuentos o `contentSha256` distintos, borrado sin
`--allow-data-deletion`.

## 15. Procedimiento de recuperación definido — **PASS**

Documentado en §7 de `PLAN-MIGRACION-OPTIMIZACION.md` y en el informe de esta
preparación: `down()` por versión, y si `down()` no bastara, restauración
completa desde el respaldo verificado sobre una base nueva, nunca con
`dropDatabase` sobre producción.

---

## Recuento

| Estado | Puntos |
|---|---|
| PASS | 2, 12, 14, 15 |
| BLOCKED | 1, 3, 4, 9, 10, 11 |
| PEND (requiere acceso a producción) | 5, 6, 7, 8, 13 |

**Seis puntos críticos en BLOCKED ⇒ estado global BLOCKED.**

Dos causas distintas:

- **Visibilidad del entorno desplegado** (1, 10, 11): sin acceso al panel del
  hosting, sin salida de red hacia los dominios y sin `actions: write`.
- **Defectos técnicos del camino de respaldo** (3, 4, 9): el motor JSON no
  aguanta el volumen, `verifiedAt` no demuestra restauración y el ensayo de
  rollback no cubre el borrado por TTL. Estos tres **no** se desbloquean con
  acceso: exigen cambios de código y un ensayo nuevo.
