# KRONOS, matriz de implementación actual

Estados: COMPLETADO, PARCIAL, PENDIENTE, BLOQUEADO POR ENTORNO.

## Regla de bloques (vigente desde el bloque 008, 2026-09-17)

Cada bloque entregado se numera por su posición en la secuencia (001, 002, …) y
cubre un **rango de esta matriz**. Para evitar la duplicación de información que
generó los conflictos del PR #9:

1. **Diferencial, nunca histórico.** El documento de un bloque
   (`docs/BLOQUE-*.md`) documenta solo lo que **cambia** en ese bloque. Lo
   existente se **referencia** (enlace al bloque que lo entregó), no se
   redacta de nuevo ni se "recicla" su texto.
2. **Esta matriz es la única fuente del estado global.** Si un bloque cambia el
   estado de un ID, se actualiza la fila aquí y el documento del bloque; ningún
   otro documento repite la tabla de estados.
3. **No se re-verify en verde lo ya cerrado.** Un bloque solo vuelve a tocar un
   ID cerrado si una funcionalidad nueva lo depende; en ese caso lo declara
   explícitamente en su sección "No se repite en este bloque" como verificación
   de dependencia, no como trabajo nuevo.
4. **Contratos API se documentan una sola vez**, en el bloque que los crea;
   los posteriores citan el endpoint y el bloque de origen.

| Bloque entregado | Rango de matriz | Documento |
|---|---|---|
| 001-006 | AUDIT-001…006 (auth, API cliente, social core, media/save, tabs/privacidad) | `docs/AUDIT-*.md` |
| 007 | KRONOS-UI-007…016 | [BLOQUE-007-016.md](docs/BLOQUE-007-016.md) |
| 008 | KRONOS-UI-019…024 (mensajería y notificaciones) | [BLOQUE-019-024.md](docs/BLOQUE-019-024.md) |

| ID | Área | Estado | Evidencia / siguiente acción |
|---|---|---|---|
| KRONOS-UI-001 | Perfil por username | PENDIENTE | La ruta existe, el componente aún lee `id`. |
| KRONOS-UI-002 | Editor settings/profile | PENDIENTE | La ruta aún renderiza Settings general. |
| KRONOS-UI-003 | Recuperación de cuenta | COMPLETADO (flujo confirmado por usuario) | Acceso y recuperación confirmados el 17/09/2026 tras corregir Render: base `test` y dominio público primero en `CLIENT_URL`. Se conserva Resend de main. |
| KRONOS-UI-004 | Verificación de email | PENDIENTE | Falta modelo y endpoints. |
| KRONOS-UI-005 | Validación auth | PARCIAL | Confirmación de contraseña añadida. |
| KRONOS-UI-006 | Sesión consistente | COMPLETADO | `authStorage.js` centraliza ambos storages y expone expiración, `getSession`, `peekSession` y motivos de limpieza; cubierto por `client/test/authStorage.test.mjs`. |
| KRONOS-UI-007 | Refresh/revocación JWT | COMPLETADO y verificado contra MongoDB real (mongo:7, CI 17/09/2026) | BLOQUE 007-016: refresh opaco guardado hasheado (SHA-256), rotación por familia, `REFRESH_REUSED` al reutilizar y logout que cierra la familia; el cliente renueva y reintenta. Detalle en [BLOQUE-007-016.md](docs/BLOQUE-007-016.md).
| KRONOS-UI-008 | Paginación feed | COMPLETADO y verificado contra MongoDB real (mongo:7, CI 17/09/2026) | Paginación con `page/limit/hasMore` y `useFeed`; el E2E del bloque la verifica contra MongoDB real (sin páginas repetidas).
| KRONOS-UI-009 | Media posts | COMPLETADO y verificado contra MongoDB real (mongo:7, CI 17/09/2026) | Upload a `/uploads/media`, render y persistencia verificados en el E2E del bloque. Falta almacenamiento persistente en Render.
| KRONOS-UI-010 | Edit/delete posts | PARCIAL | Rutas y UI integradas; permisos 403 y edición/eliminación del autor probados con DB simulada. E2E real pendiente. |
| KRONOS-UI-011 | Moderación | COMPLETADO y verificado contra MongoDB real (mongo:7, CI 17/09/2026) | BLOQUE 007-016: `Block`, `Mute`, `HiddenPost` y `Report` con efectos reales en feed, perfiles, follows, mensajes y notificaciones; `/settings/security` con conteos, listas y cola de moderadores. |
| KRONOS-UI-012 | Save/repost | COMPLETADO y verificado contra MongoDB real (mongo:7, CI 17/09/2026) | Persistencia y `/saved` del PR #10; el E2E verifica toggles, 409 en repost duplicado y que no se filtran identidades de `savedBy`.
| KRONOS-UI-013 | Composer multimedia | COMPLETADO y verificado contra MongoDB real (mongo:7, CI 17/09/2026) | Composer con imagen, alt, preview y borradores; upload y publicación con media verificados en base real.
| KRONOS-UI-014 | Drafts | COMPLETADO y verificado contra MongoDB real (mongo:7, CI 17/09/2026) | BLOQUE 007-016: `Draft` + `/api/drafts` (crear, listar, editar, borrar, límite 50) y UI con reanudar/eliminar; nunca aparecen como publicaciones. |
| KRONOS-UI-015 | Alt/captions | COMPLETADO (alt) y verificado contra MongoDB real (mongo:7, CI 17/09/2026) | `media.alt` con límite 500 y edición verificada en base real. Las captions de video quedan fuera de alcance.
| KRONOS-UI-016 | Cover/avatar upload | COMPLETADO y verificado contra MongoDB real (mongo:7, CI 17/09/2026) | Avatar (PR #10) y portada nueva vía `POST /api/users/me/cover` con subdirectorio `covers`; ambos verificados en base real. Persistencia de archivos en Render pendiente.
| KRONOS-UI-017 | Profile tabs | COMPLETADO y verificado contra MongoDB real (mongo:7, CI 17/09/2026) | Tabs de AUDIT-006; el E2E verifica filtros y conteos con datos reales y prohíbe `tab=saved` en perfiles.
| KRONOS-UI-018 | Privacy profile | PARCIAL | AUDIT-006: biografía, contadores y aparición en búsqueda configurables y aplicados por backend. No es cuenta privada ni restringe posts/media. Verificado además con datos reales en el E2E del bloque.
| KRONOS-UI-019 | Message attachments | COMPLETADO (código) · E2E en CI | BLOQUE 008: `POST /api/messages/media/upload` + `Message.media` (solo URLs de `/uploads/media`, jpg/png/webp, alt ≤500) en 1-a-1 y grupos; composer con preview y alt. E2E real del bloque lo verifica en base real. |
| KRONOS-UI-020 | Presence/typing | COMPLETADO (código) · E2E en CI | BLOQUE 008: presencia en memoria por instancia (`online` en REST + `presence:changed` por socket) y typing retransmitido solo al peer con throttle (2/s). Límites: multi-instanza y typing en grupos fuera de alcance. |
| KRONOS-UI-021 | Message retry/status | COMPLETADO (código) · E2E en CI | BLOQUE 008: `clientMessageId` idempotente (reintento devuelve el original, `deduplicated`), `Message.delivered` + `readBy`/`read` para estados entregado/leído; cola de reintentos en el cliente. |
| KRONOS-UI-022 | Group messages | COMPLETADO (código) · E2E en CI | BLOQUE 008: modelo `Conversation` (2-10 miembros, creador), `/api/conversations` completo, `Message.conversation`/`readBy`, sala de socket con verificación de membresía y UI de grupos. |
| KRONOS-UI-023 | Notification catalog | COMPLETADO (código) · E2E en CI | BLOQUE 008: catálogo único `NOTIFICATION_TYPES` en el modelo (6 tipos), frase por tipo en la UI y supresión por bloqueo verificada en base real. |
| KRONOS-UI-024 | Notification filters | COMPLETADO (código) · E2E en CI | BLOQUE 008: `GET /api/notifications?type=&page=&limit=` con `total/hasMore` (default 30, máx 100) y UI con filtros + "cargar más". |
| KRONOS-UI-025 | Global search | PENDIENTE | Solo usuarios. |
| KRONOS-UI-026 | Explore | PENDIENTE | Alias del buscador de usuarios. |
| KRONOS-UI-027 | Kairos image controls | PARCIAL | Prompt, negative prompt y style. |
| KRONOS-UI-028 | Kairos video jobs | PARCIAL | Generate/history, sin polling completo. |
| KRONOS-UI-029 | Kairos script editor | PARCIAL | Generación/copia, capacidades avanzadas reducidas. |
| KRONOS-UI-030 | Kairos history actions | PARCIAL | Filtros y preview, faltan delete/reuse/publish. |
| KRONOS-UI-031 | Settings completo | PENDIENTE | Solo datos de cuenta y logout. |
| KRONOS-UI-032 | Sesiones/dispositivos | PENDIENTE | Sin modelo Session. |
| KRONOS-UI-033 | Admin | PENDIENTE | No existe ruta ni backend. |
| KRONOS-UI-034 | Offline | PENDIENTE | Sin manager global. |
| KRONOS-UI-035 | Toast/modal | PENDIENTE | Feedback local disperso. |
| KRONOS-UI-036 | Accessibility | PARCIAL | Focus y labels añadidos en Auth, falta auditoría global. |
| KRONOS-UI-037 | Responsive QA | PARCIAL | CSS responsive, sin ejecución en matriz de dispositivos. |
| KRONOS-UI-038 | Security moderation | PENDIENTE | Falta report/block/admin. |
| KRONOS-UI-039 | API centralizada | PARCIAL | Social, media, moderación, borradores y perfiles usan `apiClient` con Bearer y 401. Los módulos de IA siguen con axios directo (fuera de este bloque).
| KRONOS-UI-040 | CSS unificado | PARCIAL | Design System nuevo convive con CSS legacy. |
| KRONOS-UI-041 | Frontend lint | BLOQUEADO POR ENTORNO | No existe script lint en package.json. |
| KRONOS-UI-042 | Route tests | PARCIAL | Pruebas DOM para /saved con hidratación y /reset-password; resto de rutas y navegador real pendientes. |
| KRONOS-UI-043 | Interaction tests | PARCIAL | Vitest + Testing Library: feed, paginación, comentario, creación, perfil, rollback; DB/API simuladas. |
| KRONOS-UI-044 | Env/CORS | PARCIAL | Defaults locales corregidos, producción requiere valores reales. |
| KRONOS-UI-045 | Observability | PENDIENTE | Logs básicos, sin métricas/auditoría. |

## BLOQUE 007-016 — estado local 2026-09-17

Implementado: refresh con rotación (007), moderación completa (011), borradores (014)
y portada (016), con cierre verificado de 008/009/012/013/015/017.

Verificación real (GitHub Actions, MongoDB real `mongo:7`, commit `15fe500`):
**26 pruebas · 26 OK · 0 fallos · 0 omitidas**, sin dobles ni base en memoria, en una
base temporal `kronos_e2e_*` que se elimina al terminar. La corrida se repite en cada
PR (`job mongo-real`); para lanzarla contra Atlas basta agregar el secreto
`MONGODB_URI` (job `atlas`). La primera corrida real encontró y corrigió un doble
refresh emitido por rotación y límites de peticiones fijos en código.

Detalle, contratos y límites en [BLOQUE-007-016.md](docs/BLOQUE-007-016.md).

La matriz no finge terminación: el acceso local quedó corregido por código, pero el producto completo aún requiere las tareas pendientes indicadas.

## BLOQUE 008 — estado local 2026-09-17

Rango: KRONOS-UI-019 a 024 (mensajería y notificaciones). Implementado:
adjuntos (019), presencia/typing (020), reintentos idempotentes y estados
(021), grupos con `Conversation` (022), catálogo de notificaciones (023) y
filtros/paginación (024).

Verificación local: suites sin base 37 ok (servidor 29 + contrato 8),
cliente 15 ok, vitest 29 ok, build 1723 módulos. La verificación contra
MongoDB real (E2E del bloque, 14 comprobaciones) corre en GitHub Actions
(`mongo:7`) al abrir el PR.

Detalle, contratos y límites en [BLOQUE-019-024.md](docs/BLOQUE-019-024.md).
Aplica la Regla de bloques: este y los siguientes bloques documentan solo
diferencial.

## Registro histórico de KRONOS-AUDIT-001/002/003 (previo a la resolución del PR #9)

Estos informes describen las comprobaciones originales; no equivalen a validar la nueva integración. Estado vigente y decisiones: `docs/PR9-CONFLICT-RESOLUTION.md`.

| ID | Área | Estado | Evidencia |
|---|---|---|---|
| AUDIT-001 | MongoDB real y entorno mínimo | COMPLETADO en `main` (#6) + huecos cerrados en esta rama | `main` ya eliminó el fallback en memoria y dejó `/health` en 200/503. Esta rama quita la dependencia muerta `mongodb-memory-server`, exige `CLIENT_URL` en producción y agrega `scripts/kronos-doctor.js` |
| AUDIT-001-VAL | Conexión a MongoDB real | **VALIDADO EN PRODUCCIÓN** | 2026-09-16T19:38Z: `GET /health` y `/api/health` en `https://kronos-space-com-bwu9.onrender.com` devuelven `200 {"ok":true,"database":"connected"}`; `GET /api/users/me` sin token devuelve 401 |
| AUDIT-002 | Registro / login / sesión / logout | COMPLETADO en código · validación pendiente | Registro/login/me/forgot-reset venían de `main`; esta rama agrega `GET /api/auth/session`, `POST /api/auth/logout` con revocación, `GET /api/auth/token` y las pruebas `auth.e2e.test.js` / `authStorage.test.mjs` |
| AUDIT-003 | Consolidar cliente API y sesión | COMPLETADO en código · validación de despliegue pendiente | 13 vistas de `client/src/features/**` repetían `import.meta.env.VITE_API_URL || "http://localhost:5000/api"` + `axios` directo + lecturas propias de `kronos_token`/`kronos_user`. Ahora usan `API_URL` de `services/apiClient` y `getToken`/`getUser`/`updateUser` de `services/authStorage`, sin cambiar endpoints ni comportamiento. Evidencia: build sin variable → el bundle ya NO contiene `localhost:5000` (solo `/api`); build con `VITE_API_URL=https://api.kronos-space.com/api` → la URL aparece en el bundle |
| AUDIT-003-405 | Login desde `kronos-space.com` fallaba con 405 | ARREGLADO en código · pendiente de reconstruir el despliegue | Cloudflare Pages no proxea `/api` y responde 405 a los POST. `client/src/services/apiUrl.js` resuelve la base a `https://api.kronos-space.com/api` en hosts estáticos y deja `/api` solo en desarrollo; 5 pruebas nuevas en `client/test/apiUrl.test.mjs`. `_redirects` descartado: Cloudflare no proxea dominios externos |
| AUDIT-003-VAL | Bundle desplegado apuntando a la API | PENDIENTE DEL REDEPLOY | El bundle de `kronos-space.com` (Cloudflare Pages) traía `http://localhost:5000/api`: falta `VITE_API_URL` en el build de ese proyecto + redeploy. Se re-verifica con el informe del PR / workflow `Kronos Deploy Verify` |
| AUDIT-002-VAL | Flujo completo con MongoDB real | PENDIENTE DE EJECUCIÓN | 11 pruebas OMITIDAS en el entorno de trabajo (sin red a Mongo). Cierre: workflow manual `Kronos Auth Smoke Test` o `MONGODB_URI=<base de pruebas> npm test` |

Detalle en `docs/KRONOS-AUDIT-001-BASE-DATOS.md` y `docs/KRONOS-AUDIT-002-AUTH-E2E.md`.

## AUDIT-006 — estado local 2026-09-17

Pestañas y privacidad de información de perfil implementadas; **57 pruebas aprobadas, 11 E2E omitidas**, build correcto. No fusionado ni desplegado. Alcance, contratos y límites en [AUDIT-006-profile-tabs-privacy.md](docs/AUDIT-006-profile-tabs-privacy.md). Se conserva el acceso/Resend existente y no se alteran las cuentas reales.
