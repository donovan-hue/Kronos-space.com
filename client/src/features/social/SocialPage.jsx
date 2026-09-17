import { mediaUrl } from "../../services/mediaUrl";
import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import CreatePost from "./CreatePost";
import { getUser } from "../../services/authStorage";
import useFeed from "./hooks/useFeed";
import { createComment, deleteComment, deletePost, likePost, repostPost, toggleSave, updatePost } from "../../services/postsService";

function date(value) {
  return value ? new Date(value).toLocaleString("es-MX", { dateStyle: "medium", timeStyle: "short" }) : "";
}

function currentUserId() {
  const user = getUser();
  return String(user?._id || user?.id || "");
}

function MediaBlock({ media, content }) {
  if (!media?.url) return null;
  return (
    <div style={{ margin: "0 20px 16px", overflow: "hidden", borderRadius: 12, border: "1px solid var(--k-border)", background: "var(--k-surface-2)" }}>
      <img src={mediaUrl(media.url)} alt={media.alt || content?.slice(0, 120) || "Imagen de la publicación"} loading="lazy" style={{ width: "100%", maxHeight: 520, objectFit: "cover", display: "block" }} />
      {media.alt && <p className="k-muted" style={{ margin: 8, fontSize: "0.85rem" }}>{media.alt}</p>}
    </div>
  );
}

function RepostBlock({ repostOf }) {
  if (!repostOf) return null;
  return (
    <div style={{ margin: "0 20px 12px", padding: 12, border: "1px solid var(--k-border)", borderRadius: 12, background: "var(--k-bg)" }}>
      <p className="k-muted" style={{ margin: 0, fontSize: "0.8rem" }}>Republicado de @{repostOf.author?.username || "usuario"}</p>
      <p style={{ margin: "6px 0 0", whiteSpace: "pre-wrap" }}>{repostOf.content}</p>
      {repostOf.media?.url && <img src={mediaUrl(repostOf.media.url)} alt={repostOf.media.alt || ""} loading="lazy" style={{ width: "100%", marginTop: 8, borderRadius: 8, maxHeight: 260, objectFit: "cover" }} />}
    </div>
  );
}

function PostCard({
  post,
  onLike,
  onComment,
  onShare,
  onSave,
  onRepost,
  onEdit,
  onDelete,
  onDeleteComment,
  liking,
  saving,
  reposting,
  commenting,
  commentDraft,
  setCommentDraft,
  open,
  toggleOpen,
  isOwn,
  editing,
  setEditing,
  editValue,
  setEditValue,
  savingEdit
}) {
  const comments = Array.isArray(post.comments) ? post.comments : [];
  const me = currentUserId();
  return (
    <article className="k-post">
      <header className="k-post-header">
        <Link className="k-avatar" to={post.author?.username ? `/profile/${post.author.username}` : "/profile"}>
          {post.author?.displayName?.slice(0, 1) || "K"}
        </Link>
        <div style={{ flex: 1 }}>
          <Link className="k-post-author" to={post.author?.username ? `/profile/${post.author.username}` : "/profile"}>
            {post.author?.displayName || post.author?.username || "Usuario"}
          </Link>
          <p>@{post.author?.username || "kronos"} · {date(post.createdAt)}</p>
        </div>
        {isOwn && (
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" className="k-button k-button-ghost" onClick={() => setEditing((v) => !v)} aria-label="Editar publicación">
              {editing ? "Cancelar" : "Editar"}
            </button>
            <button type="button" className="k-button k-button-ghost" onClick={() => onDelete(post._id)} aria-label="Eliminar publicación">
              Eliminar
            </button>
          </div>
        )}
      </header>

      {post.repostOf && <RepostBlock repostOf={post.repostOf} />}

      {editing ? (
        <div className="k-comments" style={{ borderTop: 0, background: "var(--k-surface)" }}>
          <textarea
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            maxLength={5000}
            aria-label="Editar contenido"
            style={{ minHeight: 90, padding: 12, border: "1px solid var(--k-border)", borderRadius: 12, background: "var(--k-bg)", color: "var(--k-text)" }}
          />
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8 }}>
            <span className="k-muted" style={{ fontSize: "0.85rem" }}>{editValue.length}/5000</span>
            <button type="button" className="k-button k-button-primary" disabled={savingEdit || !editValue.trim() || editValue.trim() === post.content} onClick={() => onEdit(post._id, editValue)}>
              {savingEdit ? "Guardando..." : "Guardar"}
            </button>
          </div>
        </div>
      ) : (
        <>
          <Link className="k-post-content" to={`/post/${post._id}`}>
            <p>{post.content}</p>
          </Link>
          <MediaBlock media={post.media} content={post.content} />
        </>
      )}

      <div className="k-post-actions" style={{ flexWrap: "wrap" }}>
        <button type="button" className={post.liked ? "is-liked" : ""} onClick={() => onLike(post._id)} disabled={liking === post._id}>
          {post.liked ? "Me gusta" : "Like"} · {post.likesCount || 0}
        </button>
        <button type="button" onClick={() => toggleOpen(post._id)}>
          Comentar · {comments.length}
        </button>
        <button type="button" className={post.saved ? "is-liked" : ""} onClick={() => onSave(post._id)} disabled={saving === post._id}>
          {post.saved ? "Guardado" : "Guardar"} {post.savedCount ? `· ${post.savedCount}` : ""}
        </button>
        <button type="button" onClick={() => onRepost(post._id)} disabled={reposting === post._id}>
          Repost
        </button>
        <button type="button" onClick={() => onShare(post)}>
          Compartir
        </button>
        <Link to={`/post/${post._id}`} style={{ marginLeft: "auto", color: "var(--k-muted)", fontSize: "0.85rem" }}>
          Ver detalle
        </Link>
      </div>

      {open && (
        <div className="k-comments">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              onComment(post._id, commentDraft);
            }}
          >
            <input value={commentDraft || ""} onChange={(e) => setCommentDraft(post._id, e.target.value)} placeholder="Escribe un comentario" maxLength={1000} aria-label={`Comentar ${post._id}`} />
            <button className="k-button k-button-primary" type="submit" disabled={commenting === post._id || !String(commentDraft || "").trim()}>
              {commenting === post._id ? "Enviando..." : "Enviar"}
            </button>
          </form>
          {comments.length === 0 ? (
            <p className="k-muted" style={{ fontSize: "0.9rem" }}>Sé el primero en comentar.</p>
          ) : (
            comments.map((c) => {
              const canDelete = String(c.user?._id || c.user) === me || String(post.author?._id || post.author) === me;
              return (
                <div className="k-comment" key={c._id || `${c.user?._id}-${c.content}`} style={{ justifyContent: "space-between" }}>
                  <span>
                    <strong>{c.user?.displayName || c.user?.username || "Usuario"}</strong> <span style={{ marginLeft: 6 }}>{c.content}</span>
                  </span>
                  {canDelete && c._id && (
                    <button type="button" onClick={() => onDeleteComment(post._id, c._id)} style={{ color: "var(--k-muted)", fontSize: "0.8rem", background: "transparent", border: 0 }}>
                      ×
                    </button>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}
    </article>
  );
}

export default function SocialPage() {
  const navigate = useNavigate();
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
    if (!trimmed) {
      setError("La publicación está vacía");
      return;
    }
    if (trimmed.length > 5000) {
      setError("La publicación no puede superar 5000 caracteres");
      return;
    }
    setSavingEdit(id);
    try {
      const updated = await updatePost(id, trimmed);
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

  async function handleShare(post) {
    const url = `${window.location.origin}/post/${post._id}`;
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
      <header className="k-page-header">
        <div>
          <p className="k-eyebrow">KRONOS / SOCIAL</p>
          <h1>Tu feed</h1>
          <p>Publicaciones reales con media, guardados y reposts.</p>
        </div>
        <button className="k-button k-button-secondary" type="button" onClick={refresh}>
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

      <CreatePost onCreated={(post) => prependPost(post)} />

      <div className="k-feed-list">
        {posts.length === 0 ? (
          <div className="k-empty-state">
            <h2>Aún no hay publicaciones</h2>
            <p>Comparte la primera idea de tu comunidad.</p>
            <button className="k-button k-button-primary" type="button" onClick={() => navigate("/create")}>
              Crear publicación
            </button>
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
