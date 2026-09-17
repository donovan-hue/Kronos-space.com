# KRONOS, matriz de implementación actual

Estados: COMPLETADO, PARCIAL, PENDIENTE, BLOQUEADO POR ENTORNO.

| ID | Área | Estado | Evidencia / siguiente acción |
|---|---|---|---|
| KRONOS-UI-001 | Perfil por username | PENDIENTE | La ruta existe, el componente aún lee `id`. |
| KRONOS-UI-002 | Editor settings/profile | PENDIENTE | La ruta aún renderiza Settings general. |
| KRONOS-UI-003 | Recuperación de cuenta | PENDIENTE | Falta endpoint y flujo de correo. |
| KRONOS-UI-004 | Verificación de email | PENDIENTE | Falta modelo y endpoints. |
| KRONOS-UI-005 | Validación auth | PARCIAL | Confirmación de contraseña añadida. |
| KRONOS-UI-006 | Sesión consistente | COMPLETADO | `authStorage.js` centraliza ambos storages. |
| KRONOS-UI-007 | Refresh/revocación JWT | PENDIENTE | JWT actual es de 7 días, sin refresh. |
| KRONOS-UI-008 | Paginación feed | COMPLETADO | `posts.routes.js` paginado `?page&limit` + `useFeed` con `hasMore`, dedup por `_id` y `Load More`. |
| KRONOS-UI-009 | Media posts | PENDIENTE | Post actual es texto. |
| KRONOS-UI-010 | Edit/delete posts | COMPLETADO | `PATCH/DELETE /:postId` con check autor 403/404 + UI inline edit/delete + rollback. |
| KRONOS-UI-011 | Moderación posts | PARCIAL | `DELETE /:postId/comments/:commentId` por autor/post; falta report/hide/block/mute. |
| KRONOS-UI-012 | Save/repost | PENDIENTE | Falta persistencia. |
| KRONOS-UI-013 | Composer multimedia | PENDIENTE | CreatePost solo texto. |
| KRONOS-UI-014 | Drafts | PENDIENTE | Sin modelo ni endpoints. |
| KRONOS-UI-015 | Alt/captions | PENDIENTE | Sin flujo multimedia. |
| KRONOS-UI-016 | Cover/avatar upload | PARCIAL | Perfil acepta avatar URL, no upload. |
| KRONOS-UI-017 | Profile tabs | PARCIAL | Publicaciones paginadas con edit/delete y deduplicación; faltan tabs segregados followers/following. |
| KRONOS-UI-018 | Privacy profile | PENDIENTE | Sin settings backend. |
| KRONOS-UI-019 | Message attachments | PENDIENTE | Solo texto. |
| KRONOS-UI-020 | Presence/typing | PENDIENTE | Socket solo emite mensajes. |
| KRONOS-UI-021 | Message retry/status | PENDIENTE | Sin estados persistentes. |
| KRONOS-UI-022 | Group messages | PENDIENTE | Sin modelo Conversation. |
| KRONOS-UI-023 | Notification catalog | PARCIAL | Follow, like, comentario. |
| KRONOS-UI-024 | Notification filters | PENDIENTE | Sin filtros/paginación. |
| KRONOS-UI-025 | Global search | PENDIENTE | Solo usuarios. |
| KRONOS-UI-026 | Explore | PENDIENTE | Alias del buscador de usuarios. |
| KRONOS-UI-027 | Kairos image controls | PARCIAL | Prompt, negative prompt y style. |
| KRONOS-UI-028 | Kairos video jobs | PARCIAL | Generate/history, sin polling completo. |
| KRONOS-UI-029 | Kairos script editor | PARCIAL | Generación/copia, capacidades avanzadas reducidas. |
| KRONOS-UI-030 | Kairos history actions | PARCIAL | Filtros y preview, faltan delete/reuse/publish. |
| KRONOS-UI-031 | Settings completo | PENDIENTE | Solo datos de cuenta y logout. |
| KRONOS-UI-032 | Sesiones/dispositivos | PENDIENTE | Sin modelo Session. |
| KRONOS-UI-033 | Admin | PENDIENTE | No existe ruta ni backend. |
| KRONOS-UI-034 | Offline | PENDIENTE | Sin manager global. |
| KRONOS-UI-035 | Toast/modal | PENDIENTE | Feedback local disperso. |
| KRONOS-UI-036 | Accessibility | PARCIAL | Focus y labels añadidos en Auth, falta auditoría global. |
| KRONOS-UI-037 | Responsive QA | PARCIAL | CSS responsive, sin ejecución en matriz de dispositivos. |
| KRONOS-UI-038 | Security moderation | PENDIENTE | Falta report/block/admin. |
| KRONOS-UI-039 | API centralizada | COMPLETADO (social) | `apiClient` + `postsService`/`usersService` + `useFeed`; migración AI pendiente. |
| KRONOS-UI-040 | CSS unificado | PARCIAL | Design System nuevo convive con CSS legacy. |
| KRONOS-UI-041 | Frontend lint | BLOQUEADO POR ENTORNO | No existe script lint en package.json. |
| KRONOS-UI-042 | Route tests | PENDIENTE | No hay suite frontend. |
| KRONOS-UI-043 | Interaction tests | PENDIENTE | No hay suite frontend. |
| KRONOS-UI-044 | Env/CORS | PARCIAL | Defaults locales corregidos, producción requiere valores reales. |
| KRONOS-UI-045 | Observability | PENDIENTE | Logs básicos, sin métricas/auditoría. |

La matriz no finge terminación: el acceso local quedó corregido por código, pero el producto completo aún requiere las tareas pendientes indicadas.
