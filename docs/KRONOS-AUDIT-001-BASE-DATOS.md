# KRONOS-AUDIT-001 — Base de datos real y entorno mínimo

Estado: **completado en `main` (#6) + cierre de huecos en esta rama.**
Validación contra MongoDB real: **pendiente de ejecutar en un entorno con
red** (ver sección 4).

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

## 4. Lo que falta y no se declara terminado

El criterio *“backend conecta a MongoDB real y `/health` responde OK”* **no
se puede cerrar desde el entorno de trabajo**: solo hay salida de red a
`github.com` y `registry.npmjs.org`, no hay `mongod` instalado y no se puede
descargar binario. Las pruebas que requieren MongoDB se reportan como
**OMITIDAS** con ese motivo; **no se sustituyen por datos en memoria**.

Comandos de cierre (en un entorno con red real):

```bash
# 1. Eliminar el riesgo de datos de prueba en la base real:
export MONGODB_URI="<base de pruebas dedicada, no producción>"

BASE=https://TU-API-EN-RENDER node scripts/kronos-doctor.js   # health desplegado
cd server && npm test                                          # suites con MongoDB
```

Se considerará cerrado cuando `/health` devuelva `ok: true` con
`database: "connected"` y las 11 pruebas de `auth.e2e.test.js` pasen de
OMITIDAS a aprobadas.
