import { useCallback, useMemo } from "react";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { getSavedPosts, getUserPosts } from "../../../services/postsService";
import { queryKeys } from "../../../services/queryKeys";
import { flattenPostPages } from "../../social/postLists";

function activityErrorMessage(requestError) {
  return (
    requestError?.response?.data?.error ||
    "No se pudo cargar esta pestaña. Inténtalo nuevamente."
  );
}

/**
 * useProfileActivity — publicaciones de un perfil por pestaña sobre
 * TanStack Query (useInfiniteQuery).
 *
 * Clave: ["posts","user",userId,tab] → cambiar de pestaña aísla su caché
 * (una respuesta lenta de la pestaña anterior nunca sustituye la actual)
 * y volver a una pestaña reciente la muestra al instante. "saved" en
 * perfil ajeno no llega a consultarse (enabled: false).
 * API pública idéntica a la versión anterior.
 */
export default function useProfileActivity(userId, tab, isOwnProfile) {
  const queryClient = useQueryClient();
  const enabled = Boolean(userId) && !(tab === "saved" && !isOwnProfile);
  const queryKey = queryKeys.posts.user(userId || "none", tab);

  const query = useInfiniteQuery({
    queryKey,
    queryFn: async ({ pageParam }) => {
      const options = { page: pageParam, limit: 20 };
      const data =
        tab === "saved"
          ? await getSavedPosts(options)
          : await getUserPosts(userId, { ...options, tab });
      const posts = Array.isArray(data?.posts) ? data.posts : [];
      return {
        posts,
        hasMore: typeof data?.hasMore === "boolean" ? data.hasMore : posts.length === 20,
        totalPosts: data?.totalPosts ?? data?.total ?? posts.length,
      };
    },
    enabled,
    initialPageParam: 1,
    getNextPageParam: (lastPage, allPages) =>
      lastPage?.hasMore ? allPages.length + 1 : undefined,
  });

  const posts = useMemo(() => flattenPostPages(query.data?.pages), [query.data]);

  const setPosts = useCallback(
    (updater) => {
      queryClient.setQueryData(queryKey, (cache) => {
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
    [queryClient, queryKey]
  );

  const setPostsCount = useCallback(
    (updater) => {
      queryClient.setQueryData(queryKey, (cache) => {
        if (!cache?.pages?.length) return cache;
        const pages = [...cache.pages];
        pages[0] = {
          ...pages[0],
          totalPosts:
            typeof updater === "function"
              ? updater(pages[0].totalPosts ?? 0)
              : updater,
        };
        return { ...cache, pages };
      });
    },
    [queryClient, queryKey]
  );

  const refresh = useCallback(async () => {
    await query.refetch();
  }, [query]);

  const loadMore = useCallback(async () => {
    if (!query.hasNextPage || query.isFetchingNextPage) return;
    await query.fetchNextPage();
  }, [query]);

  return {
    posts,
    setPosts,
    postsCount: query.data?.pages?.[0]?.totalPosts ?? 0,
    setPostsCount,
    postsLoading: enabled ? query.isPending : false,
    postsLoadingMore: query.isFetchingNextPage,
    postsError: query.error ? activityErrorMessage(query.error) : "",
    hasMore: Boolean(query.hasNextPage),
    page: query.data?.pageParams?.length ?? 1,
    refresh,
    loadMore,
  };
}
