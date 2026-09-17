import { useCallback, useEffect, useRef, useState } from "react";
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
  const requestId = useRef(0);
  const inFlight = useRef(false);
  const moreAvailable = useRef(true);

  const load = useCallback(
    async ({ nextPage = 1, append = false } = {}) => {
      if (append) {
        if (inFlight.current || !moreAvailable.current) return;
        setLoadingMore(true);
      } else {
        setLoading(true);
      }
      const id = ++requestId.current;
      inFlight.current = true;
      setError("");
      try {
        const data = await getFeed({ page: nextPage, limit });
        if (id !== requestId.current) return;
        const incoming = Array.isArray(data?.posts) ? data.posts : [];
        const incomingHasMore = typeof data?.hasMore === "boolean" ? data.hasMore : incoming.length === limit;
        const incomingTotal = typeof data?.total === "number" ? data.total : incoming.length;

        setTotal(incomingTotal);
        moreAvailable.current = incomingHasMore;
        setHasMore(incomingHasMore);
        setPage(nextPage);

        if (append) {
          setPosts((current) => {
            const merged = new Map(current.map((p) => [String(p._id), p]));
            for (const post of incoming) merged.set(String(post._id), post);
            return Array.from(merged.values());
          });
        } else {
          // primera página: evitar duplicados internos también
          const map = new Map();
          for (const p of incoming) map.set(String(p._id), p);
          setPosts(Array.from(map.values()));
        }
      } catch (requestError) {
        if (id !== requestId.current) return;
        const message = requestError.response?.data?.error || "No se pudieron cargar las publicaciones.";
        setError(message);
        if (!append) setPosts([]);
      } finally {
        if (id === requestId.current) {
          inFlight.current = false;
          setLoading(false);
          setLoadingMore(false);
        }
      }
    },
    [limit]
  );

  useEffect(() => {
    load({ nextPage: 1, append: false });
    return () => { requestId.current += 1; inFlight.current = false; };
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
