# KRONOS-AUDIT-001 — Base de datos real y entorno mínimo

Estado: **CRITERIO DE TERMINADO CUMPLIDO Y VALIDADO CONTRA PRODUCCIÓN**
(2026-09-16T19:38Z) + cierre de huecos en esta rama.

## 1. Lo que ya estaba resuelto en `main` (no se tocó)

`main` (`78fd2c6 Stabilize auth API and validate persisted sessions`) ya
entregó el núcleo de esta auditoría:

- `server/src/config/db.js` exige `MONGODB_URI` y **no** tiene fallback en
  memoria. Su comentario es explícito: *“Deliberately does not fall back to
  MongoMemoryServer: an in-memory database can hide production/configuration
  errors and loses all data on restart.”*
- `server/src/server.js` aborta el arranque sin `JWT_SECRET`.
- `GET /health` y `GET /api/health` devuelven **200** cuando
  `mongoose.connection.readyState === 1` y **503** con `ok: false` cuando no.
- `server/test/db.test.js` comprueba que `connectDB` falla sin URI.
- `server/.env.example` documenta `MONGODB_URI`,
  `MONGODB_SERVER_SELECTION_TIMEOUT_MS`, `JWT_SECRET` y `CLIENT_URL`.

Por indicación del proyecto (**no modificar ni duplicar lo ya hecho**),
estos archivos se conservan tal cual.

## 2. Huecos reales que se cierran en esta rama

| Hueco | Cambio aplicado | Archivo |
|---|---|---|
| `mongodb-memory-server` seguía declarado como dependencia aunque el código no lo usa | eliminada del workspace del servidor (y del lockfile) | `server/package.json` |
| `CLIENT_URL` podía quedar implícito en producción (CORS con `http://localhost:3000`) | `startServer()` aborta si `NODE_ENV=production` y falta `CLIENT_URL`; además registra los orígenes CORS activos | `server/src/server.js` |
| El servidor no era importable en pruebas (arrancaba al importar) | `module.exports = { app, server, io, startServer }` y arranque solo con `require.main === module` | `server/src/server.js` |
| No existía forma de comprobar el entorno desplegado | `scripts/kronos-doctor.js` | `scripts/` |
| Pruebas HTTP del criterio de terminado | `server/test/auth.routes.test.js` (sin DB) y `server/test/auth.e2e.test.js` (con MongoDB real) | `server/test/` |

### `scripts/kronos-doctor.js`

```bash
# Local: valida variables y conecta a MongoDB real
node scripts/kronos-doctor.js

# Contra el backend desplegado, sin credenciales
BASE=https://TU-API-EN-RENDER node scripts/kronos-doctor.js
```

- Comprueba `MONGODB_URI`, `JWT_SECRET` y `CLIENT_URL` sin imprimir secretos
  (la contraseña de la URI se redacta como `usuario:***@host/base`).
- Con `BASE=` valida `GET /health` y muestra `HTTP`, `database` y `service`.
- Sin `BASE`, conecta a MongoDB real y reporta `base` y `host`.

## 3. Validación ejecutada en este entorno

| Comprobación | Comando | Resultado |
|---|---|---|
| Doctor sin variables | `node scripts/kronos-doctor.js` | 4 fallos con motivo · exit 1 |
| Doctor con MongoDB inalcanzable | `MONGODB_URI=mongodb://127.0.0.1:27099/... node scripts/kronos-doctor.js` | `connect ECONNREFUSED` · exit 1 · **sin fallback** |
| Pruebas servidor | `npm test --workspace=server` | 19 pruebas · 8 OK · 11 omitidas (requieren `MONGODB_URI`) · 0 fallos |
| Pruebas cliente | `npm test --workspace=client` | 10 pruebas · 10 OK |
| Build frontend | `npm run build --workspace=client` | OK |

## 4. Validación real contra producción (Render + MongoDB Atlas)

Backend desplegado: `https://kronos-space-com-bwu9.onrender.com`

| Petición | Respuesta real | Lectura |
|---|---|---|
| `GET /health` | `200 {"ok":true,"service":"kronos-social-ai","database":"connected","realtime":true,"timestamp":"2026-09-16T19:38:20.059Z"}` | **MongoDB real conectado** y health OK |
| `GET /api/health` | `200` mismo cuerpo, `timestamp":"2026-09-16T19:38:34.223Z"` | Endpoint duplicado operativo |
| `GET /api/users/me` (sin token) | `401 {"error":"Token requerido"}` | Middleware de autenticación activo |
| `GET /api/auth/session` | `Cannot GET /api/auth/session` | Producción corre `main` (#6): las rutas de sesión llegan con el PR abierto |
| `GET https://kronos-space.com` | SPA servida, redirige a `/login` con el formulario real | Frontend desplegado y enlazado a la API |

Con esto el criterio de terminado de esta auditoría queda **cumplido**:
*backend conecta a MongoDB real y health responde OK*.

## 5. Lo que falta y no se declara terminado

El entorno de trabajo solo tiene salida de red a `github.com` y
`registry.npmjs.org` (no hay `mongod` local), así que las 11 pruebas de
`auth.e2e.test.js` siguen reportándose **OMITIDAS** con ese motivo y **no se
sustituyen por datos en memoria**. Se ejecutan desde el runner de GitHub
Actions (que sí tiene red) o en local:

```bash
# Suites completas contra MongoDB (usa una base de PRUEBAS)
cd server && MONGODB_URI="mongodb+srv://.../kronos_audit_test" npm test
```

El health desplegado ya está validado (sección 4). Lo que queda es la
validación del flujo POST (registro/login/logout) contra la API real, que
requiere el workflow `Kronos Auth Smoke Test` (sección 6).

## 6. Validación del flujo POST en producción

`scripts/auth-smoke-test.sh` ejecuta el flujo completo contra un backend real
(registro, login, rutas protegidas, logout y revocación). Desde este entorno
no puede ejecutarse porque el sandbox no permite salida POST a Internet, así
que se ejecuta en un runner de GitHub:

```bash
gh workflow run "Kronos Auth Smoke Test" -f base_url=https://kronos-space-com-bwu9.onrender.com
gh run watch
```

**Aviso:** ese flujo crea un usuario temporal (`smoke<timestamp>@example.com`)
en la base de datos apuntada. Se dispara a mano y nunca en cada push. Si no
quieres usuarios temporales en producción, apunta `base_url` a un backend
conectado a una base de pruebas.
