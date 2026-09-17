import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import Comments from "./Comments";
import { deletePost, getPost, likePost, updatePost } from "../../services/postsService";
import { getUser } from "../../services/authStorage";

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
  const [deleting, setDeleting] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState("");
  const [error, setError] = useState("");

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
      if (loaded) setEditValue(loaded.content || "");
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
    // optimistic
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

  async function handleEdit() {
    const value = editValue.trim();
    if (!value) {
      setError("La publicación está vacía");
      return;
    }
    if (value.length > 5000) {
      setError("La publicación no puede superar 5000 caracteres");
      return;
    }
    if (value === post.content) {
      setEditing(false);
      return;
    }
    setSaving(true);
    setError("");
    try {
      const updated = await updatePost(post._id, value);
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

      <article className="k-surface" style={{ overflow: "hidden", borderRadius: "var(--k-radius-lg)" }}>
        <header className="k-post-header">
          <Link className="k-avatar" to={post.author?.username ? `/profile/${post.author.username}` : "/profile"}>
            {post.author?.displayName?.slice(0, 1) || "K"}
          </Link>
          <div style={{ flex: 1 }}>
            <Link className="k-post-author" to={post.author?.username ? `/profile/${post.author.username}` : "/profile"}>
              {post.author?.displayName || post.author?.username || "Usuario"}
            </Link>
            <p className="k-muted" style={{ margin: "2px 0 0", fontSize: "0.85rem" }}>
              @{post.author?.username || "kronos"} · {formatDate(post.createdAt)}
            </p>
          </div>
          {isOwn && (
            <div style={{ display: "flex", gap: 8 }}>
              <button type="button" className="k-button k-button-ghost" onClick={() => setEditing((v) => !v)}>
                {editing ? "Cancelar" : "Editar"}
              </button>
              <button type="button" className="k-button k-button-ghost" onClick={handleDelete} disabled={deleting}>
                {deleting ? "Eliminando..." : "Eliminar"}
              </button>
            </div>
          )}
        </header>

        {editing ? (
          <div style={{ padding: "0 20px 20px", display: "grid", gap: 12 }}>
            <textarea
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              maxLength={5000}
              aria-label="Editar publicación"
              style={{ minHeight: 120, padding: 14, border: "1px solid var(--k-border)", borderRadius: 12, background: "var(--k-bg)", color: "var(--k-text)", resize: "vertical" }}
            />
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span className="k-muted" style={{ fontSize: "0.85rem" }}>
                {editValue.length}/5000
              </span>
              <button type="button" className="k-button k-button-primary" onClick={handleEdit} disabled={saving || !editValue.trim()}>
                {saving ? "Guardando..." : "Guardar cambios"}
              </button>
            </div>
          </div>
        ) : (
          <div className="k-post-content" style={{ padding: "0 20px 20px" }}>
            <p style={{ whiteSpace: "pre-wrap", margin: 0 }}>{post.content}</p>
          </div>
        )}

        <div className="k-post-actions" style={{ borderTop: "1px solid var(--k-border)" }}>
          <button type="button" onClick={handleLike} disabled={liking} className={post.liked ? "is-liked" : ""}>
            {post.liked ? "Ya no me gusta" : "Me gusta"} {post.likesCount || 0}
          </button>
          <span className="k-muted">Comentarios {comments.length}</span>
          <Link to="/home" style={{ marginLeft: "auto", color: "var(--k-muted)", fontSize: "0.85rem" }}>
            Volver al feed
          </Link>
        </div>
      </article>

      <Comments postId={post._id} comments={comments} onCommentCreated={setPost} postAuthorId={post.author?._id || post.author} />
    </section>
  );
}
