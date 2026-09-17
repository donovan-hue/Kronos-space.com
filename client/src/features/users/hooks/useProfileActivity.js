import { useCallback, useEffect, useRef, useState } from "react";
import { getSavedPosts, getUserPosts } from "../../../services/postsService";

export default function useProfileActivity(userId, tab, isOwnProfile) {
  const [posts, setPosts] = useState([]);
  const [postsCount, setPostsCount] = useState(0);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [postsLoading, setPostsLoading] = useState(false);
  const [postsLoadingMore, setPostsLoadingMore] = useState(false);
  const [postsError, setPostsError] = useState("");
  const sequence = useRef(0);
  const busy = useRef(false);

  const load = useCallback(async (nextPage = 1, append = false) => {
    if (!userId || (tab === "saved" && !isOwnProfile) || (append && busy.current)) return;
    const ticket = ++sequence.current;
    busy.current = true;
    setPostsError("");
    if (append) setPostsLoadingMore(true);
    else { setPostsLoading(true); setPosts([]); setPostsCount(0); setHasMore(false); setPage(1); }
    try {
      const options = { page: nextPage, limit: 20 };
      const data = tab === "saved" ? await getSavedPosts(options) : await getUserPosts(userId, { ...options, tab });
      if (ticket !== sequence.current) return;
      const incoming = Array.isArray(data?.posts) ? data.posts : [];
      setPosts(current => {
        const unique = new Map((append ? current : []).map(post => [String(post._id), post]));
        for (const post of incoming) unique.set(String(post._id), post);
        return [...unique.values()];
      });
      setPostsCount(data?.totalPosts ?? data?.total ?? incoming.length);
      setPage(nextPage);
      setHasMore(typeof data?.hasMore === "boolean" ? data.hasMore : incoming.length === 20);
    } catch (error) {
      if (ticket === sequence.current) setPostsError(error.response?.data?.error || "No se pudo cargar esta pestaña. Inténtalo nuevamente.");
    } finally {
      if (ticket === sequence.current) {
        busy.current = false;
        setPostsLoading(false);
        setPostsLoadingMore(false);
      }
    }
  }, [userId, tab, isOwnProfile]);

  useEffect(() => {
    setPosts([]); setPostsCount(0); setHasMore(false); setPage(1);
    setPostsLoading(false); setPostsLoadingMore(false); setPostsError("");
    load();
    return () => { sequence.current += 1; busy.current = false; };
  }, [load]);

  return {
    posts, setPosts, postsCount, setPostsCount, postsLoading, postsLoadingMore,
    postsError, hasMore, page,
    refresh: () => load(),
    loadMore: () => hasMore && load(page + 1, true)
  };
}
