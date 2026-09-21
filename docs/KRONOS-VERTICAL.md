# KRONOS — Vertical: video vertical como feed opcional (Fase 3, segunda mitad)

**Fecha:** 2026-09-21
**Rango:** Fase 3 del plan maestro, ítem "Video vertical como feed opcional, nunca sustituto forzado de Inicio". Cierra la Fase 3 iniciada con [KRONOS-STORIES.md](KRONOS-STORIES.md).

## Qué se entrega

- **Dimensiones reales en la media**: `media.width`/`media.height` y `media.orientation` (`vertical`/`horizontal`/`square`) se calculan en el servidor al publicar. `CreatePost` las captura del video real (`loadedmetadata`) y las envía con la publicación; el servidor recalcula y sanea (nunca confía en el cliente).
- **`GET /api/posts/vertical`** (en `posts.routes.js`, registrado antes que `/:postId`): feed paginado (`page`/`limit`, igual contrato que `/feed`) con solo videos `orientation ≠ horizontal`. Los videos sin dimensiones (publicaciones anteriores) siguen entrando para que el feed no nazca vacío; en cuanto se sepa que uno es horizontal, queda fuera.
- Moderación y audiencia reutilizadas: `feedConstraints` (bloqueados/silenciados/ocultos) + `withAudienceFilter` (público/seguidores/círculo/órbita).
- **Pantalla `/vertical`** (`VerticalFeed.jsx`):
  - Un video reproduce a la vez (IntersectionObserver), silenciado por defecto con la **preferencia compartida de video** (`services/videoPrefs.js`, la misma de stories).
  - Controles de consumo del plan: toque para pausar, progreso visible, ←/→ para navegar, M para silenciar, carga incremental al final.
  - Acciones laterales reales: reaccionar (con rollback y sincronización vía `["posts"]`), comentarios (enlace al detalle) y guardar.
- **Navegación**: ítem "Vertical" en el abanico (grupo Social) y ruta `/vertical`. Inicio no cambia: la superficie es opcional, como exige el plan.

## Decisiones y por qué

1. **Orientación calculada en el servidor desde dimensiones**, no detectada al vuelo en el cliente: el feed debe poder paginarse y filtrarse en la base, igual que el resto de superficies.
2. **`$ne: "horizontal"` y no `== "vertical"`**: las publicaciones existentes no tienen dimensiones; excluirlas dejaría el feed vacío el día del lanzamiento. Se prefiere incluir lo desconocido y excluir solo lo que se sabe horizontal.
3. **Sin transcodificación ni subtítulos todavía**: requieren un servicio de medios (ffmpeg/transcripción) que el proyecto aún no tiene; el plan los exige antes de "sonidos reutilizables". Documentado como pendiente, no simulado.
4. **Mute compartido con stories**: un solo ajuste de usuario para todo el video con autoplay (`kronos_video_muted`), en lugar de dos preferencias contradictorias.

## Validación

- Servidor: `node --test` → 142 pruebas, 88 ok, 0 fallos, 54 E2E omitidas sin `MONGODB_URI` (por diseño).
  - Nuevas: `server/test/vertical.contract.test.js` (4: esquema de dimensiones, cálculo/saneo de orientación, filtro del feed, orden de rutas con auth) y `server/test/vertical.e2e.test.js` (4, con MongoDB real en CI: solo videos no horizontales, audiencia respetada, bloqueo del autor, paginación sin repeticiones).
- Cliente: `vitest` 121 ok (nuevas 4 en `client/test-ui/vertical-feed.spec.jsx`: render con autor/acciones, reaccionar y guardar con endpoints reales, estado vacío, error con reintento) · `eslint src` sin hallazgos · build de Vite correcto.

## Fuera de este bloque (pendiente honesto)

- Transcodificación y variantes de calidad, subtítulos automáticos y música/sonidos (requiere política de copyright y servicio de medios; Fase 3 "cierre" completo).
- Analítica de video (alcance, retención): planificada para la Fase 8 con la analítica de creador.
- "Más como este" / preferencias por video: pertenece a la Fase 6 (Pulso y feeds elegibles).
