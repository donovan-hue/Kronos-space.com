# Verificación de servidores — 29 de octubre de 2026

Registro de una corrida real contra el despliegue de producción y de una
auditoría de filtración de secretos. **No contiene secretos, URIs reales ni
credenciales**: donde hay un identificador público (un Client ID de OAuth) se
escribe porque no lo es; todo lo demás se describe por su forma, no por su valor.

Complementa `docs/production-access.md` (el mapa de dónde mirar) y
`docs/PROBADORES.md` (cómo se corre cada probador). Los puntos que registra son
los del bloque C de `docs/CHECKLIST-CIERRE-Y-ESCALABILIDAD.md`.

## Cómo se leyó la producción, y hasta dónde llega este método

Las lecturas se hicieron por HTTP **solo de lectura** contra los hosts públicos
(`/health`, `/api/flags`, `/api/auth/google/config`) y contra la API de Vercel.
Nada de lo de abajo requiere credenciales ni escribe nada.

El límite del entorno de trabajo hay que decirlo, porque cambia lo que se puede
afirmar: la máquina donde se prepararon estos cambios solo tiene salida a
`github.com`, `registry.npmjs.org` y `pypi.org`. Un `curl` a
`api.kronos-space.com` desde ahí falla (`SSL_ERROR_SYSCALL`). Por eso **no** se
pudieron correr aquí `scripts/verify-deploy.sh`, `scripts/smoke-test.sh`,
`npm run probar:vivo` ni ninguna de las llamadas que cuestan dinero: las tres
primeras necesitan salida a internet arbitraria y las últimas escriben o cobran.
Los dos `smoke-test` además **crean un usuario temporal** en la base contra la
que corren; no se ejecutaron contra producción por decisión propia, no por
falta de acceso.

## Lo que devolvió la producción

`GET https://api.kronos-space.com/health` a las `2026-10-29T16:33:48Z`:

```json
{
  "ok": true, "service": "kronos-space", "database": "connected", "realtime": true,
  "build": {
    "commit": "03bccc05fdb1a07ae33b958f1636a4294a4ba023", "commitShort": "03bccc0",
    "branch": "main", "repo": "donovan-hue/Kronos-space.com",
    "serviceName": "kronos-space-com-bwu9",
    "startedAt": "2026-10-29T16:33:00.496Z", "traceable": true
  },
  "environment": "production", "environmentDeclared": true, "autoIndex": false
}
```

Cuatro cosas se leen ahí, y ninguna es una suposición:

1. **`NODE_ENV` real de producción: declarado.** `environment: "production"` con
   `environmentDeclared: true`. Las dos mitades importan: la segunda es la que
   distingue «alguien lo escribió en el panel» de «falta y las guardas lo tratan
   como producción por criterio fail-closed». *Punto cerrado.*
2. **`MONGODB_AUTO_INDEX` real de producción: `false`.** Es el valor efectivo que
   resuelve la misma función que usa la aplicación, no una cadena del panel. Con
   `false`, un arranque no construye índices por su cuenta. *Punto cerrado.*
3. **El código desplegado es `03bccc0` en rama `main`, y es trazable.** Es
   exactamente el commit base de la rama de trabajo de esta sesión: nada del
   trabajo sin comitear está en producción, y el frontend de Vercel (abajo)
   apunta al mismo commit. Las dos mitades del despliegue son la misma versión.
4. **El servicio en Render es `kronos-space-com-bwu9`** — el mismo nombre que
   documenta `docs/production-access.md` §1. La identidad del backend quedó
   confirmada desde fuera, sin entrar al panel.

Detalle del plan gratuito, registrado porque explica cualquier medición futura:
el primer intento devolvió el intersticial «Application loading» de Render
(cold start: `12:33:07 Allocating compute resources` → `12:33:24 Environment
variables injected`). Una lectura que cae en ese intersticial **no** es una
prueba de que falte una variable; hay que reintentar.

`GET /api/flags` → `{aiComposer, capsules, pulse, vertical, analytics, archive}`
los seis en `true`.

`GET /api/auth/google/config` → `enabled: true` con un Client ID **idéntico**,
carácter a carácter, al `VITE_GOOGLE_CLIENT_ID` que Vercel compila en el bundle
(`132562057632-fklk…ua3pncm.apps.googleusercontent.com`). El endpoint solo
devuelve `enabled: true` si `GOOGLE_CLIENT_ID` está cargado en el proceso, así
que esto prueba las dos mitades a la vez: la variable existe en Render y las dos
plataformas coinciden. Que coincidan es lo que hace que la verificación del ID
token por audiencia funcione; dos IDs distintos se ven en producción como un 401
incomprensible en el botón de acceso.

## Vercel (frontend)

Proyecto `kronos-space.com` del equipo `oficialkronosspace-1215`, leído con la
API de Vercel con la sesión conectada:

| Dato | Valor |
| --- | --- |
| Despliegue de producción | `dpl_Bo6isCGV4DUqT9PDmLTghYdwuqmw`, `READY` / `PROMOTED` |
| Commit que compiló | `03bccc05f…` en `main`, verificado por GitHub |
| Dominios | `kronos-space.com`, `www.kronos-space.com` y los alias `*.vercel.app` |
| Construcción | root `client`, `npm run build`, salida `dist`, Node 24.x |
| Mapas fuente | `protectedSourcemaps: true` y ningún `.map` publicado |
| Variables | 3: `VITE_API_URL`, `VITE_GOOGLE_CLIENT_ID`, `MONGODB_URI` |

- `VITE_API_URL` = `https://api.kronos-space.com/api` → la API de Render, con el
  sufijo `/api` normalizado. Es el host explícito de la lista de producción: un
  preview de Vercel no hereda esta variable porque el proyecto la declara para
  los tres entornos (`production`, `preview`, `development`) y el aislamiento de
  entornos ya no deja que un tenant arbitrario apunte a la API real por defecto.
- `VITE_GOOGLE_CLIENT_ID` → público por diseño (Google lo envía en cada página
  que usa Identity Services).
- **`MONGODB_URI` en un proyecto que no ejecuta backend.** Vercel lo marca con la
  advertencia de seguridad `readable-secret` en su propio listado de variables.
  No es una brecha —véase la prueba canario abajo, donde una `MONGODB_URI`
  presente en el entorno del build **no** llega al navegador—, pero es un secreto
  respirando en el proyecto equivocado: la cadena de conexión a la base de
  producción pertenece al servicio de Render, que ya la tiene. Acción pendiente
  del dueño: quitar la variable (o la integración del Marketplace que la
  inyecta) del proyecto de frontend. No se hizo aquí porque borrar una
  configuración de producción no es una verificación.

## Google, comprobado desde fuera sin credenciales

Prueba diferencial contra el endpoint de autorización de Google, con `GET` y sin
sesión:

- Con el Client ID del sitio → `Error 400: redirect_uri_mismatch`.
- Con un Client ID inventado (`…-NOEXISTE00000000000000000000000…`) → `Error 401:
  invalid_client — The OAuth client was not found`.

La diferencia entre los dos códigos es la que informa: el cliente del sitio
**existe y está activo** en Google (un ID inexistente no llega a quejarse de la
URI). El `redirect_uri_mismatch` **no** es un defecto de esta aplicación: el
acceso usa Google Identity Services, que se autoriza por *Orígenes de JavaScript
autorizados* en la Consola de Google, no por lista de URIs de redirección. Que
`https://kronos-space.com` no esté en la segunda lista es lo esperado.

Lo que esto no prueba, y por eso el punto sigue abierto: un inicio de sesión
completo con una cuenta real (el botón, el selector de cuenta, la sesión que
queda montada). Son dos minutos en el navegador y los tiene que hacer alguien con
una cuenta; ningún `GET` de metadatos los sustituye.

## Auditoría de filtración de secretos

Cuatro barridos independientes, porque cada uno encuentra cosas distintas.

**1. Historial completo del repositorio.** El clon local era de un solo commit
(`git rev-list --count --all` = 1), así que se trajeron las 400 revisiones y se
escanearon **todos los parches** (`git log --all -p`) contra las formas de
secreto: `sk-or-v1-…` (OpenRouter), `re_…` (Resend), `AIza…` (clave de API de
Google), `GOCSPX-…` (secreto de cliente de Google), `xox?-…` (Slack),
`ghp_`/`github_pat_` (GitHub), `AKIA…` (AWS), `-----BEGIN … PRIVATE KEY-----`,
JWT firmado con cabecera conocida, y los prefijos de Cloudflare, Render y Vercel.
**Cero coincidencias de ninguna.** Las únicas 10 coincidencias en todo el
historial son cadenas de conexión de MongoDB con forma de marcador, todas en
pruebas y plantillas: `cluster0.ab12c.mongodb.net`, `cluster.example`,
`otro-cluster.mongodb.net`, `127.0.0.1`, `h:27017` y el `USER:PASSWORD@CLUSTER`
de `server/.env.example`. Ningún host real de Atlas con credenciales. Dos
archivos que aparecían en el historial y ya no están rastreados
(`server/env.example` y `.agents/skills/kronos-mongodb/SKILL.md`) solo contenían
plantillas y prosa con `«usuario:contraseña»`.

**2. Árbol de trabajo, incluidos los archivos sin registrar y `client/dist`.**
Mismas formas, mismas conclusiones. Ningún `.env` rastreado: el `.gitignore`
declara `.env`, `.env.*` y la excepción `!.env.example`, y los únicos archivos
`env` del repositorio son los dos `.env.example`. El cliente solo lee
`import.meta.env.VITE_*`: buscar `process.env.` en `client/src` sin prefijo `VITE_`
no devuelve nada. Lo que sí hay en el código son contraseñas de prueba con nombre
obvio (`KronosCapsules123!`, `kronos-health-test-secret`) en suites locales y un
valor por defecto efímero en los dos `smoke-test` (`smoke$(date +%s)@example.test`)
—ninguna es una credencial de producción, y se dejan porque sin ellas las suites
no arrancan.

**3. Prueba canario del build** (la que decide si la variable mal ubicada en
Vercel se filtra de verdad). Se compiló el cliente con valores identificables en
todas las variables del servidor —`MONGODB_URI`, `GOOGLE_CLIENT_SECRET`,
`RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `OPENROUTER_API_KEY`, `GEMINI_API_KEY`,
`VIDEO_API_KEY`, `VIDEO_API_URL`, `JWT_SECRET`, `CAPSULE_SECRET`,
`CLOUDFLARE_API_TOKEN`— y se buscó cada una en las 97 archivos de `client/dist`:

| Búsqueda | Archivos del bundle que la contienen |
| --- | --- |
| `CANARI0` (todas las sondas) | 0 |
| `sk-or-v1`, `GOCSPX`, `AIzaCANARI`, `re_CANARI` | 0 |
| `mongodb+srv`, `mongodb://` | 0 |
| `cf-canari0`, `jwt-canari0` | 0 |
| `VITE_API_URL` (debe estar) | 1 |
| Client ID de Google (público por diseño) | 1 |
| archivos `.map` publicados | 0 |

Corte transversal de `envPrefix` por defecto de Vite: el `define` de
`client/vite.config.js` solo fija `import.meta.env.VITE_API_URL`, y `loadEnv` con
prefijo vacío se usa únicamente para leer esa clave dentro de la configuración.
Aunque alguien ponga un secreto en el proyecto de frontend, no puede terminar en
el navegador. **La `MONGODB_URI` de Vercel es un problema de higiene, no una
brecha activa.**

**4. Lo que GitHub indexa del repositorio público** (búsqueda de código en la rama
por defecto, desde `gh api`): `sk-or-v1` → 1 coincidencia, que es la columna
*forma del valor* de `docs/CONFIG-ENTORNO.md` escribiendo `sk-or-v1-…`; `GOCSPX`
→ 0; `AIzaSy` → 0; `BEGIN PRIVATE KEY` → 0. Coincide con el barrido local, que
es lo que se esperaba: el repo público no tiene secretos.

**El barrido se volvió a correr después de escribir estas líneas**, porque el
mismo pase añadió un archivo con formas de secreto dentro: las únicas
coincidencias nuevas son las tres constantes de prueba de
`server/test/probar-proveedores.contract.test.js` (una clave de Resend, una de
OpenRouter y una cadena de conexión de MongoDB simulada), y las tres llevan la
palabra `CANARIO` en el medio justamente para que un barrido las encuentre y para
que nadie las confunda con credenciales. Este documento no las transcribe: un
registro que dice «aquí no hay secretos» no puede empezar pegando formas de
secreto, aunque sean falsas. Total del árbol tras el pase: 36
coincidencias, todas marcador; 0 de forma de clave real.

**Qué no cubre esta auditoría.** Los valores que viven en los paneles (Render,
Atlas, la Consola de Google) no están en el repositorio y no se pueden barrer
desde aquí. Y un secreto que se haya pegado alguna vez en un chat, un correo o
un issue no aparece en ningún barrido de código: si alguna vez se compartió una
cadena de conexión o una clave por un canal no cifrado, la respuesta es rotarla,
no buscarla en el repo.

## Qué se añadió para poder verificar lo que no se podía verificar

Los puntos de credenciales decían «cargado y probado», y hasta hoy la única
forma de saberlo era gastar: enviar un correo, generar una imagen, lanzar un
trabajo de video. Se añadió una sonda de **lectura, coste 0**:

```bash
npm run probar:proveedores        # = node scripts/kronos-doctor.js --proveedores
```

Corrida en el *shell* del servicio de Render (donde las variables ya están
puestas), cada proveedor configurado recibe un `GET` a su endpoint de metadatos:
Resend responde qué dominios de envío tiene la cuenta y si el del remitente está
verificado; OpenRouter responde si la clave es de crédito gratuito, cuánto lleva
gastado y cuál es su tope; Gemini responde qué modelos admite la clave y se
comprueba que el modelo del chat (`GEMINI_MODEL`, hoy `gemini-3.6-flash`) está
entre ellos. Video no tiene endpoint de lectura, así que la sonda lo dice en vez
de inventar una comprobación. Sin clave, no se toca la red. Nunca se imprime un
valor.

- `scripts/lib/probeaProveedores.js` — las sondas, con el `fetchImpl` inyectable.
- `server/test/probar-proveedores.contract.test.js` — 12 casos que prueban sobre
  todo que **no aprueba lo que no puede comprobar**: clave rechazada (401) es
  `FALLA`, dominio sin verificar es `FALLA`, clave de crédito gratuito no puede
  decir «facturación OK», modelo inexistente es `FALLA`, `VIDEO_API_URL` en `http`
  es `FALLA` (una clave de proveedor no puede viajar en claro), Client IDs
  desparejados son `FALLA`, y la salida serializada no contiene ninguna de las
  claves canario. Hay un caso, además, que fija que las sondas solo hacen `GET` a
  los tres hosts oficiales: una herramienta de diagnóstico que aceptara un host
  arbitrario sería una forma de exfiltrar la clave que se le pasa.
- `scripts/kronos-doctor.js` — nueva sección 3 detrás de `--proveedores`; el
  comportamiento anterior del doctor no cambia cuando la bandera no está.
- `server/src/server.js` — el health publica `trustProxy` (booleano, valor
  efectivo del proceso), igual que ya publicaba `environment`,
  `environmentDeclared` y `autoIndex` por el motivo que explica el comentario de
  esa función: son banderas que la lista de pre-producción exige comprobar y que
  no son secretos. `server/test/health.test.js` fija la lista de claves del
  contrato (ahora diez) y añade un caso que verifica que el campo refleja el
  valor efectivo, activado **y** apagado.

## Estado de los diez puntos

| # | Punto | Estado después de esta corrida |
| --- | --- | --- |
| 1 | `GOOGLE_CLIENT_ID` + `VITE_GOOGLE_CLIENT_ID` | **Cerrado el cruce entre plataformas** (mismo ID en Render y en Vercel; el cliente de Google existe y está activo). Queda el inicio de sesión real en el navegador. |
| 2 | `RESEND_API_KEY` + `RESEND_FROM_EMAIL` | **Abierto.** No se puede leer desde fuera. Existe la sonda (`npm run probar:proveedores`); un `FALLA` de «dominio sin verificar» es el fallo más común y ahora se ve. Falta además un correo real recibido en un buzón propio. |
| 3 | `OPENROUTER_API_KEY` con generación facturada | **Abierto**, con la mitad gratis ya instrumentada: la sonda distingue clave de crédito gratuito de clave con facturación. La corrida que cobra es `npm run smoke:openrouter`. |
| 4 | `GEMINI_API_KEY` con chat real | **Abierto.** La sonda confirma clave y disponibilidad del modelo; el chat real es `TOKEN=… npm run probar:chat`. |
| 5 | `VIDEO_API_KEY` + `VIDEO_API_URL` con trabajo real | **Abierto.** La sonda solo puede comprobar forma y que el endpoint sea `https`. El trabajo real: `TOKEN=… npm run probar:video`. |
| 6 | URI de solo lectura para auditoría de índices | **Abierto, bloqueado en Atlas.** Hace falta crear el usuario con rol `read` (receta en `docs/production-access.md` §5-6). Comprobado aquí que las dos guardas funcionan: sin `MONGODB_URI`, `scripts/db/index-audit.js` responde `CONFIG_FALTANTE` y no conecta; sin `KRONOS_DIAG_ALLOW_DB`, el diagnóstico de solo lectura informa `GUARDAS PREVIAS A LA CONEXIÓN: FALLARON` antes de abrir socket. |
| 7 | Acceso al panel del hosting | **Frontend verificado** por API de Vercel (proyecto, variables, despliegue de producción, dominio). **Backend solo por identidad** (`serviceName`, rama y commit leídos del propio servicio): no hay conector de Render en este entorno. |
| 8 | `NODE_ENV` real, leído y registrado | **Cerrado** con la lectura de arriba. |
| 9 | `MONGODB_AUTO_INDEX` real, leído y registrado | **Cerrado** con la lectura de arriba. |
| 10 | `TRUST_PROXY` confirmado con 429 por IP | **Medible desde ahora.** El health publica `trustProxy`; en la última lectura del servicio desplegado ese campo todavía no existía (el `03bccc0` no lo incluye), así que hay que volver a leer tras el próximo despliegue. Prueba complementaria: dos redes distintas (wifi y datos móviles) y ver que el 429 de `AUTH_RATE_LIMIT_MAX` = 20/15 min en credenciales afecta a una IP y no a la otra. Si la bandera faltase, el aviso `CONFIG_WARNING: TRUST_PROXY no activado en producción` aparece en el log del arranque y los cubos —300 API, 60 acciones, 20 credenciales por 15 minutos— se reparten entre toda la plataforma. |

## Repetición

```bash
# Solo lectura, desde cualquier máquina con salida a internet:
curl -s https://api.kronos-space.com/health | jq '{environment, environmentDeclared, autoIndex, trustProxy, build}'
curl -s https://api.kronos-space.com/api/auth/google/config | jq -r '.clientId'
EXPECTED_COMMIT=$(git rev-parse HEAD) ./scripts/verify-deploy.sh

# Dentro del servicio (Render → Shell): donde las variables ya están puestas.
npm run probar:proveedores

# Las que cuestan dinero o escriben, una a una y con decisión del dueño:
npm run smoke:openrouter                      # una generación por capacidad
TOKEN=… npm run probar:chat                   # una respuesta corta
TOKEN=… npm run probar:video                  # un trabajo
```
