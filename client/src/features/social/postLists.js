import { queryKeys } from "../../services/queryKeys";

/**
 * Utilidades de caché para listas de publicaciones (queries infinitos).
 *
 * Forma de caché: { pages: [{ posts, hasMore, total, totalPosts }], pageParams }.
 * Todas las listas (feed, perfil, guardados) comparten la raíz ["posts"],
 * así que una misma operación sincroniza todas las pantallas a la vez.
 */

/** Aplana las páginas deduplicando por _id (un post puede llegar en 2 páginas). */
export function flattenPostPages(pages = []) {
  const unique = new Map();
  for (const page of pages) {
    for (const post of page?.posts || []) {
      if (post?._id) unique.set(String(post._id), post);
    }
  }
  return [...unique.values()];
}

function mapListCache(cache, mapper) {
  if (!cache?.pages) return cache;
  return {
    ...cache,
    pages: cache.pages.map((page) => ({ ...page, posts: mapper(page.posts || []) })),
  };
}

/**
 * Actualiza un post en TODAS las listas cacheadas y en su detalle
 * (si está cacheado). `updater` recibe el post y devuelve el nuevo.
 */
export function updatePostEverywhere(queryClient, postId, updater) {
  const id = String(postId);
  queryClient.setQueriesData({ queryKey: ["posts"] }, (cache) =>
    mapListCache(cache, (posts) =>
      posts.map((post) => (String(post?._id) === id ? updater(post) : post))
    )
  );
  const detailKey = queryKeys.post(id);
  if (queryClient.getQueryData(detailKey)) {
    queryClient.setQueryData(detailKey, (post) => (post ? updater(post) : post));
  }
}

/** Elimina un post de todas las listas y de su detalle. */
export function removePostEverywhere(queryClient, postId) {
  const id = String(postId);
  queryClient.setQueriesData({ queryKey: ["posts"] }, (cache) =>
    mapListCache(cache, (posts) => posts.filter((post) => String(post?._id) !== id))
  );
  queryClient.removeQueries({ queryKey: queryKeys.post(id) });
}

/**
 * Quita un post SOLO de las listas de guardados (página /saved y pestaña
 * Guardados del perfil). El post sigue existiendo en el feed y demás
 * listas: dejar de guardar no elimina la publicación.
 */
export function removePostFromSavedLists(queryClient, postId) {
  const id = String(postId);
  queryClient.setQueriesData(
    {
      predicate: (query) =>
        query.queryKey[0] === "posts" &&
        (query.queryKey[1] === "saved" || query.queryKey[3] === "saved"),
    },
    (cache) =>
      mapListCache(cache, (posts) => posts.filter((post) => String(post?._id) !== id))
  );
}

/** Antepone un post recién creado al feed (y a nada más: es contenido propio nuevo). */
export function prependPostToFeed(queryClient, post, queryKey = queryKeys.posts.feed) {
  if (!post?._id) return;
  queryClient.setQueryData(queryKey, (cache) => {
    const pages = cache?.pages?.length ? cache.pages : [{ posts: [], hasMore: false, total: 0 }];
    if (flattenPostPages(pages).some((item) => String(item._id) === String(post._id))) {
      return cache;
    }
    const [first, ...rest] = pages;
    return {
      ...cache,
      pages: [{ ...first, posts: [post, ...(first.posts || [])] }, ...rest],
    };
  });
}

/** Actualiza el detalle de un post (sin tocar listas). */
export function setPostDetail(queryClient, postId, updater) {
  queryClient.setQueryData(queryKeys.post(postId), (post) =>
    typeof updater === "function" ? updater(post) : { ...post, ...updater }
  );
}
