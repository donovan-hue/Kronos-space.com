# KRONOS, validación

## BLOQUE 008 (019-024) — validación 2026-09-17/18

- Node 22.22.3 local: `npm test` → servidor 69 pruebas (29 ok · 40 E2E
  omitidas por falta de MONGODB_URI, por diseño · 0 fallos) · cliente 15 ok.
- `vitest`: 29 ok, incluyendo 8 nuevas (reintento idempotente de mensajes y
  filtros/paginación de notificaciones).
- Build: 1723 módulos; gzip 144.06 kB.
- E2E contra MongoDB real: `server/test/block-019-024.e2e.test.js`
  (14 comprobaciones del bloque + 26 de suites anteriores = 40).
  **Verificado en CI** (run 35294968429, PR #15): `# tests 40 # pass 40
  # fail 0 # skipped 0` en ambos jobs — MongoDB real (`mongo:7`) y Atlas.
  El entorno de trabajo no tiene red a un servidor MongoDB (fastdl
  bloqueado), por lo que la corrida real se hace en CI.
- No se tocaron: autenticación, refresh con rotación, moderación, feed ni
  contratos 1-a-1 existentes (solo extensiones aditivas).
- Detalle y límites: [BLOQUE-019-024.md](docs/BLOQUE-019-024.md).

## BLOQUE 009 (025-030) — validación local 2026-09-18

- `npm run build --workspace=client`: OK (1730 módulos).
- `npm test --workspace=client`: 15 pruebas Node + 32 UI, 47 OK.
- `npm test --workspace=server`: 81 pruebas, 38 OK y 43 E2E omitidas sin
  `MONGODB_URI`, 0 fallos.
- Contrato del bloque: `server/test/block-025-030.contract.test.js`, 5/5 OK.
- Se mantiene pendiente la corrida E2E con MongoDB real para confirmar
  búsqueda, historial y jobs contra persistencia real.
- Detalle: [BLOQUE-025-030](docs/BLOQUE-025-030.md).

## AUDIT-006 — validación local 2026-09-17

- Node 20.20.2: 57 pruebas aprobadas, ninguna fallida, 11 E2E omitidas.
- Build: 1714 módulos; sintaxis backend y auditoría de dependencias correctas.
- 19 pruebas nuevas de pestañas, guardados privados y preferencias de perfil.
- API/DB simuladas en las pruebas nuevas; no equivale a validación en MongoDB o navegador real.
- No se publicaron cambios ni se fusionó el PR #10. No se cambió la autenticación.
- Detalle y limitaciones: [AUDIT-006](docs/AUDIT-006-profile-tabs-privacy.md).

## Actualización 2026-09-17: integración revisada del PR #9

- Ocho conflictos resueltos en la rama de esta sesión, sin fusionar main ni desplegar producción.
- Node 20.20.2: `npm ci`, `npm test` y build correctos. 38 pruebas aprobadas, 11 E2E omitidas por falta de MongoDB de pruebas.
- `npm audit`: cero vulnerabilidades reportadas.
- Autenticación/Resend/configuración DB de main conservados; no se modificaron cuentas reales.
- Pruebas UI con jsdom y servicios simulados, no QA de navegador real.
- Persistencia de uploads y QA/E2E de producción siguen pendientes.

Decisiones y límites: [PR9-CONFLICT-RESOLUTION.md](docs/PR9-CONFLICT-RESOLUTION.md).

## Registro histórico anterior (no describe la validación actual)

## Código revisado

- Frontend: rutas, Auth, App, ProtectedRoute, storage, API client, Socket.IO.
- Backend: server, CORS, auth routes, JWT middleware, User, DB config.
- Contrato de login: alineado a `{ token, user }`.
- CORS local: alineado a Vite en `http://localhost:3000`.
- Secretos: no se añadieron claves al frontend.

## BLOQUE 007-016 — verificación real (17/09/2026)

| Prueba | Resultado |
|---|---|
| E2E del bloque + auth E2E contra MongoDB real (`mongo:7`, GitHub Actions, commit `15fe500`) | **26 pruebas · 26 OK · 0 fallos · 0 omitidas** |
| `npm test --workspace=client` | 36 OK · 0 fallos |
| `npm run build --workspace=client` | OK (1718 módulos · gzip 138.63 kB) |

Sin dobles: servidor real, rutas reales, JWT reales y MongoDB real, en una base
temporal `kronos_e2e_*` que se elimina al terminar. La corrida se ejecuta en cada PR;
contra Atlas se lanza agregando el secreto `MONGODB_URI` (Run workflow).

Hallazgos de esa corrida, ya corregidos: doble refresh emitido por rotación y
límites de peticiones fijos en código (300/60/20) que bloqueaban el propio E2E.

## Ejecución

| Prueba | Resultado |
|---|---|
| `npm install` | OK |
| `npm run build` | OK (1703 módulos) · tras AUDIT-003: sin `VITE_API_URL` el bundle usa `/api` (ya no `localhost:5000`); con `VITE_API_URL=https://api.kronos-space.com/api` la URL queda compilada |
| `npm run lint` | No existe script lint definido |
| `npm test --workspace=server` | 19 pruebas · 8 OK · 11 omitidas (requieren `MONGODB_URI` real) · 0 fallos |
| Login desde `kronos-space.com` | Diagnosticado: **405** de Cloudflare Pages al POST de `/api/auth/login` (no proxea). Arreglado en `client/src/services/apiUrl.js`: los hosts estáticos resuelven a `https://api.kronos-space.com/api` |
| `GET /health` producción | **VALIDADO** 2026-09-16T19:38Z · `200 {"ok":true,"database":"connected"}` en `https://kronos-space-com-bwu9.onrender.com` |
| Login correcto | Backend desplegado con MongoDB real conectado; la prueba automática del flujo POST se ejecuta con `Kronos Auth Smoke Test` (workflow manual) |
| Password incorrecta | Backend devuelve 401, UI muestra error |
| Email inexistente | Backend devuelve 401, UI muestra error |
| Token inválido/expirado | Middleware devuelve 401 y App limpia sesión |
| Backend apagado | UI muestra error de conexión |
| MongoDB no disponible | Falla siempre con error explícito: **ya no existe fallback en memoria** |
| Reload autenticado | `App.jsx` descarta el token expirado y valida con `/auth/me`; `peekSession`/`getSession` exponen la expiración |
| Logout | Llama a `POST /api/auth/logout` (revoca el token) y luego limpia ambos storages |

## Bloqueos honestos

- No hay credenciales de prueba ni salida de red hacia MongoDB desde el entorno de trabajo.
- No hay un entorno remoto funcional accesible para probar login real.
- El repositorio no define lint frontend.
- Las funcionalidades de la matriz 001-045 todavía no están todas implementadas.

No se declara producción lista ni se declara el plan completo terminado.
- Pruebas de cliente: `npm test --workspace=client` → 15 pruebas · 15 OK.
- AUDIT-003: las 13 vistas de `features` ya no pueden apuntar a `localhost`; el único bloqueo restante es la variable `VITE_API_URL` en el proyecto de **Cloudflare Pages** y su redeploy.

Detalle en `docs/KRONOS-AUDIT-001-BASE-DATOS.md`, `docs/KRONOS-AUDIT-002-AUTH-E2E.md` y `docs/KRONOS-AUDIT-003-CLIENTE-API.md`.
