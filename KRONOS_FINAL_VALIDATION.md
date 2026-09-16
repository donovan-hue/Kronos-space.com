# KRONOS, validación actual

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
| `npm run build` | OK (1703 módulos) |
| `npm run lint` | No existe script lint definido |
| `npm test --workspace=server` | 19 pruebas · 8 OK · 11 omitidas (requieren `MONGODB_URI` real) · 0 fallos |
| `GET /health` producción | No verificable desde aquí (sin salida de red). Cierre: `BASE=https://TU-API node scripts/kronos-doctor.js` |
| Login correcto | Prueba E2E escrita contra MongoDB real; pendiente de ejecutar con `MONGODB_URI` |
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
- Pruebas de cliente: `npm test --workspace=client` → 10 pruebas · 10 OK.
