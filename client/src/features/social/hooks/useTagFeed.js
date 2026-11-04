import { useCallback } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { getPostsByHashtag } from "../../../services/postsService";
import { queryKeys } from "../../../services/queryKeys";
import { flattenPostPages } from "../postLists";

/**
 * useTagFeed — páginas del listado de un tema (`GET /posts/topic/:tag`).
 *
 * La clave incluye la etiqueta normalizada: dos temas distintos no comparten
 * caché, y volver a un tema ya visto lo sirve al instante mientras revalida.
 * La normalización replica la del servidor (`hashtag.service.js`): sin `#`,
 * en minúsculas.
 */
export default function useTagFeed(tag, { limit = 20 } = {}) {
  const normalized = String(tag || "").trim().replace(/^#/, "").toLocaleLowerCase("und");
  const tagKey = queryKeys.posts.tag(normalized);

  const query = useInfiniteQuery({
    queryKey: tagKey,
    enabled: Boolean(normalized),
    queryFn: async ({ pageParam }) => {
      const data = await getPostsByHashtag(normalized, { page: pageParam, limit });
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

  const loadMore = useCallback(async () => {
    if (!query.hasNextPage || query.isFetchingNextPage) return;
    await query.fetchNextPage();
  }, [query]);

  const retry = useCallback(() => query.refetch(), [query]);

  return {
    tag: normalized,
    posts: flattenPostPages(query.data?.pages),
    total: query.data?.pages?.[0]?.total ?? 0,
    loading: query.isPending,
    loadingMore: query.isFetchingNextPage,
    hasMore: Boolean(query.hasNextPage),
    error:
      query.error?.response?.data?.error ||
      (query.error ? "No se pudo cargar el tema." : ""),
    loadMore,
    retry
  };
}
