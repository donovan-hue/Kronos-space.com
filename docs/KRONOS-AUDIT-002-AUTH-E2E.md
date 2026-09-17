# KRONOS-AUDIT-002 — Autenticación end-to-end

Estado: **ampliado y probado en HTTP real; validación contra MongoDB real
pendiente de entorno** (ver sección 5).

## 1. Lo que ya estaba resuelto en `main` (no se tocó)

`main` (`78fd2c6`) ya entregaba:

- `POST /api/auth/register` (201 `{ token, user }`), con validación de email,
  usuario ≥ 3 caracteres y contraseña ≥ 8.
- `POST /api/auth/login` (200 `{ token, user }`), con `401 Credenciales
  inválidas` para email inexistente y para contraseña incorrecta, y
  migración de documentos legacy `password` → `passwordHash`.
- `GET /api/auth/me` (autenticado) → `{ user }`.
- `POST /api/auth/forgot-password` y `POST /api/auth/reset-password`.
- `client/src/services/authStorage.js` con `getToken`, `getUser`,
  `saveSession(token, user, remember)` y `clearSession` sobre
  `localStorage`/`sessionStorage`.
- `client/src/services/apiClient.js` con base `/api` relativa, `Bearer`
  automático y limpieza de sesión al recibir 401.
- `client/src/App.jsx` que valida la sesión al montar con `GET /auth/me`.
- `client/src/features/auth/Auth.jsx` con confirmación de contraseña,
  mostrar/ocultar y “Recordar sesión”.
- `client/vite.config.js` con proxy `/api` y `/socket.io`.

Estos archivos **no se reescribieron**. Lo que sigue son huecos que `main`
todavía tenía.

## 2. Huecos cerrados en esta rama

| Hueco real | Cambio |
|---|---|
| **El logout no cerraba nada en el servidor.** `main` solo borraba el storage: el JWT seguía siendo válido hasta 7 días. | `POST /api/auth/logout` revoca el token; el middleware rechaza el token reutilizado con `401 TOKEN_REVOKED`. |
| No había forma de validar la sesión persistida ni su expiración. | `GET /api/auth/session` → `{ valid, expiresAt, tokenId, user }`; `GET /api/auth/token` describe el token propio. |
| El cliente no sabía cuándo expiraba el token. | `authStorage` añade `isTokenExpired`, `getTokenExpiresAt`, `getSession`, `peekSession`, `hasSession`, `updateUser`, `subscribeToSession` y motivos de limpieza. El contrato anterior (`getToken`/`getUser`/`saveSession`/`clearSession`) se conserva intacto. |
| La hidratación intentaba validar un token ya expirado. | `App.jsx` descarta la sesión expirada antes de llamar a `/auth/me`. |
| No había pruebas de autenticación. | `server/test/auth.routes.test.js`, `server/test/auth.e2e.test.js` y `client/test/authStorage.test.mjs`. |

Archivos nuevos: `server/src/modules/auth/session.service.js`,
`server/src/modules/auth/session.routes.js`.
Archivos modificados de forma aditiva: `server/src/middleware/auth.js`,
`server/src/server.js` (una línea de montaje + validación de `CLIENT_URL`),
`client/src/services/authStorage.js`, `client/src/App.jsx`.

## 3. Contrato de sesión (nuevo)

| Método | Ruta | Auth | Respuesta |
|---|---|---|---|
| GET | `/api/auth/session` | Bearer | `200 { valid, expiresAt, tokenId, user }` |
| POST | `/api/auth/logout` | Bearer | `200 { ok, revoked }` |
| GET | `/api/auth/token` | Bearer | `200 { valid, revoked, tokenId, expiresAt }` |

Revocación: `SessionRevocation` guarda `_id` (`jti` o `h:<sha256 del token>`),
`userId`, motivo y `expiresAt` con índice TTL (ventana máxima 90 días). Como
los tokens que emite `main` no incluyen `jti`, la revocación usa el hash del
token: **funciona con el contrato actual sin modificarlo**.

Códigos de rechazo: `TOKEN_REQUIRED`, `TOKEN_MISSING`, `TOKEN_INVALID`,
`TOKEN_EXPIRED`, `TOKEN_MALFORMED`, `TOKEN_REVOKED`,
`AUTH_STORAGE_UNAVAILABLE` (503 si el almacén de revocación no responde).

Montaje: `app.use("/api/auth", sessionRoutes)` se registra **antes** del
limitador estricto, de modo que hidratar la sesión o cerrarla no consume el
presupuesto de 20 intentos de login (verificado en
`auth.routes.test.js`: 25 peticiones a `/api/auth/session` no devuelven 429).

## 4. Flujo de seguridad resultante

```text
registro/login  →  token JWT (7d)  →  storage (localStorage o sessionStorage)
                                            │
        hidratación  ←  /auth/session o /auth/me  ←  Bearer
                                            │
        expiración detectada en cliente o TOKEN_EXPIRED del servidor
                                            │
        logout  →  POST /auth/logout  →  revocación  →  TOKEN_REVOKED
```

## 5. Validación

| Prueba | Comando | Resultado |
|---|---|---|
| Rutas de sesión, middleware y validación (sin DB) | `npm test --workspace=server` | 19 pruebas · 8 OK · 0 fallos |
| Flujo completo con MongoDB real | `MONGODB_URI=... npm test --workspace=server` | **OMITIDAS** en este entorno (11 pruebas) |
| Persistencia de sesión en cliente | `npm test --workspace=client` | 10 pruebas · 10 OK |
| Build | `npm run build --workspace=client` | OK |
| Flujo HTTP contra backend desplegado | `BASE=https://TU-API scripts/auth-smoke-test.sh` | **pendiente de ejecutar aquí** |

Cubierto por `auth.e2e.test.js` (se ejecuta con MongoDB real y limpia los
usuarios que crea): registro y duplicados, login y normalización de email,
errores indistinguibles, `/auth/me` y `/users/me`, `/auth/session` y
`/auth/token`, tokens ausente/malformado/ajeno/expirado, **logout que revoca
en todas las rutas protegidas**, re-login y migración legacy.

## 6. Bloqueos honestos

- **MongoDB real no se ha ejecutado** desde el entorno de trabajo: sin salida
  de red hacia MongoDB ni `mongod` local, y sin sustitutos en memoria por
  decisión del proyecto. Las 11 pruebas del flujo completo quedan OMITIDAS.
- **No hay refresh token ni rotación.** Existe expiración (7 días) y
  revocación por token; la rotación sigue pendiente (`KRONOS-UI-007`).
- **Sin sesiones por dispositivo** ni panel de sesiones (`KRONOS-UI-032`).
- La revocación por hash guarda una fila por token cerrado; con TTL de 90 días
  el crecimiento es acotado, pero un modelo de `Session` por dispositivo sería
  más limpio (trabajo futuro, no implementado aquí).
- Verificación de email (`KRONOS-UI-004`) sigue pendiente; `main` sí trae
  recuperación de contraseña por correo (Resend).
