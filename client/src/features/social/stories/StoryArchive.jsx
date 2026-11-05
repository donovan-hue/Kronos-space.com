import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Trash2 } from "lucide-react";
import { getUser } from "../../../services/authStorage";
import {
  getMyStoryArchive,
  deleteStory,
  getStoryHighlights,
  createStoryHighlight,
  deleteStoryHighlight
} from "../../../services/storiesService";
import { mediaUrl } from "../../../services/mediaUrl";
import StoryViewer from "./StoryViewer";

/**
 * STORIES — archivo personal.
 *
 * Las historias activas y las expiradas del autor. Después de las 24 h
 * nadie más puede verlas; aquí se conservan hasta que el autor las
 * elimine.
 *
 * Dos cosas nuevas (bloque 1.3):
 * - **Retención visible**: cada tarjeta dice cuándo se borrará sola. El
 *   borrado no es un TTL silencioso; lo hace `db:stories-retention` en dos
 *   pasos, y esta pantalla es donde el autor se entera.
 * - **Destacados**: una selección permanente que sobrevive a la caducidad.
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
  // Destacados: colección permanente que sobrevive a la caducidad.
  const [highlights, setHighlights] = useState([]);
  const [seleccion, setSeleccion] = useState([]);
  const [tituloDestacado, setTituloDestacado] = useState("");
  const [creando, setCreando] = useState(false);

  const cargarDestacados = useCallback(async () => {
    try {
      setHighlights(await getStoryHighlights());
    } catch {
      // Un fallo de destacados no debe tumbar el archivo.
      setHighlights([]);
    }
  }, []);

  useEffect(() => { cargarDestacados(); }, [cargarDestacados]);

  function alternarSeleccion(id) {
    setSeleccion((actual) => actual.includes(id) ? actual.filter((x) => x !== id) : [...actual, id]);
  }

  async function crearDestacado() {
    if (creando || !seleccion.length) return;
    setCreando(true);
    try {
      await createStoryHighlight({ title: tituloDestacado, storyIds: seleccion });
      setSeleccion([]);
      setTituloDestacado("");
      await cargarDestacados();
    } catch (requestError) {
      setError(requestError?.response?.data?.error || "No se pudo crear el destacado.");
    } finally {
      setCreando(false);
    }
  }

  async function borrarDestacado(id) {
    try {
      await deleteStoryHighlight(id);
      await cargarDestacados();
    } catch (requestError) {
      setError(requestError?.response?.data?.error || "No se pudo eliminar el destacado.");
    }
  }

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

      {highlights.length > 0 && (
        <section className="k-story-highlights" aria-label="Destacados">
          <h2>Destacados</h2>
          <ul>
            {highlights.map((item) => (
              <li key={item.id}>
                <span className="k-story-highlight-cover">
                  {item.coverUrl ? <img src={mediaUrl(item.coverUrl)} alt="" loading="lazy" /> : null}
                </span>
                <span>
                  <strong>{item.title || "Sin título"}</strong>
                  <small className="k-muted">{item.count} {item.count === 1 ? "historia" : "historias"}</small>
                </span>
                <button type="button" className="k-story-icon-button" onClick={() => borrarDestacado(item.id)} aria-label={`Eliminar destacado ${item.title || "sin título"}`}>
                  <Trash2 size={15} />
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {seleccion.length > 0 && (
        <div className="k-story-highlight-builder">
          <label>
            <span>Nombre del destacado</span>
            <input
              type="text"
              value={tituloDestacado}
              maxLength={60}
              placeholder="Verano 2026"
              onChange={(event) => setTituloDestacado(event.target.value)}
            />
          </label>
          <button type="button" className="k-button k-button-primary" onClick={crearDestacado} disabled={creando}>
            {creando ? "Creando…" : `Destacar ${seleccion.length} ${seleccion.length === 1 ? "historia" : "historias"}`}
          </button>
          <button type="button" className="k-button k-button-ghost" onClick={() => setSeleccion([])}>Cancelar</button>
        </div>
      )}

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
                {Number.isFinite(story.daysUntilDelete) ? (
                  <small className={`k-story-retention${story.daysUntilDelete <= 7 ? " is-urgent" : ""}`}>
                    {story.daysUntilDelete === 0
                      ? "Se borrará hoy"
                      : `Se borra en ${story.daysUntilDelete} ${story.daysUntilDelete === 1 ? "día" : "días"}`}
                  </small>
                ) : null}
                <label className="k-story-highlight-pick">
                  <input
                    type="checkbox"
                    checked={seleccion.includes(story._id)}
                    onChange={() => alternarSeleccion(story._id)}
                  />
                  <span>Destacar</span>
                </label>
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
