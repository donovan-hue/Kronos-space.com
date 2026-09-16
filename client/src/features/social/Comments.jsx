import { useState } from "react";
import axios from "axios";
import { API_URL } from "../../services/apiClient";
import { getToken } from "../../services/authStorage";

const API = API_URL;

function getAuthConfig() {
  const token = getToken();

  return token
    ? {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    : {};
}

export default function Comments({
  postId,
  comments = [],
  onCommentCreated,
}) {
  const [content, setContent] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function submitComment(event) {
    event.preventDefault();

    const value = content.trim();

    if (!value || submitting) {
      return;
    }

    if (!postId) {
      setError("La publicación no es válida.");
      return;
    }

    if (!getToken()) {
      setError("Tu sesión no está disponible.");
      return;
    }

    setSubmitting(true);
    setError("");

    try {
      const response = await axios.post(
        `${API}/posts/${postId}/comments`,
        {
          content: value,
        },
        getAuthConfig()
      );

      const updatedPost = response.data?.post;

      if (!updatedPost) {
        throw new Error("INVALID_COMMENT_RESPONSE");
      }

      setContent("");

      if (typeof onCommentCreated === "function") {
        onCommentCreated(updatedPost);
      }
    } catch (requestError) {
      console.error(
        "KRONOS_SOCIAL_CREATE_COMMENT_ERROR:",
        requestError
      );

      setError(
        requestError.response?.data?.error ||
          "No se pudo publicar el comentario."
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="comments" aria-label="Comentarios">
      <h3>Comentarios</h3>

      <form
        className="comment-composer"
        onSubmit={submitComment}
      >
        <textarea
          value={content}
          onChange={(event) => setContent(event.target.value)}
          maxLength={1000}
          placeholder="Escribe un comentario..."
          disabled={submitting}
          aria-label="Escribir comentario"
        />

        <button
          type="submit"
          disabled={submitting || !content.trim()}
        >
          {submitting ? "Publicando..." : "Comentar"}
        </button>
      </form>

      {error && (
        <p role="alert">
          {error}
        </p>
      )}

      {comments.length === 0 ? (
        <p>No hay comentarios todavía.</p>
      ) : (
        <div className="comments-list">
          {comments.map((comment) => (
            <article
              className="comment"
              key={comment._id}
            >
              <header>
                <strong>
                  {comment.user?.displayName ||
                    comment.user?.username ||
                    "Usuario"}
                </strong>

                {comment.user?.username && (
                  <span>
                    @{comment.user.username}
                  </span>
                )}
              </header>

              <p>{comment.content}</p>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

