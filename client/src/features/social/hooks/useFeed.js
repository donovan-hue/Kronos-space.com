import { useCallback, useMemo, useState } from "react";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { getFeed } from "../../../services/postsService";
import { queryKeys } from "../../../services/queryKeys";
import { flattenPostPages, prependPostToFeed } from "../postLists";

function feedErrorMessage(requestError) {
  return (
    requestError?.response?.data?.error ||
    "No se pudieron cargar las publicaciones."
  );
}

/**
 * useFeed — feed paginado sobre TanStack Query (useInfiniteQuery).
 * Arquitectura: Screen -> Hook -> Service -> API -> Backend.
 *
 * El estado del feed vive en el caché de queries (clave ["posts","feed"]),
 * compartido con el resto de listas de publicaciones (ver postLists.js):
 * un like/editar/eliminar desde detalle o guardados sincroniza también
 * este feed. La API pública se mantiene idéntica a la versión anterior
 * para que SocialPage no cambie.
 *
 * Semánticas preservadas:
 * - refresh() cancela un "cargar más" en vuelo: una respuesta obsoleta
 *   de página N nunca pisa una recarga de página 1 (refetch cancela la
 *   descarga en curso).
 * - Deduplicación por _id al aplanar páginas.
 * - setError permite a la pantalla informar errores de acciones.
 */
export default function useFeed({ limit = 20, orbitId = "" } = {}) {
  const queryClient = useQueryClient();
  const [actionError, setActionError] = useState("");
  const feedKey = orbitId ? queryKeys.posts.orbit(orbitId) : queryKeys.posts.feed;

  const query = useInfiniteQuery({
    queryKey: feedKey,
    queryFn: async ({ pageParam }) => {
      const data = await getFeed({ page: pageParam, limit, orbitId });
      const posts = Array.isArray(data?.posts) ? data.posts : [];
      return {
        posts,
        hasMore: typeof data?.hasMore === "boolean" ? data.hasMore : posts.length === limit,
        total: typeof data?.total === "number" ? data.total : posts.length,
      };
    },
    initialPageParam: 1,
    getNextPageParam: (lastPage, allPages) =>
      lastPage?.hasMore ? allPages.length + 1 : undefined,
  });

  const posts = useMemo(() => flattenPostPages(query.data?.pages), [query.data]);

  const setPosts = useCallback(
    (updater) => {
      queryClient.setQueryData(feedKey, (cache) => {
        if (!cache?.pages) return cache;
        return {
          ...cache,
          pages: cache.pages.map((page) => ({
            ...page,
            posts:
              typeof updater === "function"
                ? updater(page.posts || [])
                : updater,
          })),
        };
      });
    },
    [queryClient]
  );

  const updatePost = useCallback(
    (postId, postUpdater) => {
      setPosts((items) =>
        items.map((post) =>
          String(post?._id) === String(postId)
            ? typeof postUpdater === "function"
              ? postUpdater(post)
              : { ...post, ...postUpdater }
            : post
        )
      );
    },
    [setPosts]
  );

  const removePost = useCallback(
    (postId) => {
      setPosts((items) => items.filter((post) => String(post?._id) !== String(postId)));
    },
    [setPosts]
  );

  const prependPost = useCallback(
    (post) => {
      prependPostToFeed(queryClient, post, feedKey);
    },
    [queryClient]
  );

  const refresh = useCallback(async () => {
    setActionError("");
    await query.refetch();
  }, [query]);

  const loadMore = useCallback(async () => {
    if (!query.hasNextPage || query.isFetchingNextPage) return;
    await query.fetchNextPage();
  }, [query]);

  return {
    posts,
    setPosts,
    page: query.data?.pageParams?.length ?? 1,
    hasMore: Boolean(query.hasNextPage),
    total: query.data?.pages?.[0]?.total ?? 0,
    loading: query.isPending,
    loadingMore: query.isFetchingNextPage,
    error: actionError || (query.error ? feedErrorMessage(query.error) : ""),
    setError: setActionError,
    refresh,
    loadMore,
    updatePost,
    removePost,
    prependPost,
  };
}
