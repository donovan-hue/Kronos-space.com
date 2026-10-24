# PLANO KRONOS — estado real y cierre

**21 octubre 2026 · rama `arena/0e06e12c-kronos-space-com` · integración en `main` pendiente.**

## Corrección tras los fallos de CI del PR #66

Las 49 pruebas de navegador del cierre anterior **eran un subconjunto**, no
la suite completa que ejecuta GitHub. Los checks fallidos aportados por el
propietario son [CI 39638639270](https://github.com/donovan-hue/Kronos-space.com/actions/runs/39638639270)
y [post-deploy 39638463073](https://github.com/donovan-hue/Kronos-space.com/actions/runs/39638463073).

| Problema | Corrección y evidencia |
|---|---|
| Auditoría bloqueada por dependencias vulnerables | ✅ Vite **7.3.7** y follow-redirects **1.16.1**; `npm run audit:dependencies`: **0 vulnerabilidades** en app y Guardian. No se rebaja el umbral. |
| Pruebas de 59 fichas, Proyectos informativo y páginas retiradas | ✅ Se comprueba el catálogo vigente, se crea un proyecto por su API simulada y se abre el tablero; las URLs retiradas dan 404 y sus capas siguen funcionando con teclado. |
| Prueba que intentaba pulsar el botón de movimiento retirado | ✅ Se comprueba movimiento por defecto, ausencia del botón, reloj sincronizado y compatibilidad de preferencias antiguas; no se restaura el botón. |
| Clasificador ausente en el checkout de `main` | ✅ Respaldo inmutable y mínimo para el `main` anterior conocido; las revisiones desconocidas fallan. Sin código arbitrario del evento ni secretos de producción. |
| Comprobación completa de navegador | ✅ **96/96 locales**. GitHub confirmó **95/96** en `62c45ca`: una lectura inmediata tras activar colores forzados falló; se mantiene la exigencia y se espera al estilo real (30/30 repeticiones locales). |
| Diagnósticos remotos poco útiles | ✅ Anotaciones de Playwright y de fallos del sondeo en los checks, sin convertir contenido HTTP en comandos de Actions. |

La comprobación HTTP real de cada preview conserva sus controles: 401/403,
CORS bloqueado o recursos rotos siguen siendo fallos, no se disfrazan de éxito.
El resultado remoto se consulta en los checks del [PR #66](https://github.com/donovan-hue/Kronos-space.com/pull/66).

**Resultado remoto observado en `62c45ca`:** `validate`, Guardian y los dos E2E
(MongoDB local y Atlas) pasaron. El post-deploy ya pudo ejecutar el sondeo:
la preview redirige a otro origen y la API no devuelve ACAO para su origen ni
para el preflight de login. **No está certificada.** La lista CORS de la API
sale de `CLIENT_URL`; no se ha ampliado, ni se ha desactivado protección alguna.
Se añade un diagnóstico del origen de destino, sin publicar parámetros de acceso.

La siguiente ejecución (`2d2d935`) confirmó colores forzados y dejó un único
fallo de sincronización al abrir búsqueda durante el cambio 404 → Inicio.
Se espera ahora la cabecera real de Inicio antes del atajo y se escribe en el
buscador para comprobar que permanece abierto: **60/60 repeticiones locales**
(20 por herramienta). No se reintroducen rutas retiradas ni se relajan asserts.
El sondeo confirmó el destino **`https://vercel.com`**; producción fue verificada
correctamente en **Cloudflare**. La configuración de Vercel y el CORS de la API
siguen sin modificarse y requieren revisar la política de previews con el propietario.

## 1. Problemas revisados, uno por línea

| Problema | Estado | Qué quedó realmente |
|---|---|---|
| Deploys de preview omitidos en GitHub | ✅ Código corregido | Se verifica la URL de esa preview; producción conserva su dominio y su cola independiente. |
| Confundir verificación con despliegue | ✅ Aclarado | El workflow verifica; Vercel/Render despliegan mediante su integración Git. |
| Pulso confundía vacío/error con sesión terminada | ✅ Corregido | Carga, error con reintento, vacío y sesión completada son estados separados. |
| Bienvenida fingía guardar tras un rechazo del servidor | ✅ Corregido | Conserva elecciones, muestra el error y permite reintentar; no marca éxito local ficticio. |
| Pie de la bienvenida difícil de alcanzar en móvil | ✅ Corregido | Pie sticky, botones de 44 px y desplazamiento de los cuatro pasos comprobado. |
| Pantalla compartida de En vivo existía solo en backend | ✅ Construida | Selector real del navegador antes de crear sala; invitados no comparten su escritorio. |
| En vivo sin controles propios de captura | ✅ Construido | Silenciar micrófono y apagar cámara modifican las pistas reales, no solo el texto. |
| En vivo podía quedar abierto visualmente tras fallar el cierre | ✅ Corregido | Detiene pistas, cierra la vista y ofrece reintentar la confirmación del servidor. |
| En vivo confundía fallo de listado con ninguna sala | ✅ Corregido | Error de carga con reintento; vacío solo después de una respuesta correcta. |
| Notificaciones sin indicación textual de lectura | ✅ Corregido | «Sin leer» / «Leída», fecha semántica y estado accesible. |
| Contador de notificaciones incoherente entre páginas/filtros | ✅ Corregido | Marcar en página 2+ descuenta una vez; otros filtros revalidan su contador global. |
| Destinos de notificación podían terminar en `/undefined` | ✅ Corregido | Post por ID u objeto, cápsulas y perfiles canónicos con destinos válidos. |
| Apoyo ajeno sin enlace visible a su página | ✅ Corregido | «Página de apoyo» desde el perfil; el modal «Apoyar» se conserva. |
| `/settings/profile` tratado como función incompleta | ✅ Diagnóstico corregido | Es un alias a `/settings#privacy`; eliminado el archivo que solo repetía `Navigate`. |
| Fichas de funciones supuestamente inaccesibles | ✅ Diagnóstico corregido | El demo de pantallas se retiró: la navegación real es el modelo de destinos y `docs/RUTAS-Y-NAVEGACION.md`. |
| 404 con estilos en línea y sin título principal | ✅ Corregido | Un `h1`, estilos compartidos y salidas a Inicio/Explorar. |
| Generador seguía diciendo que faltaban Proyectos/Versiones/Plantillas | ✅ Corregido | Las tres herramientas constan como construidas; documento regenerado y comprobado. |
| Estilos encimados y anchos rivales | ✅ Cerrado | Shell con un dueño geométrico, límites por familia y overlays fuera del contenedor animado. |
| CSS faltante en pantallas | ✅ Cerrado | Biblioteca, Jobs, guion, historial, ajustes, perfil, encuestas y eventos tienen estructura (Canales se retiró con Órbitas). |
| Cascada CSS con 316 `!important` | ✅ Consolidada | Una entrada, cinco capas declaradas; quedan 24 excepciones justificadas de accesibilidad. La capa `priority` ya no existe: cada regla vive en su hoja de origen. |
| Doble centrado de diálogos al optimizar CSS | ✅ Corregido | Un solo mecanismo de centrado; conservadas las pruebas originales de posición y foco. |
| Código/estilos redundantes revisados | ✅ Retirados | 196 declaraciones tapadas, 18 reglas vacías y 12 atributos `style` más; import sin uso retirado. |
| Google / botón de movimiento | ✅ Conservado lo acordado | Google visible con su acción; sin botón flotante de movimiento, con la función intacta. |

**No confundir estos ✅ con un despliegue publicado ni con la aprobación de un rediseño visual.**

## 2. Qué significa «existe sin camino»

Significa que había código y una URL, pero ningún botón o enlace normal llevaba
allí. **No significa que la función estuviera necesariamente sin construir.**
Las cuatro marcas del reporte anterior ya no describen el estado actual:

| Dirección | Camino actual | Interpretación correcta |
|---|---|---|
| `/support` | Perfil propio → **Mis apoyos** | Historial privado de apoyos recibidos/enviados. |
| `/support/:userId` | Perfil ajeno → **Página de apoyo**; también ficha del directorio | Página compartible; no sustituye al modal rápido «Apoyar». |
| `/settings/profile` | Directorio → **Privacidad de la cuenta**; Configuración → Privacidad | Alias que abre `/settings#privacy`; no otra pantalla pendiente. |
| `/funciones/:featureId` | **Funciones / Todas las pantallas** → ficha correspondiente | Las rutas parametrizadas piden un recurso real o permiten buscarlo. |

| Lo que existe | Situación real |
|---|---|
| Proyectos, Versiones/comparador A/B y Plantillas | Construidos; servicios cliente y 7 endpoints protegidos de `/api/projects`. |
| Audio | Dos tareas: `/kairos/audio` para locución y `/kairos/catalogs` para catálogo filtrado. |
| Feed de una órbita | Reutiliza el feed con contexto de comunidad; compartir componente no es estar a medias. |
| Cápsulas | Estados, contador y apertura existen; no hacía falta inventar otra pantalla para «Sellada». |
| Administración | Tarjetas existentes, protegidas por rol; no era una tabla rota. |
| `k-error-icon` | Ya está definido en `auth-refresh.css`; se retira la marca antigua de CSS faltante. |
| Mapa, buscador, atajos, visores e historias | Capas con disparadores reales; no necesitan páginas duplicadas. |
| Federación y Webhooks | **Dos fichas de infraestructura**, no paneles de usuario. La bandeja federada sigue sin procesar entradas (`501`). |
| Rutas propuestas para cada sala/canal/círculo, etc. | Ideas del plano inicial, no funciones anunciadas como construidas ni nuevas rutas aplicadas sin decisión. |

**Inventario comprobado:** 67 declaraciones de ruta, incluyendo alias y comodines;
53 fichas: 42 visibles, 9 apagables según configuración y 2 de infraestructura.
**0 fichas «Próximamente» y 0 fichas «Escondido».** No son 53 pantallas independientes.
El detalle de direcciones está en [RUTAS-Y-NAVEGACION.md](./RUTAS-Y-NAVEGACION.md).

## 3. CSS: qué se consolidó y qué no se inventó

| Medida | Antes de esta limpieza | Ahora |
|---|---|---|
| Entradas de estilos de app/demo | Listas separadas | **Una:** `styles/app.css` compartida |
| Orden de cascada | Capas del motor + estilos sin capa + prioridades forzadas | `theme → base → components → utilities → kronos` (la capa `priority` se retiró: cada regla vive en su hoja de origen) |
| `!important` | 316 | **24**, todos en guardas de movimiento reducido/colores forzados |
| Hojas fuente | 43 | **45**: se añaden entrada y prioridad; los módulos siguen separados por responsabilidad |
| Peso fuente, incluidos 2 experimentos | 333 431 B | **326 693 B** (−6 738 B en esta ronda) |
| Reglas AST | 2 099 | **2 125**; las capas explícitas y estados nuevos no se presentan como menos reglas |
| Declaraciones inferiores tapadas por la prioridad | Sin retirar | **196 retiradas**, además de 18 reglas vacías |
| Estilos estáticos en línea retirados en bloques auditados | 44 en la fase anterior | **56 acumulados**, incluidos apoyo y 404 |
| Clases `k-*` literales sin CSS | Auditoría antigua desactualizada | **0 sin justificar**; 3 hooks documentados, no un censo exhaustivo de clases dinámicas |

- **Seis capas no significa seis archivos.** Se conserva la modularidad y un único orden de carga; Tailwind puede emitir su capa interna `properties`.
- `fan-nav.css` mantiene el ancho del shell; el reset queda en `base`, no anidado en `kronos`.
- Se compararon estilos computados de **100 estados** a 390/1280 px. Reloj, blobs y órbitas tienen valores dinámicos; un degradiente perdió un `50%` redundante sin cambiar su resultado.
- La prueba de geometría completa detectó una **doble traslación en diálogos** que esa comparación no cubría. Se corrigió quitando las utilidades redundantes; después pasaron los 49 ensayos seleccionados de aquella fase; ahora también pasan los 96 de la suite completa. No se retiraron sus comprobaciones.
- La reducción de peso es frente al inicio de esta ronda. Frente al commit base hay CSS nuevo necesario para pantallas que carecían de estructura; **no se vende como reducción global respecto a HEAD**.
- Reglas de mantenimiento: [styles/README.md](../client/src/styles/README.md).

## 4. GitHub: omitidos corregidos sin fabricar verde

| Caso | Comportamiento preparado |
|---|---|
| Production exitoso | Verifica `https://kronos-space.com`, API compartida y CORS de apex/www. |
| Preview exitoso | Verifica **su `environment_url` de Vercel**, su bundle y el CORS de ese origen. No consulta producción como sustituto del frontend. |
| API de preview | **No se inventó un backend separado:** sigue siendo `https://api.kronos-space.com`. |
| URL ajena o ausente / entorno desconocido | Falla la clasificación, no certifica otro entorno. |
| Preview protegida 401/403, bundle roto/HTML, redirección de origen o CORS bloqueado | Falla con evidencia; no se evaden protecciones ni se amplía CORS para aparentar éxito. |
| Estado de deployment todavía no exitoso | No se certifica como sano; esa omisión es correcta. |
| Paso de instrucciones de reversión omitido en una ejecución sana | Correcto: solo tiene sentido cuando hay un fallo. |
| Seguridad | Checkout confiable de la rama predeterminada en eventos automáticos; permisos de lectura, sin secretos ni escrituras de prueba. |
| Arranque del workflow automático | Prefiere `main`; solo el `main` inicial `0c95fc0` sin scripts usa el respaldo fijo revisado `b0b6283`. Después de integrar se usa `main` sin respaldo. |

Archivo: `.github/workflows/deploy-verify.yml` · clasificador:
`scripts/ci/deployment-target.js` · sondeo: `scripts/verify-deploy.sh`.
La primera integración tiene un respaldo inmutable acotado al HEAD anterior;
no se ejecutan los scripts de cualquier rama/SHA indicado por un deployment.
Los registros históricos no se reescriben: la [preview omitida revisada](https://github.com/donovan-hue/Kronos-space.com/actions/runs/39385193844)
correspondía a la guarda anterior; la [verificación de producción consultada](https://github.com/donovan-hue/Kronos-space.com/actions/runs/39395997781)
sí había pasado. No se forzó un nuevo despliegue.

## 5. Validación local y alcance

| Comando / comprobación | Resultado |
|---|---|
| `npm run build` | ✅ 84 chunks JS; máximo 418 630 B; 6 iniciales sin 3D precargado |
| `npm run audit:dependencies` / `npm ls --all` | ✅ 0 vulnerabilidades, incluido desarrollo y Guardian; árbol válido |
| `npm run lint` | ✅ Cliente, servidor, scripts y Guardian sin avisos |
| `node scripts/ci/barrido-utilidades.mjs --estricto` | ✅ 0 utilidades inertes; guardas de cascada conservadas |
| `npm test -w client` | ✅ **70 contratos + 375 pruebas UI**, 58 archivos UI |
| `npm test -w server` | ✅ **583 pass / 185 skip / 0 fail**; los skip no se cuentan como aprobados |
| `CI=1 KRONOS_BROWSER_PRODUCTION=1 npm run test:browser -w client` | ✅ **96/96**, suite completa de 12 archivos, app + design-preview |
| Contratos de despliegue | ✅ 24 del clasificador + 8 del sondeo HTTP local + 12 de workflows; incluidos en la suite de servidor |
| YAML / shell / documentación | ✅ 7 workflows parseados; `bash -n`; generador de rutas `--check`; `git diff --check` |

**Cobertura y límites:** 25 rutas × 9 anchos (320–1920), otras 7 × 3,
overlays, foco, Publicar, acceso/recuperación, privacidad, apoyos, bienvenida y
En vivo. API, socket y permisos de captura se simulan; las pistas de la prueba
browser son `MediaStreamTrack` del navegador. **No se certificaron proveedores
externos, una llamada entre redes reales, teclado físico de teléfono ni datos
de producción.** En vivo mantiene su límite WebRTC sin TURN: ciertas redes NAT
pueden impedir una conexión, y la interfaz no promete lo contrario.

## 6. Demo y límite visual acordado

```bash
npm run demo -w client
# http://localhost:3000 → /demo.html#/projects
```

La demo mantiene 3 proyectos y 2 versiones en memoria: lista, alta, tablero,
comparador y plantillas. No crea datos reales y se reinicia al recargar.
No intenta reproducir un MP3 inexistente. Usa la misma cascada que la app y
no entra en el build de producción.

| Lo siguiente | Estado |
|---|---|
| Integrar los cambios en `main` | Pendiente; el arranque con respaldo fijo no fusiona el PR ni despliega producción. |
| Rediseño negro profundo / metal líquido / burbujas transparentes, sin botones sólidos | **No aplicado:** necesita la demo visual y tu aprobación, como se acordó. |
| Propuestas de navegación extra del plano inicial | No se añadieron rutas ni funciones nuevas por suposición. |

## 7. Bitácora de cierre, continuación

| # | Problema cerrado | Estado | Archivo principal |
|---|---|---|---|
| 77 | Preview omitida por guarda exclusiva de Production | ✅ local | `deploy-verify.yml` |
| 78 | Verificar la URL real de preview sin aceptar otros proyectos ni sustituirla por producción | ✅ | `deployment-target.js` |
| 79 | No aceptar protección, HTML como JS, bundle HTTP incorrecto o redirección fuera de preview | ✅ | `verify-deploy.sh` |
| 80 | Unificar carga de estilos de app y demo en capas explícitas | ✅ | `styles/app.css` |
| 81 | Sustituir 292 prioridades de presentación y retirar 196 declaraciones tapadas | ✅ | `priority.css` + módulos |
| 82 | Mantener reset y utilidades sin encimarlos | ✅ | `tailwind.css`, `css-cascade.test.mjs` |
| 83 | Conservar filtros al compilar sus prefijos y declaración estándar | ✅ | CSS + prueba de navegador |
| 84 | Separar carga/error/vacío/final en Pulso | ✅ | `Pulse.jsx` |
| 85 | No simular preferencias guardadas y mantener pie móvil alcanzable | ✅ | `Onboarding.jsx`, `design-system.css` |
| 86 | Estados, contador y destinos reales de notificaciones | ✅ | `Notifications.jsx`, `useNotifications.js` |
| 87 | Abrir la página compartible de apoyo desde el perfil | ✅ | `Profile.jsx` |
| 88 | Retirar wrapper redundante de privacidad y aclarar el alias | ✅ | `App.jsx`, `screenIndex.js` |
| 89 | Corregir salida del directorio y completar el 404 semántico | ✅ | `FeatureDetail.jsx`, `NotFound.jsx` |
| 90 | Quitar 12 estilos estáticos en línea y una rama de importe inaccesible | ✅ | `SupportDialog.jsx`, `NotFound.jsx` |
| 91 | Implementar pantalla compartida y controles de pistas sin capturas involuntarias | ✅ | `Live.jsx`, `liveMedia.js` |
| 92 | Liberar captura al cancelar, desmontar o fallar; permitir reintentar el cierre | ✅ | `Live.jsx` + 12 pruebas UI |
| 93 | Regenerar rutas y retirar diagnósticos obsoletos del reporte | ✅ | generador + documentación |
| 94 | Corregir doble centrado encontrado por la suite completa, sin relajar sus asserts | ✅ | `dialog.jsx`, `design-system.css` |
| 95 | Ejecutar build, lint, suites y 49 pruebas de navegador después de la corrección | ✅ subconjunto, no CI completo | resultados de §5 |
| 96 | Actualizar las dos dependencias vulnerables sin desactivar la auditoría | ✅ | `client/package.json`, `package-lock.json` |
| 97 | Actualizar pruebas obsoletas del directorio y del botón retirado; conservar pruebas funcionales | ✅ | `feature-directory`, `liquid-chrome` |
| 98 | Resolver el arranque del verificador antes de la primera integración y mejorar diagnósticos | ✅ | workflow + 11 contratos |
| 99 | Ejecutar la suite completa de navegador en modo CI/producción, además de auditoría, árbol, lint, barrido y tests Node | ✅ local | 96 browser; 375 UI + 70 contratos; servidor 583 pass/185 skip |
| 100 | Esperar la aplicación real de colores forzados, sin aceptar texto transparente ni relajar el contraste | ✅ 30/30 repeticiones | `completion-regression.spec.js` |
| 101 | Señalar la redirección y el CORS reales de la preview sin forzar un verde | ⚠️ Configuración pendiente de decisión | anotaciones del post-deploy |
| 102 | Esperar al montaje de Inicio antes de probar las capas; comprobar escritura real en búsqueda | ✅ 60/60 repeticiones | `feature-directory.spec.js` |

<details>
<summary>Histórico 1–76: decisiones anteriores, incidentes revertidos y fases ya superadas</summary>

**Esto no es una lista de pendientes actuales.** Las filas tachadas describen
un intento revertido; las cifras de cada fase no sustituyen a las de §3 y §5.
Se conserva el registro para no dar por vigente una limpieza que se deshizo.

| # | Qué se hizo | Estado | Archivo |
|---|---|---|---|
| 1 | Revisado el botón de Google: **ya existía** y está conectado a `POST /api/auth/google` | ✅ | `Auth.jsx` |
| 2 | El botón de Google ahora **siempre se ve** en acceso; sin `GOOGLE_CLIENT_ID` aparece desactivado y explicado (antes se ocultaba) | ✅ | `Auth.jsx:488`, `Auth.jsx:694` |
| 3 | Eliminado el botón flotante «Movimiento en bucle» de abajo a la derecha en la primera pantalla | ✅ | `Auth.jsx:718` |
| 4 | La **función** de movimiento sigue intacta (no se tocó la librería) | ✅ | `lib/motionPreference.js` |
| 5 | **`/users`** ahora redirige a **`/explore`** (se queda la del menú) | ✅ | `App.jsx:156` |
| 6 | **`/u/:username`** ahora redirige a **`/profile/:username`** | ✅ | `App.jsx:69,159` |
| 7 | **`/settings/security`** ahora redirige a **`/moderation`** | ✅ | `App.jsx:168` |
| 8 | Enlace de Administración corregido a `/moderation` | ✅ | `AdminCenter.jsx:66` |
| 9 | Índice de pantallas sin duplicados: `/users` y `/settings/security` pasan a alias | ✅ | `screenIndex.js` |
| 10 | **Audio** queda en 2 pantallas por tarea: `/kairos/audio` (generar) y `/kairos/catalogs` (catálogo) | ✅ | `AudioTools.jsx` |
| 11 | Catálogo con filtro **Todo / Voces / Música** y contadores | ✅ | `AudioTools.jsx` |
| 12 | Menú: una sola entrada **«Multimedia IA · audio, voces y música»** | ✅ | `navigation/model.jsx` |
| 13 | Pestañas Locución / Voces con `aria-current` | ✅ | `AudioTools.jsx` |
| 14 | ~~**Limpieza**: 123 reglas de clases que nadie usa, eliminadas~~ — revertido en 46 | ❌ | 16 hojas CSS |
| 15 | ~~**9 `@keyframes`** huérfanos eliminados (`kronos-spin`, `k-sign-*`, `k-chrome-sweep`, `sway`…)~~ — revertido en 46 | ❌ | 7 hojas |
| 16 | ~~**80 variables** sin uso eliminadas (de 231 quedan 151)~~ — revertido en 46 | ❌ | 7 hojas |
| 17 | ~~`kronos-system/10-utilities.css` eliminada (era 100 % muerta) y su `@import`~~ — revertido en 46 | ❌ | `index.css` |
| 18 | ~~CSS: 42 → **41 hojas** · 301.9 → **278.0 kB** · 1 919 → **1 761 reglas**~~ — revertido en 46 | ❌ | — |
| 19 | ⚠️ **Incidente corregido**: la limpieza de variables rompió el `@theme inline` de `tailwind.css`. Detectado y **revertido** antes de seguir | ✅ | `tailwind.css` |
| 20 | Verificado: los **20 tokens** que usa Tailwind siguen definidos (bg, border, chrome, radius, shadow…) | ✅ | — |
| 21 | ~~Confirmado: las **41 hojas compilan** sin error (esbuild)~~ — revertido en 46 | ❌ | — |
| 22 | ~~16 reglas muertas más dentro de `@media` + 3 bloques vacíos~~ — revertido en 46 | ❌ | 6 hojas |
| 23 | ~~11 selectores muertos retirados de listas compartidas (sin tocar los vivos)~~ — revertido en 46 | ❌ | 3 hojas |
| 24 | ~~**Total limpieza:** 150 reglas, 9 animaciones, 80 variables, 1 hoja; **301.9 → 278.0 kB** (−23.9 kB)~~ — revertido en 46 | ❌ | — |
| 25 | **Retiradas las 3 páginas que solo repetían un modal**: `/mapa`, `/atajos`, `/busqueda` (siguen abriéndose con `G`, `?` y `⌘K`) | ✅ | `App.jsx`, `NavigationTool.jsx` eliminado |
| 26 | **`/support` se conserva** y ahora se enlaza desde el perfil propio como **«Mis apoyos»** (antes era inalcanzable) | ✅ | `Profile.jsx`, `App.jsx` |
| 27 | **`/support/:userId` se conserva**: es el único enlace compartible para apoyar a alguien | ✅ | `App.jsx` |
| 28 | Índice de pantallas sin las 3 fichas retiradas: 65 rutas, 49 fichas | ✅ | `screenIndex.js` |
| 29 | Ruta **`/no-encontrado` retirada**: el comodín `*` ya muestra la misma pantalla | ✅ | `App.jsx` |
| 30 | Ficha del índice y caso especial de sección eliminados | ✅ | `screenIndex.js`, `model.jsx` |
| 31 | **`MotionToggle.jsx` eliminado** (nadie lo importaba) + sus 4 reglas CSS | ✅ | `components/motion/`, `landing-void.css` |
| 32 | Verificado: la **función de movimiento sigue viva** (`main.jsx` aplica la preferencia, 23 reglas reaccionan a `data-k-motion`) | ✅ | `main.jsx`, `lib/motionPreference.js` |
| 33 | Recuento final: **64 rutas** · 48 fichas · 48 pantallas distintas | ✅ | — |
| 34 | **`/users/:id` pasa a alias** de `/profile/:id`: el perfil resuelve id o nombre en un solo parámetro | ✅ | `App.jsx`, `Profile.jsx` |
| 35 | ~~Eliminadas 137 declaraciones que perdían la cascada~~ **revertido en 46**: el análisis no veía los bloques completos que sí ganaban | ❌ | 11 hojas |
| 36 | ~~Eliminadas 18 reglas vacías~~ revertido junto con la 35 | ❌ | 8 hojas |
| 37 | ~~CSS 280,3 → 271,7 kB~~ — la cifra no se sostuvo: 35 rompía la cascada | ❌ | — |
| 38 | Revisión de `!important` aplazada en aquella fase; completada con capas y pruebas de producción en 80–83 y 94 | ✅ superado | `styles/app.css` |
| 39 | **Proyectos** desarrollado: `GET/POST /api/projects`, `GET/PATCH/DELETE /:id`, `POST /:id/versions`, `DELETE /:id/versions/:vid` (auth + `requireUser` + `validId`, 404 uniforme) | ✅ | 2 archivos nuevos + `registerRoutes.js` |
| 40 | **Tablero** con 3 pestañas por `?tab`: escenas (orden, guion, enlace de toma), música (`<audio>`) y versiones | ✅ | `ProjectBoard.jsx` |
| 41 | **Versiones y comparación** dentro del tablero: guardar con etiqueta, borrar, comparador A/B escena por escena con conteo de cambios | ✅ | máx. 30 versiones |
| 42 | **Plantillas de formato**: reel 9:16 (5 escenas), cuadrado 1:1 (3), portada 16:9 (3) → `/projects/plantillas` crea el proyecto ya prellenado | ✅ | `templates.js` + `TemplatesPage.jsx` |
| 43 | 3 rutas montadas en `App.jsx` (**67** en total), `projects.css` como hoja nueva, entrada «Proyectos» en el menú Kairos | ✅ | 0 `próximamente` en `screenIndex.js` |
| 44 | CSS: **43 hojas** · **300,8 kB** · **1 929 reglas** · **323 `!important`** (vuelve a la línea base + `projects.css`) | ✅ | la hoja nueva no usa `!important` |
| 45 | **Build real**: `npm ci` + `vite build` → falla por `::-webkit-scrollbar` sin cerrar (daño de la 35) | ❌ | detectado y corregido |
| 46 | **Limpieza CSS revertida entera** a HEAD: los tests de paridad y el build demostraron que el script borraba bloques que sí ganaban | ✅ | 23 hojas |
| 47 | Build `vite` **completo** en verde (12 s); el aviso de esbuild no sustituye al build real | ✅ | `dist/` |
| 48 | Corregido **bug de perfil**: un id que no es ObjectId (`owner`) se confundía con un nombre de usuario y perdía la pestaña privada | ✅ | `Profile.jsx` |
| 49 | Tests al día con lo decidido: atajos retirados, conmutador de movimiento retirado, fichas «Próximamente» ya construidas, 12 tarjetas en Kairos | ✅ | 6 archivos de test |
| 50 | **Suite completa en verde**: cliente **332/332** · servidor **541 pass / 0 fail** · `eslint --max-warnings=0` limpio | ✅ | — |
| 51 | Nuevo test de contrato de Proyectos: esquema, topes, 7 rutas con sesión y 404 uniforme | ✅ | `server/test/projects.contract.test.js` |
| 52 | `docs/RUTAS-Y-NAVEGACION.md` regenerado: **53 funciones, 2 fichas informativas** | ✅ | script `ci/` |
| 53 | **Demo local de las 3 pantallas** con datos de ejemplo y API en memoria, sin Mongo | ✅ | `client/demo/` + `vite.config.js` (modo `projects-demo`) |
| 54 | Se abre con `npm run demo -w client` → `http://localhost:3000` (la raíz redirige a la demo) | ✅ | `demo.html` |
| 55 | Demo con **12 pruebas de UI** (crear, guardar, ordenar, comparar A/B, plantillas) y 1 de humo de arranque | ✅ | `test-ui/projects.spec.jsx`, `test-ui/demo.spec.jsx` |
| 56 | Corregido `--k-text-2xl` inexistente en `projects.css` (el título no tenía tamaño) | ✅ | `projects.css:129` |
| 57 | **Capas**: 14 tokens globales; los números internos de historias/mapa siguen siendo locales, no son conflictos globales | ✅ | `design-tokens.css` + consumidores |
| 58 | **Mapa/overlays**: mapa y diálogos sobre su propio fondo (`1010 > 1000`); el `801` orbital queda aislado dentro del mapa | ✅ (mapa retirado en el refactor de interfaz) | `design-system.css` |
| 59 | **Alturas**: `.page` deja de sumar `100vh`; el shell reserva el alto medido de cabecera y barra, incluido safe-area | ✅ | `fan-nav.css`, `useShellMetrics.js` |
| 60 | **Teclado**: se usa `visualViewport` cuando existe, no se supone que `dvh` responde al teclado; onboarding permite crecer y desplazarse | ✅ | hook + `design-system.css` |
| 61 | **Diagnóstico corregido**: `min(100% - 24px, …)` sí es válido (comprobado con Chromium); fallaba el selector de hijo directo, no la sintaxis | ✅ | pruebas de navegador |
| 62 | **Anchos**: tokens 440 / 660 / 720 / 1040 / 1180; se retiran las reglas rivales 920/1080/1140 del shell | ✅ | `fan-nav.css`, `design-tokens.css` |
| 63 | **DOM real**: el ancho alcanza `.k-route-view > .page`; retirada la copia de ancho de `design-system` y `interface-density` | ✅ | `AppLayout.jsx`, 3 hojas |
| 64 | **Pantalla completa**: visor, estudio, historias y descarte van a `body`; retirado el `will-change` permanente que atrapaba los elementos fijos | ✅ | 5 componentes |
| 65 | **Aviso offline** dentro de la cabecera sticky; no tapa buscador/menú y su altura se vuelve a medir | ✅ | `AppLayout.jsx` |
| 66 | **Canales**: 13 clases con rejilla lista/hilo, formulario adaptable, mensajes con scroll y texto largo contenido | ✅ (la función se retiró con Órbitas) | `social-refresh.css` |
| 67 | **Encuestas/eventos**: opciones, resultados, acciones y campos con estructura; cierre de encuesta ya no desborda a 320 px | ✅ | `PostCard`/`CreatePost`, CSS social |
| 68 | **Kairos/Biblioteca/Jobs**: rejillas, filtros, historial, editor de guion, resultados y estados de trabajo diferenciados con texto/símbolos | ✅ | `media.css`, componentes |
| 69 | **Auth**: recuperación/verificación ya no heredan el héroe de login; verificación pasa de 15 estilos en línea a 0 | ✅ | `auth-refresh.css`, 3 pantallas |
| 70 | **Comentarios/compositor**: 13→1 y 30→13 estilos en línea; sangría limitada a 3 niveles; fechas y opciones adaptables | ✅ | `Comments.jsx`, `CreatePost.jsx` |
| 71 | **Estudio** usa `CreatePost embedded`: un único `h1`, sin página anidada ni cabecera repetida | ✅ | `StudioPage.jsx` |
| 72 | **Rejillas**: Círculos/Colecciones sin mínimos rígidos; Ajustes con `display:grid`; perfil 2 columnas móvil / 3 escritorio | ✅ | 5 hojas |
| 73 | **Limpieza verificada**: 16 reglas sin consumidor, 17 selectores y `k-reaction-show` retirados con parser; conservados prefijos dinámicos | ✅ | 3 hojas |
| 74 | **Grupos**: `finally` apaga «cargando» tanto en éxito como error; antes solo se apagaba al fallar | ✅ | `Conversations.jsx`, prueba real del hilo |
| 75 | **Regresión**: 6 pruebas de medidas/teclado + 5 contratos CSS + 17 pruebas de navegador nuevas; 23 existentes también verdes | ✅ | `shell-metrics`, `css-layout`, `layout-regression` |
| 76 | **Cierre verificado**: build de producción + presupuesto + lint + 351 UI + 65 contratos + servidor 545 pass/185 skip/0 fail | ✅ | comandos reproducibles en §4 |

</details>
