# KRONOS SPACE, causa raíz de acceso

## Causa raíz confirmada en código

El frontend Vite está fijado en `http://localhost:3000` por `client/vite.config.js`, mientras que el backend usaba `http://localhost:5173` como origen CORS por defecto en `server/src/server.js`. Cuando no existía `CLIENT_URL` en `server/.env`, el navegador bloqueaba las peticiones desde el frontend real antes de que `/api/auth/login` pudiera entregar una respuesta utilizable.

Además, el cliente tenía almacenamiento de sesión dividido: Auth podía guardar en `sessionStorage`, pero varias features solo buscaban el token en `localStorage`. Con "Recordar sesión" desactivado, el login podía devolver 200 y luego las pantallas protegidas recibían 401.

## Corrección aplicada

- El origen CORS por defecto ahora es `http://localhost:3000`.
- Los orígenes se normalizan para evitar fallos por slash final.
- `server/.env.example` y la documentación usan el mismo puerto real.
- Se añadió `client/src/services/authStorage.js` como fuente única de sesión.
- Se añadió `client/src/services/apiClient.js` con base URL, timeout y Authorization Bearer automático.
- App y Socket.IO recuperan tokens desde localStorage o sessionStorage.
- Login y registro validan respuesta completa, guardan sesión de forma consistente y manejan errores de red.
- Registro ahora exige confirmación de contraseña en frontend.

## Comprobación disponible

El contrato está alineado:

- `POST /api/auth/login` devuelve `{ token, user }`.
- Auth consume exactamente `response.data.token` y `response.data.user`.
- `users/me` acepta `Authorization: Bearer <token>`.
- `ProtectedRoute` usa el usuario hidratado desde el storage compartido.
- Logout limpia ambos storages.

No fue posible ejecutar una prueba real contra MongoDB o un usuario existente desde GitHub porque no hay credenciales de prueba ni entorno de ejecución conectado a esta sesión. Por tanto, no se declara un login remoto como probado hasta ejecutar el stack con un `.env` válido y una cuenta existente.
