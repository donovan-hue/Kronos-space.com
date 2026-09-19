import { useCallback, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { getUser } from "../../services/authStorage";
import { getSavedPosts, likePost, repostPost, toggleSave } from "../../services/postsService";
import { blockUser, hidePost, muteUser } from "../../services/moderationService";
import ReportDialog from "../moderation/ReportDialog";
import PostCard from "./components/PostCard";
import { queryKeys } from "../../services/queryKeys";
import { publicAppUrl } from "../../services/publicUrl";
import { flattenPostPages, removePostFromSavedLists, updatePostEverywhere } from "./postLists";

export default function SavedPosts() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const meId = useMemo(() => String(getUser()?._id || getUser()?.id || ""), []);

  // Guardados como query infinito. Los mutadores escriben en TODAS las
  // listas en caché (feed, perfil, guardados): quitar un guardado aquí
  // también actualiza la pestaña Guardados del perfil.
  const query = useInfiniteQuery({
    queryKey: queryKeys.posts.saved,
    queryFn: async ({ pageParam }) => {
      const data = await getSavedPosts({ page: pageParam, limit: 20 });
      const incoming = Array.isArray(data?.posts) ? data.posts : [];
      return {
        posts: incoming,
        hasMore: typeof data?.hasMore === "boolean" ? data.hasMore : incoming.length === 20,
      };
    },
    initialPageParam: 1,
    getNextPageParam: (lastPage, allPages) =>
      lastPage?.hasMore ? allPages.length + 1 : undefined,
  });

  const posts = useMemo(() => flattenPostPages(query.data?.pages), [query.data]);
  const hasMore = Boolean(query.hasNextPage);
  const loading = query.isPending;
  const loadingMore = query.isFetchingNextPage;

  const setPosts = useCallback(
    (updater) => {
      queryClient.setQueryData(queryKeys.posts.saved, (cache) => {
        if (!cache?.pages) return cache;
        return {
          ...cache,
          pages: cache.pages.map((pageItem) => ({
            ...pageItem,
            posts:
              typeof updater === "function"
                ? updater(pageItem.posts || [])
                : updater,
          })),
        };
      });
    },
    [queryClient]
  );

  const loadMore = useCallback(async () => {
    if (!query.hasNextPage || query.isFetchingNextPage) return;
    await query.fetchNextPage();
  }, [query]);

  const [liking, setLiking] = useState("");
  const [saving, setSaving] = useState("");
  const [reposting, setReposting] = useState("");
  const [hiding, setHiding] = useState("");
  const [reportTarget, setReportTarget] = useState(null);
  const [moderationNote, setModerationNote] = useState("");
  const [actionError, setActionError] = useState("");
  const error =
    actionError ||
    (query.error
      ? query.error.response?.data?.error || "No se pudieron cargar los guardados."
      : "");

  async function handleLike(id) {
    if (!id || liking) return;
    const prev = posts.find((p) => String(p._id) === String(id));
    const prevLiked = Boolean(prev?.liked);
    const prevCount = prev?.likesCount || 0;
    setLiking(id);
    setActionError("");
    updatePostEverywhere(queryClient, id, (p) => ({ ...p, liked: !prevLiked, likesCount: prevLiked ? Math.max(0, prevCount - 1) : prevCount + 1 }));
    try {
      const result = await likePost(id);
      updatePostEverywhere(queryClient, id, (p) => ({ ...p, liked: Boolean(result.liked), likesCount: typeof result.likesCount === "number" ? result.likesCount : p.likesCount }));
    } catch (e) {
      updatePostEverywhere(queryClient, id, (p) => ({ ...p, liked: prevLiked, likesCount: prevCount }));
      setActionError(e.response?.data?.error || "No se pudo actualizar el like.");
    } finally {
      setLiking("");
    }
  }

  async function handleSave(id) {
    if (!id || saving) return;
    setSaving(id);
    setActionError("");
    try {
      const result = await toggleSave(id);
      if (!result.saved) {
        removePostFromSavedLists(queryClient, id);
      } else {
        updatePostEverywhere(queryClient, id, (p) => ({ ...p, saved: true, savedCount: typeof result.savedCount === "number" ? result.savedCount : p.savedCount }));
      }
    } catch (e) {
      setActionError(e.response?.data?.error || "No se pudo quitar de guardados.");
    } finally {
      setSaving("");
    }
  }

  async function handleRepost(id) {
    if (!id || reposting) return;
    if (!window.confirm("¿Republicar esta publicación en tu perfil?")) return;
    setReposting(id);
    setActionError("");
    try {
      await repostPost(id);
    } catch (e) {
      if (e.response?.status === 409) setActionError("Ya has republicado esta publicación.");
      else setActionError(e.response?.data?.error || "No se pudo republicar.");
    } finally {
      setReposting("");
    }
  }

  async function handleShare(post) {
    const url = publicAppUrl(`/post/${post._id}`);
    try {
      if (navigator.share) await navigator.share({ title: "Publicación en Kronos", text: post.content || "Publicación en Kronos", url });
      else {
        await navigator.clipboard.writeText(url);
        window.alert("Enlace copiado");
      }
    } catch (e) {
      if (e.name !== "AbortError") setActionError("No se pudo compartir la publicación.");
    }
  }

  async function handleHide(id) {
    if (!id || hiding) return;
    setHiding(id);
    setActionError("");
    setModerationNote("");
    try {
      await hidePost(id);
      setPosts((items) => items.filter((p) => String(p._id) !== String(id)));
      setModerationNote("Publicación oculta para ti.");
    } catch (e) {
      setActionError(e.response?.data?.error || "No se pudo ocultar la publicación.");
    } finally {
      setHiding("");
    }
  }

  async function handleMute(author) {
    if (!author?._id) return;
    setActionError("");
    setModerationNote("");
    try {
      await muteUser(author._id);
      setPosts((items) => items.filter((p) => String(p.author?._id || p.author) !== String(author._id)));
      setModerationNote(`Silenciaste a @${author.username || "usuario"}.`);
    } catch (e) {
      setActionError(e.response?.data?.error || "No se pudo silenciar al usuario.");
    }
  }

  async function handleBlock(author) {
    if (!author?._id) return;
    if (!window.confirm(`¿Bloquear a @${author.username || "usuario"}?`)) return;
    setActionError("");
    setModerationNote("");
    try {
      await blockUser(author._id);
      setPosts((items) => items.filter((p) => String(p.author?._id || p.author) !== String(author._id)));
      setModerationNote(`Bloqueaste a @${author.username || "usuario"}.`);
    } catch (e) {
      setActionError(e.response?.data?.error || "No se pudo bloquear al usuario.");
    }
  }

  if (loading) {
    return (
      <section className="page">
        <div className="k-surface k-feed-state"><span className="k-skeleton" /><span className="k-skeleton k-skeleton-wide" /></div>
      </section>
    );
  }

  return (
    <section className="page">
      <header className="k-page-header">
        <div>
          <h1>Guardados</h1>
          <p>Publicaciones que marcaste para después.</p>
        </div>
        <Link className="k-button k-button-ghost" to="/home">Volver al feed</Link>
      </header>
      {error && <p className="k-state k-state-error" role="alert">{error}</p>}
      {moderationNote && <p className="k-state k-state-success" role="status">{moderationNote}</p>}
      <ReportDialog
        open={Boolean(reportTarget)}
        targetType="post"
        targetId={reportTarget?._id}
        targetLabel={reportTarget?.author?.username ? `la publicación de @${reportTarget.author.username}` : ""}
        onClose={() => setReportTarget(null)}
      />
      {posts.length === 0 ? (
        <div className="k-empty-state">
          <h2>Nada guardado aún</h2>
          <p>Usa el botón Guardar en el feed para ver tus favoritos aquí.</p>
          <Link className="k-button k-button-primary" to="/home">Ir al feed</Link>
        </div>
      ) : (
        <>
          <div className="k-feed-list">
            {posts.map((post) => {
              const authorId = String(post.author?._id || post.author || "");
              const isOwn = Boolean(authorId && meId && authorId === meId);
              return (
                <PostCard
                  key={post._id}
                  post={post}
                  currentUserId={meId}
                  isOwn={isOwn}
                  liking={liking}
                  saving={saving}
                  reposting={reposting}
                  hiding={hiding}
                  onLike={handleLike}
                  onSave={handleSave}
                  onRepost={handleRepost}
                  onShare={handleShare}
                  toggleOpen={(postId) => navigate(`/post/${postId}`)}
                  onHide={handleHide}
                  onReport={(item) => setReportTarget(item)}
                  onMute={isOwn ? undefined : handleMute}
                  onBlock={isOwn ? undefined : handleBlock}
                />
              );
            })}
          </div>
          <div style={{ display: "flex", justifyContent: "center", marginTop: 24 }}>
            {hasMore ? (
              <button type="button" className="k-button k-button-secondary" onClick={loadMore} disabled={loadingMore}>
                {loadingMore ? "Cargando..." : "Cargar más"}
              </button>
            ) : (
              <p className="k-muted" style={{ fontSize: "0.9rem" }}>No hay más guardados.</p>
            )}
          </div>
        </>
      )}
    </section>
  );
}
