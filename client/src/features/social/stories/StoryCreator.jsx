import { createPortal } from "react-dom";
import { useEffect, useMemo, useRef, useState } from "react";
import { X } from "lucide-react";
import { uploadMedia } from "../../../services/postsService";
import { createStory } from "../../../services/storiesService";
import { getCircles } from "../../../services/circlesService";
import { obtenerCatalogoMusica } from "../../../services/musicService";
import { storySchema, STORY_AUDIENCE_TYPES } from "../../../schemas";

// Stickers (bloque 1.3). No se suben imágenes: se guardan datos y la historia
// los pinta con sus estilos, así una mención es un enlace de verdad y una
// encuesta se puede votar.
const STICKER_TIPOS = [
  { id: "mention", label: "Mención", placeholder: "usuario" },
  { id: "hashtag", label: "Etiqueta", placeholder: "tema" },
  { id: "location", label: "Ubicación", placeholder: "Tlaquepaque" },
  { id: "question", label: "Pregunta", placeholder: "¿Qué te parece?" }
];

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
  // Stickers y música (bloque 1.3).
  const [stickers, setStickers] = useState([]);
  const [stickerTipo, setStickerTipo] = useState("mention");
  const [stickerTexto, setStickerTexto] = useState("");
  const [encuestaPregunta, setEncuestaPregunta] = useState("");
  const [encuestaOpciones, setEncuestaOpciones] = useState(["", ""]);
  const [catalogo, setCatalogo] = useState([]);
  const [busquedaMusica, setBusquedaMusica] = useState("");
  const [musicaId, setMusicaId] = useState("");
  const [musicaInicio, setMusicaInicio] = useState(0);
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
    setStickers([]);
    setStickerTipo("mention");
    setStickerTexto("");
    setEncuestaPregunta("");
    setEncuestaOpciones(["", ""]);
    setMusicaId("");
    setMusicaInicio(0);
    setBusquedaMusica("");
    let cancelled = false;
    // El catálogo es opcional: si falla, se publica la historia sin música y
    // la pantalla lo dice, en vez de bloquear la publicación.
    obtenerCatalogoMusica()
      .then(({ pistas }) => {
        if (!cancelled) setCatalogo(Array.isArray(pistas) ? pistas : []);
      })
      .catch(() => {
        if (!cancelled) setCatalogo([]);
      });
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

  function agregarSticker() {
    if (stickers.length >= 12) return;
    if (stickerTipo === "poll") {
      const opciones = encuestaOpciones.map((opcion) => opcion.trim()).filter(Boolean).slice(0, 4);
      if (!encuestaPregunta.trim() || opciones.length < 2) {
        setError("Una encuesta necesita una pregunta y al menos dos opciones.");
        return;
      }
      setStickers((actual) => [...actual, { type: "poll", text: encuestaPregunta.trim(), options: opciones, position: "centro" }]);
      setEncuestaPregunta("");
      setEncuestaOpciones(["", ""]);
      setError("");
      return;
    }
    const limpio = stickerTexto.trim().replace(/^[@#]+/, "");
    if (!limpio) return;
    setStickers((actual) => [...actual, { type: stickerTipo, text: limpio, position: "centro" }]);
    setStickerTexto("");
    setError("");
  }

  function quitarSticker(indice) {
    setStickers((actual) => actual.filter((_, posicion) => posicion !== indice));
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
        stickers,
        ...(musicaId ? { music: { trackId: musicaId, inicio: Number(musicaInicio) || 0 } } : {}),
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

  return createPortal(
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

          <fieldset className="k-story-stickers">
            <legend>Stickers</legend>
            <p className="k-muted">Se pintan sobre la historia. Sin texto libre fuera de ellos: así una mención es un enlace real.</p>
            <div className="k-story-sticker-add">
              <select value={stickerTipo} onChange={(event) => setStickerTipo(event.target.value)} aria-label="Tipo de sticker">
                {STICKER_TIPOS.map((tipo) => (
                  <option key={tipo.id} value={tipo.id}>{tipo.label}</option>
                ))}
                <option value="poll">Encuesta</option>
              </select>

              {stickerTipo === "poll" ? (
                <div className="k-story-poll-builder">
                  <input
                    value={encuestaPregunta}
                    onChange={(event) => setEncuestaPregunta(event.target.value)}
                    maxLength={120}
                    placeholder="Pregunta"
                    aria-label="Pregunta de la encuesta"
                  />
                  {encuestaOpciones.map((opcion, indice) => (
                    <input
                      key={indice}
                      value={opcion}
                      onChange={(event) => setEncuestaOpciones((actual) => actual.map((item, posicion) => (posicion === indice ? event.target.value : item)))}
                      maxLength={40}
                      placeholder={`Opción ${indice + 1}`}
                      aria-label={`Opción ${indice + 1} de la encuesta`}
                    />
                  ))}
                  {encuestaOpciones.length < 4 && (
                    <button type="button" className="k-button k-button-ghost" onClick={() => setEncuestaOpciones((actual) => [...actual, ""])}>
                      Añadir opción
                    </button>
                  )}
                </div>
              ) : (
                <input
                  value={stickerTexto}
                  onChange={(event) => setStickerTexto(event.target.value)}
                  maxLength={120}
                  placeholder={STICKER_TIPOS.find((tipo) => tipo.id === stickerTipo)?.placeholder || ""}
                  aria-label="Texto del sticker"
                />
              )}

              <button type="button" className="k-button k-button-secondary" onClick={agregarSticker} disabled={stickers.length >= 12}>
                Añadir
              </button>
            </div>

            {stickers.length > 0 && (
              <ul className="k-story-sticker-list">
                {stickers.map((sticker, indice) => (
                  <li key={`${sticker.type}-${indice}`}>
                    <span>
                      <strong>{sticker.type === "poll" ? "Encuesta" : sticker.type}</strong>{" "}
                      {sticker.text}
                      {sticker.type === "poll" ? ` · ${sticker.options.join(" / ")}` : ""}
                    </span>
                    <button type="button" className="k-comment-delete" onClick={() => quitarSticker(indice)} aria-label={`Quitar sticker ${sticker.text}`}>×</button>
                  </li>
                ))}
              </ul>
            )}
          </fieldset>

          <fieldset className="k-story-music">
            <legend>Música</legend>
            {catalogo.length === 0 ? (
              <p className="k-muted">No hay música disponible en el catálogo.</p>
            ) : (
              <div className="k-story-music-picker">
                <input
                  value={busquedaMusica}
                  onChange={(event) => setBusquedaMusica(event.target.value)}
                  placeholder="Buscar en el catálogo"
                  aria-label="Buscar música"
                />
                <select value={musicaId} onChange={(event) => setMusicaId(event.target.value)} aria-label="Pista de música">
                  <option value="">Sin música</option>
                  {catalogo
                    .filter((pista) => {
                      const texto = busquedaMusica.trim().toLowerCase();
                      if (!texto) return true;
                      return `${pista.titulo} ${pista.autor}`.toLowerCase().includes(texto);
                    })
                    .slice(0, 40)
                    .map((pista) => (
                      <option key={pista._id} value={pista._id}>
                        {pista.titulo}{pista.autor ? ` · ${pista.autor}` : ""}
                      </option>
                    ))}
                </select>
                {musicaId && (
                  <label className="k-story-music-start">
                    Empieza en el segundo
                    <input
                      type="number"
                      min="0"
                      max="600"
                      value={musicaInicio}
                      onChange={(event) => setMusicaInicio(Math.max(0, Math.min(600, Number(event.target.value) || 0)))}
                    />
                  </label>
                )}
              </div>
            )}
          </fieldset>

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
    </div>,
    document.body
  );
}
