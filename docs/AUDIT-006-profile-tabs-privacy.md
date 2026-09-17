# AUDIT-006 — Pestañas de perfil y controles de privacidad

Fecha: 2026-09-17. Estado: **implementado localmente; validación E2E y publicación pendientes**.

Se toma el siguiente bloque indicado en `AUDIT-005-media-save.md`: KRONOS-UI-017 y KRONOS-UI-018. No se continúa con mensajería ni se fusiona/despliega el PR #10. No se modifican las credenciales, MongoDB, Render, Resend ni las rutas de autenticación.

## Alcance implementado

### Pestañas (UI-017)

- **Publicaciones:** originales del perfil (sin reposts).
- **Imágenes:** publicaciones con media de tipo image y URL no vacía, incluyendo republicaciones con imagen.
- **Republicaciones:** documentos con `repostOf`.
- **Guardados — Solo tú:** solo aparece al visitar el perfil propio, incluso mediante `/users/:id` propio; consulta el endpoint de guardados autenticado, nunca un userId suministrado por el navegador.
- Paginación independiente por pestaña, conteo filtrado, carga/vacío/error/reintento, deduplicación por ID y protección contra respuestas antiguas al cambiar de pestaña/perfil.
- Tabs con roles, aria-selected, asociación con panel, foco y navegación ArrowLeft/ArrowRight/Home/End; scroll horizontal en pantallas estrechas.
- Quitar un guardado lo retira de la pestaña privada. Republicar no inserta un post propio en la lista de otro perfil ni en la pestaña de originales.

### Privacidad de información de perfil (UI-018, parcial)

En Configuración → Editar perfil → Privacidad del perfil:

1. Mostrar biografía a otros usuarios.
2. Mostrar contadores de seguidores/seguidos.
3. Aparecer en la búsqueda de usuarios.

Se guardan en `User.profilePrivacy` como booleanos `showBio`, `showFollowCounts`, `discoverable`. Los documentos antiguos sin opciones mantienen el comportamiento público anterior; no se ejecutó migración ni escritura masiva. Cambios parciales solo actualizan las claves enviadas y no tocan credenciales o sesiones.

El servidor aplica los controles en perfiles por ID, por username y búsqueda. Los contadores ocultos se devuelven como `null`, no como números falsos; la UI conserva ese estado al seguir/dejar de seguir. El propietario puede ver siempre su biografía y contadores. La sesión local se actualiza con `updateUser`, sin reemplazar token, expiración ni recordar sesión.

**Límite explícito:** no es una cuenta privada. Publicaciones, comentarios, imágenes, nombre, avatar, perfil por enlace y relaciones visibles en otras interacciones siguen accesibles según el comportamiento actual. Tampoco implementa solicitudes de seguimiento, bloqueo, mute ni eliminación de información ya vista/copiada. La pantalla lo indica: ocultarse de búsqueda no deshabilita enlaces directos.

## Contratos de API

- `GET /api/posts/user/:userId?tab=posts|media|reposts|all&page=1&limit=20`.
  - Sin `tab`, conserva el contrato histórico `all`.
  - Mismo filtro en resultados y conteo; orden `createdAt desc, _id desc`.
  - `tab=saved` o cualquier valor no reconocido devuelve 400. Guardados ajenos no son un filtro público.
- `GET /api/posts/saved`: sigue usando exclusivamente `req.user.id`; ignora `userId` del query como selector de dueño.
- `PATCH /api/users/me/privacy` con claves booleanas conocidas, por ejemplo `{ "showBio": false }`.
  - 401 sin sesión, 400 tipo/clave inválidos o payload vacío, 404 sin usuario, 503 error de persistencia.
  - Actualiza exclusivamente el usuario del JWT, devuelve `{ privacy: { showBio, showFollowCounts, discoverable } }`.
- Perfiles públicos: lista explícita de campos; no se incluyen email, hashes, arrays de seguidores ni preferencias internas.

### Cierre de filtración de guardados

El serializador anterior devolvía `savedBy` junto con cada publicación. Se retiró ese array del payload público, incluidos los originales dentro de republicaciones. Se conservan `saved` relativo al visitante y `savedCount` como contador agregado; no se divulgan identidades de otros usuarios que guardaron el contenido. Esto no borra ningún guardado de MongoDB.

## Archivos principales

- Backend: `users/profilePrivacy.js`, `User.js`, `users.routes.js`, `posts/profilePostFilter.js`, `posts/normalizePost.js`, `posts.routes.js`.
- Cliente: `Profile.jsx`, `ProfileTabs.jsx`, `hooks/useProfileActivity.js`, `ProfilePrivacy.jsx`, `ProfileSettings.jsx`, `UserSearch.jsx`, servicios posts/users y estilos.
- Tests: `server/test/profile.privacy.test.js` y `client/test-ui/profile-block.spec.jsx`.

## Validación ejecutada

Con Node **20.20.2**:

- `npm test`: **57 aprobadas, 0 fallidas, 11 omitidas**.
  - Backend: 21 aprobadas, 11 E2E omitidas.
  - Cliente Node: 15 aprobadas.
  - UI Vitest/Testing Library: 21 aprobadas.
  - De ellas, **19 nuevas** cubren este bloque: 8 backend y 11 UI.
- `npm run build`: correcto (1714 módulos).
- Sintaxis de todos los archivos JS del backend: correcta.
- `npm audit`: cero vulnerabilidades reportadas en el lock disponible.
- `git diff --check`: sin errores.

Las nuevas pruebas HTTP usan JWT/rutas reales con persistencia simulada. Las pruebas UI usan jsdom/servicios simulados. No prueban entrega SMTP, MongoDB de producción, persistencia real tras redeploy ni renderizado en dispositivo físico. No se utilizaron datos personales del usuario, no se crearon cuentas ni se enviaron correos reales.

## Pendiente antes de publicar

- Pruebas contra MongoDB **aislado**, no la base `test` que contiene las cuentas reales.
- QA en navegador móvil/escritorio: navegación entre perfiles, tabs, foco, scroll, guardar preferencias, recargar y comprobar desde una segunda cuenta.
- Verificar filtros/counts con posts originales, imágenes y reposts reales; comprobar guardados desde otra cuenta.
- Publicar backend y frontend compatibles. Si se publica solo frontend, un backend antiguo puede ignorar `tab` o no tener `/me/privacy`; no marcarlo como funcional en producción antes del despliegue conjunto.
- Mantener por separado los pendientes del PR #10 (QA y almacenamiento persistente de uploads), los cambios de SEO y otros ajustes anteriores. No se actualizó ni fusionó ningún PR durante este bloque.
