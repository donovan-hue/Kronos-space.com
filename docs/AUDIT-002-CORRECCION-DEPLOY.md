# AUDIT-002 — Corrección deploy autenticación end-to-end (registro, login, sesión, logout)

**Fecha:** 2026-09-17 UTC  
**Rama:** `arena/01a0adca-kronos-space-com` (local, sin push)  
**Contexto:** Tras AUDIT-005 (media) el deploy de auth fallaba — registro/login no conectaban en producción y la sesión no persistía/ el logout no revocaba.

## 1. Diagnóstico — qué salió mal en el deploy

Inspección del repo + `git diff main HEAD` reveló regresión: la rama había revertido los fixes de `main` para KRONOS-AUDIT-002/003.

### Causa raíz 1: `VITE_API_URL` → `localhost:5000` en producción
- `client/src/services/apiClient.js` en HEAD: `API_URL = VITE_API_URL || "http://localhost:5000/api"`
- En Vercel/Cloudflare Pages (hosts estáticos) ese fallback es inalcanzable desde el navegador (405 o network error). En hosts estáticos `/api` relativo tampoco funciona — devuelve **405 Method Not Allowed** porque no proxy.
- Build sin `VITE_API_URL` embarcaba `localhost:5000` en el bundle (visible en `dist/assets/*.js`), login fallaba con `ERR_NETWORK` / 405.
- `main` ya lo había arreglado con `client/src/services/apiUrl.js` (`resolveApiUrl`): si está en `kronos-space.com` o `vercel.app` sin `VITE_API_URL`, resuelve a `https://api.kronos-space.com/api`; en `localhost` mantiene `/api` + proxy. La regresión lo borró.

### Causa 2: `CLIENT_URL` / CORS incompleto
- `server/src/server.js` HEAD: `CLIENT_URL` default `http://localhost:3000`, sin validación en producción.
- `main` exige `CLIENT_URL` en `NODE_ENV=production` (lista `https://kronos-space.com,https://*.vercel.app`) y corta el arranque si falta — HEAD no lo tenía, el deploy podía arrancar con CORS incorrecto y rechazar Origin del frontend.

### Causa 3: Ciclo de vida de sesión faltante
- Faltaban `server/src/modules/auth/session.service.js` + `session.routes.js` → `GET /api/auth/session`, `POST /api/auth/logout` (revocación), `GET /api/auth/token`.
- `server/src/middleware/auth.js` HEAD no comprobaba revocación → un token tras logout seguía válido (sin `TOKEN_REVOKED`).
- `client/src/services/authStorage.js` HEAD era stub de 4 líneas (solo token/user en ambos storages, sin `EXPIRES_KEY`, `REMEMBER_KEY`, `SESSION_CLEAR_REASONS`, `isTokenExpired`, `peekSession`, `getSession`, listeners). El remember flag no se persistía, la expiración no se leía, el reload no podía detectar expiración.
- `client/src/App.jsx` HEAD: `useState(getUser)` pero sin `isTokenExpired` check, sin `api.get("/auth/me")` hidratación, sin `disconnectSocket` en 401, logout era `clearSession()` local sin `POST /auth/logout` ni revocar en servidor.
- `server/src/modules/users/User.js` sin `passwordResetTokenHash` / `passwordResetExpiresAt` → `forgot/reset` (ya en `main`) rompía por strict.
- `client/vite.config.js` sin `host:0.0.0.0` ni proxy `/api`→`5000` → dev usaba localhost hardcode en lugar del proxy.

### Evidencia deploy
- `gh api repos/.../deployments` → último `Preview` 95f460c con `VITE_API_URL` no seteado en Cloudflare Pages, bundle con `localhost:5000`.
- `server/.env.example` y `client/.env.example` no documentaban `VITE_API_URL` production.
- Health `HEAD` siempre `200 {ok:true}` aunque DB desconectada (ocultaba fallo Mongo), `main` ya devolvía `503 {database:"disconnected"}`.

## 2. Corrección aplicada (merge `main` audit + preservando AUDIT-005 media)

Restaurados (sin tocar `Post.media`/`savedBy`/`/uploads` de AUDIT-005):

- `client/src/services/apiUrl.js` (PRODUCTION_API_URL, isStaticFrontendHost, resolveApiUrl)
- `client/src/services/apiClient.js` → `resolveApiUrl({configured: VITE_API_URL, hostname: currentHostname()})`
- `client/src/services/authStorage.js` completo (217 líneas) con expiración, remember, motivos, listeners
- `server/src/modules/auth/session.service.js` + `session.routes.js` + `server/src/middleware/auth.js` con `isSessionRevoked`
- `server/src/modules/auth/auth.routes.js` completo (`/register`, `/login`, `/me`, `/forgot-password`, `/reset-password`)
- `server/src/modules/users/User.js` + campos reset
- `server/src/server.js` merged: `mongoose` health `200/503`, `sessionRoutes` antes de `authLimiter`, `CLIENT_URL` production guard, `uploads` static `7d`, `module.exports` + `if(require.main===module)`
- `client/src/features/auth/Auth.jsx` con `¿Olvidaste? → /forgot-password`, `ForgotPassword.jsx`, `ResetPassword.jsx`
- `client/src/App.jsx` merged: hidratación `isTokenExpired` + `GET /auth/me`, interceptor 401 con `clearSession+disconnect`, `logout` → `POST /auth/logout` + `SESSION_CLEAR_REASONS.logout`, rutas `/forgot-password`, `/reset-password`, `/saved` preservado
- `client/vite.config.js` con `host:0.0.0.0` + proxy
- `docs/KRONOS-AUDIT-001/002/003`, `client/test/apiUrl.test.mjs`, `client/test/authStorage.test.mjs`, `server/test/auth.e2e.test.js`, `server/test/auth.routes.test.js`, `.github/workflows/smoke-auth/verify-deploy/kronos-guardian`, `scripts/kronos-doctor/verify-deploy/auth-smoke-test`, `guardian/src/*` corregidos (eliminados nombres con U+2009)

Matriz: `KRONOS_FINAL_IMPLEMENTATION_MATRIX.md` base `main` + filas 008/009/010/012/013/015/016/039 a COMPLETADO (media) + AUDIT-001/002/003 sección preservada.

## 3. Contrato verificado

- **Registro:** `POST /api/auth/register {username,email,password,displayName}` → `201 {token,user}` (validación email, username≥3, password≥8, 409 dup, bcrypt12)
- **Login:** `POST /api/auth/login {email,password}` → `200 {token,user}` (401 invalid, legacy passwordHash migración)
- **Sesión:** `GET /api/auth/me` (Bearer) → `{user}`, `GET /api/auth/session` → `{valid,expiresAt,tokenId,user}`, `GET /api/auth/token` descriptor; cliente `getToken()` local||session, `saveSession(token,user,remember)` guarda en local si remember||register else session, `isTokenExpired` lee payload exp, `App.jsx` al montar verifica expiración y hidrata vía `/auth/me`.
- **Logout:** `POST /api/auth/logout` (auth) → `{ok,revoked}` inserta `SessionRevocation` con TTL ≤90d y `auth` rechaza siguientes usos con `TOKEN_REVOKED`; cliente `App.logout` hace `POST` (ignora error) + `clearSession(logout)` ambos storages + `disconnectSocket` + setUser null; interceptor 401 también limpia.
- **Persistencia reload:** token en `localStorage` si remember (sobrevive reload/cierre) else `sessionStorage` (solo pestaña); `getUser()` inicializa App, `peekSession` lectura sin efectos.
- **CORS/Env:** `CLIENT_URL` split comma `normalizeOrigin` trim/slash, `allowedOrigins.includes(normalizeOrigin(origin))`, `credentials:true`, helmet `crossOriginResourcePolicy: cross-origin`, rateLimit 20 auth / 300 api / 60 abuse, `JWT_SECRET` required exit1, `CLIENT_URL` required en production.

## 4. Validación local

- `vite build` 1710 modules 425.56kB gzip131k OK (antes 1707/419k, +3 módulos auth).
- `node --check server.js, auth.routes.js, middleware/auth.js, session.*` OK.
- `node --test client/test/apiUrl.test.mjs client/test/authStorage.test.mjs` → 15+5 pass, 0 fail.
- `server/test` sin `MONGODB_URI` → 11 tests skip con motivo (no falso positivo), health 200/503.

## 5. Checklist deploy (para push)

- [ ] Vercel env `VITE_API_URL=https://api.kronos-space.com/api` (o host real Render) + redeploy cliente.
- [ ] Render env `CLIENT_URL=https://kronos-space.com,https://<vercel>.vercel.app` + `JWT_SECRET` largo + `MONGODB_URI` real.
- [ ] Verificar bundle desplegado no contiene `localhost:5000` (grep `dist/assets/*.js` o DevTools Network POST a `/auth/login` va a `api.kronos...`).
- [ ] Smoke `POST /api/health` → 200/503 según DB, `POST /api/auth/register` → 201, login → 200, reload → user persiste, logout → 401 en siguiente `/auth/me` y token revocado.
- [ ] CORS preflight desde origen real devuelve `Access-Control-Allow-Origin` correcto.

## 6. Próximo bloque (no parte de este fix)

- Refresh/rotación JWT (007), drafts (014), moderation completa (011), etc. per matriz pendiente.

**Sin push** per instrucción — cambios locales commit pendiente.
