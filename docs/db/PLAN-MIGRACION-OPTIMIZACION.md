# Migración y optimización de la base de datos

Manual de operación de la base de datos de Kronos: qué herramientas existen,
en qué orden se usan, qué hay que comprobar antes de tocar datos y cómo se
vuelve atrás. Acompaña al esquema generado (`ESQUEMA.md`) y al inventario de
acceso a datos (`INVENTARIO-CODIGO.md`).

Regla que ordena todo lo demás: **ningún punto se da por bueno por
inspección visual**. Cada afirmación de este documento apunta a un comando
reproducible, una prueba o un informe.

## 1. Piezas

| Pieza | Ruta | Qué resuelve |
|---|---|---|
| Registro de colecciones | `server/src/db/registry.js` | Única lista de las 27 colecciones con dominio, propósito, sensibilidad y retención. Detecta modelos sin declarar. |
| Plan de índices | `server/src/db/indexPlan.js` | Índices deseados a partir de los esquemas, redundancias por prefijo y diferencias contra la base real. |
| Consultas críticas | `server/src/db/criticalQueries.js` | Las 25 consultas reales del producto y qué índice las sostiene (regla Igualdad → Orden → Rango). |
| Reglas de integridad | `server/src/db/integrity.js` | 20 comprobaciones declarativas (obligatorios, duplicados, referencias huérfanas). |
| Informe de esquema | `server/src/db/schemaReport.js` | Descripción campo a campo y riesgos estructurales sin tocar la base. |
| Ejecutor de migraciones | `server/src/migrations/runner.js` | Bitácora, bloqueo, checksums, autorizaciones y `up`/`down`/`status`. |
| Migraciones | `server/src/migrations/001…006` | Línea base, usuarios, publicaciones, índices, notificaciones y limpieza. |

## 2. Herramientas de línea de comandos

Todas leen `server/.env`, exigen `MONGODB_URI` real (sin modo simulado),
nunca imprimen credenciales y devuelven códigos estables:
`0` correcto · `1` fallo · `2` uso incorrecto · `3` falta configuración.

| Comando | Fase | Necesita base | Qué hace |
|---|---|---|---|
| `npm run db:code-inventory` | 1 | no | Inventario estático: 104 archivos, 193 endpoints y el mapa colección → endpoints. |
| `npm run db:schema` | 3 | no | Regenera `ESQUEMA.md` y marca riesgos (arrays sin cota, campos sensibles). |
| `npm run db:inventory` | 1 | sí | Documentos, tamaño, índices reales, índices que faltan o sobran, campos desconocidos. |
| `npm run backup:verify -- --out DIR` | 2 | sí | Copia verificable con hash por colección. |
| `npm run backup:verify -- --check DIR` | 2 | no | Revalida una copia y sella `verifiedAt` en el manifiesto. |
| `npm run backup:verify -- --restore DIR --target-uri URI` | 2 | sí | Restaura en una base **distinta** y deja `restore-proof.json`. |
| `npm run db:migrate -- status` | 4 | sí | Qué migraciones están aplicadas y si alguna cambió tras aplicarse. |
| `npm run db:migrate -- up --dry-run` | 5 | sí | Simula sin escribir: dice exactamente qué tocaría. |
| `npm run db:migrate -- up --backup DIR --confirm BASE` | 5 | sí | Aplica con respaldo verificado y confirmación del nombre de la base. |
| `npm run db:migrate -- down --to N` | 5 | sí | Revierte hasta la versión indicada. |
| `npm run db:validate` | 6 | sí | Ejecuta las 20 reglas de integridad. Falla solo con incidencias críticas. |
| `npm run db:index-audit` | 6 | sí | `explain("executionStats")` real de las 25 consultas críticas. Falla si hay COLLSCAN crítico. |
| `npm run db:media-orphans` | 10 | sí | Cruce base ↔ disco ↔ GridFS: referencias rotas y archivos huérfanos. |

## 3. Orden de ejecución

El orden no es una preferencia: cada paso produce la evidencia que el
siguiente necesita.

```text
1. Inventario        npm run db:code-inventory && npm run db:inventory
2. Respaldo          npm run backup:verify -- --out backups/AAAA-MM-DD
                     npm run backup:verify -- --check backups/AAAA-MM-DD
                     npm run backup:verify -- --restore backups/AAAA-MM-DD --target-uri URI_ENSAYO
3. Esquema           npm run db:schema
4. Diseño            npm run db:migrate -- validate && npm run db:migrate -- status
5. Migración ensayo  npm run db:migrate -- up --dry-run
                     npm run db:migrate -- up --backup backups/AAAA-MM-DD --confirm BASE_ENSAYO
6. Validación        npm run db:validate && npm run db:index-audit
7. Producción        repetir 2 → 5 → 6 contra producción, en ventana acordada
```

Nada del paso 5 se ejecuta contra producción sin haber completado el 5 y el 6
en una copia de ensayo restaurada desde el respaldo del paso 2.

## 4. Qué protege cada escritura

| Riesgo | Protección | Dónde |
|---|---|---|
| Migrar sin respaldo | `assertBackupAvailable` exige un `manifest.json` con `verifiedAt` | `runner.js` |
| Escribir en producción por error | `--confirm <nombre de la base>` obligatorio en todo entorno que no sea `development` ni `test` | `runner.js` |
| Migración editada después de aplicarse | `MIGRATION_CHECKSUM_MISMATCH` | `runner.js` |
| Dos ejecuciones simultáneas | Bloqueo en `kronos_migration_lock` | `runner.js` |
| Relleno que pise datos existentes | Solo actúa sobre `{$exists: false}` y guarda los ids en `kronos_migration_undo` | `helpers.js` |
| Borrado accidental | `deleteWhenAuthorized` exige `--allow-data-deletion` **y** respaldo verificado | `helpers.js` |
| Restauración sobre la base equivocada | `--target-uri` obligatorio; aborta si coincide con el origen salvo `--force-same-target` | `backup-verify.js` |
| Restauración incompleta | Compara recuentos **y** hash de contenido; sin coincidencia, `BACKUP_FAIL` | `backup-verify.js` |

Acciones que el sistema **no** ejecuta por su cuenta y deja como informe para
decisión humana: usernames o correos sin normalizar, cuentas sin credenciales,
`audience.type` fuera de catálogo, conflictos de opciones de índice,
referencias rotas de propietario y colecciones sin declarar.

### Cómo decide el ejecutor si está en producción

La guarda de `--confirm` preguntaba `environment !== "production"` contra la
cadena exacta, y `up()`/`down()` rellenaban el valor ausente con
`process.env.NODE_ENV || "development"`. Con esa combinación, nueve de cada
diez valores de `NODE_ENV` dejaban la guarda inactiva —incluido el caso más
probable, un operador o un runner sin `NODE_ENV` definido, al que el fallback
bautizaba «development»—, de modo que `migrate.js up` podía escribir en la
base real sin pedir nada. `scripts/db/migrate.js` nunca pasa `environment`,
así que dependía por completo de ese valor por defecto.

Ahora la pregunta está invertida y vive en un solo sitio,
`server/src/config/environment.js`: solo `development` y `test` eximen de
confirmar; cualquier otro valor, incluida su ausencia, exige
`--confirm <nombre de la base>`. Es el mismo criterio que ya usaba
`config/db.js` para los índices automáticos, y ahora lo comparten también el
arranque del servidor y la copia durable de subidas. `server/test/environment.contract.test.js`
impide que una guarda nueva vuelva a comparar contra la cadena exacta.

### Quién crea los índices

Desde la fase 6 los índices son propiedad de la migración 004. Dos caminos
podían saltarse esa regla en silencio, y ambos están ahora cerrados por una
prueba, no por un comentario:

| Riesgo | Protección | Dónde |
|---|---|---|
| Una herramienta crea índices mientras los cuenta | Toda conexión bajo `scripts/` pasa `autoIndex: false`; una prueba recorre el código y falla nombrando el archivo infractor | `db-tools.contract.test.js` |
| El servidor indexa producción al arrancar | Solo `development` y `test` construyen índices; cualquier otro valor de `NODE_ENV`, incluido vacío o sin definir, se trata como producción | `config/db.js`, `db.test.js` |

El primero no es hipotético: ocurrió. `listCollections()` resuelve los 27
modelos, y Mongoose construye sus 61 índices nada más conectar salvo que se le
diga lo contrario. Con `autoIndex` activo el inventario informó «45 índices» y
el `explain()` del ANTES dio «0 COLLSCAN» sobre una base recién sembrada: la
herramienta medía un estado que ella misma acababa de crear, y la medición
parecía perfecta justo por estar mal.

El segundo es la misma clase de fallo un nivel más abajo, y falló dos veces
seguidas por la misma razón: la pregunta estaba planteada al revés. Preguntar
«¿es esto producción?» obliga a *demostrar* el peligro, y lo que no se puede
demostrar se aprueba; así pasaron primero `Production` y `prod`, y después
`NODE_ENV` vacío, sin definir, `live` o `staging`. La pregunta correcta es
«¿consta que este entorno no tiene datos reales?»: solo `development` y `test`
la responden que sí. Equivocarse ahora cuesta una consulta lenta en
desarrollo; antes costaba una construcción de 61 índices en producción.

`MONGODB_AUTO_INDEX` sigue mandando sobre ambos, en los dos sentidos. Al
conectar, el servidor imprime `entorno=<valor> autoIndex=<valor>`: esa línea
es la comprobación previa del operador antes de cualquier migración.

## 5. Resultados medidos

### Índices

| Métrica | Antes | Después |
|---|---:|---:|
| Índices declarados | 73 | 61 |
| Índices redundantes (cubiertos por prefijo) | 19 | 0 |
| Consultas críticas sin índice de apoyo | 1 | 0 |

`feed.vertical` filtraba `media.type` por igualdad, `media.orientation` por
negación y ordenaba por `createdAt`. El índice
`{media.type, media.orientation, createdAt}` dejaba el orden en la posición
equivocada y obligaba a ordenar en memoria; ahora es
`{media.type, createdAt, media.orientation}` (Igualdad → Orden → Rango).

La creación de índices deja de hacerse al arrancar el proceso:
`MONGODB_AUTO_INDEX=false` en producción y la migración 004 es la dueña.
Fuera de producción sigue activa para que las bases temporales de las
pruebas E2E funcionen.

### Consultas del feed

| Punto | Antes | Después |
|---|---|---|
| Contexto del espectador | `getFeedPreferences` + `withAudienceFilter` leían el usuario dos veces | `loadViewerScope` lo lee una vez y lo comparte |
| Reposts y remixes | `Post.findById` + audiencia + bloqueo **por publicación** | 3 consultas por página, sean 1 o 50 publicaciones |
| Publicaciones de una colección | `canViewPost` por publicación (hasta ~1500 consultas) | 3 consultas de contexto y filtrado en memoria |

La prueba `server/test/feed-nplus1.e2e.test.js` mide operaciones reales con
el canal de depuración de Mongoose y exige que una página de 12
publicaciones no cueste **ni una consulta más** que una de 3.

### Cliente

| Métrica | Antes | Después | Cambio |
|---|---:|---:|---:|
| Primera carga (bytes) | 1 332 799 | 985 310 | −26,1 % |
| Primera carga (gzip) | 376 340 | 286 236 | −23,9 % |
| Entrada JavaScript | 1 108 191 | 404 309 | −63,5 % |
| Trozos JS | 6 | 70 | división por ruta |

Medido con `npm run build --workspace=client` sobre el mismo árbol, antes y
después. Las 36 pantallas de ruta se cargan bajo demanda; el límite de
suspensión vive dentro del shell (`AppLayout`), así que la navegación no
desaparece mientras llega el trozo de la ruta.

Un agrupamiento inicial más agresivo (un trozo `vendor` cajón de sastre)
arrastraba `three` y `zod` a la primera carga: 980 kB de motor gráfico
precargados en el login. Se midió, se descartó y el archivo de configuración
explica por qué.

### Pruebas

| Suite | Antes | Después |
|---|---|---|
| Servidor | 271 pruebas · 197 pasan · 74 omitidas | 294 · 217 · 77 |
| Cliente | 46 archivos · 243 pruebas | 46 · 243 |
| Lint cliente | limpio | limpio |

Las pruebas nuevas que **no** necesitan MongoDB: contrato del plan de base de
datos (12), contrato de las herramientas (8), campos sensibles (3). Las que
necesitan MongoDB real se omiten en local y se ejecutan en el trabajo
`kronos-e2e` de GitHub Actions con `mongo:7`.

### Cadena completa contra MongoDB real (CI)

El trabajo `E2E contra MongoDB real (mongo:7)` ejecuta en cada *pull request*
la secuencia entera contra un MongoDB 7 efímero y falla el PR si algo se
rompe. Resultado de la ejecución sobre el commit `ea86564`:

| Paso | Resultado |
|---|---|
| Suites E2E (incluye el presupuesto de consultas del feed) | 77 pruebas · 77 pasan · 0 fallan · 0 omitidas |
| Inventario, esquema e inventario de la base | correcto |
| Respaldo, verificación y restauración en otra base | correcto |
| Migración: simulación, aplicación, idempotencia | correcto |
| Integridad, `explain()` y multimedia | correcto |
| Vuelta atrás hasta la versión 0 y reaplicación | correcto |

Que las 77 pruebas E2E pasen con MongoDB real es lo que convierte el
presupuesto de consultas del feed en un hecho medido: la prueba compara las
operaciones de una página de 3 publicaciones con las de una de 12 y exige
diferencia cero.

Los informes de cada paso quedan como artefacto del run
(`kronos-db-reports-<id>`): inventario, auditoría de esquema, integridad,
auditoría de índices, multimedia, manifiesto del respaldo y prueba de
restauración.

## 6. Evidencia sobre base de ensayo poblada

La cadena de §5 corre sobre la base del E2E: pocos documentos y los índices
ya creados. Sirve para probar que los comandos funcionan, no para medir. Por
eso el job `mongo-real` levanta además una base de **ensayo** independiente,
`kronos_ensayo`, con volumen representativo, y ejecuta encima el ciclo
completo. Todo lo de esta sección son cifras de esa corrida, no estimaciones.

### Base de ensayo

`scripts/db/seed-staging.js` escribe con el driver, no con los modelos: así
Mongoose no crea índices por su cuenta y la migración 004 tiene trabajo real.
Guardas: nombre repetido en `--confirm`, prefijo de ensayo obligatorio,
rechazo de nombres que parezcan de producción y `--reset` limitado a bases de
ensayo.

| concepto | cifra |
|---|---|
| documentos sembrados | 135 800 en 23 colecciones |
| documentos antiguos (esperan migración) | 100 usuarios · 1 250 publicaciones · 2 000 notificaciones |
| índices al empezar | 23 (`_id_`), 61 por crear, 0 redundantes |
| archivos multimedia reales en disco | 40 + 8 avatares + 2 huérfanos deliberados |

Los identificadores fijos de `criticalQueries` existen en los datos: sin eso,
`explain()` planificaría sobre cero filas. Una prueba de contrato sin base de
datos lo verifica antes de que la siembra llegue a CI, junto con los índices
únicos del plan y las veinte reglas de integridad.

### Antes y después de los índices

| medición | antes (solo `_id_`) | después (migración 004) |
|---|---|---|
| COLLSCAN en consultas críticas | 24 de 25 | **0 de 25** |
| avisos de `index-audit` | 22 | **0** |
| documentos examinados (25 consultas) | — | **−98,4 % de media** |
| veredicto de `bench-queries` | FAIL (relaciones de 45 y 90) | **25 PASS, 0 WARNING, 0 FAIL** |

`bench-queries.js` mide la misma consulta dos veces sobre los mismos datos:
con los índices y forzando recorrido completo con `hint({$natural: 1})`. De
cada una registra plan ganador, etapas, `docsExamined`, `keysExamined`,
`nReturned`, `executionTimeMillis` y los percentiles p50/p95/p99 de una serie
de ejecuciones. Falla si una consulta crítica sigue en COLLSCAN, si examina
más documentos de la cuenta o si la colección está vacía: sin datos no hay
evidencia.

### Respaldo, restauración y migración

| paso | resultado |
|---|---|
| respaldo (`ejson+sha256`) | 27 colecciones, 135 800 documentos |
| verificación | correcta |
| restauración en `kronos_migration_test` | 135 800 → 135 800, **diferencia 0, IDÉNTICO** |
| aplicación | 6 migraciones; 004 creó los índices; **005 afectó 2 000 documentos** |
| idempotencia (segunda pasada) | **0 aplicadas, 6 omitidas** |
| integridad tras migrar | 20 reglas, 0 críticas |

La tabla comparativa por colección (`origen | restaurado | diferencia |
estado`) la emite `backup-verify.js --restore` y queda en `restore-proof.json`
con una explicación escrita de cada fila.

### Que las comprobaciones detecten, no solo que devuelvan cero

`scripts/db/detection-drill.js` construye una base desechable con una anomalía
por cada regla de integridad, más una referencia multimedia rota, un archivo
huérfano y tres metadatos incoherentes. Resultado: **20/20 reglas detectan lo
suyo** y el cruce multimedia encuentra las tres clases de problema. Un
verificador que siempre devuelve cero es indistinguible de uno roto; esto lo
distingue.

### Rollback

`scripts/db/rollback-drill.js` corre sobre su propia base sin migrar y toma
una instantánea en cada parada: inicial → migrar → validar → rollback →
validar → reaplicar → validar. Sobre 27 160 documentos, con **61 índices
creados** por la migración: ninguna colección cambió de recuento, el rollback
devolvió exactamente el conjunto de índices inicial y la reaplicación
reprodujo el estado migrado.

Diferencia explicada: `createIndex` crea la colección si no existe, así que la
004 hace aparecer las colecciones del plan que la base aún no tenía. Al
revertir se borra el índice pero no la colección, porque eliminarla sería una
operación destructiva que ninguna migración debe decidir por su cuenta. Esas
colecciones nacen vacías y se informan en su propia tabla.

## 6.1. Pendiente de la base de producción

Lo anterior es una base de ensayo, no producción. Con datos reales falta:

- `npm run db:inventory` contra la base real: recuentos, tamaños y campos
  desconocidos que solo aparecen con datos vividos.
- Respaldo de producción, su verificación y la restauración de ensayo con
  volumen real, midiendo el tiempo de restauración.
- Las seis migraciones sobre esa copia y la comparación de recuentos por
  colección antes y después.
- `npm run db:media-orphans` contra el almacenamiento real.
- Métricas de campo del despliegue (LCP, INP, CLS).

## 7. Vuelta atrás

1. **Migraciones**: `npm run db:migrate -- down --to <versión>`. Los rellenos
   se deshacen con los ids guardados en `kronos_migration_undo`; las
   migraciones que solo crean índices los eliminan.
2. **Datos**: restaurar el respaldo verificado sobre una base nueva y
   apuntar la aplicación a ella. Nunca se restaura encima del origen.
3. **Aplicación**: el despliegue anterior sigue siendo válido porque ninguna
   migración cambia el contrato de la API; los campos añadidos son opcionales
   y los índices son transparentes para el código.
