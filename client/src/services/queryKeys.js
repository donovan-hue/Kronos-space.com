/**
 * Claves de consulta KRONOS — contrato único para caché, invalidación y
 * actualizaciones cruzadas entre pantallas.
 *
 * Todas las LISTAS de publicaciones comparten la raíz ["posts"] para que
 * un like/guardado/edición sincronice feed, perfil y guardados de una
 * sola vez (ver features/social/postLists.js).
 */
export const postKeys = {
  /** Feed principal (getFeed → /posts). */
  feed: ["posts", "feed"],
  /** Publicaciones de un usuario por pestaña (posts/media/reposts/saved). */
  user: (userId, tab) => ["posts", "user", String(userId), tab],
  /** Guardados standalone (/saved). */
  saved: ["posts", "saved"],
};

export const queryKeys = {
  posts: postKeys,
  /** Detalle de una publicación. */
  post: (postId) => ["post", String(postId)],
  /** Perfil: { kind: "me" } | { kind: "id", value } | { kind: "username", value }. */
  profile: (scope) => ["profile", scope.kind, scope.value ?? null],
  /** Búsqueda global por texto + ámbito. */
  search: (query, scope) => ["search", query, scope],
  /** Notificaciones por filtro ("" = todas). */
  notifications: (filter) => ["notifications", filter],
  /** Lista de conversaciones 1-a-1. */
  conversations: ["conversations"],
  /** Lista de grupos. */
  groups: ["groups"],
  /** Mensajes 1-a-1 con un usuario. */
  messages: (userId) => ["messages", String(userId)],
  /** Kairos — historial combinado y biblioteca multimedia. */
  kairosHistory: ["kairos", "history"],
  kairosMedia: ["kairos", "media"],
};
