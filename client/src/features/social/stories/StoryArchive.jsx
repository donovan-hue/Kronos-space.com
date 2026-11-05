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
  const [pagina, setPagina] = useState(1);
  const [total, setTotal] = useState(null);
  const [hayMas, setHayMas] = useState(false);
  const [cargandoMas, setCargandoMas] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [viewerIndex, setViewerIndex] = useState(-1);
  const [confirming, setConfirming] = useState("");
  const [deleting, setDeleting] = useState("");

  const load = useCallback(async () => {
    try {
      const resultado = await getMyStoryArchive();
      setStories(resultado.stories);
      setTotal(resultado.total);
      setHayMas(resultado.hayMas);
      setPagina(resultado.page);
      setError("");
    } catch (requestError) {
      setError(requestError?.response?.data?.error || "No se pudo cargar tu archivo.");
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Trae la página siguiente y la añade al final.
   *
   * La página se pide por desplazamiento y no por cursor porque el archivo se
   * ordena por fecha de creación: una historia nueva mientras se pagina entra
   * al principio y no desplaza lo ya leído hacia una página anterior.
   */
  const cargarMas = useCallback(async () => {
    if (cargandoMas || !hayMas) return;
    setCargandoMas(true);
    try {
      const resultado = await getMyStoryArchive({ page: pagina + 1 });
      setStories((actual) => [...actual, ...resultado.stories]);
      setHayMas(resultado.hayMas);
      setPagina(resultado.page);
      if (resultado.total !== null) setTotal(resultado.total);
      setError("");
    } catch (requestError) {
      setError(requestError?.response?.data?.error || "No se pudieron cargar más historias.");
    } finally {
      setCargandoMas(false);
    }
  }, [cargandoMas, hayMas, pagina]);

  useEffect(() => {
    load();
  }, [load]);

  async function remove(storyId) {
    if (deleting) return;
    setDeleting(storyId);
    try {
      await deleteStory(storyId);
      setStories((current) => current.filter((story) => story._id !== storyId));
      // El total viene del servidor y no se recarga aquí: si no baja, la
      // pantalla diría «1 de 2» después de borrar una, que es mentira.
      setTotal((actual) => (actual === null ? null : Math.max(0, actual - 1)));
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
            {total !== null ? `${stories.length} de ${total}` : stories.length}{" "}
            {total === 1 ? "historia" : "historias"}
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

      {hayMas && (
        <div className="k-story-archive-more">
          <button
            type="button"
            className="k-button k-button-secondary"
            onClick={cargarMas}
            disabled={cargandoMas}
          >
            {cargandoMas ? "Cargando…" : "Cargar más historias"}
          </button>
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
