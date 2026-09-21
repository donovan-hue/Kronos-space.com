import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ImagePlus, Plus, RefreshCw, Sparkles } from "lucide-react";
import { getUser } from "../../services/authStorage";
import useFeed from "./hooks/useFeed";
import { createComment, deleteComment, deletePost, likePost, reactToPost, toggleSave, updatePost } from "../../services/postsService";
import { optimisticReaction, reactionFromResponse } from "./reactions";
import { blockUser, hidePost, muteUser } from "../../services/moderationService";
import ReportDialog from "../moderation/ReportDialog";
import CreatePost from "./CreatePost";
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
  const [refreshing, setRefreshing] = useState(false);
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

  async function handleReaction(id, type) {
    if (liking) return;
    const prev = posts.find((p) => String(p._id) === String(id));
    if (!prev) return;
    setLiking(id);
    setPosts((items) => items.map((p) => (String(p._id) === String(id) ? optimisticReaction(p, type) : p)));
    try {
      const result = typeof reactToPost === "function"
        ? await reactToPost(id, type)
        : await likePost(id);
      setPosts((items) => items.map((p) => (String(p._id) === String(id) ? reactionFromResponse(p, result) : p)));
    } catch (e) {
      setPosts((items) => items.map((p) => (String(p._id) === String(id) ? prev : p)));
      setError(e.response?.data?.error || "No se pudo actualizar la reacción.");
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

  async function handleComment(id, content, parentCommentId = null) {
    const value = String(content || "").trim();
    if (!value || commenting) return;
    if (value.length > 1000) {
      setError("El comentario no puede superar 1000 caracteres");
      return;
    }
    setCommenting(id);
    try {
      const updated = parentCommentId
        ? await createComment(id, value, parentCommentId)
        : await createComment(id, value);
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
      setModerationNote("Publicación oculta para ti. Puedes gestionarla desde Moderación.");
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

  async function handleRefresh() {
    if (refreshing) return;
    setRefreshing(true);
    try {
      await refresh();
    } finally {
      setRefreshing(false);
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
      <section className="page" aria-busy="true" aria-label="Cargando publicaciones">
        <div className="k-surface k-feed-state" role="status" aria-label="Cargando publicaciones">
          <span className="k-skeleton" />
          <span className="k-skeleton k-skeleton-wide" />
          <span className="k-skeleton" />
        </div>
      </section>
    );
  }

  return (
    <section className="page k-feed-page">
      <header className="k-feed-topline k-feed-topline-redesigned">
        <div>
          <p className="k-eyebrow">TU ESPACIO</p>
          <h1 className="k-feed-title">Inicio</h1>
        </div>
        <div className="k-feed-head-actions">
          <button
            className="k-feed-icon-button"
            type="button"
            onClick={handleRefresh}
            disabled={refreshing}
            aria-label={refreshing ? "Actualizando publicaciones" : "Actualizar publicaciones"}
            aria-busy={refreshing}
            title={refreshing ? "Actualizando" : "Actualizar"}
          >
            <RefreshCw size={17} />
          </button>
          <details className="k-create-menu">
            <summary aria-label="Crear contenido"><Plus size={21} /></summary>
            <div>
              <Link to="/create"><ImagePlus size={17} /><span><strong>Crear publicación</strong><small>Texto, fotos, carrusel o video</small></span></Link>
              <Link to="/kairos"><Sparkles size={17} /><span><strong>Crear con Kairos</strong><small>Imagen, video o guion con IA</small></span></Link>
              <Link to="/library"><ImagePlus size={17} /><span><strong>Biblioteca multimedia</strong><small>Administra tus creaciones</small></span></Link>
            </div>
          </details>
        </div>
      </header>

      {error && (
        <div className="k-state k-state-error k-feed-error" role="alert">
          <span>{error}</span>
          <div className="k-feed-error-actions">
            <button type="button" className="k-button k-button-ghost" onClick={handleRefresh} disabled={refreshing}>
              {refreshing ? "Reintentando..." : "Reintentar"}
            </button>
            <button type="button" className="k-feed-error-close" onClick={() => setError("")} aria-label="Cerrar error">
              ×
            </button>
          </div>
        </div>
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

      <CreatePost compact onCreated={prependPost} />

      <div className="k-feed-list" aria-label="Publicaciones del inicio">
        {posts.length === 0 ? (
          <div className="k-empty-state">
            <h2>Aún no hay publicaciones</h2>
            <p>Usa el cuadro de arriba para compartir la primera idea de tu comunidad.</p>
            <Link className="k-button k-button-primary" to="/create">Crear publicación</Link>
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
                commenting={commenting}
                commentDraft={commentText[post._id]}
                setCommentDraft={setCommentDraft}
                open={Boolean(openComments[post._id])}
                toggleOpen={toggleOpen}
                onReact={handleReaction}
                onSave={handleSave}
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
            <button
              type="button"
              className="k-button k-button-secondary"
              onClick={loadMore}
              disabled={loadingMore}
              aria-busy={loadingMore}
            >
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
