import { Link } from "react-router-dom";
import PostActions from "./PostActions";
import PostMedia from "./PostMedia";

function date(value) {
  return value ? new Date(value).toLocaleString("es-MX", { dateStyle: "medium", timeStyle: "short" }) : "";
}

function authorProfileTo(author) {
  return author?.username ? `/profile/${author.username}` : "/profile";
}

function RepostBlock({ repostOf }) {
  if (!repostOf) return null;

  return (
    <div className="k-post-repost">
      <p className="k-muted">Republicado de @{repostOf.author?.username || "usuario"}</p>
      {repostOf.content && <p>{repostOf.content}</p>}
      <PostMedia media={repostOf.media} mediaItems={repostOf.mediaItems} content={repostOf.content} compact />
    </div>
  );
}

export default function PostCard({
  post,
  isOwn = false,
  currentUserId = "",
  onLike,
  onComment,
  onShare,
  onSave,
  onEdit,
  onDelete,
  onDeleteComment,
  onHide,
  onReport,
  onMute,
  onBlock,
  hiding = "",
  liking = "",
  saving = "",
  commenting = "",
  commentDraft = "",
  setCommentDraft,
  open = false,
  toggleOpen,
  editing = false,
  setEditing,
  editValue = "",
  setEditValue,
  savingEdit = false
}) {
  const comments = Array.isArray(post.comments) ? post.comments : [];
  const me = String(currentUserId || "");
  const canSaveEdit =
    !savingEdit &&
    (String(editValue || "").trim() || post.media?.url) &&
    String(editValue || "").trim() !== String(post.content || "");

  return (
    <article className="k-post">
      <header className="k-post-header">
        <Link className="k-avatar" to={authorProfileTo(post.author)}>
          {post.author?.displayName?.slice(0, 1) || "K"}
        </Link>
        <div className="k-post-header-copy">
          <Link className="k-post-author" to={authorProfileTo(post.author)}>
            {post.author?.displayName || post.author?.username || "Usuario"}
          </Link>
          <p>@{post.author?.username || "kronos"} · {date(post.createdAt)}</p>
        </div>
      </header>

      {post.repostOf && <RepostBlock repostOf={post.repostOf} />}

      {editing ? (
        <div className="k-post-edit-panel">
          <textarea
            value={editValue}
            onChange={(event) => setEditValue?.(event.target.value)}
            maxLength={5000}
            aria-label="Editar contenido"
          />
          <div className="k-post-edit-footer">
            <span className="k-muted">{String(editValue || "").length}/5000</span>
            <button
              type="button"
              className="k-button k-button-primary"
              disabled={!canSaveEdit}
              onClick={() => onEdit?.(post._id, editValue)}
            >
              {savingEdit ? "Guardando..." : "Guardar"}
            </button>
          </div>
        </div>
      ) : (
        <>
          {post.content ? (
            <Link className="k-post-content" to={`/post/${post._id}`}>
              <p>{post.content}</p>
            </Link>
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
        onLike={onLike}
        onToggleComments={toggleOpen}
        onShare={onShare}
        onSave={onSave}
        onToggleEdit={setEditing}
        onDelete={onDelete}
        onHide={onHide}
        onReport={onReport}
        onMute={onMute}
        onBlock={onBlock}
        liking={liking}
        saving={saving}
        hiding={hiding}
      />

      {open && (
        <div className="k-comments">
          <form
            onSubmit={(event) => {
              event.preventDefault();
              onComment?.(post._id, commentDraft);
            }}
          >
            <input
              value={commentDraft || ""}
              onChange={(event) => setCommentDraft?.(post._id, event.target.value)}
              placeholder="Escribe un comentario"
              maxLength={1000}
              aria-label={`Comentar ${post._id}`}
            />
            <button
              className="k-button k-button-primary"
              type="submit"
              disabled={commenting === post._id || !String(commentDraft || "").trim()}
            >
              {commenting === post._id ? "Enviando..." : "Enviar"}
            </button>
          </form>
          {comments.length === 0 ? (
            <p className="k-muted k-comment-empty">Sé el primero en comentar.</p>
          ) : (
            comments.map((comment) => {
              const canDelete =
                String(comment.user?._id || comment.user) === me ||
                String(post.author?._id || post.author) === me;
              return (
                <div className="k-comment" key={comment._id || `${comment.user?._id}-${comment.content}`}>
                  <span>
                    <strong>{comment.user?.displayName || comment.user?.username || "Usuario"}</strong>{" "}
                    <span>{comment.content}</span>
                  </span>
                  {canDelete && comment._id && (
                    <button
                      type="button"
                      aria-label="Eliminar comentario"
                      className="k-comment-delete"
                      onClick={() => onDeleteComment?.(post._id, comment._id)}
                    >
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
