# KRONOS, matriz de implementación actual

Estados: COMPLETADO, PARCIAL, PENDIENTE, BLOQUEADO POR ENTORNO.

| ID | Área | Estado | Evidencia / siguiente acción |
|---|---|---|---|
| KRONOS-UI-001 | Perfil por username | PENDIENTE | La ruta existe, el componente aún lee `id`. |
| KRONOS-UI-002 | Editor settings/profile | PENDIENTE | La ruta aún renderiza Settings general. |
| KRONOS-UI-003 | Recuperación de cuenta | PENDIENTE | Falta endpoint y flujo de correo. |
| KRONOS-UI-004 | Verificación de email | PENDIENTE | Falta modelo y endpoints. |
| KRONOS-UI-005 | Validación auth | PARCIAL | Confirmación de contraseña añadida. |
| KRONOS-UI-006 | Sesión consistente | COMPLETADO | `authStorage.js` centraliza ambos storages y expone expiración, `getSession`, `peekSession` y motivos de limpieza; cubierto por `client/test/authStorage.test.mjs`. |
| KRONOS-UI-007 | Refresh/revocación JWT | PARCIAL | Revocación real por token (`session.service.js` + `POST /api/auth/logout`, código `TOKEN_REVOKED`) y expiración de 7 días. Falta refresh/rotación. |
| KRONOS-UI-008 | Paginación feed | PENDIENTE | Feed actual usa límite backend. |
| KRONOS-UI-009 | Media posts | PENDIENTE | Post actual es texto. |
| KRONOS-UI-010 | Edit/delete posts | PENDIENTE | Falta contrato backend y UI. |
| KRONOS-UI-011 | Moderación posts | PENDIENTE | Falta report/hide/block/mute. |
| KRONOS-UI-012 | Save/repost | PENDIENTE | Falta persistencia. |
| KRONOS-UI-013 | Composer multimedia | PENDIENTE | CreatePost solo texto. |
| KRONOS-UI-014 | Drafts | PENDIENTE | Sin modelo ni endpoints. |
| KRONOS-UI-015 | Alt/captions | PENDIENTE | Sin flujo multimedia. |
| KRONOS-UI-016 | Cover/avatar upload | PARCIAL | Perfil acepta avatar URL, no upload. |
| KRONOS-UI-017 | Profile tabs | PENDIENTE | Solo publicaciones. |
| KRONOS-UI-018 | Privacy profile | PENDIENTE | Sin settings backend. |
| KRONOS-UI-019 | Message attachments | PENDIENTE | Solo texto. |
| KRONOS-UI-020 | Presence/typing | PENDIENTE | Socket solo emite mensajes. |
| KRONOS-UI-021 | Message retry/status | PENDIENTE | Sin estados persistentes. |
| KRONOS-UI-022 | Group messages | PENDIENTE | Sin modelo Conversation. |
| KRONOS-UI-023 | Notification catalog | PARCIAL | Follow, like, comentario. |
| KRONOS-UI-024 | Notification filters | PENDIENTE | Sin filtros/paginación. |
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
| KRONOS-UI-039 | API centralizada | PARCIAL | Cliente creado, migración de features pendiente. |
| KRONOS-UI-040 | CSS unificado | PARCIAL | Design System nuevo convive con CSS legacy. |
| KRONOS-UI-041 | Frontend lint | BLOQUEADO POR ENTORNO | No existe script lint en package.json. |
| KRONOS-UI-042 | Route tests | PENDIENTE | No hay suite frontend. |
| KRONOS-UI-043 | Interaction tests | PENDIENTE | No hay suite frontend. |
| KRONOS-UI-044 | Env/CORS | PARCIAL | Defaults locales corregidos, producción requiere valores reales. |
| KRONOS-UI-045 | Observability | PENDIENTE | Logs básicos, sin métricas/auditoría. |

La matriz no finge terminación: el acceso local quedó corregido por código, pero el producto completo aún requiere las tareas pendientes indicadas.

## KRONOS-AUDIT-001/002/003 (base de datos real, autenticación y cliente API)

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
