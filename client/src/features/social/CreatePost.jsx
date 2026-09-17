import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { createPost, uploadMedia } from "../../services/postsService";

export default function CreatePost({ onCreated }) {
  const [content, setContent] = useState("");
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState("");
  const [alt, setAlt] = useState("");
  const [uploading, setUploading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const inputRef = useRef(null);

  function handleFileChange(event) {
    const selected = event.target.files?.[0] || null;
    if (!selected) return;
    const allowed = new Set(["image/jpeg", "image/png", "image/webp"]);
    if (!allowed.has(selected.type)) {
      setError("Formato no permitido. Usa JPG, PNG o WebP.");
      return;
    }
    if (selected.size > 10 * 1024 * 1024) {
      setError("La imagen no puede superar 10 MB");
      return;
    }
    setError("");
    setFile(selected);
    const url = URL.createObjectURL(selected);
    setPreview(url);
  }

  function clearMedia() {
    if (preview) URL.revokeObjectURL(preview);
    setFile(null);
    setPreview("");
    setAlt("");
    if (inputRef.current) inputRef.current.value = "";
  }

  async function handleSubmit(event) {
    event.preventDefault();
    const value = content.trim();
    if (!value || creating || uploading) return;
    if (value.length > 5000) {
      setError("La publicación no puede superar 5000 caracteres");
      return;
    }
    if (alt.length > 500) {
      setError("El texto alternativo no puede superar 500 caracteres");
      return;
    }
    setCreating(true);
    setError("");
    setSuccess("");
    try {
      let media = null;
      if (file) {
        setUploading(true);
        try {
          media = await uploadMedia(file);
        } finally {
          setUploading(false);
        }
      }
      const post = await createPost(value, { media, alt });
      if (!post) throw new Error("INVALID_POST_RESPONSE");
      setContent("");
      clearMedia();
      setSuccess("Publicación creada.");
      if (typeof onCreated === "function") onCreated(post);
    } catch (requestError) {
      const status = requestError.response?.status;
      if (status === 401) setError("Tu sesión expiró. Inicia sesión de nuevo.");
      else if (status === 429) setError("Demasiadas publicaciones. Espera un momento.");
      else setError(requestError.response?.data?.error || requestError.message || "No se pudo crear la publicación.");
    } finally {
      setCreating(false);
      setUploading(false);
    }
  }

  const isBusy = creating || uploading;

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
          disabled={isBusy}
        />
        {/* media preview */}
        {preview && (
          <div className="k-composer-media" style={{ display: "grid", gap: 8, marginTop: 8 }}>
            <div style={{ position: "relative", overflow: "hidden", borderRadius: 12, border: "1px solid var(--k-border)", background: "var(--k-surface-2)" }}>
              <img src={preview} alt={alt || "Vista previa"} style={{ width: "100%", maxHeight: 380, objectFit: "cover", display: "block" }} />
              <button type="button" onClick={clearMedia} disabled={isBusy} aria-label="Quitar imagen" style={{ position: "absolute", top: 8, right: 8, width: 32, height: 32, borderRadius: "50%", border: "1px solid var(--k-border)", background: "rgba(0,0,0,0.6)", color: "#fff" }}>
                ×
              </button>
            </div>
            <label style={{ display: "grid", gap: 4, fontSize: "0.85rem", color: "var(--k-muted)" }}>
              Texto alternativo (opcional, máx 500)
              <input type="text" value={alt} onChange={(e) => setAlt(e.target.value)} maxLength={500} placeholder="Describe la imagen para accesibilidad" disabled={isBusy} style={{ padding: 10, border: "1px solid var(--k-border)", borderRadius: 10, background: "var(--k-bg)", color: "var(--k-text)" }} />
            </label>
            {uploading && <span className="k-muted" style={{ fontSize: "0.85rem" }}>Subiendo imagen...</span>}
          </div>
        )}

        <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={handleFileChange} disabled={isBusy} style={{ display: "none" }} aria-label="Seleccionar imagen" />

        <div className="k-composer-footer" style={{ marginTop: 12 }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button type="button" className="k-button k-button-secondary" onClick={() => inputRef.current?.click()} disabled={isBusy}>
              {preview ? "Cambiar imagen" : "Añadir imagen"}
            </button>
            {preview && (
              <span className="k-muted" style={{ fontSize: "0.85rem" }}>
                {file?.name} · {(file?.size / 1024).toFixed(0)} KB
              </span>
            )}
          </div>
          <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
            <span>{content.length}/5000</span>
            <button className="k-button k-button-primary" type="submit" disabled={isBusy || !content.trim()}>
              {uploading ? "Subiendo..." : creating ? "Publicando..." : "Publicar"}
            </button>
          </div>
        </div>
      </form>
    </section>
  );
}
