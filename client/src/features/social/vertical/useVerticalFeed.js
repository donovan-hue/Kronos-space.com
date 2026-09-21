import { useCallback, useMemo, useState } from "react";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { getVerticalFeed } from "../../../services/postsService";
import { queryKeys } from "../../../services/queryKeys";
import { flattenPostPages } from "../postLists";

function feedErrorMessage(requestError) {
  return (
    requestError?.response?.data?.error ||
    "No se pudo cargar el feed vertical."
  );
}

/**
 * useVerticalFeed — video vertical (Fase 3) sobre useInfiniteQuery.
 *
 * Misma arquitectura que useFeed pero con clave propia: el like/guardado
 * desde el feed vertical sincroniza con el resto de listas de publicaciones
 * porque comparten la raíz ["posts"] (ver postLists.js).
 */
export default function useVerticalFeed({ limit = 10 } = {}) {
  const queryClient = useQueryClient();
  const [actionError, setActionError] = useState("");
  const feedKey = queryKeys.posts.vertical;

  const query = useInfiniteQuery({
    queryKey: feedKey,
    queryFn: async ({ pageParam }) => {
      const data = await getVerticalFeed({ page: pageParam, limit });
      const posts = Array.isArray(data?.posts) ? data.posts : [];
      return {
        posts,
        hasMore: typeof data?.hasMore === "boolean" ? data.hasMore : posts.length === limit,
        total: typeof data?.total === "number" ? data.total : posts.length
      };
    },
    initialPageParam: 1,
    getNextPageParam: (lastPage, allPages) =>
      lastPage?.hasMore ? allPages.length + 1 : undefined
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
                : updater
          }))
        };
      });
    },
    [queryClient, feedKey]
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
    updatePost,
    hasMore: Boolean(query.hasNextPage),
    total: query.data?.pages?.[0]?.total ?? 0,
    loading: query.isPending,
    loadingMore: query.isFetchingNextPage,
    error: actionError || (query.error ? feedErrorMessage(query.error) : ""),
    setError: setActionError,
    refresh,
    loadMore
  };
}
