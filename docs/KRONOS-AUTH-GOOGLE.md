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
   - `https://kronos-space.com` y `https://www.kronos-space.com`
   - el dominio alterno de Vercel (p. ej. `https://kronos-space.vercel.app`)
   No se necesitan URIs de redirección: GIS trabaja con popup.
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
