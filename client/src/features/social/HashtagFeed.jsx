import { Link, useNavigate, useParams } from "react-router-dom";
import useTagFeed from "./hooks/useTagFeed";
import EmptyState from "../../components/ui/EmptyState";
import Spinner from "../../components/ui/Spinner";

/**
 * PANTALLA DE TEMA — el listado de un hashtag.
 *
 * `GET /posts/topic/:tag` existía desde hace tiempo y ninguna pantalla lo
 * llamaba: al pulsar un hashtag se caía en la búsqueda global, que busca texto
 * (y encuentra el carácter `#`), no el tema. Aquí se consume esa ruta con su
 * paginación real.
 *
 * Es una pantalla de LECTURA: muestra publicaciones y sus contadores, sin
 * duplicar el estado de un feed completo. Se apoya en una tarjeta propia (y no
 * en `PostCard`) porque `PostCard` necesita el estado de likes, guardados y
 * comentarios de su pantalla; reutilizarlo aquí obligaría a duplicar toda esa
 * lógica o a dejar media tarjeta sin funcionar. El detalle sigue siendo el
 * sitio donde se interactúa.
 */
export default function HashtagFeed() {
  const { tag = "" } = useParams();
  const navigate = useNavigate();
  const { posts, loading, error, hasMore, loadMore, loadingMore, retry } = useTagFeed(tag);

  return (
    <section className="page k-tag-page">
      <header className="k-page-header">
        <div>
          <h1>#{tag}</h1>
          <p>Todas las publicaciones con este tema, de la más reciente a la más antigua.</p>
        </div>
        <div className="k-inline-actions">
          <Link className="k-button k-button-secondary" to="/home">Ir a Inicio</Link>
          <button
            type="button"
            className="k-button k-button-ghost"
            onClick={() => navigate(`/explore?q=${encodeURIComponent(`#${tag}`)}`)}
          >
            Buscar «#{tag}»
          </button>
        </div>
      </header>

      {error && (
        <div className="k-state k-state-error" role="alert">
          <p>{error}</p>
          <button type="button" className="k-button k-button-secondary" onClick={retry}>
            Reintentar
          </button>
        </div>
      )}

      {loading ? (
        <Spinner label="Cargando el tema..." />
      ) : posts.length === 0 && !error ? (
        <EmptyState
          title="Todavía no hay publicaciones con este tema"
          description={`Nadie ha usado #${tag} todavía. Puedes ser la primera persona en hacerlo.`}
          action={<Link className="k-button k-button-primary" to="/create/post">Escribir una publicación</Link>}
        />
      ) : (
        <div className="k-feed-list" aria-label={`Publicaciones con el tema #${tag}`}>
          {posts.map((post) => (
            <article key={post._id} className="k-surface k-tag-post">
              <header className="k-tag-post-head">
                <Link to={`/profile/${encodeURIComponent(post.author?.username || post.author?._id || "")}`}>
                  {post.author?.displayName || post.author?.username || "Usuario"}
                </Link>
                <small className="k-muted">
                  {post.createdAt ? new Date(post.createdAt).toLocaleDateString("es-MX", { dateStyle: "medium" }) : ""}
                </small>
              </header>
              <Link className="k-post-content" to={`/post/${post._id}`}>
                <p>{post.content || "Publicación con multimedia"}</p>
              </Link>
              <footer className="k-tag-post-foot k-muted">
                <span>{post.likesCount || 0} me gusta</span>
                <span>{post.commentsCount || 0} comentarios</span>
                <span>{post.repostsCount || 0} republicaciones</span>
                {post.recommendationReason && <span>{post.recommendationReason}</span>}
              </footer>
            </article>
          ))}
        </div>
      )}

      {hasMore && (
        <button
          type="button"
          className="k-button k-button-secondary k-load-more"
          onClick={loadMore}
          disabled={loadingMore}
        >
          {loadingMore ? "Cargando..." : "Cargar más"}
        </button>
      )}
    </section>
  );
}
