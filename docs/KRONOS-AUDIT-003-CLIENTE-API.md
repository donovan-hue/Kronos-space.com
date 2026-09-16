# KRONOS-AUDIT-003 — Consolidar el cliente API y la sesión

Fecha: 2026-09-16 · Rama: `arena/01a0ab92-kronos-space-com`

## 1. Diagnóstico (evidencia real, no suposición)

El informe de verificación del despliegue (publicado por el CI en el PR) encontró
referencias prohibidas dentro del bundle que sirve producción:

| Origen | Bundle | Base de API del bundle |
| --- | --- | --- |
| `https://kronos-space.com` (Cloudflare Pages) | `index-DxciSEbr.js` | `/api` relativo **+ `http://localhost` y `http://localhost:5000/api`** |
| `https://kronos-social-ai-client.vercel.app` (Vercel) | `index-CLWnk-ST.js` | `https://api.kronos-space.com/api` **+ `http://localhost`** |

Causa raíz: **13 vistas** de `client/src/features/**/*.jsx` repetían su propia copia
del cliente HTTP:

```js
const API = import.meta.env.VITE_API_URL || "http://localhost:5000/api";
```

con llamadas `axios` directas y lecturas propias de
`localStorage.getItem("kronos_token")` / `kronos_user`.

Consecuencias reales:

1. Si `VITE_API_URL` no está definida en el build, el navegador del usuario intenta
   hablar con **su propia máquina** (`localhost:5000`) en lugar de la API: el login y
   el resto de la app fallan. Ese es exactamente el estado del sitio servido por
   Cloudflare Pages.
2. La sesión con “Recordar sesión” desactivado se guarda en `sessionStorage`, pero las
   vistas que leían solo `localStorage` **perdían el token** aunque existiera.
3. Un 401 en una vista no pasaba por el interceptor central: no limpiaba la sesión
   ni desconectaba el socket.

## 2. Cambios aplicados

Solo se sustituyó la **fuente** de la base de API y del token. Ninguna vista cambió
sus endpoints, cuerpos, cabeceras, estados ni manejo de errores.

| Antes | Ahora |
| --- | --- |
| `const API = import.meta.env.VITE_API_URL \|\| "http://localhost:5000/api"` | `const API = API_URL` (de `services/apiClient`, ya usa `/api` relativo sin variable) |
| `localStorage.getItem("kronos_token") \|\| sessionStorage.getItem("kronos_token")` | `getToken()` (de `services/authStorage`, respeta `remember` y descarta tokens expirados) |
| `JSON.parse(localStorage.getItem("kronos_user") \|\| "null")` | `getUser()` |
| `localStorage.setItem("kronos_user", JSON.stringify(u))` | `updateUser(u)` (escribe en el almacenamiento que realmente tiene la sesión) |

Archivos modificados (13):

`ai/KairosHistory.jsx`, `ai/KronosChat.jsx`, `ai/MediaLibrary.jsx`,
`auth/ResetPassword.jsx`, `image-ai/ImageGenerator.jsx`,
`script-ai/ScriptGenerator.jsx`, `social/Comments.jsx`, `social/CreatePost.jsx`,
`social/PostDetail.jsx`, `social/SocialPage.jsx`, `users/Profile.jsx`,
`video-ai/VideoGenerator.jsx`, `video-ai/VideoJobs.jsx`.

`KronosChat` ya usaba el nombre `API_URL` en sus llamadas: solo se eliminó la
declaración local duplicada.

### Lo que se dejó igual a propósito

- **Las llamadas `axios` directas siguen siendo `axios`.** La instancia `api` de
  `apiClient` impone `timeout: 15000`, suficiente para peticiones normales pero
  arriesgado en los endpoints de IA (imagen/vídeo/script pueden tardar más). Migrarlas
  a `api` es trabajo de AUDIT-007/008, donde se revisa el tiempo de espera de la IA.
- El interceptor de 401 de `apiClient` y el de `App.jsx` no se duplicaron.
- `socket.js` ya derivaba su URL de `API_URL`; no requería cambios.

## 3. Verificación ejecutada

```
npm install                                   → OK
npm run build (sin VITE_API_URL)              → ✓ built in 3.21s
  grep localhost client/dist/assets/*.js      → 4 coincidencias, TODAS internas de
                                                socket.io-client/no-builtins
  grep '"/api"' client/dist/assets/*.js       → presente (mismo origen, ya no :5000)
VITE_API_URL=https://api.kronos-space.com/api vite build
  grep 'https://api.kronos-space.com/api'     → presente en el bundle
npm test                                      → server 8 pass / 0 fail / 11 skip
                                                client 10 pass / 0 fail
Revisión sintáctica de todos los .jsx (esbuild transform) → OK
```

Las 11 pruebas omitidas del servidor siguen esperando un `MONGODB_URI` real
(AUDIT-002-VAL, sin cambios aquí).

Además se ajustó `scripts/verify-deploy.sh` para no marcar como fallo las cadenas
internas de `socket.io-client` (`http://localhost` como valor por defecto de su
`location`), que no son URLs de la aplicación: el verificador ahora solo falla ante
`localhost:5000` o `localhost/api`.

## 4. Cómo se cierra esta auditoría

1. CI + el informe del PR confirman el nuevo código (checks verdes).
2. El usuario pone `VITE_API_URL=https://api.kronos-space.com/api` en **Cloudflare
   Pages** y **redespliega** `kronos-space.com`. Con el cambio de esta rama, el bundle
   ya no puede caer en `localhost` aunque la variable falte: usaría `/api` relativo,
   que sigue necesitando proxy en ese origen.
3. Tras el redeploy, `Kronos Deploy Verify` debe reportar para ambos frentes:
   sin URLs de localhost y con base de API utilizable.
