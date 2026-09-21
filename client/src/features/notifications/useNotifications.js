import { useCallback, useEffect, useMemo, useState } from "react";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../services/apiClient";
import { getSocket } from "../../services/socket";
import { queryKeys } from "../../services/queryKeys";

const PAGE_SIZE = 30;

function mapPages(cache, mapper) {
  if (!cache?.pages) return cache;
  return { ...cache, pages: cache.pages.map(mapper) };
}

/**
 * useNotifications — lista paginada de notificaciones sobre TanStack Query.
 *
 * - Cada filtro es su propia clave ["notifications", filter].
 * - `unreadCount` viaja en la primera página de cada consulta; las
 *   acciones (marcar leída / todas) y el socket "notification:new"
 *   actualizan TODAS las claves de notificaciones en caché para que el
 *   contador no dependa del filtro visible.
 * - Socket.IO se mantiene como canal en vivo: un evento nuevo entra
 *   directo al caché sin refetch.
 */
export default function useNotifications(filter) {
  const queryClient = useQueryClient();
  const [actionError, setActionError] = useState("");

  const query = useInfiniteQuery({
    queryKey: queryKeys.notifications(filter),
    queryFn: async ({ pageParam }) => {
      const params = { page: pageParam, limit: PAGE_SIZE };
      if (filter) params.type = filter;
      const { data } = await api.get("/notifications", { params });
      return data;
    },
    initialPageParam: 1,
    getNextPageParam: (lastPage, allPages) =>
      lastPage?.hasMore ? allPages.length + 1 : undefined,
  });

  const items = useMemo(() => {
    const unique = new Map();
    for (const page of query.data?.pages || []) {
      for (const item of page?.notifications || []) {
        if (item?._id) unique.set(String(item._id), item);
      }
    }
    return [...unique.values()];
  }, [query.data]);

  // Socket: llegada en vivo (contrato original, ahora escribe al caché).
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return undefined;

    const receive = (item) => {
      if (!item?._id) return;

      // Un evento en vivo solo entra en "Todas" y en el filtro de su tipo.
      // Antes se insertaba también en filtros ajenos, mezclando resultados.
      const cachedQueries = queryClient.getQueryCache().findAll({
        queryKey: ["notifications"]
      });

      for (const cachedQuery of cachedQueries) {
        const [, filter] = cachedQuery.queryKey;
        const filterTypes = filter
          ? String(filter).split(",").map((value) => value.trim())
          : [];
        if (filterTypes.length && !filterTypes.includes(String(item.type))) continue;

        queryClient.setQueryData(cachedQuery.queryKey, (cache) => {
          if (!cache?.pages?.length) return cache;
          const first = cache.pages[0];
          const known = (first.notifications || []).some(
            (existing) => String(existing._id) === String(item._id)
          );
          if (known) return cache;
          const pages = [...cache.pages];
          pages[0] = {
            ...first,
            notifications: [item, ...(first.notifications || [])],
            unreadCount: (first.unreadCount || 0) + 1,
          };
          return { ...cache, pages };
        });
      }
    };

    socket.on("notification:new", receive);
    return () => socket.off("notification:new", receive);
  }, [queryClient]);

  async function mark(id) {
    setActionError("");
    try {
      await api.patch(`/notifications/${id}/read`);
      queryClient.setQueriesData({ queryKey: ["notifications"] }, (cache) =>
        mapPages(cache, (page, pageIndex) => {
          const wasUnread = (page.notifications || []).some(
            (item) => String(item._id) === String(id) && !item.read
          );
          return {
            ...page,
            notifications: (page.notifications || []).map((item) =>
              String(item._id) === String(id) ? { ...item, read: true } : item
            ),
            unreadCount:
              pageIndex === 0 && wasUnread
                ? Math.max(0, (page.unreadCount || 0) - 1)
                : page.unreadCount,
          };
        })
      );
    } catch {
      setActionError("No se pudo marcar la notificación.");
    }
  }

  async function markAll() {
    setActionError("");
    try {
      await api.patch("/notifications/read-all");
      queryClient.setQueriesData({ queryKey: ["notifications"] }, (cache) =>
        mapPages(cache, (page, pageIndex) => ({
          ...page,
          notifications: (page.notifications || []).map((item) => ({
            ...item,
            read: true,
          })),
          unreadCount: pageIndex === 0 ? 0 : page.unreadCount,
        }))
      );
    } catch (requestError) {
      setActionError(
        requestError.response?.data?.error || "No se pudieron marcar todas."
      );
    }
  }

  const loadMore = useCallback(async () => {
    if (!query.hasNextPage || query.isFetchingNextPage) return;
    await query.fetchNextPage();
  }, [query]);

  async function retry() {
    setActionError("");
    return query.refetch();
  }

  return {
    items,
    unread: query.data?.pages?.[0]?.unreadCount ?? 0,
    loading: query.isPending,
    loadingMore: query.isFetchingNextPage,
    error:
      actionError ||
      (query.error
        ? query.error.response?.data?.error ||
          "No se pudieron cargar las notificaciones."
        : ""),
    hasMore: Boolean(query.hasNextPage),
    loadMore,
    retry,
    mark,
    markAll,
  };
}
