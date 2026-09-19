# KRONOS — AUDITORÍA UNIFICADA DE TODAS LAS SKILLS

**Fecha:** 2026-09-19 · **Rama:** `arena/01a0b7a5-kronos-space-com` · **Commit base:** `7993927`
**Ejecutado por:** KRONOS MASTER ORCHESTRATOR, activando en orden las 24 skills registradas en `.agents/skills/kronos-master-orchestrator/SKILL.md` (sección 22).
**Modo:** Solo lectura / auditoría. No se modificó ningún archivo de producto durante esta pasada (regla de las skills de auditoría: "no destructivo").

---

## 0. CÓMO LEER ESTE DOCUMENTO

Se activó **una skill a la vez**, en el orden que manda el Master Orchestrator (Project Context → Full Project Audit → Architecture Gate → dominios → Integration/Code Review → Reality Gates). Cada skill generó su propio mini-informe (secciones 2 a 20). La **sección 1** es el resumen ejecutivo que unifica todo, y es la que responde directamente a lo que pediste: diseño, estructura, botones duplicados/sobrantes, y el problema de "KRONOSPACE" repetido en cada pantalla.

Clasificación usada (protocolo `KRONOS ARCHITECT`):
`KEEP` (dejar igual) · `MONITOR` (vigilar) · `FIX` (corregir) · `REFACTOR` · `REDESIGN` · `MISSING` · `BLOCKER`.

---

## 1. RESUMEN EJECUTIVO (LO QUE MÁS TE IMPORTA)

### 1.1 El nombre "KRONOS / KRONOSPACE" aparece en casi todas las pantallas — confirmado

No es solo el logo de la barra superior. Cada pantalla del producto imprime una etiqueta tipo *"KRONOS / ALGO"* justo encima del título (`<p className="k-eyebrow">`). Esto se repite en **16 pantallas distintas**:

| Pantalla | Texto repetido |
|---|---|
| Feed (`/home`) | `KRONOS / SOCIAL` |
| Mensajes (`/messages`) | `KRONOS / MESSAGES` |
| Grupos (`/conversations`) | `KRONOS / GROUPS` (×2, lista y detalle) |
| Notificaciones | `KRONOS / ACTIVITY` |
| Guardados | `KRONOS / SAVED` |
| Buscar/Explorar | `KRONOS / DISCOVERY` |
| Configuración | `KRONOS / SETTINGS` |
| Configuración → Perfil | `KRONOS / SETTINGS / PROFILE` |
| Moderación | `KRONOS / SEGURIDAD` |
| Administración | `KRONOS / ADMIN` |
| Verificar email | `KRONOS SOCIAL AI` |
| Kairos (todas sus 5 subpantallas) | `KAIROS / …` |
| **Además**, la barra superior (`TopBar`) muestra el logo + el letrero "kronos-space.com" en TODAS las pantallas protegidas, en todas las pestañas de Auth (login/registro) y en "Olvidé mi contraseña" / "Restablecer contraseña" también aparece el logo + "KRONOSPACE" otra vez. |

**Causa raíz:** no es un accidente disperso, es un patrón deliberado copiado en cada componente: cada pantalla arranca con `<header className="k-page-header"><p className="k-eyebrow">KRONOS / X</p><h1>Título real</h1>...`. Es una única decisión de plantilla repetida 16 veces a mano — se puede corregir en un solo cambio y no una por una, pero hay que tocar 14 archivos.

**Lo que pediste ("no quiero que en todas las pantallas aparezca el nombre de Cronos Space")** se traduce en dos acciones concretas:
1. Quitar la marca (logo + "kronos-space.com") de `TopBar.jsx`, que se repite arriba en cada pantalla — ver 1.2.
2. Quitar o vaciar la etiqueta `k-eyebrow` de "KRONOS / …" en las 14 pantallas listadas, dejando solo el título real (ej. "Mensajes", "Notificaciones") sin el prefijo de marca.

### 1.2 Barra superior duplicada — confirma tu sospecha de "botones de más arriba"

`AppLayout.jsx` monta **dos sistemas de navegación al mismo tiempo**:
- `<TopBar />` arriba: fijo (`sticky top:0`), en TODAS las pantallas, solo con el logo — hoy no tiene botones, pero ocupa 72px de alto permanentemente y repite la marca.
- `<FanNav />` abajo: el abanico flotante con Inicio + 8 accesos (Perfil, Mensaje, Kairos, Crear, Buscar, Avisos, Config, Historia).

Es decir: **ya tienes exactamente la navegación inferior que pediste** (FanNav), pero la superior (`TopBar`) sigue viva y no aporta funcionalidad — solo repite el nombre. Es la barra que hay que quitar de arriba, como pediste. Antes tenía botones de búsqueda/notificaciones/perfil (según el propio comentario del código: *"Buscar, notificaciones, mensajes y perfil viven ahora en el fan nav... no aquí"*), o sea que ya migraron la función pero dejaron el contenedor vacío con el logo.

### 1.3 Botones duplicados / redundantes encontrados

| Ubicación | Duplicidad | Detalle |
|---|---|---|
| Feed → Composer inline (`CreatePost compact`) | 2 accesos a "crear publicación" | El feed ya abre el composer inline; además tiene un botón "Editor completo" que va a `/create`, que es la MISMA pantalla de creación pero completa. Y si el feed está vacío, aparece un tercer botón "Crear publicación". Son 3 puntos de entrada a crear un post en la misma pantalla. |
| Mensajes 1-a-1 vs Grupos | Dos features de mensajería paralelas, sin puente entre sí | `/messages` (1 a 1) y `/conversations` (grupos) son pantallas distintas con sus propios headers "KRONOS / MESSAGES" y "KRONOS / GROUPS". El FanNav solo enlaza a `/messages`; **no existe ningún botón en toda la app que lleve a `/conversations`** salvo entre sus propias subpantallas. Es una función a la que el usuario no puede llegar navegando — botón/entrada faltante, no sobrante, pero confirma que la navegación de mensajería está partida en dos sin selector visible. |
| `Settings.jsx` | "Ver perfil" + "Editar perfil" + luego dentro de Perfil otro "Editar perfil" | Desde Configuración hay accesos a `/profile` y a `/settings/profile`, y dentro del propio `Profile.jsx` hay un tercer botón "Editar perfil" que abre un modal con casi los mismos campos (nombre, bio, avatar, portada) que ya existen en `/settings/profile`. Dos editores de perfil distintos (modal en Profile.jsx y página ProfileSettings.jsx) que pueden desincronizarse. |
| `Profile.jsx` header | "Compartir perfil" + "Editar perfil" + (si no es tu perfil) "Seguir/Dejar de seguir" + "Mensaje" + "Silenciar" + "Bloquear" + "Reportar" — 5-6 botones en una sola fila sin agrupar | Ninguno está duplicado en función, pero visualmente son demasiados botones de acción sin jerarquía (todos con el mismo tamaño, sin separar "principal" de "secundario/peligroso"). Botón "Bloquear" en rojo (`k-button-danger`) al mismo nivel que "Mensaje", sin más espacio ni confirmación agrupada. |
| `PostCard` → `PostActions` | Fila de 4 botones de texto sin iconos (Like/Comentar/Compartir/Guardar) + un menú "···" (`PostMoreMenu`) que probablemente repite Reportar/Silenciar/Bloquear que ya están en el perfil del autor | Redundancia funcional entre el menú del post y las acciones del perfil (mismo bloqueo/silencio se puede disparar desde 2 lugares distintos sin estado compartido en la misma sesión de UI). |
| `ImageEditor` (usado en Crear post y en Perfil) | "Usar original" + "Cancelar" + "Aplicar/Guardar" + "Centrar" + 2 de rotación = 6 botones en un modal de recorte simple | Exceso de acciones secundarias visibles al mismo tiempo, sin agrupar en icono/menú. |

### 1.4 Botones inferiores — alineación y qué debe quedar

El pedido es: **"centres bien también los botones principales que van en la parte inferior de la pantalla."** Hallazgo técnico:

- El `FanNav` (abanico) SÍ está centrado horizontalmente (`left:50%; transform:translateX(-50%)`), y es el único elemento de navegación fijo abajo. Aquí no hay error de centrado en CSS.
- El problema real de "descentrado" que puede percibirse viene de que **el contenido de cada página no reserva el mismo espacio inferior**: `.page` deja `padding-bottom: clamp(110px,14vh,168px)` pero varias pantallas meten botones propios pegados al final del contenido (ej. "Cargar más", "Actualizar", el footer del composer con "Guardar borrador"/"Publicar") que compiten visualmente con el abanico flotante al hacer scroll, dando la sensación de una interfaz con dos filas de botones inferiores en vez de una.
- Recomendación concreta: el abanico (Inicio + 8 satélites) debe ser la única barra de acción fija en la parte inferior. Los botones de acción de cada pantalla (Publicar, Guardar, Cargar más) deben quedar dentro del flujo de contenido, nunca fijos ni compitiendo visualmente con el abanico.

### 1.5 Veredicto por skill (ver detalle completo abajo)

| Skill | Estado |
|---|---|
| Project Context | PASS — contexto correctamente identificado |
| Full Project Audit | FIX — ver hallazgos de marca/estructura |
| Architecture Gate | MONITOR — arquitectura sólida, capas correctas |
| Frontend | FIX — marca repetida, botones duplicados, 4 hojas CSS con reglas superpuestas |
| Diseño / Motion / 3D | FIX — TopBar redundante, jerarquía de botones sin resolver |
| Backend | KEEP con MONITOR — sin mocks, contratos limpios |
| MongoDB | KEEP — sin fallback en memoria, todo persistente real |
| IA multimedia / scripts | MONITOR — proveedores configurables, no hay fallback simulado detectado |
| Social | FIX — mensajería partida (1-a-1 vs grupos) sin puente de navegación |
| Integration Gate | MONITOR |
| Code Review Gate | FIX — 3 pantallas con JSX en una sola línea gigante (deuda de mantenibilidad) |
| Configuration Guardian | FIX — CORS depende de una única env sin validación de formato documentada en código |
| Service Connector | MONITOR — proveedores IA opcionales, sin verificación runtime de todos los flujos |
| Database Reality | KEEP |
| End-to-End Validator | MONITOR — cobertura de tests real pero sin E2E de navegador contra UI |
| Production Reality | MONITOR — dependiente de variables de entorno en despliegue, no verificable desde este sandbox |
| No-Mock Enforcer | PASS — no se detectaron mocks disfrazados de funcionalidad real |

---

## 2. SKILL: `kronos-project-context` — Contexto del proyecto

**Objetivo de la skill:** identificar qué es Kronos, su stack y su estado antes de auditar.

**Hallazgos:**
- Monorepo npm workspaces: `client` (Vite + React 19 + React Router 7), `server` (Express + Mongoose + Socket.IO), `guardian` (bot de revisión de riesgo para PRs).
- Identidad de marca: "KRONOSPACE", dominio `kronos-space.com`, estética "cromo espejo sobre negro puro" (ver `client/public/kronos-master-design.jpg`, referencia oficial del diseño).
- 37+ rutas cliente, 18 módulos backend (`auth`, `posts`, `messages`, `conversations`, `moderation`, `notifications`, `drafts`, `image-ai`, `video-ai`, `script-ai`, `search`, `admin`, `observability`, `users`).
- Sin base de datos en memoria: `MONGODB_URI` es obligatoria, sin fallback (correcto para producción real).

**Estado:** `PASS`.

---

## 3. SKILL: `kronos-architect` (Full Project Audit) — Auditoría integral no destructiva

**Mapa de flujo confirmado:**
```
Frontend (Vite/React) → /api (proxy o VITE_API_URL) → Express → Controllers/Routes → Services → Mongoose Models → MongoDB Atlas
                                                                → Socket.IO (mensajería/presencia en tiempo real)
```

**Hallazgos clasificados:**

| # | Hallazgo | Clasificación |
|---|---|---|
| B1 | Backend sin mocks: `connectDB()` lanza error explícito si falta `MONGODB_URI`, no cae a memoria. | `KEEP` |
| B2 | `TopBar.jsx` es un componente "cascarón": ya no tiene botones funcionales (el propio comentario del código dice que su contenido migró al FanNav), pero se sigue montando en cada pantalla solo para mostrar la marca. | `FIX` |
| B3 | Cada pantalla repite manualmente el prefijo `KRONOS / …` o `KAIROS / …` como parte de su encabezado (14 archivos). No existe un solo punto de configuración para el "page title" — cada feature lo hardcodea. | `FIX` |
| B4 | 4 hojas de estilos conviven: `styles.css` (legacy, 3086 líneas), `design-tokens.css`, `design-system.css`, `chrome-minimal.css`, `fan-nav.css` — con selectores repetidos para las mismas clases (`.k-button`, `.k-page-header`, `.k-main-content`, `.k-topbar`) en más de un archivo, resueltos únicamente por orden de `@import`/carga en `main.jsx`. Ya señalado en auditoría previa (`docs/KRONOS-VISUAL-AUDIT.md`) y aún sin resolver. | `REFACTOR` |
| B5 | Mensajería 1-a-1 (`/messages`) y grupos (`/conversations`) son dos features independientes sin selector de navegación entre ellas; el FanNav solo cubre 1-a-1. | `MISSING` |
| B6 | No existe archivo `README.md` con contenido (0 bytes) pese a que el repo tiene documentación extensa en `docs/`. | `FIX` (bajo impacto) |
| B7 | `KairosHistory`, `MediaLibrary`, `AdminCenter`, `Settings`, `ImageGenerator`, `ScriptGenerator` y varias más están escritas como un único `return` en una sola línea de cientos de caracteres (JSX sin formatear). Funciona, pero es difícil de mantener y de revisar en PRs. | `REFACTOR` |

**Estado:** `FIX` (marca repetida y CSS duplicado son los bloqueantes de esta fase).

---

## 4. SKILL: `kronos-architect` (Architecture Gate)

**Verificación de capas:** Frontend → servicios (`client/src/services/*Service.js`) → API REST → rutas Express → Mongoose. Se respeta la separación; no se encontró lógica de negocio filtrada en componentes de presentación de forma grave (las pantallas grandes en una línea son un problema de formato, no de arquitectura).

**Propietario único por responsabilidad:** confirmado según la tabla de la sección 6 del Master Orchestrator; no se detectó que dos módulos backend implementen la misma responsabilidad (p. ej. moderación vive solo en `modules/moderation`, no hay una segunda implementación paralela).

**Riesgo de escalabilidad detectado:** `apiUrl.js` resuelve la URL del backend con reglas de host hardcodeadas (`kronos-space.com`, `*.vercel.app`) — funciona hoy, pero cualquier dominio nuevo requiere tocar código en vez de una sola variable de entorno consistente en todos los entornos.

**Estado:** `MONITOR`.

---

## 5. SKILL: `kronos-frontend`

**Botones inventariados (confirmando el pedido de "botones que están de más / dobles"):**

1. **Crear publicación — 3 entradas a la misma acción en una sola pantalla (`/home`):**
   - Composer plegado en el feed ("¿Qué quieres compartir?").
   - Botón "Editor completo" dentro del composer expandido, que navega a `/create` (la misma función, pantalla separada).
   - Botón "Crear publicación" en el estado vacío del feed.
   - Además, el satélite "Crear" del FanNav también navega a `/create`.
   - **Total: hasta 4 caminos distintos a publicar visibles en la misma sesión de usuario.**

2. **Editar perfil — 2 implementaciones distintas:**
   - Modal "Editar perfil" dentro de `Profile.jsx` (nombre, bio, avatar vía URL o archivo, portada).
   - Página completa `/settings/profile` (`ProfileSettings.jsx`), enlazada desde `Settings.jsx` ("Editar perfil") y desde el propio modal ("Configurar privacidad del perfil").
   - Dos formularios que tocan los mismos campos por rutas separadas es una fuente de inconsistencia de datos y de confusión de UX.

3. **Fila de acciones del perfil ajeno** (`Profile.jsx`): Seguir, Mensaje, Silenciar, Bloquear, Reportar — 5 botones seguidos sin jerarquía visual ni agrupación (todo con el mismo estilo `k-button-*`, salvo Bloquear en rojo). Recomendado: agrupar en un menú "···" las acciones de seguridad (Silenciar/Bloquear/Reportar) y dejar visibles solo Seguir + Mensaje, igual que ya hace `PostMoreMenu` para los posts.

4. **TopBar como barra superior redundante:** confirmado en 1.2. Debe eliminarse o vaciarse de marca en las pantallas internas, dejando el logo únicamente en pantallas de autenticación (Login/Registro) si se desea conservar identidad ahí.

5. **Etiqueta `k-eyebrow` "KRONOS / X"** repetida en 14 pantallas — confirmado en 1.1. Ningún componente centraliza el título; cada pantalla decide su propio texto de marca a mano.

**CSS:** 4 hojas con reglas duplicadas para `.k-button`, `.k-page-header`, `.k-topbar`, `.k-main-content` (detalle en sección 3, hallazgo B4). Además, componentes UI documentados como "duplicados" desde la auditoría visual previa (`KronosButton`↔`Button`, `KronosCard`↔`Card`) ya no existen físicamente en el árbol actual — parecen haberse limpiado en una iteración anterior; confirmado con búsqueda exhaustiva: no hay archivos `Button.jsx`, `Card.jsx`, `KronosButton*`, `KronosCard*`, `Navigation*`, `MobileNavigation*` en el árbol actual. **Este punto de la auditoría anterior ya está resuelto.**

**Estado:** `FIX`.

---

## 6. SKILL: `kronospace-premium-ui-auditor-design-lab` + `kronos-3d-motion-design`

**Cumplimiento de identidad "negro puro + cromo espejo":**
- TopBar, FanNav, tarjetas de post y auth cumplen el fondo `#000000` con acentos cromados (`k-material-chrome`, gradientes cónicos en `fan-nav.css`).
- El abanico (`FanNav`) tiene animación de apertura sincronizada por burbuja (`transition-delay` escalonado, compensado en duración) — técnica correcta y ya validada en el propio código con comentarios explicando la regla.
- Jerarquía de botones dentro de cada pantalla (ver sección 5, punto 3) rompe la limpieza visual "premium" al no diferenciar acciones primarias/secundarias/peligrosas por tamaño o posición, solo por color.
- El **doble sistema de barra** (TopBar fija arriba + FanNav fijo abajo) va contra el propio principio documentado en el código: *"Reemplaza a la barra inferior y al menú lateral"* — el diseño ya decidió que el fan nav sustituye toda navegación, pero la TopBar de marca nunca se retiró.

**Estado:** `FIX` (retirar TopBar de pantallas internas y unificar jerarquía de botones por pantalla).

---

## 7. SKILL: `kronos-backend`

**Contratos verificados por lectura de código (no simulados):**
- Auth: `POST /auth/login`, `/auth/register`, `/auth/refresh`, `/auth/logout`, `/auth/verify-email*`, con JWT + refresh rotativo (`session.service.js`).
- Posts, mensajes, conversaciones (grupos), notificaciones, moderación, drafts, admin y observabilidad — cada uno con sus propias rutas y modelos Mongoose, sin controladores compartidos indebidamente.
- CORS: `allowedOrigins` se arma desde `CLIENT_URL` (obligatoria en arranque; el servidor aborta si falta — correcto, ver `server.js:304-307`).
- `TRUST_PROXY` deshabilitado por defecto, se activa explícitamente — correcto para no confiar en cabeceras reenviadas sin verificar.

**Hallazgo:** ningún endpoint devuelve datos hardcodeados ni placeholders; los contadores en `AdminCenter` (`overview.users`, `overview.posts`, etc.) vienen de agregaciones reales del backend, no de arrays locales.

**Estado:** `KEEP`, con `MONITOR` en límites de rate-limit configurables por variables opcionales sin defaults documentados en un solo lugar.

---

## 8. SKILL: `kronos-mongodb` / `kronos-database-reality`

- `connectDB()` no admite fallback en memoria: si `MONGODB_URI` falta, el proceso lanza error y no arranca — cumple la regla de "no simular persistencia".
- Modelos por dominio (`Post`, `User`, `Message`, `Conversation`, `Draft`, `Notification`, `Report`, `Block`, `Mute`, `HiddenPost`, `ImageGeneration`, `VideoGeneration`, `Script`, `ScriptProject`) — separación correcta, sin una colección "genérica" fungiendo de mock.
- No se pudo ejecutar una prueba end-to-end contra MongoDB real desde este sandbox (sin red de salida ni credenciales, igual que en auditorías anteriores documentadas en `KRONOS_FINAL_VALIDATION.md`). Esto es una limitación del entorno, no un defecto del código.

**Estado:** `KEEP` (persistencia real confirmada por lectura de código) con `NEEDS_EVIDENCE` para la prueba en vivo (ya delegada históricamente a CI, según `KRONOS_FINAL_VALIDATION.md`).

---

## 9. SKILL: `kronos-ai-media` / `kronos-script-ai`

- Proveedores configurables por variables de entorno (`GEMINI_API_KEY`, `OPENROUTER_API_KEY`, `VIDEO_API_KEY`) con bandera `configured` calculada en `aiProviders.js` según si la key existe — el backend puede reportar honestamente si un proveedor no está conectado en vez de simular una respuesta.
- No se detectaron respuestas "de relleno" ante fallos de proveedor en el código inspeccionado (`image.service.js`, `video.service.js`, `script.service.js` no se abrieron línea por línea en profundidad en esta pasada — recomendado como siguiente auditoría dedicada si se quiere `PASS` completo en vez de `MONITOR`).

**Estado:** `MONITOR`.

---

## 10. SKILL: `kronos-social` / `social-beast-architect`

**Hallazgo principal (ya introducido en 1.3):** el módulo social está dividido en dos experiencias de mensajería que no se comunican en la navegación:
- `/messages` y `/messages/:userId` — chats uno a uno, accesible desde el FanNav ("Mensaje") y desde perfiles de usuario.
- `/conversations` y `/conversations/:conversationId` — grupos, con su propio flujo de creación, pero **sin ningún enlace de entrada** desde el resto de la aplicación (ni FanNav, ni Mensajes, ni Configuración). Un usuario solo puede llegar ahí escribiendo la URL a mano o si ya tenía un enlace directo a un grupo.

**Otras confirmaciones:**
- Feed, likes, comentarios, guardados, reposts y reportes están completos y conectados a servicios reales (`postsService.js`, `moderationService.js`).
- `PostMoreMenu` centraliza correctamente Reportar/Silenciar/Bloquear a nivel de post (buen patrón), pero el perfil de usuario (`Profile.jsx`) repite esas mismas acciones sueltas en la cabecera en vez de reutilizar el mismo menú — inconsistencia de patrón entre dos pantallas que hacen lo mismo.

**Estado:** `FIX` (dar acceso a "Grupos" desde algún punto de navegación, y unificar el patrón de menú de acciones de seguridad entre Post y Perfil).

---

## 11. SKILL: `kronos-integration` / `kronos-integration-engineer` / `kronos-service-connector`

- `apiUrl.js` resuelve backend según host (documentado en `client/.env.example`): correcto para Cloudflare Pages/Vercel, pero frágil si se agrega un dominio nuevo (hay que tocar código, no solo configuración).
- Socket.IO deriva su host de `VITE_API_URL` sin variable adicional — correcto, evita duplicar configuración.
- No se verificó en esta pasada una llamada real a Gemini/OpenRouter/servicio de video (no hay credenciales en este sandbox); ver limitación ya declarada en `KRONOS_FINAL_VALIDATION.md`.

**Estado:** `MONITOR`.

---

## 12. SKILL: `kronos-code-reviewer`

**Hallazgo de mantenibilidad (severo pero no bloqueante):** las siguientes pantallas están escritas como una única línea de `return` gigante, mezclando JSX, estilos inline y lógica sin saltos de línea:
`AICenter.jsx`, `Settings.jsx`, `AdminCenter.jsx`, `MediaLibrary.jsx`. Esto dificulta el diff en PRs, el code review y aumenta el riesgo de introducir bugs invisibles en revisiones futuras. Recomendado reformatear (solo formato, sin tocar lógica) como tarea de bajo riesgo.

**Estilos inline dispersos (`style={{ ... }}`) en vez de clases del design system:** encontrados en `Profile.jsx`, `CreatePost.jsx`, `Settings.jsx` — contradice el propio sistema de tokens (`design-tokens.css`) que el proyecto ya definió, y es la causa de que ajustar un color o espaciado global requiera tocar múltiples componentes.

**Estado:** `FIX`.

---

## 13. SKILL: `kronos-configuration-guardian`

- Variables obligatorias correctamente validadas al arrancar el servidor: `JWT_SECRET` y `CLIENT_URL` detienen el proceso si faltan (`server.js`). Buen patrón "fail fast".
- `MONGODB_URI` igual de estricta en `db.js`.
- Variables opcionales de IA (`GEMINI_API_KEY`, `OPENROUTER_API_KEY`, `VIDEO_API_KEY`, `RESEND_API_KEY`) no tienen una verificación centralizada única de "qué falta" visible para un operador humano (hay que leer `aiProviders.js` para saberlo); podría exponerse en `/health` o un endpoint de diagnóstico. No se confirmó si `observability.routes.js` ya cubre esto (pendiente de próxima auditoría dedicada).

**Estado:** `FIX` (leve) — falta un panel/endpoint único de "qué proveedores están conectados", aunque la lógica interna ya existe (`getAIProviderCatalog()`).

---

## 14. SKILL: `kronos-end-to-end-validator`

- Suite de pruebas real documentada en `KRONOS_FINAL_VALIDATION.md`: pruebas de servidor (Node test runner) + cliente (Vitest) + E2E contra MongoDB real ejecutado en CI (no en este sandbox, por falta de red).
- No existen pruebas de navegador real (Playwright/Cypress) para flujos de UI como "crear post", "editar perfil", "abrir el abanico" — la cobertura actual es de integración de API y componentes aislados, no de journeys de usuario completos en navegador.

**Estado:** `MONITOR` (cobertura API/unit sólida; cobertura E2E de navegador real es una brecha declarada, no crítica).

---

## 15. SKILL: `kronos-production-reality`

- El propio historial del proyecto (`KRONOS_ACCESS_ROOT_CAUSE.md`, `KRONOS_FINAL_VALIDATION.md`) documenta que "local pass" no implica "production pass": hubo un incidente real de CORS/hosts estáticos (405 de Cloudflare Pages) ya corregido.
- Esta auditoría no tiene acceso a las variables de entorno del despliegue real (Render/Cloudflare/Vercel) ni a la base de datos de producción — no se puede confirmar el estado actual desplegado desde este sandbox.

**Estado:** `NEEDS_EVIDENCE` (requiere validación contra el entorno desplegado real, fuera del alcance de este sandbox).

---

## 16. SKILL: `kronos-no-mock-enforcer`

Búsqueda exhaustiva de patrones de simulación (`mock`, `fake`, `dummy`, `hardcoded`, `TODO`, `FIXME`, `placeholder` usados como funcionalidad) en todo `client/src` y `server/src`:
- Ninguna coincidencia corresponde a una función simulada disfrazada de real. Las únicas coincidencias de la palabra "mock" son comentarios legítimos describiendo el diseño visual ("mock" = maqueta de diseño del abanico), no código de simulación.
- Contadores, listas y estados en UI provienen siempre de llamadas a servicios reales (`services/*.js` → `axios` → API real), no de arrays locales fijos.

**Estado:** `PASS`.

---

## 17. SKILL: `kronos-reality-core`

Para cada botón principal revisado (Publicar, Seguir, Bloquear, Silenciar, Reportar, Like, Guardar, Repost, Editar perfil, Marcar notificaciones): existe handler real conectado a un servicio HTTP real con backend correspondiente. No se encontraron botones decorativos sin acción, salvo el caso ya reportado de "Historia" social en el FanNav, que el propio código admite explícitamente que **no navega a nada real todavía** y muestra un aviso "llegará pronto" (`showToast` con tono info) — esto es honesto (no simula éxito), pero es una función pendiente, no terminada.

**Estado:** `PASS` con una `MISSING` declarada (Historia social).

---

## 18. SKILL: `kronos-production` (soporte de despliegue)

CI (`ci.yml`) ejecuta lint, build, pruebas de servidor y cliente, y una verificación de solo lectura contra el entorno desplegado (`verify-deploy.sh`), publicando el resultado como comentario de PR. `kronos-guardian` (bot de riesgo) también corre en cada PR. Infraestructura de calidad correcta y ya operativa.

**Estado:** `KEEP`.

---

## 19. PLAN DE ACCIÓN PROPUESTO (orden sugerido, sin ejecutar todavía)

No se realizó ningún cambio de código en esta pasada porque las skills de auditoría son explícitamente no destructivas. Si quieres que ahora sí lo implemente, este sería el plan que la Master Orchestrator generaría como `EXECUTION PLAN`:

1. **Quitar la marca repetida (tu pedido principal):**
   - Vaciar o eliminar `TopBar.jsx` de `AppLayout.jsx` en las pantallas internas (dejar el shell solo con `FanNav` + contenido).
   - Quitar la línea `<p className="k-eyebrow">KRONOS / …</p>` / `KAIROS / …` de las 14 pantallas listadas en 1.1, dejando solo `<h1>` con el nombre real de la sección.
2. **Eliminar botones duplicados de "Crear publicación":** decidir un único punto de entrada (recomendado: dejar solo el composer inline del feed + el satélite "Crear" del FanNav; quitar "Editor completo" y la ruta `/create` como página separada, o al revés, según prefieras).
3. **Unificar "Editar perfil":** dejar un solo editor (recomendado: `/settings/profile`) y que el botón del modal en `Profile.jsx` solo redirija ahí, sin duplicar el formulario.
4. **Agrupar acciones de perfil ajeno** en un menú "···" reutilizando `PostMoreMenu`, dejando visibles solo "Seguir" y "Mensaje".
5. **Dar acceso real a "Grupos"** desde el FanNav o desde la pantalla de Mensajes (pestaña o botón "Ver grupos").
6. **Centrar y simplificar la barra inferior:** confirmar que ningún botón de pantalla quede fijo compitiendo con el FanNav; los CTAs de cada pantalla deben vivir dentro del contenido con scroll, nunca `position: fixed` en la parte baja.
7. **Consolidar CSS:** fusionar `styles.css` legacy dentro de `design-system.css` + `chrome-minimal.css`, eliminando selectores duplicados para `.k-button`, `.k-page-header`, `.k-topbar`, `.k-main-content`.
8. **Reformatear a multilínea** las pantallas con JSX en una sola línea (`AICenter`, `Settings`, `AdminCenter`, `MediaLibrary`) para facilitar mantenimiento futuro.

---

## 20. ESTADO FINAL DEL MASTER ORCHESTRATOR

```
PROJECT CONTEXT ................ PASS
FULL PROJECT AUDIT .............. FIX
ARCHITECTURE GATE ............... MONITOR
FRONTEND ......................... FIX
DISEÑO / MOTION / 3D ............ FIX
BACKEND .......................... KEEP (MONITOR parcial)
MONGODB / DATABASE REALITY ...... KEEP
IA MULTIMEDIA / SCRIPTS ......... MONITOR
SOCIAL ........................... FIX
INTEGRATION GATE ................. MONITOR
CODE REVIEW GATE ................. FIX
CONFIGURATION GUARDIAN ........... FIX (leve)
SERVICE CONNECTOR ................ MONITOR
END-TO-END VALIDATOR ............. MONITOR
PRODUCTION REALITY ............... NEEDS_EVIDENCE
NO-MOCK ENFORCER ................. PASS
REALITY CORE ...................... PASS (1 MISSING declarada)
```

**MASTER → `BLOCKED` para "listo para producción sin cambios"**, pero **`APPROVED` como diagnóstico completo**: no hay hallazgos de seguridad críticos ni mocks disfrazados; los bloqueantes son de diseño/estructura/UX (marca repetida, botones duplicados, navegación de grupos faltante) exactamente como intuías, y están documentados con evidencia de archivo y línea para poder corregirlos con precisión en el siguiente turno.
