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
| Escribir en producción por error | `--confirm <nombre de la base>` obligatorio | `runner.js` |
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

## 6. Pendiente de una base real

Sin MongoDB en el entorno de trabajo, estos puntos quedan escritos y
verificados estáticamente, pero **no** se consideran completados:

- `npm run db:inventory` contra la base real (recuentos, tamaños, índices
  existentes, campos desconocidos).
- Copia de seguridad real, su verificación y la restauración de ensayo.
- `--dry-run` y aplicación de las seis migraciones en una copia de ensayo.
- `npm run db:validate` y `npm run db:index-audit` con `explain()` real.
- Cruce de multimedia (`npm run db:media-orphans`) con el almacenamiento real.
- Tabla de rendimiento de la API (p50/p95/p99) y métricas de campo
  (LCP, INP, CLS) medidas sobre el despliegue.

## 7. Vuelta atrás

1. **Migraciones**: `npm run db:migrate -- down --to <versión>`. Los rellenos
   se deshacen con los ids guardados en `kronos_migration_undo`; las
   migraciones que solo crean índices los eliminan.
2. **Datos**: restaurar el respaldo verificado sobre una base nueva y
   apuntar la aplicación a ella. Nunca se restaura encima del origen.
3. **Aplicación**: el despliegue anterior sigue siendo válido porque ninguna
   migración cambia el contrato de la API; los campos añadidos son opcionales
   y los índices son transparentes para el código.
