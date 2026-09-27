# Revisión técnica final — antes de la fase operacional

Punto de partida: `2e1570f`. Estado entregado: `77bc507`. CI 8/8.
Toda la evidencia de esta revisión procede del job `mongo-real`
(MongoDB 7 real) o de la suite local. **Producción no se tocó.**

---

## 1. Estado

**CONDITIONALLY READY.**

Los cuatro defectos que bloqueaban el camino de respaldo, restauración y
rollback están cerrados y verificados contra MongoDB real. El código ya no es
lo que impide empezar. Lo que falta no está en el repositorio:

| Requisito de READY | Estado | Evidencia |
| --- | --- | --- |
| Guardas fail-closed | CUMPLE | 9/9 casos, `db.test.js`, `drill-production-guard.test.js` |
| Migraciones auditadas | CUMPLE | Las 6, con `up`/`down`/índices/reversibilidad |
| Respaldo apropiado al volumen | CUMPLE | Streaming; el pico ya no depende del tamaño total |
| Restauración verificable | CUMPLE | 3 restauraciones IDÉNTICO sobre Mongo real |
| Rollback reproducible | CUMPLE | Ensayo superado, ahora con datos vencidos |
| CI verde | CUMPLE | 8/8 en `77bc507` |
| Producción intacta | CUMPLE | Ninguna orden contra producción |

**Las tres condiciones que faltan, todas fuera del código:**

1. Nadie ha comprobado qué valen `NODE_ENV` y `MONGODB_AUTO_INDEX` en el
   servidor de producción. El sandbox no alcanza los dominios KRONOS.
2. No existe un respaldo de producción restaurado en una copia de ensayo.
3. No se ha contado cuántos documentos vencidos hay en producción, que es
   exactamente lo que la migración 004 borrará al crear los TTL.

Hasta que esas tres estén resueltas, no se empieza.

---

## 2. Riesgos críticos abiertos

**C-1 · Los índices TTL borran datos en cuanto se crean, y no hay cuenta previa.**
`refreshtokens.expiresAt` y `sessionrevocations.expiresAt` usan
`expireAfterSeconds: 0`. Al crear el índice, el monitor de MongoDB elimina
todo lo caducado. `down()` retira el índice y detiene el borrado futuro, pero
**no devuelve lo ya borrado**: solo lo recupera un respaldo *anterior* al
índice. Son tokens caducados, inservibles por definición, pero el borrado es
real y debe decidirse a propósito.
*Mitigado en el código* (ensayo que lo demuestra, aviso en la cabecera de 004,
clasificación aparte en el ensayo de rollback). *Abierto en la operación*:
falta ejecutar los dos `countDocuments` sobre producción antes de migrar.

**C-2 · El entorno de producción no es observable desde aquí.**
Si `NODE_ENV` no fuera exactamente `production`, las guardas fail-closed
abortan el arranque —eso es lo correcto— pero se descubriría durante la
ventana de migración. Hay que leerlo antes.

---

## 3. Riesgos altos

**A-1 · Los 14 índices únicos fallan con E11000 si hay duplicados.**
La migración 004 crea 61 índices, 14 de ellos únicos. Sobre datos reales sin
depurar, un duplicado aborta la creación. En el ensayo no hay duplicados
porque la siembra no los genera. Hay que buscarlos antes con un `$group` por
cada clave única.

**A-2 · Volumen de producción desconocido.**
Los 730 ms de las migraciones 004→006 se midieron sobre 135 800 documentos
sembrados. No se sabe si producción tiene eso, diez veces más o cien. El
respaldo ya no escala con el tamaño total, pero la construcción de índices sí:
la fase de drenaje toma un lock **S** que bloquea escrituras, y su duración
crece con las escrituras concurrentes.

**A-3 · Sin `syncIndexes` en ningún punto.**
Los índices declarados en los modelos y los que existan de verdad en
producción pueden haber divergido. La 004 solo crea lo que falta según su
plan; no reconcilia lo que sobra y nadie declaró.

---

## 4. Riesgos medios

**M-1 · Arrays sin cota.** Nueve campos array y `Post.likes` pueden crecer sin
límite hacia los 16 MB por documento. No es un problema de la migración, sí
del modelo a medio plazo.

**M-2 · La siembra cubre 23 de 27 colecciones.** Cuatro colecciones nunca se
ejercitan en el ensayo, así que sobre ellas la evidencia es de inspección, no
de ejecución.

**M-3 · Sin ESLint para `server/` ni `scripts/`.** El lint que pasa cubre el
cliente. En el servidor, un identificador inexistente solo lo descubre una
prueba que cargue de verdad el módulo —cosa que ya mordió dos veces en esta
revisión.

**M-4 · `runner.down()` no borra la entrada del diario**, la marca
`direction: "down"`. Es coherente pero no evidente; quien lea el diario sin
saberlo contará mal las migraciones aplicadas.

---

## 5. Archivos modificados en esta revisión

| Archivo | Qué cambió y por qué |
| --- | --- |
| `scripts/backup-verify.js` (+625) | Volcado y verificación en streaming (NDJSON `ejson-canonical-v2`); tres niveles de verificación; `--restore` reescrito con recreación y comparación de índices; mongodump restaurado con `mongorestore`; URI fuera de `ps`; guarda de origen intacto |
| `server/src/migrations/runner.js` (+26) | `assertBackupAvailable` exige `RESTORE_VERIFIED`; antes aceptaba cualquier objeto |
| `scripts/db/migrate.js` (+24) | Exige `RESTORE_VERIFIED`; rechaza `verifiedAt` heredado; `main()` importable |
| `scripts/db/ttl-drill.js` (+281, nuevo) | Ensayo de TTL con datos vencidos reales |
| `scripts/db/rollback-drill.js` (+151) | `--seed-expired`, espera al monitor TTL antes de fotografiar, clasifica la pérdida por TTL, `--allow-ttl-deletions` |
| `server/src/migrations/004-indexes.js` (+11) | La cabecera afirmaba que crear un índice nunca pierde documentos: falso para TTL |
| `.github/workflows/kronos-e2e.yml` (+61) | Instala mongodb-database-tools; añade ensayo de TTL y cadena nativa; restauración probada antes del rollback |
| `server/test/backup-verification.test.js` (+473, nuevo) | 25 pruebas |
| `server/test/backup.contract.test.js` (+7) | Comprueba los estados separados |
| `docs/db/PLAN-MIGRACION-OPTIMIZACION.md` (+68) | §7 con la evidencia real |
| `docs/db/CHECKLIST-PRE-PRODUCCION.md` | Apartados 4 y 9: el motivo del bloqueo ya no es el código |
| `docs/CONTRATO-OPERACION-KRONOS.md` | §4 al día |

---

## 6. Nuevos tests

**25 en `server/test/backup-verification.test.js`.** Suite: **358 pruebas,
281 pass, 0 fail, 77 skip** (servidor) · **243/243** (cliente).

Cada corrección se comprobó reintroduciendo el defecto y exigiendo que la
prueba fallara. Una de ellas —la del remapeo de espacios de nombres— **no
detectaba su regresión** en el primer intento: comprobaba la función pura sin
mirar el punto de llamada. Se corrigió hasta que falló por la razón correcta.

| Riesgo | Cubre | Falla si se revierte |
| --- | --- | --- |
| R-06 | Digest por documento, streaming, ida y vuelta BSON, compatibilidad v1, URI fuera de `ps`, origen intacto | Sí |
| R-07 | Tres niveles, el rango nunca baja, rechazo de `verifiedAt`, digest en ambos modos, guarda del runner (3) | Sí |
| R-08 | Existencia y forma de los dos ensayos, cabecera de 004 | Sí |
| R-09 | Recreación de índices, comparación, URI sin base en el punto de llamada | Sí |

---

## 7. CI final

**8/8 SUCCESS** en `77bc507`.

Evidencia del job `mongo-real` (MongoDB 7 real):

| Restauración | Modo | Colecciones | Documentos | Índices | Resultado |
| --- | --- | --- | --- | --- | --- |
| `kronos_ensayo` → `kronos_migration_test` | json (NDJSON) | 27 | 135 800 → 135 800 | 0 | IDÉNTICO |
| `kronos_ensayo` → `kronos_dump_restore` | mongodump | 32 | 135 836 → 135 836 | 61 | IDÉNTICO |
| `kronos_ensayo_rollback` → `kronos_rollback_restore` | json (NDJSON) | 23 | 27 160 → 27 160 | 0 | IDÉNTICO |

Las tres selladas `RESTORE_VERIFIED`. Los respaldos con 0 índices se tomaron
antes de la migración, cuando aún no existía ninguno fuera de `_id_`.

- Ensayo de TTL: **superado** — «el borrado se observa, el rollback no lo
  revierte y el respaldo sí».
- Ensayo de rollback con datos vencidos: **superado** — 61 índices creados,
  sin pérdida ajena al TTL, reaplicación reproducible.

La cadena real destapó cuatro defectos que ninguna prueba local podía ver,
porque sin `mongodump` instalado el script nunca tomaba ese camino.

---

## 8. ¿Es seguro el respaldo actual para producción?

**El código de respaldo ya es seguro para producción. El respaldo de
producción no existe todavía.**

Son dos afirmaciones distintas y ninguna sustituye a la otra.

Lo que era inseguro y ya no lo es:

- Cargaba la colección entera en memoria con `find({}).toArray()`. Medido:
  49,8 MB de binario GridFS ocupaban 200,1 MB de heap, y el tope de cadena de
  V8 (512 MB) rompía el respaldo a partir de unos 384 MB de binario en una
  sola colección. **Habría fallado contra producción sin aviso previo.** Ahora
  el pico depende del documento mayor —un chunk de 255 KB—, no del total.
- `--check` sellaba una marca que la migración aceptaba como prueba de
  restauración sin serlo.
- `--restore` no recreaba un solo índice: la copia quedaba sin las 14
  restricciones únicas ni los TTL.
- `--restore` rechazaba los respaldos de mongodump, que son justo los que hay
  que usar por volumen.
- La URI, credenciales incluidas, quedaba visible en `ps` durante todo el
  volcado.

Lo que sigue sin hacerse: **nadie ha tomado un respaldo de producción ni lo ha
restaurado en una copia de ensayo.** Mientras eso no exista, el apartado 4 del
checklist no es PASS, por muy correcta que sea la herramienta.

---

## 9. Procedimiento recomendado

**BACKUP → RESTORE TEST → MIGRATION → VERIFY → ROLLBACK**

**Paso 0 — antes de nada** (solo lectura, sobre producción):

```bash
# 1. El entorno es el que se cree que es
echo "$NODE_ENV" ; echo "$MONGODB_AUTO_INDEX"

# 2. Lo que la 004 va a borrar al crear los TTL
db.refreshtokens.countDocuments({ expiresAt: { $lt: new Date() } })
db.sessionrevocations.countDocuments({ expiresAt: { $lt: new Date() } })

# 3. Duplicados que romperían los 14 índices únicos (uno por clave)
db.<col>.aggregate([{ $group: { _id: "$<clave>", n: { $sum: 1 } } },
                    { $match: { n: { $gt: 1 } } }, { $limit: 5 }])
```

Si el paso 2 devuelve una cifra que nadie está dispuesto a perder, o el paso 3
devuelve algo: **parar y decidir antes de continuar.**

**BACKUP** — con `mongodump`, anterior a cualquier índice:

```bash
node scripts/backup-verify.js --out backups/prod-<sello>
```

**RESTORE TEST** — obligatorio, en una base aislada:

```bash
node scripts/backup-verify.js --restore backups/prod-<sello> \
  --target-uri '<uri de la copia de ensayo>' --drop-target-collections
```

Debe terminar en `RESTORE_VERIFIED` con recuentos, contenido e índices
IDÉNTICOS. Si no, **el respaldo no vale y no se migra**. La herramienta
comprueba además que la restauración no alteró el origen.

**Ensayo completo sobre la copia** — antes de tocar producción:

```bash
node scripts/db/migrate.js up --backup backups/prod-<sello>   # sobre la copia
node scripts/db/rollback-drill.js --backup backups/prod-<sello> --seed-expired 0
node scripts/db/ttl-drill.js
```

**MIGRATION** — ventana de escrituras bajas, por el lock **S** de la fase de
drenaje:

```bash
node scripts/db/migrate.js up --dry-run
node scripts/db/migrate.js up --backup backups/prod-<sello>
```

**VERIFY**:

```bash
node scripts/db/migrate.js status
node scripts/db/validate-data.js --counts
node scripts/db/index-audit.js --verbose
node scripts/db/media-orphans.js
node scripts/db/bench-queries.js
```

**ROLLBACK** — si algo va mal:

```bash
node scripts/db/migrate.js down --to <versión> --backup backups/prod-<sello>
```

Con una advertencia que no puede olvidarse: **`down()` no devuelve los
documentos que el TTL borró.** Para eso, y solo para eso, hace falta restaurar
el respaldo anterior al índice.

---

## 10. Confirmación

**PRODUCCIÓN MODIFICADA: NO**

Ninguna orden de esta revisión se ejecutó contra producción. No hubo respaldo,
restauración, migración, creación o borrado de índices, escritura, cambio de
variables, despliegue ni reinicio de producción. Todo lo medido salió del job
`mongo-real` de CI, con su propio MongoDB 7 efímero, o de la suite local.
