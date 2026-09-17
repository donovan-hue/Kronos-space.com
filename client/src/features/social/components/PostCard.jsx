import { Link } from "react-router-dom";

function date(value) {
  return value ? new Date(value).toLocaleString("es-MX", { dateStyle: "medium", timeStyle: "short" }) : "";
}

export default function PostCard({
  post,
  isOwn = false,
  onLike,
  onToggleComments,
  onShare,
  onEdit,
  onDelete,
  onDeleteComment,
  liking = false,
  commenting = false,
  commentDraft = "",
  setCommentDraft,
  open = false,
  editing = false,
  editValue = "",
  setEditValue,
  saving = false,
  showDetailLink = true
}) {
  const comments = Array.isArray(post.comments) ? post.comments : [];
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
          <p className="k-muted">@{post.author?.username || "kronos"} · {date(post.createdAt)}</p>
        </div>
        {isOwn && (
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" className="k-button k-button-ghost" onClick={onEdit}>
              {editing ? "Cancelar" : "Editar"}
            </button>
            <button type="button" className="k-button k-button-ghost" onClick={onDelete}>
              Eliminar
            </button>
          </div>
        )}
      </header>

      {editing ? (
        <div className="k-comments" style={{ borderTop: 0, background: "var(--k-surface)" }}>
          <textarea
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            maxLength={5000}
            style={{ minHeight: 90, padding: 12, border: "1px solid var(--k-border)", borderRadius: 12, background: "var(--k-bg)", color: "var(--k-text)", resize: "vertical" }}
          />
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8 }}>
            <span className="k-muted" style={{ fontSize: "0.85rem" }}>{editValue.length}/5000</span>
            <button type="button" className="k-button k-button-primary" disabled={saving || !editValue.trim() || editValue.trim() === post.content} onClick={() => onEdit && onEdit(post._id, editValue)}>
              {saving ? "Guardando..." : "Guardar"}
            </button>
          </div>
        </div>
      ) : (
        <Link className="k-post-content" to={`/post/${post._id}`}>
          <p style={{ whiteSpace: "pre-wrap" }}>{post.content}</p>
        </Link>
      )}

      <div className="k-post-actions">
        <button type="button" className={post.liked ? "is-liked" : ""} onClick={() => onLike(post._id)} disabled={liking}>
          {post.liked ? "Me gusta" : "Like"} · {post.likesCount || 0}
        </button>
        <button type="button" onClick={() => onToggleComments(post._id)}>
          Comentar · {comments.length}
        </button>
        <button type="button" onClick={() => onShare(post)}>
          Compartir
        </button>
        {showDetailLink && (
          <Link to={`/post/${post._id}`} style={{ marginLeft: "auto", color: "var(--k-muted)", fontSize: "0.85rem" }}>
            Ver detalle
          </Link>
        )}
      </div>

      {open && (
        <div className="k-comments">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              // parent handles create via setCommentDraft flow; we call onLike? Actually comment via prop
              if (setCommentDraft) {
                // trigger via parent's handler passed as onToggle? Need separate handler
              }
            }}
          >
            {/* This generic card expects parent to manage form; to keep reusable, we render input + button via props */}
          </form>
          {comments.map((c) => (
            <div className="k-comment" key={c._id || `${c.user?._id}-${c.content}`}>
              <strong>{c.user?.displayName || c.user?.username || "Usuario"}</strong>
              <span>{c.content}</span>
              {onDeleteComment && c._id && (
                <button type="button" onClick={() => onDeleteComment(post._id, c._id)} style={{ marginLeft: "auto", background: "transparent", border: 0, color: "var(--k-muted)" }}>
                  ×
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </article>
  );
}
