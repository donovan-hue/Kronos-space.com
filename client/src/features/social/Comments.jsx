import { useState } from "react";
import { createComment, deleteComment } from "../../services/postsService";
import { getUser } from "../../services/authStorage";

export default function Comments({ postId, comments = [], onCommentCreated, postAuthorId }) {
  const [content, setContent] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const meId = String(getUser()?._id || getUser()?.id || "");

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
      const updatedPost = await createComment(postId, value);
      if (!updatedPost) throw new Error("INVALID_COMMENT_RESPONSE");
      setContent("");
      if (typeof onCommentCreated === "function") onCommentCreated(updatedPost);
    } catch (requestError) {
      const status = requestError.response?.status;
      if (status === 401) setError("Tu sesión expiró. Inicia sesión de nuevo.");
      else setError(requestError.response?.data?.error || "No se pudo publicar el comentario.");
    } finally {
      setSubmitting(false);
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
      else setError(requestError.response?.data?.error || "No se pudo eliminar el comentario.");
    }
  }

  return (
    <section className="comments k-comments" aria-label="Comentarios" style={{ marginTop: 16 }}>
      <h3 style={{ margin: 0, fontSize: "1rem" }}>Comentarios</h3>

      <form className="comment-composer" onSubmit={submitComment} style={{ display: "flex", gap: 8, marginTop: 12 }}>
        <textarea
          value={content}
          onChange={(event) => setContent(event.target.value)}
          maxLength={1000}
          placeholder="Escribe un comentario..."
          disabled={submitting}
          aria-label="Escribir comentario"
          style={{ flex: 1, minHeight: 44, padding: 12, border: "1px solid var(--k-border)", borderRadius: 12, background: "var(--k-surface)", color: "var(--k-text)", resize: "vertical" }}
        />
        <button className="k-button k-button-primary" type="submit" disabled={submitting || !content.trim()} style={{ alignSelf: "flex-start" }}>
          {submitting ? "Publicando..." : "Comentar"}
        </button>
      </form>

      {error && (
        <p role="alert" className="k-state k-state-error" style={{ marginTop: 12 }}>
          {error}
        </p>
      )}

      {comments.length === 0 ? (
        <p className="k-muted" style={{ marginTop: 12 }}>
          No hay comentarios todavía.
        </p>
      ) : (
        <div className="comments-list" style={{ display: "grid", gap: 12, marginTop: 12 }}>
          {comments.map((comment) => {
            const authorId = String(comment.user?._id || comment.user || "");
            const canDelete = Boolean(comment._id && (authorId === meId || String(postAuthorId || "") === meId));
            return (
              <article className="comment k-surface" key={comment._id} style={{ padding: 12, borderRadius: 12, display: "flex", justifyContent: "space-between", gap: 12 }}>
                <div>
                  <header style={{ display: "flex", gap: 6, alignItems: "baseline" }}>
                    <strong>{comment.user?.displayName || comment.user?.username || "Usuario"}</strong>
                    {comment.user?.username && <span className="k-muted">@{comment.user.username}</span>}
                  </header>
                  <p style={{ margin: "6px 0 0", whiteSpace: "pre-wrap" }}>{comment.content}</p>
                </div>
                {canDelete && (
                  <button type="button" onClick={() => handleDelete(comment._id)} aria-label="Eliminar comentario" style={{ background: "transparent", border: 0, color: "var(--k-muted)" }}>
                    ×
                  </button>
                )}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
