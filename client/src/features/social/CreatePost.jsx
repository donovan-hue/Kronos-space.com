import { useState } from "react";
import { Link } from "react-router-dom";
import { createPost } from "../../services/postsService";

export default function CreatePost({ onCreated }) {
  const [content, setContent] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function handleSubmit(event) {
    event.preventDefault();
    const value = content.trim();
    if (!value || creating) return;
    if (value.length > 5000) {
      setError("La publicación no puede superar 5000 caracteres");
      return;
    }
    setCreating(true);
    setError("");
    setSuccess("");
    try {
      const post = await createPost(value);
      if (!post) throw new Error("INVALID_POST_RESPONSE");
      setContent("");
      setSuccess("Publicación creada.");
      if (typeof onCreated === "function") onCreated(post);
    } catch (requestError) {
      const status = requestError.response?.status;
      if (status === 401) setError("Tu sesión expiró. Inicia sesión de nuevo.");
      else if (status === 429) setError("Demasiadas publicaciones. Espera un momento.");
      else setError(requestError.response?.data?.error || requestError.message || "No se pudo crear la publicación.");
    } finally {
      setCreating(false);
    }
  }

  return (
    <section className="k-composer">
      <div className="k-composer-heading">
        <div>
          <p className="k-eyebrow">CREAR</p>
          <h2>¿Qué quieres compartir?</h2>
        </div>
        <Link className="k-button k-button-ghost" to="/create">
          Editor completo
        </Link>
      </div>
      {error && (
        <p className="k-state k-state-error" role="alert">
          {error}
        </p>
      )}
      {success && (
        <p className="k-state k-state-success" role="status">
          {success}
        </p>
      )}
      <form onSubmit={handleSubmit}>
        <textarea
          value={content}
          onChange={(event) => setContent(event.target.value)}
          maxLength={5000}
          placeholder="Escribe una idea, una observación o una pregunta..."
          aria-label="Contenido de la publicación"
          disabled={creating}
        />
        <div className="k-composer-footer">
          <span>{content.length}/5000</span>
          <button className="k-button k-button-primary" type="submit" disabled={creating || !content.trim()}>
            {creating ? "Publicando..." : "Publicar"}
          </button>
        </div>
      </form>
    </section>
  );
}
