# Configuración del entorno: qué lleva cada variable y de dónde sale su valor

Esta es la lista completa de variables del servidor y del cliente, con el valor
que corresponde en producción y de dónde se obtiene. Los valores secretos no
viven en el repositorio: se pegan en el panel del proveedor (Render para el
servidor, Vercel para el cliente). Aquí van con su sitio de origen, no con su
contenido.

Las que se marcan **obligatorias** detienen o degradan el arranque si faltan. El
resto tiene valor por defecto en el código y se puede dejar vacía.

## Servidor (Render)

| Variable | Valor en producción | De dónde sale | ¿Obligatoria? |
|---|---|---|---|
| `PORT` | `10000` | Render la inyecta sola; no hace falta definirla. Si se define, el servidor escucha ahí | No |
| `NODE_ENV` | `production` | Fijo. Solo `development` y `test` construyen índices al arrancar | No (vacío = producción) |
| `MONGODB_URI` | `mongodb+srv://…@…mongodb.net/kronos_social_ai?retryWrites=true&w=majority` | MongoDB Atlas: Database > Connect > Drivers | **Sí** |
| `MONGODB_SERVER_SELECTION_TIMEOUT_MS` | `10000` | Fijo | No |
| `MONGODB_AUTO_INDEX` | `false` | Fijo. En producción los índices los crea la migración 004 | No |
| `JWT_SECRET` | Cadena larga aleatoria | Se genera: `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"` | **Sí** (sin ella la sesión no firma) |
| `JWT_EXPIRES_IN` | `7d` | Fijo | No |
| `JWT_REFRESH_EXPIRES_IN` | `30d` | Fijo | No |
| `CAPSULE_SECRET` | Otra cadena aleatoria, distinta de la anterior | Igual que JWT_SECRET. Si falta, se deriva de JWT_SECRET, pero rotar la llave vieja volvería ilegibles las cápsulas ya escritas | Recomendada |
| `CANONICAL_HOST` | `kronos-space.com` | Fijo | No |
| `CLIENT_URL` | `https://kronos-space.com,https://www.kronos-space.com` | Fijo. El primero es el canónico y se usa en correos y referencias | Recomendada |
| `TRUST_PROXY` | `1` | Fijo en Render: hay un proxy delante. Sin esto, los límites de peticiones ven la IP del proxy en lugar de la del visitante | Recomendada en Render |
| `API_RATE_LIMIT_MAX` | Vacío (300 por 15 min) | Fijo; solo se sube en pruebas de carga | No |
| `ABUSE_RATE_LIMIT_MAX` | Vacío (60 por 15 min) | Fijo | No |
| `AUTH_RATE_LIMIT_MAX` | Vacío (20 por 15 min) | Fijo | No |
| `GEMINI_API_KEY` | `AIza…` | Google AI Studio > Get API key (aistudio.google.com/apikey). Es la del **chat** de Kairos | Para el chat |
| `GEMINI_MODEL` | Vacío (`gemini-3.6-flash`) | Fijo; se verifica contra el proveedor antes de cambiarlo | No |
| `OPENROUTER_API_KEY` | `sk-or-v1-…` | openrouter.ai/keys. Sirve para **imagen, guion y voz** | Para imagen, guion y voz |
| `OPENROUTER_MODEL` | `openrouter/free` | Fijo. Modelo del guion | No |
| `OPENROUTER_IMAGE_MODEL` | `google/gemini-2.5-flash-image` | Fijo. Modelo de imagen | No |
| `OPENROUTER_IMAGE_SIZE` | `1024x1024` | Fijo; solo se envía si el modelo lo declara | No |
| `OPENROUTER_IMAGE_ASPECT_RATIO` | `1:1` | Fijo | No |
| `OPENROUTER_TTS_MODEL` | `x-ai/grok-voice-tts-1.0` | Fijo; es el modelo de la **locución**. Usa la misma llave de OpenRouter | No |
| `OPENROUTER_TTS_VOICE` | `eve` | Voz dentro de ese modelo; el catálogo de voces lo lista el proveedor | No |
| `OPENROUTER_BASE_URL` | Vacío | Fijo vacío = proveedor oficial. Definirlo apunta a un gateway compatible y la prueba de humo lo marca como no verificado | No |
| `VIDEO_API_KEY` | (pendiente) | Del proveedor de video que se elija. OpenRouter no genera video: sin estas dos, la capacidad de video se declara en falta | Para el video |
| `VIDEO_API_URL` | (pendiente) | Igual que la anterior | Para el video |
| `VIDEO_MODEL` | Vacío | Fijo | No |
| `RESEND_API_KEY` | `re_…` | resend.com > API Keys. Correos del sitio | Para correos |
| `RESEND_FROM_EMAIL` | Remitente verificado | resend.com > Domains | Para correos |
| `REQUIRE_VERIFIED_EMAIL_TO_POST` | Vacío (apagada) | Fijo vacío. Con `true`, crear publicaciones y republicaciones exige el correo verificado y responde `403` con `code=correo_no_verificado`. **No se enciende sin `RESEND_API_KEY`**: sin correo de verificación la guarda deja de filtrar spam y cierra el producto para todas las cuentas locales. No aplica a comentarios, reacciones ni mensajes directos | No |
| `GOOGLE_CLIENT_ID` | `….apps.googleusercontent.com` | Google Cloud Console > APIs y servicios > Credenciales > ID de cliente de OAuth (Web). Solo el Client ID: no hay Client Secret. Sin ella, el botón de Google queda desactivado | Para entrar con Google |

## Cliente (Vercel)

| Variable | Valor en producción | De dónde sale | ¿Obligatoria? |
|---|---|---|---|
| `VITE_API_URL` | `https://api.kronos-space.com/api` | Fijo. Si falta, el cliente lo resuelve solo por el host, pero se pierde el control | Recomendada |
| `VITE_GOOGLE_CLIENT_ID` | El mismo Client ID de arriba | Google Cloud Console | Para entrar con Google |

`socket.js` deriva el host del backend de `VITE_API_URL`: no necesita otra
variable. En el cliente no va ninguna clave secreta: todo lo que empieza con
`VITE_` se compila y queda visible en el navegador.

## Cómo se comprueba que quedaron bien

- Al arrancar, el servidor imprime `entorno=… autoIndex=…`: esa línea confirma
  `NODE_ENV` y `MONGODB_AUTO_INDEX`.
- `GET /api/kairos/capacidades` responde el estado de cada herramienta y, cuando
  falta algo, el nombre exacto de la variable. Es la misma verdad que pinta el
  tablero de Kairos.
- `GET /api/voices` devuelve `servicio.listo` y la variable de la voz.

## Rotación de secretos

Al cambiar `JWT_SECRET` se cierran todas las sesiones (hay que volver a entrar);
las cápsulas del tiempo solo se vuelven ilegibles si `CAPSULE_SECRET` estaba
vacío y dependía de la llave vieja. Por eso se recomienda definir
`CAPSULE_SECRET` con valor propio desde el principio.
