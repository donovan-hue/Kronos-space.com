# KRONOS × TanStack Query — Arquitectura de datos (Fase 2)

**Fecha:** 2026-09-19
**Rama:** `arena/01a0baf9-kronos-space-com`
**Alcance:** client/ únicamente. Sin cambios de backend ni de contratos API.

## 1. Auditoría previa (hallazgos)

| Aspecto | Estado antes de esta fase |
| --- | --- |
| Cliente HTTP | `apiClient.js` sólido: axios + inyección de token, refresh single-flight, reintento único de 401, listeners de sesión. **Se conserva intacto.** |
| Servicios | 14 servicios de dominio (posts, users, messages, ai, moderation…) sobre `api`. **Se conservan; son los queryFn.** |
| Pantallas | Patrón `useState`+`useEffect`+fetch manual en cada pantalla: loading/error/paginación/deduplicación duplicados en 9 pantallas (~15 implementaciones). |
| Realtime | Socket.IO en Messages/Conversations/Notifications actualizando estado local. |
| Tests | 5 suites que actúan sobre `api`/servicios mockeados — sin dependencia de clases CSS. |

## 2. Decisiones de arquitectura

1. **TanStack Query v5 (`@tanstack/react-query` 5.103) sin devtools.** El estado
   de servidor (listas, perfiles, hilos, historial) vive en el caché de queries;
   el estado efímero (typing, presencia, drafts de formularios, colas de envío)
   permanece local — sin duplicación.
2. **`QueryClient` central** (`src/app/queryClient.js`): staleTime 30s,
   gcTime 5 min, retry solo en fallos de red/5xx (los 4xx son decisiones del
   backend; el 401 ya lo maneja apiClient), refetchOnWindowFocus activo.
3. **Sesión ligada al caché**: al terminar la sesión (logout, 401 irrecuperable,
   hidratación fallida) `App` ejecuta `queryClient.clear()` — el siguiente
   usuario nunca hereda datos del anterior.
4. **Claves de consulta únicas** (`src/services/queryKeys.js`). Todas las listas
   de publicaciones comparten la raíz `["posts"]`; el detalle es `["post", id]`.
5. **Socket.IO se mantiene** como canal en vivo: los eventos
   (`notification:new`, `message:new`, presencia, typing) escriben directo al
   caché (`setQueryData`) o a estado local si son efímeros — sin refetch.
6. **Sin reemplazar lo que funciona**: `apiClient`, servicios, `useMessageSend`
   (cola idempotente), `ToastProvider` y `GroupThread` (realtime-first) se
   conservan tal cual.

## 3. Migración por pantallas

| Pantalla/Hook | Query | Notas |
| --- | --- | --- |
| `useFeed` | `useInfiniteQuery ["posts","feed"]` | API pública idéntica; SocialPage sin cambios. `refresh()` cancela un "cargar más" en vuelo (semántica de carrera preservada y probada). |
| `useProfileActivity` | `useInfiniteQuery ["posts","user",id,tab]` | Pestañas aisladas por clave (respuesta lenta de una pestaña no pisa otra); `saved` en perfil ajeno no consulta (`enabled:false`). API pública idéntica. |
| `Profile` | `useQuery ["profile",kind,value]` | `following`/`blockedByMe`/`mutedByMe` derivan del caché; las acciones escriben el caché (una sola fuente). |
| `UserSearch` | `useQuery ["search",q,scope]` | Búsqueda por envío (botón/Enter) con caché 60s; repetir el mismo término no repite la petición. |
| `Notifications` | `useInfiniteQuery ["notifications",filter]` + `useNotifications` | Socket `notification:new` antepone en vivo a TODAS las claves de notificaciones y ajusta `unreadCount`; marcar leída/todas actualiza caché sin refetch. |
| `Messages` | `useQuery ["conversations"]` / `["messages",userId]` | Entrega/leída al abrir hilo (una vez por interlocutor); socket sigue alimentando el caché con dedupe por `clientMessageId`. Presencia/typing locales. |
| `Conversations` (lista) | `useQuery ["groups"]` | Invalidación al crear grupo. `GroupThread` (join/leave por socket) se conserva. |
| `PostDetail` | `useQuery ["post",id]` | Likes/guardados/ediciones sincronizan detalle **y todas las listas**; eliminar limpia caché global. |
| `SavedPosts` | `useInfiniteQuery ["posts","saved"]` | Quitar un guardado solo saca el post de las listas de guardados (no del feed). |
| `KairosHistory` | `useQuery ["kairos","history"]` | Combina imágenes+videos+scripts; eliminar/publicar actualiza caché. |
| `MediaLibrary` | `useQuery ["kairos","media"]` | `Promise.allSettled` con error parcial preservado. |

### Sincronización entre pantallas (`postLists.js`)

- `updatePostEverywhere(queryClient, postId, updater)` — like/guardado/edición
  refleja en feed + perfil + guardados + detalle a la vez.
- `removePostEverywhere` — para eliminaciones reales.
- `removePostFromSavedLists` — quitar de guardados sin tocar el feed.
- `prependPostToFeed` — post nuevo al frente, sin duplicar.

## 4. Detalle técnico para pruebas

`createTestQueryClient()` configura `notifyManager.setScheduler((cb) => cb())`:
el scheduler por defecto usa una macrotask (MessageChannel) que cae fuera del
`act()` de React y dejaba resultados obsoletos en asserts inmediatos. Con
despacho síncrono, los tests existentes (incluidos los de carreras) pasan sin
`waitFor` artificiales.

## 5. Validaciones (todas verdes)

| Validación | Resultado |
| --- | --- |
| `npm run lint` | ✓ sin warnings |
| `npm run build` | ✓ |
| `npm run test:client` | ✓ 15 node + 56 vitest (50 previos + 6 nuevos `query-integration.spec.jsx`) |
| `npm run test:server` | ✓ 47 pass / 0 fail (44 skips preexistentes) |
| Smoke test dev server | ✓ Vite arranca; App con QueryProvider y dependencia resueltas |

Tests nuevos (`query-integration.spec.jsx`): sincronización multi-lista de
`postLists`, alcance de "quitar guardado", prepend sin duplicar, socket → caché
de notificaciones (sin refetch), y caché de búsqueda.

## 6. Guía rápida

```js
import { queryKeys } from "@/services/queryKeys";
import { updatePostEverywhere } from "@/features/social/postLists";

// Nueva consulta
const { data, isPending, error } = useQuery({
  queryKey: queryKeys.post(id),
  queryFn: () => getPost(id),
});

// Mutación que sincroniza todas las pantallas
updatePostEverywhere(queryClient, postId, (p) => ({ ...p, liked: true }));
```

Reglas: pantalla nueva → query con clave de `queryKeys.js`; mutación de posts →
helpers de `postLists.js`; dato efímero del socket → estado local; nunca
duplicar en `useState` lo que ya está en el caché.
