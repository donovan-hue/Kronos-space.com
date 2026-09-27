# Acceso a producción — dónde mirar y qué devolver

Documento operativo. **No contiene secretos, URIs reales ni credenciales, y no
debe contenerlos nunca.** Describe dónde está cada cosa, no cuánto vale.

---

## 1. Dónde está el backend

| Pieza | Plataforma | Cómo se identifica |
| --- | --- | --- |
| API | **Render** | `api.kronos-space.com` resuelve a `kronos-space-com-bwu9.onrender.com` (región `gcp-us-west1`), detrás de Cloudflare |
| Cliente web | **Vercel** | Despliegues del entorno `Production` registrados en GitHub, creados por `vercel[bot]` |
| Cliente (espejo) | **Cloudflare Pages** | Comprobación `Cloudflare Pages` del repositorio |

**El repositorio no contiene ningún manifiesto de despliegue del backend**: no
hay `render.yaml`, `Procfile`, `Dockerfile` ni `vercel.json`. La configuración
del servicio vive exclusivamente en el panel de Render. Esto es deuda de
infraestructura, no un olvido de este documento.

Consecuencia directa: **los despliegues del backend no dejan rastro en
GitHub.** Los que aparecen en la API de despliegues de GitHub son del cliente.

---

## 2. Cómo identificar el commit desplegado

Desde `1f3ad36` el propio servicio lo declara. No hace falta entrar al panel:

```bash
curl -s https://api.kronos-space.com/health | jq '.build'
```

```json
{
  "commit": "<sha de 40 caracteres>",
  "commitShort": "<7 caracteres>",
  "branch": "<rama>",
  "repo": "<owner/repo>",
  "serviceName": "<nombre del servicio en Render>",
  "startedAt": "<ISO-8601 del arranque del proceso>",
  "traceable": true
}
```

Los valores los inyecta Render por su cuenta (`RENDER_GIT_COMMIT`,
`RENDER_GIT_BRANCH`, `RENDER_GIT_REPO_SLUG`, `RENDER_SERVICE_NAME`): **no hay
que configurar nada en el panel.**

`traceable: false` con `commit: null` significa que el servicio corre una
versión anterior a este cambio, o que la plataforma no inyectó las variables.
En ese caso el despliegue **no es trazable** y hay que redesplegar antes de
cualquier operación sobre datos.

Comprobación automática, incluida la comparación con lo que esperas:

```bash
EXPECTED_COMMIT=<sha> BASE=https://api.kronos-space.com ./scripts/verify-deploy.sh
```

También como flujo de trabajo manual: `verify-deploy.yml` (`workflow_dispatch`,
solo lectura).

---

## 3. Dónde comprobar `NODE_ENV`

**Vía preferida — al propio servicio, sin credenciales:**

```bash
curl -s https://api.kronos-space.com/health | jq '{environment, environmentDeclared}'
```

Los dos campos hay que leerlos juntos:

| `environment` | `environmentDeclared` | Significado |
| --- | --- | --- |
| `production` | `true` | `NODE_ENV=production` está declarado. **Correcto.** |
| `production` | `false` | `NODE_ENV` falta, está vacío o vale algo desconocido (`staging`, `prod`…). Las guardas lo tratan como producción por criterio fail-closed, pero **nadie lo declaró**. Hay que fijarlo. |
| `development` / `test` | `true` | **Grave.** El servicio de producción cree que no lo es. Parar. |

**Vía secundaria:** panel de Render → servicio del API → *Environment*. Solo
para fijarlo si falta; para leerlo basta el health.

---

## 4. Dónde comprobar `MONGODB_AUTO_INDEX`

```bash
curl -s https://api.kronos-space.com/health | jq '.autoIndex'
```

`false` es lo correcto: Mongoose no crea índices por su cuenta. Es un booleano
con el valor **efectivo**, ya resuelto por la misma función que usa la
aplicación, así que no depende de interpretar una cadena del panel.

`true` en producción significa que un arranque puede construir índices sin que
nadie lo haya pedido, durante la ventana que menos conviene.

---

## 5. Dónde obtener la URI de forma segura

**La URI no se pide por chat, ni se pega en un issue, ni se guarda en el
repositorio.** Vive en Render → servicio del API → *Environment* → `MONGODB_URI`.

Para el diagnóstico, quien lo ejecute debe:

1. Crear en MongoDB Atlas un usuario **con rol `read` únicamente** sobre la
   base de producción. No reutilizar el usuario de la aplicación: si el
   diagnóstico no puede escribir, no escribe aunque el código tuviera un
   fallo.
2. Exportarla solo en la sesión del terminal, nunca en un fichero del
   repositorio:

   ```bash
   read -rs MONGODB_URI && export MONGODB_URI
   ```

3. Revocar el usuario de solo lectura al terminar.

Cualquier salida que se comparta debe llevar la URI redactada. El script ya lo
hace: muestra el host y sustituye las credenciales por `<credenciales>`.

---

## 6. Cómo ejecutar el diagnóstico de solo lectura

```bash
export MONGODB_URI='<uri con usuario de solo lectura>'
export KRONOS_DIAG_ALLOW_DB='<nombre exacto de la base de producción>'

node scripts/db/production-readonly-diagnostics.js --json /tmp/diagnostico.json
```

`KRONOS_DIAG_ALLOW_DB` es obligatoria **y tiene que coincidir con la base que
nombra la URI**. Si no coincide, el script se detiene antes de conectar: evita
que un copiar y pegar equivocado produzca un informe atribuido a otra base.

El script no contiene ninguna operación de escritura —hay una prueba que lo
comprueba leyendo su código fuente— y conecta con `autoIndex: false` y
`autoCreate: false`.

Su última línea es siempre una de estas dos:

```
READ_ONLY_ASSERTION=PASS        # exit 0, todas las guardas pasaron
READ_ONLY_ASSERTION=BLOCKED     # exit != 0, alguna falló
```

---

## 7. Qué evidencia debe devolver el operador

Cinco cosas. Las dos primeras no necesitan credenciales:

1. **Salida de `/health`:**

   ```bash
   curl -s https://api.kronos-space.com/health | jq '{build, environment, environmentDeclared, autoIndex}'
   ```

2. **Salida de `verify-deploy.sh`** con `EXPECTED_COMMIT` fijado.

3. **`/tmp/diagnostico.json`** completo, o al menos:
   - `TTL ANALYSIS` íntegro — **el dato que decide si la migración 004 es
     segura**;
   - `UNIQUE INDEX DUPLICATE CHECKS` íntegro;
   - `DB STATS` y `GRIDFS`, que dimensionan el respaldo.

4. **La línea `READ_ONLY_ASSERTION=`** tal cual, con el código de salida.

5. **Una decisión explícita sobre los documentos vencidos**: cuántos hay y si
   se acepta perderlos al crear los TTL. Nadie debe tomar esa decisión por el
   dueño de los datos, y el respaldo que los recupera es el **anterior** a la
   creación del índice.

Con eso, los puntos 10 y 11 de `docs/db/CHECKLIST-PRE-PRODUCCION.md` pasan a
PASS o a BLOCKED con evidencia, y el punto 1 deja de depender de que alguien
recuerde qué se desplegó.

---

## 8. Lo que este documento NO autoriza

Nada de lo descrito aquí escribe en producción. En concreto **no** cubre, y
sigue necesitando autorización explícita aparte: respaldo de producción,
restauración, migración, creación o borrado de índices, cambio de variables,
despliegue y reinicio.
