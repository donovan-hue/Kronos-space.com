import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import Comments from "./Comments";
import { deletePost, getPost, likePost, repostPost, toggleSave, updatePost } from "../../services/postsService";
import { getUser } from "../../services/authStorage";
import { blockUser, hidePost, muteUser } from "../../services/moderationService";
import ReportDialog from "../moderation/ReportDialog";
import PostActions from "./components/PostActions";
import PostMedia from "./components/PostMedia";

function formatDate(date) {
  if (!date) return "";
  try {
    return new Date(date).toLocaleString("es-MX", { dateStyle: "medium", timeStyle: "short" });
  } catch {
    return "";
  }
}

export default function PostDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [post, setPost] = useState(null);
  const [loading, setLoading] = useState(true);
  const [liking, setLiking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savingPost, setSavingPost] = useState(false);
  const [reposting, setReposting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState("");
  const [editAlt, setEditAlt] = useState("");
  const [reportTarget, setReportTarget] = useState(null);
  const [hiding, setHiding] = useState(false);
  const [error, setError] = useState("");
  const commentsRef = useRef(null);

  const meId = useMemo(() => String(getUser()?._id || getUser()?.id || ""), []);
  const isOwn = useMemo(() => {
    const authorId = String(post?.author?._id || post?.author || "");
    return Boolean(authorId && meId && authorId === meId);
  }, [post, meId]);

  async function loadPost() {
    setLoading(true);
    setError("");
    try {
      const data = await getPost(id);
      const loaded = data?.post || null;
      setPost(loaded);
      if (loaded) {
        setEditValue(loaded.content || "");
        setEditAlt(loaded.media?.alt || "");
      }
    } catch (requestError) {
      setError(requestError.response?.data?.error || "No se pudo cargar la publicación.");
    } finally {
      setLoading(false);
    }
  }

  async function handleLike() {
    if (!post?._id || liking) return;
    const prevLiked = post.liked;
    const prevCount = post.likesCount || 0;
    setLiking(true);
    setError("");
    setPost((c) => ({ ...c, liked: !prevLiked, likesCount: prevLiked ? Math.max(0, prevCount - 1) : prevCount + 1 }));
    try {
      const result = await likePost(post._id);
      setPost((currentPost) => ({
        ...currentPost,
        likesCount: typeof result?.likesCount === "number" ? result.likesCount : currentPost.likesCount || 0,
        liked: Boolean(result?.liked)
      }));
    } catch (requestError) {
      setPost((c) => ({ ...c, liked: prevLiked, likesCount: prevCount }));
      setError(requestError.response?.data?.error || "No se pudo actualizar el like.");
    } finally {
      setLiking(false);
    }
  }

  async function handleSave() {
    if (!post?._id || savingPost) return;
    const prevSaved = post.saved;
    const prevCount = post.savedCount || 0;
    setSavingPost(true);
    setPost((c) => ({ ...c, saved: !prevSaved, savedCount: prevSaved ? Math.max(0, prevCount - 1) : prevCount + 1 }));
    try {
      const result = await toggleSave(post._id);
      setPost((c) => ({ ...c, saved: Boolean(result.saved), savedCount: typeof result.savedCount === "number" ? result.savedCount : c.savedCount }));
    } catch (e) {
      setPost((c) => ({ ...c, saved: prevSaved, savedCount: prevCount }));
      setError(e.response?.data?.error || "No se pudo guardar.");
    } finally {
      setSavingPost(false);
    }
  }

  async function handleRepost() {
    if (!post?._id || reposting) return;
    if (!window.confirm("¿Republicar esta publicación?")) return;
    setReposting(true);
    try {
      const newPost = await repostPost(post._id);
      if (newPost) navigate(`/post/${newPost._id}`);
    } catch (e) {
      if (e.response?.status === 409) setError("Ya has republicado esta publicación.");
      else setError(e.response?.data?.error || "No se pudo republicar.");
    } finally {
      setReposting(false);
    }
  }

  async function handleEdit() {
    const value = editValue.trim();
    const hasMedia = Boolean(post?.media?.url);
    if (!value && !hasMedia) {
      setError("La publicación está vacía");
      return;
    }
    if (value.length > 5000) {
      setError("La publicación no puede superar 5000 caracteres");
      return;
    }
    if (value === (post.content || "") && editAlt.trim() === (post.media?.alt || "")) {
      setEditing(false);
      return;
    }
    setSaving(true);
    setError("");
    try {
      const updated = await updatePost(post._id, value, { alt: editAlt.trim().slice(0, 500), allowEmptyContent: hasMedia });
      setPost(updated);
      setEditing(false);
    } catch (requestError) {
      const status = requestError.response?.status;
      if (status === 403) setError("No tienes permisos para editar esta publicación.");
      else if (status === 404) setError("Publicación no encontrada.");
      else setError(requestError.response?.data?.error || "No se pudo editar la publicación.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!post?._id || deleting) return;
    if (!window.confirm("¿Eliminar esta publicación? Esta acción no se puede deshacer.")) return;
    setDeleting(true);
    setError("");
    try {
      await deletePost(post._id);
      navigate("/home");
    } catch (requestError) {
      const status = requestError.response?.status;
      if (status === 403) setError("No tienes permisos para eliminar esta publicación.");
      else if (status === 404) setError("Publicación no encontrada.");
      else setError(requestError.response?.data?.error || "No se pudo eliminar la publicación.");
    } finally {
      setDeleting(false);
    }
  }

  function handleFocusComments() {
    commentsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    commentsRef.current?.querySelector("textarea")?.focus();
  }

  async function handleShare(targetPost = post) {
    if (!targetPost?._id) return;
    const url = `${window.location.origin}/post/${targetPost._id}`;
    try {
      if (navigator.share) await navigator.share({ title: "Publicación en Kronos", text: targetPost.content || "Publicación en Kronos", url });
      else {
        await navigator.clipboard.writeText(url);
        window.alert("Enlace copiado");
      }
    } catch (shareError) {
      if (shareError.name !== "AbortError") setError("No se pudo compartir la publicación.");
    }
  }

  async function handleHide() {
    if (!post?._id || hiding) return;
    setHiding(true);
    setError("");
    try {
      await hidePost(post._id);
      navigate("/home");
    } catch (requestError) {
      setError(requestError.response?.data?.error || "No se pudo ocultar la publicación.");
    } finally {
      setHiding(false);
    }
  }

  async function handleMute(author) {
    if (!author?._id) return;
    setError("");
    try {
      await muteUser(author._id);
      navigate("/home");
    } catch (requestError) {
      setError(requestError.response?.data?.error || "No se pudo silenciar al usuario.");
    }
  }

  async function handleBlock(author) {
    if (!author?._id) return;
    if (!window.confirm(`¿Bloquear a @${author.username || "usuario"}? Dejarán de verse y no podrán interactuar.`)) return;
    setError("");
    try {
      await blockUser(author._id);
      navigate("/home");
    } catch (requestError) {
      setError(requestError.response?.data?.error || "No se pudo bloquear al usuario.");
    }
  }

  useEffect(() => {
    loadPost();
  }, [id]);

  if (loading) {
    return (
      <section className="page">
        <div className="k-surface k-feed-state">
          <span className="k-skeleton" />
          <span className="k-skeleton k-skeleton-wide" />
        </div>
      </section>
    );
  }

  if (!post) {
    return (
      <section className="page">
        <p role="alert" className="k-state k-state-error">
          {error || "Publicación no encontrada."}
        </p>
        <Link className="k-button k-button-secondary" to="/home">
          Volver al inicio
        </Link>
      </section>
    );
  }

  const comments = Array.isArray(post.comments) ? post.comments : [];

  return (
    <section className="page post-detail-page">
      {error && (
        <p role="alert" className="k-state k-state-error" style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
          <span>{error}</span>
          <button type="button" onClick={() => setError("")} style={{ background: "transparent", border: 0, color: "inherit" }}>
            ×
          </button>
        </p>
      )}

      <ReportDialog
        open={Boolean(reportTarget)}
        targetType="post"
        targetId={reportTarget?._id}
        targetLabel={reportTarget?.author?.username ? `la publicación de @${reportTarget.author.username}` : ""}
        onClose={() => setReportTarget(null)}
      />

      <article className="k-post k-post-detail">
        <header className="k-post-header">
          <Link className="k-avatar" to={post.author?.username ? `/profile/${post.author.username}` : "/profile"}>
            {post.author?.displayName?.slice(0, 1) || "K"}
          </Link>
          <div className="k-post-header-copy">
            <Link className="k-post-author" to={post.author?.username ? `/profile/${post.author.username}` : "/profile"}>
              {post.author?.displayName || post.author?.username || "Usuario"}
            </Link>
            <p className="k-muted">
              @{post.author?.username || "kronos"} · {formatDate(post.createdAt)}
            </p>
          </div>
        </header>

        {post.repostOf && (
          <div className="k-post-repost">
            <p className="k-muted">Republicado de @{post.repostOf.author?.username || "usuario"}</p>
            {post.repostOf.content && <p>{post.repostOf.content}</p>}
            <PostMedia media={post.repostOf.media} mediaItems={post.repostOf.mediaItems} content={post.repostOf.content} compact />
          </div>
        )}

        {editing ? (
          <div className="k-post-edit-panel">
            <textarea
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              maxLength={5000}
              aria-label="Editar publicación"
            />
            {post.media?.url && (
              <label className="k-post-alt-editor">
                Texto alternativo
                <input type="text" value={editAlt} onChange={(e) => setEditAlt(e.target.value)} maxLength={500} placeholder="Alt de la imagen" />
              </label>
            )}
            <div className="k-post-edit-footer">
              <span className="k-muted">{editValue.length}/5000</span>
              <button type="button" className="k-button k-button-primary" onClick={handleEdit} disabled={saving || (!editValue.trim() && !post.media?.url)}>
                {saving ? "Guardando..." : "Guardar cambios"}
              </button>
            </div>
          </div>
        ) : (
          <>
            {post.content ? (
              <div className="k-post-content">
                <p>{post.content}</p>
              </div>
            ) : (
              <div className="k-post-content k-post-content-empty">
                <p className="k-muted">Publicación con multimedia</p>
              </div>
            )}
            <PostMedia media={post.media} mediaItems={post.mediaItems} content={post.content} />
          </>
        )}

        <PostActions
          post={post}
          commentsCount={comments.length}
          isOwn={isOwn}
          editing={editing}
          onLike={handleLike}
          onToggleComments={handleFocusComments}
          onShare={handleShare}
          onSave={handleSave}
          onRepost={handleRepost}
          onToggleEdit={() => setEditing((value) => !value)}
          onDelete={handleDelete}
          onHide={handleHide}
          onReport={(item) => setReportTarget(item)}
          onMute={isOwn ? undefined : handleMute}
          onBlock={isOwn ? undefined : handleBlock}
          liking={liking ? post._id : ""}
          saving={savingPost ? post._id : ""}
          reposting={reposting ? post._id : ""}
          hiding={hiding ? post._id : ""}
        />
      </article>

      <div ref={commentsRef}>
        <Comments postId={post._id} comments={comments} onCommentCreated={setPost} postAuthorId={post.author?._id || post.author} />
      </div>
    </section>
  );
}
