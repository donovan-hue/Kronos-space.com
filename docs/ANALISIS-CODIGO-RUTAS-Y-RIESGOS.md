# Análisis del código, las rutas de las pantallas y los riesgos de romperlo

> Revisión estática + ejecución real de la suite en el commit `e709758`
> (rama `arena/a12d6018-kronos-space-com`).
> Todo lo que sigue está medido, no supuesto: los comandos ejecutados están al final.
>
> **Actualizado tras el refactor de interfaz** (navegación con emojis, sin
> descripciones ni recuadros; sin demo de pantallas; sin Órbitas ni Canales;
> sin capa de estilos encimados). Los números de rutas y los hallazgos que
> mencionaban el demo de pantallas o las órbitas se han recalculado sobre el
> árbol actual; el shell de navegación volvió a cambiar después (ver
> `docs/RUTAS-Y-NAVEGACION.md`).

---

## 0. Resumen ejecutivo

| Métrica | Valor |
|---|---|
| Líneas de código (`client/src` + `server/src` + `scripts` + `guardian/src`) | **61.580** |
| Archivos cliente / servidor | 182 / 129 |
| Pantallas (features) en cliente | 69 archivos en 27 directorios de `features/` |
| Módulos de servidor | 31 |
| `<Route>` declarados en `App.jsx` | **60** (44 montan pantalla, 16 redirigen) |
| Demo de pantallas (`/pantallas`, `/funciones`) | **retirado** |
| Ítems de navegación (`navigation/model.jsx`) | 17 (+8 hijos de Kairos) |
| Capas de CSS encimadas | **0** (todo el diseño vive en una sola hoja: `styles/kronos.css`) |
| Aristas de importación cliente+servidor | 855 |
| **Ciclos de importación** | **1** (auto-import en `server.js`) |

**El repo está sano**: `lint` pasa con `--max-warnings=0`, cliente **524/524
pruebas verdes** (71 en `node:test` + 453 en Vitest), servidor **581 pasan / 0
fallan / 186 omitidas** (e2e que exigen MongoDB real), guardián **8/8**, y el
build sigue sin precargar el motor 3D.

**El CSS es una sola identidad**: negro profundo, cromo líquido y reloj 3D en
movimiento constante. Las 30 hojas de producto que existían (más la carpeta
`kronos-system/`) se fusionaron en `client/src/styles/kronos.css`; el motor
(`tailwind.css`) y el vocabulario del color (`design-tokens.css`) se conservan
aparte porque no son estilos del producto. `scripts/styles/consolidate-identity.js`
regenera la hoja y es reproducible: lee las hojas de origen del historial.

El riesgo real **no está en las rutas**: el mapa de rutas está declarado en
dos capas (router + modelo de navegación) y verificado por tests en las dos
direcciones. El riesgo está
**alrededor** de las rutas: en los cuellos de botella compartidos, en los
archivos que son punto único de fallo, en el guardián que decide qué bloquea
un merge, y en tres hallazgos concretos que describo en §5.

---

## 1. Mapa de rutas: dos capas, un contrato

El sistema de rutas es deliberadamente redundante. Una pantalla nueva obliga a
tocar **dos** sitios; a cambio, existe una prueba que verifica la cobertura
**bidireccional** entre las dos capas.

```
App.jsx  ──────────►  rutas reales del router (qué se monta)
    ▲
    │  test-ui/navigation-3d.spec.jsx  (cubre ambas direcciones)
    │  test-ui/routes-consistency.spec.jsx
    ▼
navigation/model.jsx ─►  destinos de la barra inferior y del cajón de secciones
```

- `navigation/model.jsx` es la **fuente única de verdad de la navegación**:
  `NAV_GROUPS`, `NAV_EMOJIS`, `TAB_ITEM_IDS`, `SECTION_LABELS`, `NAV_ORDER`
  y `getCurrentSection(pathname)`. La barra inferior, el cajón «Secciones», la
  etiqueta de la cabecera y las transiciones direccionales consumen **ese mismo
  módulo**; nadie declara rutas en otro sitio.
- El **demo de pantallas** (`/pantallas`, `/funciones`, `lib/screenIndex.js` y
  el generador `scripts/ci/generate-route-docs.mjs`) se retiró: era una tercera
  capa que describía lo mismo que el router y que se desincronizaba. En su
  lugar, `docs/RUTAS-Y-NAVEGACION.md` se escribe a mano y la suite comprueba
  que el modelo no tenga enlaces muertos.
- `getCurrentSection()` es el único árbitro de «en qué sección estoy», y por eso
  `AppLayout` puede confiar en él para la etiqueta del topbar y para la
  coreografía de entrada/salida sin recalcular nada por su cuenta.
- `AppLayout` congela el `<Outlet />` con `useOutlet()` en cada hijo de la
  transición: un `<Outlet />` vivo dentro de un hijo que sale lee la ruta nueva
  y monta el editor dos veces, descartando lo escrito durante la animación.
  Ese detalle ya está documentado en el código y es un punto de rotura
  silencioso si alguien "simplifica" el shell.

### 1.1 Inventario completo de rutas

**Públicas / de entrada (5 + 4 condicionales)**

| Ruta | Qué monta | Nota |
|---|---|---|
| `/` | — | Redirige a `/home` con sesión, `/login` sin ella |
| `/login` | `Auth` | Si ya hay sesión → `/home` |
| `/register` | `Auth` | Si ya hay sesión → `/home` |
| `/forgot-password` | `ForgotPassword` | Condicional |
| `/reset-password` | `ResetPassword` | Condicional |
| `/verify-email` | `VerifyEmail` | Única pública que **no** se redirige con sesión |

**Sesión — La red (10)**

`/onboarding` · `/home` · `/explore` · `/create` · `/create/post` ·
`/vertical` · `/stories/archive` · `/capsules` · `/pulse` · `/live`

**Sesión — Comunidad (6)**

`/circles` · `/conversations` · `/conversations/:conversationId` ·
`/messages` · `/messages/:userId` · `/notifications`

Órbitas y Canales se retiraron: eran Grupos con otro nombre (y los Canales
dependían estructuralmente de una Órbita).

**Sesión — La persona (10)**

`/profile` · `/profile/:username` · `/u/:username`\* · `/users/:id`\* ·
`/support` · `/support/:userId` · `/saved` · `/post/:id` · `/library` ·
`/settings`

\* alias heredados que reescriben con `<Navigate replace>`.

**Sesión — Kairos (13)**

`/kairos` · `/kairos/image` · `/kairos/video` · `/kairos/script` ·
`/kairos/studio` · `/kairos/audio` · `/kairos/catalogs` · `/kairos/history` ·
`/kairos/video/jobs` · `/projects` · `/projects/plantillas` ·
`/projects/:projectId`

**Sesión — Control y sistema (3)**

`/moderation` · `/admin` (guardia `AdminRoute`) ·
`*` (dentro de la sesión → 404 con contexto) ·
`*` (fuera de la sesión → `AnonymousPathRedirect` a `/login` con `state.from`)

`/pantallas` y `/funciones/:featureId` se retiraron con el demo de pantallas.

**Alias y redirecciones (17)**

`/feed`→`/home` · `/social`→`/home` · `/search`→`/explore` · `/users`→`/explore` ·
`/historias`→`/stories/archive` · `/ai`→`/kairos` · `/ai/image`→`/kairos/image` ·
`/ai/script`→`/kairos/script` · `/ai/video`→`/kairos/video` ·
`/ai/video/jobs`→`/kairos/video/jobs` ·
`/settings/profile`→`/settings#privacy` · `/settings/security`→`/moderation` ·
`/`→`/home`|`/login` · `/login`,`/register`,`/forgot-password`,`/reset-password`
→`/home` si ya hay sesión.

### 1.2 Qué protege el contrato de rutas

- `client/test-ui/navigation-3d.spec.jsx` — 7 pruebas: cruza **cada** `to` del
  modelo de navegación contra los `<Route>` de `App.jsx`, comprueba que el eje
  de profundidad cubra todos los destinos sin duplicados, que **ningún destino
  se quede sin emoji**, que la navegación **no muestre descripciones**, que
  los grupos repartan los destinos y que la coreografía direccional sea pura.
- `client/test-ui/routes-consistency.spec.jsx` — `/stories/archive` monta y
  consulta su API (bug ya corregido: la bandeja enlazaba a una ruta que no
  existía y el comodín la mandaba a `/home` en silencio).
- `client/test-ui/block-a-navigation-search.spec.jsx` — la búsqueda global
  encuentra personas, temas y publicaciones; la creación de grupos usa
  `circleId`.

Es decir: **una ruta muerta rompe la CI, no producción**. Eso reduce mucho el
riesgo §5.3 y §5.4, pero no los elimina (ver §5.1 y §5.5).

---

## 2. Puntos únicos de fallo (fan-in): el mapa de «si tocas esto, esto cae»

Medido sobre 855 aristas de importación. Estos son los archivos que, si
cambian, tienen más dependencias en el codebase:

| # | Archivo | Fan-in | Líneas | Qué se rompe si se toca mal |
|---|---|---|---|---|
| 1 | `client/src/services/apiClient.js` | **32** | 210 | Interceptores de axios: refresh con rotación de token, cancelación por cambio de sesión, cierre de sesión ante 401 irrecuperable. Es el reloj maestro de toda la autenticación del cliente. |
| 2 | `server/src/middleware/auth.js` | **32** | 133 | Toda petición autenticada del backend. |
| 3 | `server/src/middleware/permissions.js` | **30** | 40 | Reglas de permiso por rol. |
| 4 | `client/src/services/mediaUrl.js` | **23** | 14 | Reescritura de `/uploads/...` al host de la API. 14 líneas, 23 dependencias: el punto de mayor apalancamiento por línea del cliente. |
| 5 | `server/src/modules/users/User.js` | 22 | 262 | Modelo de usuario. |
| 6 | `client/src/services/authStorage.js` | **19** | 405 | Persistencia de la sesión, `sessionRevision`, borrado defensivo cuando el navegador bloquea el almacenamiento. |
| 7 | `client/src/components/feedback/ConfirmProvider.jsx` | 15 | 108 | Confirmaciones modales de toda la app. |
| 8 | `client/src/services/queryKeys.js` | 14 | 42 | Claves de caché de React Query: cambiarlas invalida cachés a propósito y puede producir storms de refetch. |
| 9 | `client/src/components/ui/EmptyState.jsx` | 20 | 20 | Estado vacío compartido. |
| 10 | `client/src/lib/mediaStudio.js` | 11 | 525 | Motor de edición de medios (filtros, recortes, secuencias). |

**Fan-out** (quién depende de más cosas, y por eso es más fácil romperlo):

| Archivo | Imports | Líneas |
|---|---|---|
| `server/src/modules/users/users.routes.js` | 37 | 488 |
| `server/src/http/registerRoutes.js` | 34 | 86 |
| `client/src/features/users/Profile.jsx` | 19 | 835 |
| `server/src/modules/posts/posts.routes.js` | 17 | 1794 |
| `client/src/features/social/CreatePost.jsx` | 10 | 1216 |
| `client/src/layouts/AppLayout.jsx` | 11 | 226 |
| `client/src/App.jsx` | 11 | 230 |

### 2.1 El único ciclo de importación

```
server/src/server.js -> server/src/server.js
```

Es un `require()` dinámico consigo mismo (carga perezosa de una ruta). No es un
ciclo entre módulos, pero es la **única** arista que vuelve sobre sí misma en
todo el grafo: es el único punto donde una futura reescritura puede producir
un `undefined` en tiempo de carga.

---

## 3. Archivos que el propio repo declara críticos

`guardian/src/riskEvaluator.js` mantiene una lista corta y explícita de
`RUTAS_CRITICAS`: son los archivos cuyo fallo **no se puede deshacer** o que
sostienen **varias protecciones a la vez**. Es la lista que hace fallar el job
del guardián y, por tanto, **bloquea el merge**:

| # | Archivo | Por qué un error aquí es irreversible |
|---|---|---|
| 1 | `server/src/modules/capsules/capsule.crypto.js` | AES-256-GCM con clave derivada por scrypt. Romper la derivación o rotar el secreto deja **el contenido ya escrito ilegible para siempre**. |
| 2 | `server/src/config/environment.js` | Clasificador *fail-closed* del entorno. De él cuelgan **cuatro guardas a la vez**: confirmación de migraciones, arranque sin `CLIENT_URL`, copia durable de subidas y creación de índices. Si se afloja, las cuatro se abren en silencio. |
| 3 | `server/src/migrations/runner.js` | La guarda que exige `--confirm` para tocar producción. |
| 4 | `server/src/middleware/mediaAuth.js` | Cookie de media: atributo `Secure` y revalidación de revocación. Es lo único que impide leer media privada con la sesión ya cerrada. |
| 5 | `server/src/config/durableUploads.js` | Política de nombres de la copia durable en GridFS. Si deja de coincidir con `storage.js`, las subidas fallan con 503 en producción **y el archivo local se borra**: se pierde el dato. |

### 3.1 Cómo funciona el guardián

- `guardian/src/classify.js` — clasificación por zona (`client`, `server`,
  `guardian`, `scripts`, `config`, `other`). Vive aparte **a propósito**: si
  viviera dentro de `diffAnalyzer.js` arrastraría `githubClient.js`, que
  lanza al importarse sin `GITHUB_TOKEN` — las reglas de riesgo no se podrían
  probar sin credenciales, que es justo lo que más falta hace en un módulo
  cuya trabajo es decidir si un cambio es peligroso.
- `guardian/src/riskEvaluator.js` — puntúa por zona y por rutas críticas.
  `CRITICAL` gana siempre; las demás reglas **suben** el nivel, nunca lo bajan.
- `guardian/src/index.js` — falla el job (y por tanto el check) si el riesgo
  general es `CRITICAL`.
- `.github/workflows/kronos-guardian.yml` — corre `npm test` de las reglas
  **antes** de aplicarlas, y valida la sintaxis con `find -print0 | xargs -0`
  (porque `find -exec \;` devuelve éxito aunque `node --check` falle).

Niveles por zona por defecto: `server` LOW, `client` LOW, `guardian` MEDIUM,
`scripts` MEDIUM, `config` MEDIUM, `other` LOW.

---

## 4. Superficies grandes: dónde una regresión se esconde

| Archivo | Líneas | Hooks | Funciones | Comentario |
|---|---|---|---|---|
| `client/src/components/media/MediaStudio.jsx` | **1327** | **49** | 15 | Editor de foto y video: filtros, recortes, secuencias, voz, música, exportaciones. El archivo más grande y el más denso en estado del cliente. |
| `client/src/features/social/CreatePost.jsx` | **1216** | 39 | 37 | Compositor: fotos, video, encuestas, eventos, borradores, subida. |
| `client/src/features/users/Profile.jsx` | 835 | 29 | 18 | 5 pestañas + subida de avatar + like/save/repost/ocultar. |
| `client/src/features/auth/Auth.jsx` | 720 | — | — | Login, registro y Google. |
| `client/src/features/live/Live.jsx` | 671 | 38 | 20 | Audio y video en vivo. |
| `client/src/features/messages/Conversations.jsx` | 663 | 26 | 12 | Grupos + creación + búsqueda de miembros. |
| `client/src/features/social/SavedPosts.jsx` | 562 | — | — | Colecciones privadas. |
| `server/src/modules/posts/posts.routes.js` | **1794** | — | — | Monolito de servidor con el mayor fan-out de la API pública. |
| `server/src/modules/auth/auth.routes.js` | 1118 | — | — | Login, registro, Google, recuperación, reset. |
| `server/src/modules/moderation/moderation.routes.js` | 848 | — | — | Moderación y privacidad. |
| `server/src/modules/auth/session.service.js` | 632 | — | — | Familias de refresh, revocación, revalidación. |

**Regla práctica**: en `MediaStudio.jsx` y `CreatePost.jsx` cualquier cambio
debe venir acompañado de la prueba correspondiente
(`client/test-ui/media-studio.spec.jsx` tiene 689 líneas y cubre
específicamente ese editor).

---

## 5. Hallazgos concretos

### 5.1 — P0 · Un feature flag apagado **no apaga la función**

**Qué pasa.** `server/src/config/featureFlags.js` expone 6 flags
(`aiComposer`, `capsules`, `pulse`, `vertical`, `analytics`, `archive`) que el
cliente lee por `GET /api/flags`. El único consumidor de esas flags es
`client/src/navigation/useNavFlags.js`, que **filtra los ítems de navegación**:

```js
items.filter((item) => !item.flag || flags[item.flag] !== false)
```

**El problema.** El filtrado ocurre **solo en la capa de menú**. Ni el
router ni el servidor vuelven a comprobar la flag:

- `App.jsx` monta `/pulse`, `/vertical`, `/capsules`, `/analytics` siempre.
- `isFeatureEnabled()` **no se usa en ningún sitio** del servidor salvo para
  exponer `/api/flags` (`server/src/server.js:270`).
- Las APIs `/api/pulse`, `/api/capsules`, `/api/analytics` no tienen guarda.

**Consecuencia.** Poner `FEATURE_FLAG_PULSE=false` **oculta el enlace del menú
pero no apaga Pulso**: la URL directa sigue montando la pantalla y la API
sigue respondiendo. Un apagado de emergencia (por coste de IA, por un fallo de
OpenRouter, por moderación) **no surte efecto**. El índice de pantallas lo
presenta como «Se puede apagar», lo que refuerza la falsa seguridad.

**Y el switch ni siquiera existe para 3 de las 7 pantallas que lo prometen.**
El modelo de navegación solo declara `flag` en **4** ítems (`pulse`,
`vertical`, `capsules`, `analytics`); y `DEFAULT_FLAGS` del servidor tiene
6 flags, de los cuales `aiComposer` y `archive` **no los usa ningún ítem de
navegación**:

| Pantalla | Flag en el modelo | Flag en el servidor |
|---|---|---|
| `/pulse` | `pulse` | `pulse` |
| `/vertical` | `vertical` | `vertical` |
| `/capsules` | `capsules` | `capsules` |
| `/analytics` | `analytics` | `analytics` |
| `/circles` | **ninguno** | **ninguno** |
| `/live` | **ninguno** | **ninguno** |
| `/kairos/audio` | **ninguno** | **ninguno** |

Es decir: para Círculos, En vivo y Audio **no existe ningún interruptor** — ni
en el cliente ni en el servidor. Como el demo de pantallas se retiró, ya no
hay ninguna etiqueta que prometa «Se puede apagar» en la interfaz: el modelo
de navegación es ahora la única fuente y solo declara flag donde existe.

**Impacto**: medio. **No es una vulnerabilidad** (todo lo afectado exige
sesión), pero es un control de seguridad y de coste que no hace lo que su
nombre promete.

**Arreglo**: aplicar el flag en el servidor, en el punto de montaje de la
ruta y en el handler de la API. Cliente: el `flag` del ítem de navegación
debe seguir ocultando el enlace, pero la ruta debe devolver 404 o el feature
debe responder «desactivado».

### 5.2 — P0 · El guardián no cubre el mapa de rutas

`RUTAS_CRITICAS` protege el lado del servidor y la criptografía, pero **ningún
archivo del cliente que sostiene el contrato de rutas está en la lista**, y
el guardián clasifica `client` como LOW salvo que el nombre del archivo
contenga `auth` o `login`:

```js
if (zone === "client") {
  if (filename.includes("auth") || filename.includes("login")) { ... MEDIUM }
}
```

Por tanto, un PR que toque `client/src/App.jsx` o `client/src/navigation/model.jsx`
—los dos archivos que **deciden qué pantalla
existe y dónde se entra**— se reporta como **LOW** y **no bloquea**. Lo mismo
con `client/src/services/apiClient.js` o `client/src/services/authStorage.js`:
son el punto de fallo nº1 y nº6 por fan-in, y el guardián los puntúa LOW.

**Arreglo**: añadir a `RUTAS_CRITICAS` (o a una nueva lista `RUTAS_CONTRATO`)
`client/src/App.jsx`, `client/src/navigation/model.jsx`,
`client/src/services/apiClient.js` y `client/src/services/authStorage.js`, con
su razón. El propio repositorio tiene el patrón para documentarlo
(`guardian/test/riskEvaluator.test.js`).

### 5.3 — P1 · `mediaUrl()` tiene un `localhost` de reserva

`client/src/services/mediaUrl.js` (14 líneas, fan-in 23) hace:

```js
origin = typeof window !== "undefined" && window?.location?.origin
    ? window.location.origin
    : "http://localhost:3000"
```

Fuera del navegador (SSR, un worker, o `window`Defined pero sin `location`)
las URLs de media se construyen contra `http://localhost:3000`. En el
navegador real nunca se dispara, porque `window.location.origin` siempre
existe — **pero** es exactamente el patrón que `client/src/services/apiUrl.js`
prohíbe deliberadamente en el lado de la API («Nunca a localhost, que solo
existe en la máquina de quien programa»). La incoherencia entre ambos módulos
es el riesgo: alguien que aplique la regla de `apiUrl.js` a `mediaUrl.js` (o
al revés) sin leer el otro módulo puede introducir una URL que no existe fuera
de su máquina.

**Arreglo**: que `mediaUrl()` derive el origen de la misma fuente que
`apiUrl.js` (`resolveApiUrl` + `currentHostname`), sin un literal de
localhost.

### 5.4 — P1 · Dos fuentes de verdad de rutas y un desajuste de prefijos

Para añadir una pantalla hay que tocar **dos** sitios:

1. `client/src/App.jsx` → el `<Route>`.
2. `client/src/navigation/model.jsx` → `NAV_GROUPS` (y `SECTION_LABELS` si
   produce sección nueva, y `NAV_EMOJIS` si necesita emoji).

Los dos **están** cubiertos por tests bidireccionales
(`navigation-3d.spec.jsx`): si se edita `App.jsx` sin `model.jsx` la suite
falla; si se edita `model.jsx` sin `App.jsx`, el destino queda muerto en el
router y el mismo test lo detecta. El mapa está **bien protegido**.

> **Resuelto en el refactor de interfaz**: antes eran cuatro sitios (se
> añadían `lib/screenIndex.js` y `npm run docs:routes`). El demo de pantallas
> se retiró y el documento de rutas se escribe a mano, así que ya no hay una
> tercera capa que pueda desincronizarse ni una puerta manual que abrir.

Lo que sí sigue frágil: **`getCurrentSection()` no es verificable contra el
router**. Es una función de *prefix matching* escrita a mano
(`p.startsWith("/pulse") → "pulse"`), y una ruta nueva cuya URL comparta
prefijo con otra hereda su sección. Ejemplo real: `/settings/security`
redirige a `/moderation`, pero `getCurrentSection("/settings/security")`
devuelve `"settings"` y `getCurrentSection("/moderation")` devuelve
`"moderation"` — la etiqueta del topbar durante la redirección es la de la
sección de origen, no la de destino. Menor, pero es el tipo de desajuste que
esta arquitectura no tiene dónde declararse.

**Arreglo**: derivar `getCurrentSection()` de la misma tabla de rutas que
`App.jsx`, en lugar de mantener un segundo mapa de prefijos escrito a mano.

### 5.5 — P1 · 188 pruebas del servidor (24 %) no se ejecutan sin credencial

`server/test/` tiene **100 archivos**. Resultado real de la ejecución:

```
# tests 767   # pass 581   # fail 0   # skipped 186
```

Las 186 omitidas son las e2e que exigen `KRONOS_E2E_MONGODB_URI` real. En un
entorno sin esa variable, **la cuarta parte de la suite nunca se ejecuta** y
el resultado sigue verde (`fail 0`). Los flujos con base de datos real —
sesiones, publicaciones, moderación, cápsulas, analítica — son precisamente
los de mayor riesgo.

**Arreglo**: en la CI, exponer `KRONOS_E2E_MONGODB_URI` (Atlas test) como
secreto de solo lectura, o al menos hacer que la CI **falle visiblemente**
cuando hay tests omitidos, en lugar de reportar verde.

### 5.6 — P2 · Acoplamiento por duplicación: `durableUploads` ↔ `storage`

`server/src/config/durableUploads.js` replica el contrato de nombres de
`server/src/config/storage.js` con una regex propia:

```js
const SAFE_NAME =
  /^(media|avatars|covers|music|voices)\/\d+-[a-f0-9]+\.(jpg|png|webp|mp4|webm|mov|mp3|m4a|aac|wav|ogg|opus|weba|bin)$/;
```

El propio archivo lo admite: «Esta lista y aquella función tienen que ir de
la mano». Hoy hay una prueba de contrato que enumera las combinaciones reales
(`durable-uploads.contract.test.js`), lo cual mitiga el riesgo. Pero sigue
habiendo **dos fuentes** para una regla que, si divergen, produce pérdida de
datos (503 + borrado del archivo local).

**Arreglo**: exportar la lista de carpetas/extensiones de `storage.js` y
construir la regex a partir de ella, de modo que no pueda divergir.

### 5.7 — P2 · `barrido-utilidades` solo detecta el código muerto en una dirección

`scripts/ci/barrido-utilidades.mjs --estricto` falla si hay una clase
**usada en el código que no existe en el CSS construido** (clase inerte: se ve
pero no hace nada). Es una comprobación excelente.

Lo que **no** hace es lo contrario: `docs/CODIGO-SIN-USO.md` reporta **86
clases CSS definidas y sin uso** y **15 archivos que nadie importa** (2 de los
cuales — `DesignPreview.jsx` y `NanoScene.jsx` — están en el árbol desde
commit `e730528` y siguen ahí). Nada en la CI impide que esa deuda crezca.

**Arreglo**: añadir al barrido un segundo modo (`--huerfanas`) que liste y
opcionalmente falle con clases y archivos huérfanos, con una lista blanca
explícita para lo que sí se quiere conservar.

### 5.8 — P2 · Sin tests de las rutas de error del shell

El `*` dentro de la sesión devuelve `NotFound` y el `*` fuera devuelve
`AnonymousPathRedirect`. El segundo es el que **conserva la URL intentada** en
`state.from` para que `Auth` devuelva al usuario a su destino tras iniciar
sesión. La paridad con `ProtectedRoute` (que ya lo hacía con `state.from`) está
comentada y es correcta, pero **no hay prueba que la selle**: un cambio en
`Auth.jsx` que deje de leer `state.from` devolvería al usuario a `/home` en
silencio — exactamente el tipo de enlace roto que el propio repo registra
como incidente ya ([] `/stories/archive`).

**Arreglo**: un test en `client/test-ui/` que abra una ruta protegida sin
sesión, complete el login y compruebe que vuelve a la ruta original.

---

## 6. Lo que el repo hace bien y conviene no romper

1. **Fail-closed por defecto.** `config/environment.js` clasifica como
   producción *todo* valor de `NODE_ENV` que no sea `development` o `test`,
   incluidos `undefined`, `Production`, `prod` o `live`. Ninguna función de
   ese módulo lleva parámetro por defecto, a propósito: un default no
   distingue «no me pasaron nada» de «me pasaron undefined».
2. **Contraseña, no adornos.** Cero `dangerouslySetInnerHTML`, cero
   `.innerHTML`, cero `eval`/`new Function`, cero `console.log` en
   `client/src`, cero `TODO`/`FIXME` en cliente y servidor.
3. **Una sola política de sesión.** `apiClient.js` es el único interceptor;
   `useAppSession` se suscribe a sus eventos en vez de duplicar lógica (el
   comentario del código explica por qué un interceptor propio nunca se
   ejecutaba: el de `apiClient` corría primero y ya había borrado el token).
4. **Un solo vuelo de refresh.** `refreshFlight` + `sessionRevision` evitan
   que dos peticiones simultáneas roten el refresh a la vez (lo que el backend
   interpretaría como reutilización y cerraría la familia completa).
5. **División de código por ruta.** Todas las pantallas son `lazy()`; solo
   login y 404 viajan en la entrada, y `check-client-bundle.mjs` falla si el
   motor 3D se precarga.
6. **Contratos verificados.** `barrido-utilidades`, `check-client-bundle`,
   `environment.contract.test.js`, `durable-uploads.contract.test.js`,
   `e2e-target-guard.test.js`, `navigation-3d.spec.jsx` y
   `css-cascade.test.mjs` (que comprueba que **no exista capa de
   prioridades**: cada hoja es dueña de sus reglas).

---

## 7. Plan de acción priorizado

### P0 — antes de tocar nada más

| # | Acción | Archivos | Por qué |
|---|---|---|---|
| 1 | Aplicar los feature flags en servidor y router, no solo en el menú | `server/src/config/featureFlags.js`, `server/src/http/registerRoutes.js`, `client/src/App.jsx`, `client/src/navigation/useNavFlags.js` | Un apagado que no apaga es peor que no tener el flag (§5.1) |
| 2 | Añadir el contrato de rutas a las rutas críticas del guardián | `guardian/src/riskEvaluator.js`, `guardian/test/riskEvaluator.test.js` | `App.jsx`, `model.jsx`, `apiClient.js` y `authStorage.js` hoy no bloquean un merge (§5.2) |
| 3 | Declarar el interruptor que falta para Círculos, En vivo y Audio | `client/src/navigation/model.jsx`, `server/src/config/featureFlags.js` | 3 pantallas sin ningún flag detrás (§5.1) |

### P1 — siguiente iteración

| # | Acción | Archivos |
|---|---|---|
| 4 | Derivar `getCurrentSection()` de la tabla de rutas en vez de un segundo mapa de prefijos | `client/src/navigation/model.jsx` (§5.4) |
| 5 | Eliminar el `localhost` de reserva de `mediaUrl()` y unificar el origen con `apiUrl.js` | `client/src/services/mediaUrl.js` (§5.3) |
| 6 | Ejecutar las 186 e2e en CI (o hacer visible el `skipped`) | `.github/workflows/ci.yml` (§5.5) |
| 7 | Probar que el login devuelve al usuario a la URL intentada | `client/test-ui/` (§5.8) |

### P2 — higiene

| # | Acción | Archivos |
|---|---|---|
| 8 | Exportar carpetas/extensiones desde `storage.js` y derivar la regex de `durableUploads` | `server/src/config/storage.js`, `durableUploads.js` (§5.6) |
| 9 | Añadir modo `--huerfanas` al barrido y cerrar la deuda de `docs/CODIGO-SIN-USO.md` | `scripts/ci/barrido-utilidades.mjs` (§5.7) |
| 10 | Partir `MediaStudio.jsx` (1327) y `CreatePost.jsx` (1216) por sub-sistema | `client/src/components/media/`, `client/src/features/social/` (§4) |

---

## 8. Comandos ejecutados (reproducible)

```bash
npm ci                                        # 601 paquetes
npm run lint                                  # cliente + servidor + scripts + guardian, 0 warnings
npm test --workspace=client                   # 71 pruebas node:test + 453 vitest, 0 fallos
npm test --workspace=server                   # 767 pruebas: 581 pass / 0 fail / 186 skipped
npm test --prefix=guardian                    # 8 pruebas, 0 fallos
npm run build                                 # "Bundle OK ... sin motor 3D precargado"
```

Además, para el mapa de acoplamiento: grafo de importaciones construido sobre
`client/src`, `server/src`, `guardian/src` y `scripts` (855 aristas), con
detección de ciclos por DFS y extracción de las declaraciones `<Route>` de
`App.jsx` contrastadas contra `navigation/model.jsx`.

Para el plegado de los estilos encimados se comparó, regla a regla, cada
selector y propiedad de la antigua hoja `priority.css` con el árbol CSS
completo: las 16 reglas que dejaron de existir son exactamente las de la
navegación (bordes y descripciones), que el refactor eliminó a propósito.

Para la consolidación en una sola hoja se hizo la misma comprobación, pero
completa: se reconstruyó la cascada original (el orden real de `@import`,
incluidos los anidados de `kronos-system/index.css`) y se comparó, para cada
selector y cada propiedad, el valor que ganaba antes con el que gana ahora.
**Cero diferencias de valor y cero propiedades perdidas**; lo único que
desaparece son 273 reglas cuya clase no usa nadie. Además se comprobó que
**ninguna clase usada en el JSX** se quedó sin estilo, y que el orden de la
cascada (la identidad al final) no altera el resultado: en los 57.777 pares
de reglas comparados, el orden no cambia ni un solo valor ganador.

---

## 9. Documentos relacionados

- [`RUTAS-Y-NAVEGACION.md`](RUTAS-Y-NAVEGACION.md) — directorio de rutas
  escrito a mano; la fuente de verdad son `App.jsx` y `navigation/model.jsx`.
- [`LIMITES-Y-DEUDA.md`](LIMITES-Y-DEUDA.md) — límites de diseño conocidos.
- [`CODIGO-SIN-USO.md`](CODIGO-SIN-USO.md) — código y clases que nadie usa.
- [`PLANO-KRONOS.md`](PLANO-KRONOS.md) — plano maestro por fases.
- [`client/PLANO-INTERFAZ-KRONOS.md`](client/PLANO-INTERFAZ-KRONOS.md) — plano de interfaz.
