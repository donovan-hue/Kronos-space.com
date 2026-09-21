import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Trash2 } from "lucide-react";
import { getUser } from "../../../services/authStorage";
import { getMyStoryArchive, deleteStory } from "../../../services/storiesService";
import { mediaUrl } from "../../../services/mediaUrl";
import StoryViewer from "./StoryViewer";

/**
 * STORIES — archivo personal.
 *
 * Las historias activas y las expiradas del autor. Después de las 24 h
 * nadie más puede verlas; aquí se conservan hasta que el autor las
 * elimine.
 */
export default function StoryArchive() {
  const me = useMemo(() => {
    const user = getUser();
    return {
      id: String(user?._id || user?.id || ""),
      username: user?.username || "",
      displayName: user?.displayName || "",
      avatar: user?.avatar || ""
    };
  }, []);
  const [stories, setStories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [viewerIndex, setViewerIndex] = useState(-1);
  const [confirming, setConfirming] = useState("");
  const [deleting, setDeleting] = useState("");

  const load = useCallback(async () => {
    try {
      const list = await getMyStoryArchive();
      setStories(Array.isArray(list) ? list : []);
      setError("");
    } catch (requestError) {
      setError(requestError?.response?.data?.error || "No se pudo cargar tu archivo.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function remove(storyId) {
    if (deleting) return;
    setDeleting(storyId);
    try {
      await deleteStory(storyId);
      setStories((current) => current.filter((story) => story._id !== storyId));
      setConfirming("");
    } catch (requestError) {
      setError(requestError?.response?.data?.error || "No se pudo eliminar la historia.");
    } finally {
      setDeleting("");
    }
  }

  const activeCount = stories.filter((story) => story.isActive).length;

  return (
    <section className="page k-story-archive" aria-labelledby="k-story-archive-title">
      <header className="k-page-header">
        <div>
          <p className="k-eyebrow">HISTORIAS</p>
          <h1 id="k-story-archive-title">Tu archivo</h1>
          <p className="k-muted">
            {stories.length} {stories.length === 1 ? "historia" : "historias"}
            {activeCount > 0 ? ` · ${activeCount} activa${activeCount === 1 ? "" : "s"}` : ""}. Las expiradas solo las ves tú.
          </p>
        </div>
        <Link className="k-button k-button-ghost" to="/home">Volver a Inicio</Link>
      </header>

      {error && <p className="k-story-error" role="alert">{error}</p>}

      {loading ? (
        <div className="k-story-archive-grid" aria-busy="true">
          <span className="k-story-archive-skeleton" />
          <span className="k-story-archive-skeleton" />
          <span className="k-story-archive-skeleton" />
        </div>
      ) : stories.length === 0 ? (
        <div className="k-surface k-feed-state">
          <p className="k-muted">Todavía no has contado historias. Crea la primera desde Inicio.</p>
          <Link className="k-button k-button-primary" to="/home">Ir a Inicio</Link>
        </div>
      ) : (
        <div className="k-story-archive-grid">
          {stories.map((story, index) => (
            <article key={story._id} className={`k-story-archive-card ${story.isActive ? "" : "is-expired"}`}>
              <button type="button" className="k-story-archive-media" onClick={() => setViewerIndex(index)} aria-label={`Ver historia del ${new Date(story.createdAt).toLocaleDateString()}`}>
                {story.media.type === "video" ? (
                  <span className="k-story-archive-thumb" aria-hidden="true">▶</span>
                ) : (
                  <img src={mediaUrl(story.media.url)} alt={story.media.alt || "Historia"} loading="lazy" />
                )}
                <span className={`k-story-archive-badge ${story.isActive ? "is-active" : ""}`}>
                  {story.isActive ? "Activa" : "Expirada"}
                </span>
              </button>
              <div className="k-story-archive-meta">
                <small className="k-muted">
                  {story.viewsCount} {story.viewsCount === 1 ? "vista" : "vistas"} · {story.repliesCount} {story.repliesCount === 1 ? "respuesta" : "respuestas"}
                </small>
                {confirming === story._id ? (
                  <span className="k-story-delete-confirm">
                    <button type="button" className="k-button k-button-primary" onClick={() => remove(story._id)} disabled={deleting === story._id}>
                      {deleting === story._id ? "Eliminando..." : "Sí, eliminar"}
                    </button>
                    <button type="button" className="k-button k-button-ghost" onClick={() => setConfirming("")}>Cancelar</button>
                  </span>
                ) : (
                  <button type="button" className="k-story-icon-button" onClick={() => setConfirming(story._id)} aria-label={`Eliminar historia del ${new Date(story.createdAt).toLocaleDateString()}`}>
                    <Trash2 size={16} />
                  </button>
                )}
              </div>
            </article>
          ))}
        </div>
      )}

      {viewerIndex >= 0 && stories.length > 0 && (
        <StoryViewer
          groups={[{ author: { _id: me.id, username: me.username, displayName: me.displayName, avatar: me.avatar }, stories }]}
          onClose={() => setViewerIndex(-1)}
          onChanged={load}
        />
      )}
    </section>
  );
}
