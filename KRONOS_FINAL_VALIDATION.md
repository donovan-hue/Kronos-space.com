# KRONOS, validación

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
