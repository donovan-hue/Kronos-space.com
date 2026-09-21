import { useEffect, useMemo, useRef, useState } from "react";
import { X } from "lucide-react";
import { uploadMedia } from "../../../services/postsService";
import { createStory } from "../../../services/storiesService";
import { getCircles } from "../../../services/circlesService";
import { storySchema, STORY_AUDIENCE_TYPES } from "../../../schemas";

const AUDIENCE_OPTIONS = [
  ["public", "Pública · cualquiera que te siga"],
  ["followers", "Seguidores"],
  ["circle", "Círculo"]
];

/**
 * STORIES — creador.
 *
 * Sube el archivo con el endpoint de media existente y crea la historia
 * referenciando la URL ya alojada en Kronos. La expiración (24 h) la
 * decide el servidor; aquí solo se elige media, textos y audiencia.
 */
export default function StoryCreator({ open, onClose, onCreated }) {
  const [file, setFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [alt, setAlt] = useState("");
  const [caption, setCaption] = useState("");
  const [audienceType, setAudienceType] = useState("public");
  const [circles, setCircles] = useState([]);
  const [circleId, setCircleId] = useState("");
  const [errors, setErrors] = useState({});
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef(null);
  const objectUrlRef = useRef("");

  const isVideo = useMemo(() => Boolean(file && file.type.startsWith("video/")), [file]);

  useEffect(() => {
    if (!open) return undefined;
    setFile(null);
    setPreviewUrl("");
    setAlt("");
    setCaption("");
    setAudienceType("public");
    setCircleId("");
    setErrors({});
    setError("");
    setUploading(false);
    let cancelled = false;
    getCircles()
      .then((list) => {
        if (!cancelled) setCircles(Array.isArray(list) ? list : []);
      })
      .catch(() => {
        if (!cancelled) setCircles([]);
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  useEffect(() => {
    return () => {
      if (objectUrlRef.current && typeof URL.revokeObjectURL === "function") {
        URL.revokeObjectURL(objectUrlRef.current);
      }
    };
  }, []);

  function handleFileChange(event) {
    const selected = event.target.files?.[0];
    setError("");
    if (!selected) {
      setFile(null);
      setPreviewUrl("");
      return;
    }
    if (objectUrlRef.current && typeof URL.revokeObjectURL === "function") {
      URL.revokeObjectURL(objectUrlRef.current);
    }
    setFile(selected);
    if (typeof URL.createObjectURL === "function") {
      const url = URL.createObjectURL(selected);
      objectUrlRef.current = url;
      setPreviewUrl(url);
    } else {
      setPreviewUrl("");
    }
  }

  async function publish(event) {
    event.preventDefault();
    if (uploading) return;
    if (!file) {
      setError("Elige una imagen o un video para tu historia.");
      return;
    }
    const parsed = storySchema.safeParse({ caption, alt, audienceType });
    if (!parsed.success) {
      const fieldErrors = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0];
        if (key && !fieldErrors[key]) fieldErrors[key] = issue.message;
      }
      setErrors(fieldErrors);
      return;
    }
    if (audienceType === "circle" && !circleId) {
      setErrors({ audienceType: "Elige en qué círculo contarás la historia." });
      return;
    }
    setErrors({});
    setUploading(true);
    setError("");
    try {
      const uploaded = await uploadMedia(file);
      const story = await createStory({
        media: {
          url: uploaded.url,
          type: uploaded.type,
          mimeType: uploaded.mimeType || file.type || "",
          size: uploaded.size || file.size || 0,
          alt: parsed.data.alt
        },
        caption: parsed.data.caption,
        audience: audienceType === "circle" ? { type: "circle", circleId } : { type: audienceType }
      });
      onCreated?.(story);
      onClose?.();
    } catch (requestError) {
      setError(requestError?.response?.data?.error || requestError?.message || "No se pudo publicar la historia.");
    } finally {
      setUploading(false);
    }
  }

  if (!open) return null;

  return (
    <div className="k-story-creator" role="dialog" aria-modal="true" aria-label="Crear historia">
      <div className="k-story-creator-card">
        <header className="k-story-creator-head">
          <h2>Crear historia</h2>
          <button type="button" className="k-story-icon-button" onClick={onClose} aria-label="Cerrar creador de historias">
            <X size={20} />
          </button>
        </header>
        <p className="k-muted k-story-creator-hint">Las historias duran 24 horas y después pasan a tu archivo personal.</p>

        <form onSubmit={publish} noValidate>
          <label className="k-story-file-label">
            {previewUrl && isVideo ? (
              <video className="k-story-creator-preview" src={previewUrl} muted controls aria-label="Vista previa del video" />
            ) : previewUrl ? (
              <img className="k-story-creator-preview" src={previewUrl} alt="Vista previa de la imagen" />
            ) : (
              <span className="k-story-creator-empty">
                <strong>Elige una imagen o video</strong>
                <small className="k-muted">JPG, PNG, WebP · MP4, WebM, MOV</small>
              </span>
            )}
            <input
              ref={inputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,video/mp4,video/webm,video/quicktime"
              onChange={handleFileChange}
              aria-label="Imagen o video de la historia"
            />
          </label>

          <label className="k-story-field">
            Texto alternativo
            <input
              value={alt}
              onChange={(event) => setAlt(event.target.value)}
              maxLength={500}
              placeholder="Describe la imagen para lectores de pantalla"
            />
            {errors.alt && <small className="k-story-error" role="alert">{errors.alt}</small>}
          </label>

          <label className="k-story-field">
            Texto de la historia
            <textarea
              value={caption}
              onChange={(event) => setCaption(event.target.value)}
              maxLength={500}
              rows={2}
              placeholder="Opcional: escribe algo sobre tu historia"
            />
            {errors.caption && <small className="k-story-error" role="alert">{errors.caption}</small>}
          </label>

          <label className="k-story-field">
            Audiencia
            <select value={audienceType} onChange={(event) => setAudienceType(event.target.value)} aria-label="Audiencia de la historia">
              {AUDIENCE_OPTIONS.filter(([value]) => STORY_AUDIENCE_TYPES.includes(value)).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
            {errors.audienceType && <small className="k-story-error" role="alert">{errors.audienceType}</small>}
          </label>

          {audienceType === "circle" && (
            <label className="k-story-field">
              Círculo
              <select value={circleId} onChange={(event) => setCircleId(event.target.value)} aria-label="Círculo de la historia">
                <option value="">Elige un círculo</option>
                {circles.map((circle) => (
                  <option key={circle._id} value={circle._id}>{circle.name}</option>
                ))}
              </select>
              {circles.length === 0 && <small className="k-muted">Aún no tienes círculos. Créalos en Círculos.</small>}
            </label>
          )}

          {error && <p className="k-story-error" role="alert">{error}</p>}

          <div className="k-story-creator-actions">
            <button type="button" className="k-button k-button-ghost" onClick={onClose} disabled={uploading}>
              Cancelar
            </button>
            <button type="submit" className="k-button k-button-primary" disabled={uploading}>
              {uploading ? "Publicando..." : "Publicar historia"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
