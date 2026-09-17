import { useCallback, useEffect, useState } from "react";
import { getFeed } from "../../../services/postsService";

/**
 * useFeed — hook social para feed paginado
 * Arquitectura: Screen -> Hook -> Service -> API -> Backend
 * Soporta: carga inicial, paginación append, deduplicación, refresh, estados.
 */
export default function useFeed({ limit = 20 } = {}) {
  const [posts, setPosts] = useState([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const [total, setTotal] = useState(0);

  const load = useCallback(
    async ({ nextPage = 1, append = false } = {}) => {
      if (append) {
        if (loadingMore || !hasMore) return;
        setLoadingMore(true);
      } else {
        setLoading(true);
      }
      setError("");
      try {
        const data = await getFeed({ page: nextPage, limit });
        const incoming = Array.isArray(data?.posts) ? data.posts : [];
        const incomingHasMore = typeof data?.hasMore === "boolean" ? data.hasMore : incoming.length === limit;
        const incomingTotal = typeof data?.total === "number" ? data.total : incoming.length;

        setTotal(incomingTotal);
        setHasMore(incomingHasMore);
        setPage(nextPage);

        if (append) {
          setPosts((current) => {
            const existingIds = new Set(current.map((p) => String(p._id)));
            const deduped = incoming.filter((p) => !existingIds.has(String(p._id)));
            return [...current, ...deduped];
          });
        } else {
          // primera página: evitar duplicados internos también
          const map = new Map();
          for (const p of incoming) map.set(String(p._id), p);
          setPosts(Array.from(map.values()));
        }
      } catch (requestError) {
        const message = requestError.response?.data?.error || "No se pudieron cargar las publicaciones.";
        setError(message);
        if (!append) setPosts([]);
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [limit, loadingMore, hasMore]
  );

  useEffect(() => {
    load({ nextPage: 1, append: false });
  }, [load]);

  const refresh = useCallback(() => load({ nextPage: 1, append: false }), [load]);
  const loadMore = useCallback(() => load({ nextPage: page + 1, append: true }), [load, page]);

  const updatePost = useCallback((postId, updater) => {
    setPosts((current) => current.map((p) => (String(p._id) === String(postId) ? (typeof updater === "function" ? updater(p) : { ...p, ...updater }) : p)));
  }, []);

  const removePost = useCallback((postId) => {
    setPosts((current) => current.filter((p) => String(p._id) !== String(postId)));
  }, []);

  const prependPost = useCallback((post) => {
    if (!post?._id) return;
    setPosts((current) => {
      if (current.some((p) => String(p._id) === String(post._id))) return current;
      return [post, ...current];
    });
  }, []);

  return {
    posts,
    setPosts,
    page,
    hasMore,
    total,
    loading,
    loadingMore,
    error,
    setError,
    refresh,
    loadMore,
    updatePost,
    removePost,
    prependPost
  };
}
