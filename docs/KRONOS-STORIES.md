# KRONOS — Stories (Fase 3, primera mitad)

**Fecha:** 2026-09-21
**Rango:** Fase 3 del plan maestro (`KRONOS-SOCIAL-BENCHMARK-Y-PLAN-2026-09-19.md`), ítem "Stories con backend real". El video vertical como feed opcional, la transcodificación y la analítica de video quedan para el siguiente bloque.

## Qué se entrega

Historias efímeras de 24 horas con backend real: modelo, API, bandeja del feed, visor, creador y archivo personal.

### Backend (`server/src/modules/stories/`)

- **`Story.js`**: media propia (`/uploads/` únicamente, imagen o video), texto ≤500, texto alternativo ≤500, audiencia (`public` | `followers` | `circle`), `expiresAt` obligatorio, `views` y `replies` embebidos.
- **`stories.routes.js`** montado en `/api/stories` con `abuseLimiter`:
  | Método | Ruta | Qué hace |
  |---|---|---|
  | GET | `/` | Bandeja: historias activas propias + de quienes sigues, agrupadas por autor con `hasUnseen`. |
  | POST | `/` | Crea historia (expiración de 24 h fijada por el servidor; máx. 20 activas). |
  | GET | `/me/archive` | Archivo personal: propias, activas y expiradas (≤50). |
  | GET | `/:storyId` | Una historia activa y visible para el espectador. |
  | DELETE | `/:storyId` | El autor elimina su historia. |
  | POST | `/:storyId/view` | Marca vista (idempotente; las propias no cuentan). |
  | GET | `/:storyId/views` | Solo el autor: quién la vio (≤200, sin usuarios de terceros). |
  | POST | `/:storyId/reply` | Respuesta privada (1–1000 caracteres, máx. 500 por historia). |
  | GET | `/:storyId/replies` | Solo el autor: respuestas recibidas. |

### Frontend

- `client/src/services/storiesService.js`: cliente de la API. La subida de archivos reutiliza `/api/posts/media/upload` (misma validación de firma y tamaño; sin endpoint duplicado).
- `client/src/features/social/stories/`:
  - **`StoriesBar.jsx`**: bandeja horizontal en Inicio (`SocialPage` solo en el feed general, no en órbitas). Anillo aqua si hay historias sin ver; "Crear" si no hay propias; acceso al archivo.
  - **`StoryViewer.jsx`**: visor a pantalla completa con barras de progreso, avance automático en imágenes (6 s) y por fin de video, navegación por toque/teclado (←/→/Escape), mute de video persistido en `localStorage`, marcado de vista, respuesta privada para historias ajenas y panel de actividad (vistas + respuestas) con borrado para las propias.
  - **`StoryCreator.jsx`**: sube media, texto alternativo, texto y audiencia (pública, seguidores o uno de tus círculos) validados con `storySchema` (Zod, `src/schemas`).
  - **`StoryArchive.jsx`** en `/stories/archive`: propias activas y expiradas con conteos y borrado.
- `client/src/styles/stories.css` con los tokens existentes (aqua/negro); respeta `prefers-reduced-motion`.

## Decisiones y por qué

1. **Expiración por consulta, no por índice TTL de MongoDB.** Un TTL eliminaría el documento y con él el "archivo personal" que exige el plan. Tras 24 h la historia desaparece de todas las superficies de consumo (`expiresAt > now` en cada consulta); solo `/me/archive` del autor la conserva hasta que él la borre.
2. **Media solo de `/uploads/`.** La historia ocupa toda la pantalla y es efímera; no se aceptan URLs externas que la moderación no puede inspeccionar. La generación de Kairos también escribe en `/uploads/`, así que se puede publicar desde la biblioteca.
3. **`views`/`replies` embebidos.** La historia muere a las 24 h: no se justifica una colección propia. Nunca salen del documento: `normalizeStory` expone solo conteos y `viewed` del propio espectador; los listados completos son endpoints exclusivos del autor.
4. **Moderación integrada, no nueva.** La bandeja excluye autores bloqueados/silenciados (`feedConstraints`) y la audiencia se resuelve con `withAudienceFilter`/`canViewPost` reutilizados de publicaciones (mismo lenguaje: círculos propios, seguidores, público). Ver y responder exige `canInteract` (bloqueos).
5. **Sin tipo de notificación nuevo.** El catálogo `NOTIFICATION_TYPES` (6 tipos, BLOQUE 008) está cerrado; no se inventa un séptimo tipo en este bloque. El autor ve respuestas/vistas en el panel de actividad y en su archivo.

## Validación

- Servidor: `node --test` → 134 pruebas, 84 ok, 0 fallos, 50 E2E omitidas sin `MONGODB_URI` (por diseño). Nuevas:
  - `server/test/stories.contract.test.js` (4): modelo, parser, normalización sin fugas de usuarios, mapa de rutas con auth.
  - `server/test/stories.e2e.test.js` (6): creación con expiración de 24 h, bandeja solo de quienes sigues, vistas idempotentes, respuestas y vistas exclusivas del autor, audiencia seguidores/círculo contra base real, expiración real con archivo del autor, y bloqueo que saca al autor de la bandeja sin borrar sus historias. Se ejecuta con MongoDB real en CI (`npm run test:e2e`).
- Cliente: `vitest` 117 ok (nuevas 6 en `client/test-ui/stories.spec.jsx`: bandeja con anillos, visor con vista/navegación/respuesta, panel del autor con borrado, creador con audiencia de círculo, creador sin archivo, archivo con expiradas) · `node --test` 20 ok · `eslint src` sin hallazgos.
- Build de Vite correcto.

## Fuera de este bloque (pendiente honesto)

- Video vertical como feed opcional, transcodificación, subtítulos y analítica (segunda mitad de la Fase 3).
- Reporte directo de una historia (hoy se bloquea/silencia al autor; el `ReportDialog` cubre publicaciones y perfiles).
- Notificación al autor por nueva respuesta (requiere ampliar el catálogo cerrado del BLOQUE 008).
- Música/sonidos reutilizables: bloqueados por política de copyright, como define el plan.
