import { useMemo, useState } from "react";
import CreatePost from "./CreatePost";
import { getUser } from "../../services/authStorage";
import useFeed from "./hooks/useFeed";
import { createComment, deleteComment, deletePost, likePost, repostPost, toggleSave, updatePost } from "../../services/postsService";
import { blockUser, hidePost, muteUser } from "../../services/moderationService";
import ReportDialog from "../moderation/ReportDialog";
import PostCard from "./components/PostCard";
import { publicAppUrl } from "../../services/publicUrl";

function currentUserId() {
  const user = getUser();
  return String(user?._id || user?.id || "");
}

export default function SocialPage() {
  const meId = useMemo(() => currentUserId(), []);
  const { posts, setPosts, hasMore, loading, loadingMore, error, setError, refresh, loadMore, prependPost } = useFeed({ limit: 20 });

  const [liking, setLiking] = useState("");
  const [saving, setSaving] = useState("");
  const [reposting, setReposting] = useState("");
  const [commenting, setCommenting] = useState("");
  const [commentText, setCommentText] = useState({});
  const [openComments, setOpenComments] = useState({});
  const [editing, setEditingMap] = useState({});
  const [editValues, setEditValues] = useState({});
  const [savingEdit, setSavingEdit] = useState("");
  const [hiding, setHiding] = useState("");
  const [reportTarget, setReportTarget] = useState(null);
  const [moderationNote, setModerationNote] = useState("");

  function setCommentDraft(id, value) {
    setCommentText((items) => ({ ...items, [id]: value }));
  }
  function toggleOpen(id) {
    setOpenComments((items) => ({ ...items, [id]: !items[id] }));
  }
  function toggleEditing(id) {
    setEditingMap((items) => {
      const next = !items[id];
      if (next) {
        const post = posts.find((p) => String(p._id) === String(id));
        setEditValues((v) => ({ ...v, [id]: post?.content || "" }));
      }
      return { ...items, [id]: next };
    });
  }
  function setEditValue(id, value) {
    setEditValues((items) => ({ ...items, [id]: value }));
  }

  async function handleLike(id) {
    if (liking) return;
    const prev = posts.find((p) => String(p._id) === String(id));
    if (!prev) return;
    const prevLiked = prev.liked;
    const prevCount = prev.likesCount || 0;
    setLiking(id);
    setPosts((items) => items.map((p) => (String(p._id) === String(id) ? { ...p, liked: !prevLiked, likesCount: prevLiked ? Math.max(0, prevCount - 1) : prevCount + 1 } : p)));
    try {
      const result = await likePost(id);
      setPosts((items) => items.map((p) => (String(p._id) === String(id) ? { ...p, liked: Boolean(result.liked), likesCount: typeof result.likesCount === "number" ? result.likesCount : p.likesCount } : p)));
    } catch (e) {
      setPosts((items) => items.map((p) => (String(p._id) === String(id) ? { ...p, liked: prevLiked, likesCount: prevCount } : p)));
      setError(e.response?.data?.error || "No se pudo actualizar el like.");
    } finally {
      setLiking("");
    }
  }

  async function handleSave(id) {
    if (saving) return;
    const prev = posts.find((p) => String(p._id) === String(id));
    const prevSaved = prev?.saved;
    const prevCount = prev?.savedCount || 0;
    setSaving(id);
    setPosts((items) => items.map((p) => (String(p._id) === String(id) ? { ...p, saved: !prevSaved, savedCount: prevSaved ? Math.max(0, prevCount - 1) : prevCount + 1 } : p)));
    try {
      const result = await toggleSave(id);
      setPosts((items) => items.map((p) => (String(p._id) === String(id) ? { ...p, saved: Boolean(result.saved), savedCount: typeof result.savedCount === "number" ? result.savedCount : p.savedCount } : p)));
    } catch (e) {
      setPosts((items) => items.map((p) => (String(p._id) === String(id) ? { ...p, saved: prevSaved, savedCount: prevCount } : p)));
      setError(e.response?.data?.error || "No se pudo guardar la publicación.");
    } finally {
      setSaving("");
    }
  }

  async function handleRepost(id) {
    if (reposting) return;
    if (!window.confirm("¿Republicar esta publicación en tu perfil?")) return;
    setReposting(id);
    try {
      const post = await repostPost(id);
      if (post) prependPost(post);
    } catch (e) {
      const status = e.response?.status;
      if (status === 409) setError("Ya has republicado esta publicación.");
      else if (status === 404) setError("Publicación no encontrada.");
      else setError(e.response?.data?.error || "No se pudo republicar.");
    } finally {
      setReposting("");
    }
  }

  async function handleComment(id, content) {
    const value = String(content || "").trim();
    if (!value || commenting) return;
    if (value.length > 1000) {
      setError("El comentario no puede superar 1000 caracteres");
      return;
    }
    setCommenting(id);
    try {
      const updated = await createComment(id, value);
      if (updated) {
        setPosts((items) => items.map((p) => (String(p._id) === String(id) ? updated : p)));
        setCommentText((items) => ({ ...items, [id]: "" }));
      }
    } catch (e) {
      setError(e.response?.data?.error || "No se pudo publicar el comentario.");
    } finally {
      setCommenting("");
    }
  }

  async function handleDeleteComment(postId, commentId) {
    try {
      const updated = await deleteComment(postId, commentId);
      if (updated) setPosts((items) => items.map((p) => (String(p._id) === String(postId) ? updated : p)));
    } catch (e) {
      setError(e.response?.data?.error || "No se pudo eliminar el comentario.");
    }
  }

  async function handleEdit(id, value) {
    const trimmed = String(value || "").trim();
    const post = posts.find((p) => String(p._id) === String(id));
    const hasMedia = Boolean(post?.media?.url);
    if (!trimmed && !hasMedia) {
      setError("La publicación está vacía");
      return;
    }
    if (trimmed.length > 5000) {
      setError("La publicación no puede superar 5000 caracteres");
      return;
    }
    setSavingEdit(id);
    try {
      const updated = await updatePost(id, trimmed, { allowEmptyContent: hasMedia });
      setPosts((items) => items.map((p) => (String(p._id) === String(id) ? updated : p)));
      setEditingMap((m) => ({ ...m, [id]: false }));
    } catch (e) {
      const status = e.response?.status;
      if (status === 403) setError("No tienes permisos para editar esta publicación.");
      else if (status === 404) setError("Publicación no encontrada.");
      else setError(e.response?.data?.error || "No se pudo editar la publicación.");
    } finally {
      setSavingEdit("");
    }
  }

  async function handleDelete(id) {
    if (!window.confirm("¿Eliminar esta publicación? Esta acción no se puede deshacer.")) return;
    try {
      await deletePost(id);
      setPosts((items) => items.filter((p) => String(p._id) !== String(id)));
    } catch (e) {
      const status = e.response?.status;
      if (status === 403) setError("No tienes permisos para eliminar esta publicación.");
      else if (status === 404) setError("Publicación no encontrada.");
      else setError(e.response?.data?.error || "No se pudo eliminar la publicación.");
    }
  }

  async function handleHide(id) {
    if (hiding) return;
    setHiding(id);
    setError("");
    setModerationNote("");
    try {
      await hidePost(id);
      setPosts((items) => items.filter((p) => String(p._id) !== String(id)));
      setModerationNote("Publicación oculta para ti. Puedes restaurarla en Privacidad y seguridad.");
    } catch (e) {
      setError(e.response?.data?.error || "No se pudo ocultar la publicación.");
    } finally {
      setHiding("");
    }
  }

  async function handleMute(author) {
    if (!author?._id) return;
    setModerationNote("");
    try {
      await muteUser(author._id);
      setPosts((items) => items.filter((p) => String(p.author?._id || p.author) !== String(author._id)));
      setModerationNote(`Silenciaste a @${author.username || "usuario"}. Su contenido no aparecerá en tu feed.`);
    } catch (e) {
      setError(e.response?.data?.error || "No se pudo silenciar al usuario.");
    }
  }

  async function handleBlock(author) {
    if (!author?._id) return;
    if (!window.confirm(`¿Bloquear a @${author.username || "usuario"}? Dejarán de verse y no podrán interactuar.`)) return;
    setModerationNote("");
    try {
      await blockUser(author._id);
      setPosts((items) => items.filter((p) => String(p.author?._id || p.author) !== String(author._id)));
      setModerationNote(`Bloqueaste a @${author.username || "usuario"}.`);
    } catch (e) {
      setError(e.response?.data?.error || "No se pudo bloquear al usuario.");
    }
  }

  async function handleShare(post) {
    const url = publicAppUrl(`/post/${post._id}`);
    try {
      if (navigator.share) await navigator.share({ title: "Publicación en Kronos", text: post.content, url });
      else {
        await navigator.clipboard.writeText(url);
        window.alert("Enlace copiado");
      }
    } catch (e) {
      if (e.name !== "AbortError") setError("No se pudo compartir la publicación.");
    }
  }

  if (loading) {
    return (
      <section className="page">
        <div className="k-surface k-feed-state">
          <span className="k-skeleton" />
          <span className="k-skeleton k-skeleton-wide" />
          <span className="k-skeleton" />
        </div>
      </section>
    );
  }

  return (
    <section className="page k-feed-page">
      {/* Estructura compacta: sin header gigante — solo una fila ligera. */}
      <header className="k-feed-topline">
        <h1 className="k-feed-title">Inicio</h1>
        <button className="k-button k-button-ghost" type="button" onClick={refresh}>
          Actualizar
        </button>
      </header>

      {error && (
        <p className="k-state k-state-error" role="alert" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
          <span>{error}</span>
          <button type="button" onClick={() => setError("")} aria-label="Cerrar error" style={{ background: "transparent", border: 0, color: "inherit" }}>
            ×
          </button>
        </p>
      )}

      {moderationNote && (
        <p className="k-state k-state-success" role="status">{moderationNote}</p>
      )}

      <ReportDialog
        open={Boolean(reportTarget)}
        targetType="post"
        targetId={reportTarget?._id}
        targetLabel={reportTarget?.author?.username ? `la publicación de @${reportTarget.author.username}` : ""}
        onClose={() => setReportTarget(null)}
      />

      <CreatePost compact onCreated={(post) => prependPost(post)} />

      <div className="k-feed-list">
        {posts.length === 0 ? (
          <div className="k-empty-state">
            <h2>Aún no hay publicaciones</h2>
            <p>Usa el cuadro de arriba para compartir la primera idea de tu comunidad.</p>
          </div>
        ) : (
          posts.map((post) => {
            const authorId = String(post.author?._id || post.author || "");
            const isOwn = Boolean(authorId && meId && authorId === meId);
            return (
              <PostCard
                key={post._id}
                post={post}
                isOwn={isOwn}
                currentUserId={meId}
                liking={liking}
                saving={saving}
                reposting={reposting}
                commenting={commenting}
                commentDraft={commentText[post._id]}
                setCommentDraft={setCommentDraft}
                open={Boolean(openComments[post._id])}
                toggleOpen={toggleOpen}
                onLike={handleLike}
                onSave={handleSave}
                onRepost={handleRepost}
                onComment={handleComment}
                onShare={handleShare}
                onEdit={handleEdit}
                onDelete={handleDelete}
                onDeleteComment={handleDeleteComment}
                onHide={handleHide}
                onReport={(post) => setReportTarget(post)}
                onMute={handleMute}
                onBlock={handleBlock}
                hiding={hiding}
                editing={Boolean(editing[post._id])}
                setEditing={() => toggleEditing(post._id)}
                editValue={editValues[post._id] ?? post.content}
                setEditValue={(v) => setEditValue(post._id, v)}
                savingEdit={savingEdit === post._id}
              />
            );
          })
        )}
      </div>

      {posts.length > 0 && (
        <div style={{ display: "flex", justifyContent: "center", marginTop: 24 }}>
          {hasMore ? (
            <button type="button" className="k-button k-button-secondary" onClick={loadMore} disabled={loadingMore}>
              {loadingMore ? "Cargando..." : "Cargar más"}
            </button>
          ) : (
            <p className="k-muted" style={{ fontSize: "0.9rem" }}>Has visto todo el feed reciente.</p>
          )}
        </div>
      )}
    </section>
  );
}
