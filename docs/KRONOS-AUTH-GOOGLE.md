# KRONOS-AUTH-GOOGLE — "Continuar con Google"

Estado: **implementado** (backend + frontend). Falta solo configurar el
`GOOGLE_CLIENT_ID` real en el entorno del servidor.

## Cómo funciona

Se usa **Google Identity Services** (GIS), el flujo oficial del botón
"Sign in with Google":

1. El frontend consulta `GET /api/auth/google/config`. Si el backend tiene
   `GOOGLE_CLIENT_ID`, responde `{ enabled: true, clientId }` y solo entonces
   carga el script `https://accounts.google.com/gsi/client` y renderiza el
   botón oficial (tema negro, pill, "Continuar con Google") en dos sitios:
   el landing (bajo las píldoras) y el panel del formulario (bajo el botón
   de enviar, tras un divisor "o").
2. Al hacer clic, Google entrega al navegador un **ID token** (JWT firmado
   por Google). **No hay Client Secret** en juego.
3. El frontend lo envía a `POST /api/auth/google` con body `{ credential }`.
4. El backend lo verifica con `google-auth-library`
   (`OAuth2Client.verifyIdToken`): firma (certificados públicos de Google),
   **audiencia** (`aud === GOOGLE_CLIENT_ID`) y expiración.
5. Con el payload validado (`sub`, `email`, `email_verified`, `name`,
   `picture`):
   - Usuario ya vinculado por `googleId` → inicia sesión.
   - Email existente en una cuenta local (y verificado por Google) → se
     **vincula** `googleId` a esa cuenta y se marca `emailVerified`.
   - Usuario nuevo → se crea la cuenta **sin contraseña local**, con email
     verificado, `displayName` y `avatar` de Google, y un `username` derivado
     del nombre/correo (con sufijos `_2`, `_3`… si está ocupado).
6. En los tres casos se emite la **misma sesión** que login/registro vía
   `issueSession()`: access token JWT + refresh token con rotación
   (KRONOS-UI-007). El frontend la guarda con `saveSession()` y navega a
   `/home`. Cero sesiones paralelas ni rutas distintas para Google.

### Seguridad

- `email_verified !== true` → 401 (Google no garantiza la titularidad del
  correo; no se vincula ni crea nada).
- Token inválido/expirado/audiencia incorrecta → 401 `GOOGLE_TOKEN_INVALID`.
- Sin `GOOGLE_CLIENT_ID` → 503 `GOOGLE_NOT_CONFIGURED` (y el botón no
  aparece, porque `enabled=false`).
- `googleId` vive en el modelo `User` con `select: false` e índice único
  sparse; nunca se expone en perfiles ni en `/auth/me`.
- `POST /api/auth/google` queda bajo el `authLimiter` existente
  (20 intentos / 15 min por defecto).
- `passwordHash` dejó de ser `required` en el esquema: las cuentas nacidas
  de Google no tienen contraseña local. El login local ya lo tolera (401
  limpio) y quien quiera puede fijar una contraseña después con el flujo de
  recuperación.

## Configuración (pendiente — lo hace el dueño del proyecto)

1. Entra a <https://console.cloud.google.com/> con la cuenta del proyecto.
2. Crea (o elige) un proyecto, p. ej. `kronos-space`.
3. **APIs y servicios → Pantalla de consentimiento OAuth**: tipo *Externo*,
   nombre de app `Kronos Space`, correo de soporte, y guarda. No hace falta
   publicar la app para probar con cuentas de prueba; para uso público
   pulsa *Publicar app* (o deja modo prueba y agrega cuentas de prueba).
4. **APIs y servicios → Credenciales → Crear credenciales → ID de cliente
   de OAuth → Aplicación web**.
5. En **Orígenes de JavaScript autorizados** agrega TODOS los orígenes donde
   corre el frontend, sin barra final:
   - `http://localhost:3000` (desarrollo local)
   - la URL del preview del sandbox si se quiere probar ahí
   - `https://kronos-space.com` (único dominio público oficial)
   - `https://www.kronos-space.com` solo mientras completa su redirección al canónico
   No agregues URLs de Vercel: son infraestructura técnica y deben redirigir al
   dominio oficial. No se necesitan URIs de redirección: GIS trabaja con popup.
6. Copia el **Client ID** (termina en `.apps.googleusercontent.com`).
7. En el entorno del **server** (Render/`.env`):

   ```
   GOOGLE_CLIENT_ID=1234567890-abcabcabc.apps.googleusercontent.com
   ```

8. Reinicia el backend. `GET /api/auth/google/config` debe responder
   `enabled: true` y el botón aparece en el landing y en el formulario.

> El Client ID es **público** por diseño; nunca hay que usar un Client
> Secret con este flujo. La validez del login depende de la verificación
> del ID token en el backend, no de ocultar el Client ID.

## Archivos tocados

| Archivo | Cambio |
| --- | --- |
| `server/package.json` | dependencia `google-auth-library` |
| `server/src/modules/users/User.js` | campo `googleId` (único, sparse, `select:false`); `passwordHash` opcional |
| `server/src/modules/auth/auth.routes.js` | `GET /google/config`, `POST /google`, helpers de username |
| `server/.env.example` | documenta `GOOGLE_CLIENT_ID` |
| `client/src/features/auth/Auth.jsx` | carga del SDK GIS, botón oficial, manejo de credencial |
| `client/src/services/apiClient.js` | `/auth/google` exento del retry de refresh |
| `client/src/styles.css` | estilos del bloque/divisor de Google |
| `server/test/auth.google.test.js` | tests HTTP (config, 400, 503, 401) |

## Pruebas

```
npm run test:server          # incluye server/test/auth.google.test.js
npm run test:client && npm run lint:client
```

La verificación con un token real requiere red hacia
`www.googleapis.com` y un `GOOGLE_CLIENT_ID` legítimo; en entornos sin
salida el endpoint responde 401 `GOOGLE_TOKEN_INVALID` (degradación
esperada y testeada).

## Diagnóstico de producción — 2026-09-19

Se comprobó directamente el despliegue público después del merge del PR
#24:

- `https://kronos-space.com/login` sirve la versión que contiene y renderiza
  el botón oficial de Google.
- `GET https://api.kronos-space.com/api/auth/google/config` responde
  `enabled: true` y expone un Client ID con formato válido
  `*.apps.googleusercontent.com`.
- `GET https://api.kronos-space.com/api/health` responde `ok: true`, con
  MongoDB conectado.
- El despliegue de Vercel correspondiente al commit `375cd2c` terminó con
  estado `success`.
- Los tests de contrato del backend para Google pasan (configuración,
  entrada vacía, servidor sin configurar y token inválido).

Esto descarta como causa que el código no esté desplegado, que falte
`GOOGLE_CLIENT_ID`, que el backend esté caído o que MongoDB esté desconectado.
El tramo que falta observar es el intento interactivo real: popup de Google →
ID token → `POST /api/auth/google` → creación/vinculación de usuario.

Durante el diagnóstico se encontró un defecto de observabilidad en el
frontend: si ese POST fallaba mientras el usuario seguía en el landing,
`Auth.jsx` guardaba el mensaje en estado pero solo lo mostraba dentro del
formulario local. Desde el punto de vista del usuario, el botón parecía no
hacer nada. Se corrigió para mostrar el error también bajo el botón del
landing; además, un fallo al cargar `accounts.google.com/gsi/client` ahora
informa que una extensión o el navegador puede estar bloqueándolo. Hay una
prueba UI de regresión en `client/test-ui/Auth.google.spec.jsx`.

Si el popup aún falla tras desplegar esta corrección, el texto que aparezca
permite separar inmediatamente los dos casos restantes:

1. **Google no entrega credencial:** revisar en Google Cloud que el OAuth
   Client ID sea de tipo *Aplicación web*, que `https://kronos-space.com`
   esté exactamente en *Orígenes de JavaScript autorizados* y que la cuenta
   esté agregada como usuario de prueba si la app sigue en modo Testing.
2. **El backend rechaza la credencial:** buscar en los logs de Render
   `GOOGLE_VERIFY_ERROR`, `GOOGLE_AUTH_ERROR`, `GOOGLE_LINK_OK` o
   `GOOGLE_REGISTER_OK` en la hora exacta del intento. No compartir el ID
   token ni copiarlo a tickets o chats.
