import { useState } from "react";
import { createComment, deleteComment, likeComment, updateComment } from "../../services/postsService";
import { getUser } from "../../services/authStorage";
import ReportDialog from "../moderation/ReportDialog";

function CommentNode({ comment, depth = 0, meId, postAuthorId, onReply, onDelete, onLike, onEdit, onReport }) {
  const [replying, setReplying] = useState(false);
  const [draft, setDraft] = useState("");
  const [editing, setEditing] = useState(false);
  const [editDraft, setEditDraft] = useState(comment.content || "");
  const [busy, setBusy] = useState(false);
  const authorId = String(comment.user?._id || comment.user || "");
  const canDelete = Boolean(comment._id && (authorId === meId || String(postAuthorId || "") === meId));
  const isMine = Boolean(comment._id && authorId === meId);

  async function submitReply(event) {
    event.preventDefault();
    const value = draft.trim();
    if (!value || value.length > 1000) return;
    await onReply?.(value, comment._id);
    setDraft("");
    setReplying(false);
  }

  async function guardarEdicion(event) {
    event.preventDefault();
    const valor = editDraft.trim();
    if (!valor || valor === comment.content) { setEditing(false); return; }
    setBusy(true);
    try {
      await onEdit?.(comment._id, valor);
      setEditing(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <article className="comment k-surface" style={{ "--comment-indent": depth > 0 && depth <= 3 ? "var(--k-space-3)" : "0px" }}>
      <div className="comment-heading">
        <div className="comment-copy">
          <header>
            <strong>{comment.user?.displayName || comment.user?.username || "Usuario"}</strong>
            {comment.user?.username && <span className="k-muted">@{comment.user.username}</span>}
          </header>
          {editing ? (
            <form className="k-comment-reply-form" onSubmit={guardarEdicion}>
              <input value={editDraft} onChange={(event) => setEditDraft(event.target.value)} maxLength={1000} aria-label="Editar comentario" />
              <button type="submit" className="k-button k-button-primary" disabled={busy || !editDraft.trim()}>Guardar</button>
              <button type="button" className="k-button k-button-secondary" onClick={() => { setEditing(false); setEditDraft(comment.content || ""); }}>Cancelar</button>
            </form>
          ) : (
            <>
              <p>{comment.content}</p>
              {comment.edited ? <small className="k-muted">editado</small> : null}
            </>
          )}
        </div>
        <span className="k-comment-actions">
          <button
            type="button"
            className={`k-comment-like${comment.liked ? " is-liked" : ""}`}
            aria-pressed={Boolean(comment.liked)}
            aria-label={comment.liked ? "Quitar me gusta" : "Me gusta"}
            onClick={() => onLike?.(comment._id)}
          >
            ♥ {comment.likesCount > 0 ? comment.likesCount : ""}
          </button>
          <button type="button" className="k-comment-reply" onClick={() => setReplying((open) => !open)}>
            {replying ? "Cancelar" : "Responder"}
          </button>
          {isMine && !editing && (
            <button type="button" className="k-comment-edit" onClick={() => setEditing(true)} aria-label="Editar comentario">
              Editar
            </button>
          )}
          {/* Reportar desde el propio comentario. Antes solo se podía desde
              la publicación: para denunciar una respuesta había que denunciar
              el hilo entero, que no es lo que se quiere señalar. */}
          {!isMine && (
            <button type="button" className="k-comment-report" onClick={() => onReport?.(comment)} aria-label="Reportar comentario">
              Reportar
            </button>
          )}
          {canDelete && (
            <button type="button" onClick={() => onDelete(comment._id)} aria-label="Eliminar comentario" className="k-comment-delete">
              ×
            </button>
          )}
        </span>
      </div>
      {replying && (
        <form onSubmit={submitReply} className="k-comment-reply-form">
          <input value={draft} onChange={(event) => setDraft(event.target.value)} maxLength={1000} placeholder="Escribe una respuesta" aria-label={`Responder a ${comment.user?.displayName || "comentario"}`} />
          <button type="submit" className="k-button k-button-primary" disabled={!draft.trim()}>Enviar</button>
        </form>
      )}
      {(comment.replies || []).map((reply) => (
        <CommentNode key={reply._id || `${reply.user?._id}-${reply.content}`} comment={reply} depth={depth + 1} meId={meId} postAuthorId={postAuthorId} onReply={onReply} onDelete={onDelete} onLike={onLike} onEdit={onEdit} onReport={onReport} />
      ))}
    </article>
  );
}

export default function Comments({ postId, comments = [], commentThreads = [], onCommentCreated, postAuthorId }) {
  const [content, setContent] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  // Comentario que se está denunciando (bloque 1.2).
  const [reportando, setReportando] = useState(null);

  const meId = String(getUser()?._id || getUser()?.id || "");
  const threads = Array.isArray(commentThreads) && commentThreads.length
    ? commentThreads
    : comments.filter((comment) => !comment.parentCommentId);

  async function publish(value, parentCommentId = null) {
    if (!value || !postId) return;
    const updatedPost = parentCommentId
      ? await createComment(postId, value, parentCommentId)
      : await createComment(postId, value);
    if (!updatedPost) throw new Error("INVALID_COMMENT_RESPONSE");
    if (typeof onCommentCreated === "function") onCommentCreated(updatedPost);
  }

  async function submitComment(event) {
    event.preventDefault();
    const value = content.trim();
    if (!value || submitting) return;
    if (!postId) {
      setError("La publicación no es válida.");
      return;
    }
    if (value.length > 1000) {
      setError("El comentario no puede superar 1000 caracteres");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      await publish(value);
      setContent("");
    } catch (requestError) {
      const status = requestError.response?.status;
      if (status === 401) setError("Tu sesión expiró. Inicia sesión de nuevo.");
      else setError(requestError.response?.data?.error || "No se pudo publicar el comentario.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleReply(value, parentCommentId) {
    try {
      await publish(value, parentCommentId);
    } catch (requestError) {
      setError(requestError.response?.data?.error || "No se pudo publicar la respuesta.");
    }
  }

  async function handleLike(commentId) {
    if (!commentId || !postId) return;
    try {
      const updatedPost = await likeComment(postId, commentId);
      if (typeof onCommentCreated === "function") onCommentCreated(updatedPost);
    } catch (requestError) {
      setError(requestError.response?.data?.error || "No se pudo reaccionar al comentario.");
    }
  }

  async function handleEdit(commentId, content) {
    if (!commentId || !postId) return;
    try {
      const updatedPost = await updateComment(postId, commentId, content);
      if (typeof onCommentCreated === "function") onCommentCreated(updatedPost);
    } catch (requestError) {
      const status = requestError.response?.status;
      if (status === 403) setError("Solo puedes editar tus comentarios.");
      else setError(requestError.response?.data?.error || "No se pudo editar el comentario.");
      throw requestError;
    }
  }

  async function handleDelete(commentId) {
    if (!commentId || !postId) return;
    try {
      const updatedPost = await deleteComment(postId, commentId);
      if (typeof onCommentCreated === "function") onCommentCreated(updatedPost);
    } catch (requestError) {
      const status = requestError.response?.status;
      if (status === 403) setError("No tienes permisos para eliminar este comentario.");
      else if (status === 404) setError("Comentario no encontrado.");
      else setError(requestError.response?.data?.error || "No se pudo eliminar este comentario.");
    }
  }

  return (
    <section className="comments k-comments" aria-label="Comentarios">
      <h3>Comentarios · {comments.length}</h3>

      <form className="comment-composer" onSubmit={submitComment}>
        <textarea
          value={content}
          onChange={(event) => setContent(event.target.value)}
          maxLength={1000}
          placeholder="Escribe un comentario..."
          disabled={submitting}
          aria-label="Escribir comentario"
        />
        <button className="k-button k-button-primary" type="submit" disabled={submitting || !content.trim()}>
          {submitting ? "Publicando..." : "Comentar"}
        </button>
      </form>

      {error && <p role="alert" className="k-state k-state-error">{error}</p>}

      <ReportDialog
        open={Boolean(reportando)}
        targetType="comment"
        targetId={reportando?._id ? String(reportando._id) : ""}
        targetLabel={reportando?.user?.username ? `@${reportando.user.username}` : ""}
        onClose={() => setReportando(null)}
        onReported={() => setReportando(null)}
      />

      {threads.length === 0 ? (
        <p className="k-muted">No hay comentarios todavía.</p>
      ) : (
        <div className="comments-list">
          {threads.map((comment) => (
            <CommentNode key={comment._id || `${comment.user?._id}-${comment.content}`} comment={comment} meId={meId} postAuthorId={postAuthorId} onReply={handleReply} onDelete={handleDelete} onLike={handleLike} onEdit={handleEdit} onReport={setReportando} />
          ))}
        </div>
      )}
    </section>
  );
}
