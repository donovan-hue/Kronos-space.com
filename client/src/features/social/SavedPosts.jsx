import { mediaUrl } from "../../services/mediaUrl";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getSavedPosts, toggleSave } from "../../services/postsService";

function date(value) {
  return value ? new Date(value).toLocaleString("es-MX", { dateStyle: "medium", timeStyle: "short" }) : "";
}

export default function SavedPosts() {
  const [posts, setPosts] = useState([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");

  async function load({ nextPage = 1, append = false } = {}) {
    if (append && (loadingMore || !hasMore)) return;
    if (append) setLoadingMore(true);
    else setLoading(true);
    setError("");
    try {
      const data = await getSavedPosts({ page: nextPage, limit: 20 });
      const incoming = Array.isArray(data?.posts) ? data.posts : [];
      const total = typeof data?.total === "number" ? data.total : incoming.length;
      const incomingHasMore = typeof data?.hasMore === "boolean" ? data.hasMore : incoming.length === 20;
      setHasMore(incomingHasMore);
      setPage(nextPage);
      if (append) {
        setPosts((cur) => {
          const ids = new Set(cur.map((p) => String(p._id)));
          return [...cur, ...incoming.filter((p) => !ids.has(String(p._id)))];
        });
      } else {
        setPosts(incoming);
      }
    } catch (e) {
      setError(e.response?.data?.error || "No se pudieron cargar los guardados.");
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }

  useEffect(() => {
    load({ nextPage: 1, append: false });
  }, []);

  async function handleUnsave(id) {
    try {
      await toggleSave(id);
      setPosts((items) => items.filter((p) => String(p._id) !== String(id)));
    } catch (e) {
      setError(e.response?.data?.error || "No se pudo quitar de guardados.");
    }
  }

  if (loading) {
    return (
      <section className="page">
        <div className="k-surface k-feed-state"><span className="k-skeleton" /><span className="k-skeleton k-skeleton-wide" /></div>
      </section>
    );
  }

  return (
    <section className="page">
      <header className="k-page-header">
        <div>
          <p className="k-eyebrow">KRONOS / SAVED</p>
          <h1>Guardados</h1>
          <p>Publicaciones que marcaste para después.</p>
        </div>
        <Link className="k-button k-button-ghost" to="/home">Volver al feed</Link>
      </header>
      {error && <p className="k-state k-state-error" role="alert">{error}</p>}
      {posts.length === 0 ? (
        <div className="k-empty-state">
          <h2>Nada guardado aún</h2>
          <p>Usa el botón Guardar en el feed para ver tus favoritos aquí.</p>
          <Link className="k-button k-button-primary" to="/home">Ir al feed</Link>
        </div>
      ) : (
        <>
          <div className="k-feed-list">
            {posts.map((post) => (
              <article className="k-post" key={post._id}>
                <header className="k-post-header">
                  <Link className="k-avatar" to={post.author?.username ? `/profile/${post.author.username}` : "/profile"}>{post.author?.displayName?.slice(0, 1) || "K"}</Link>
                  <div>
                    <Link className="k-post-author" to={post.author?.username ? `/profile/${post.author.username}` : "/profile"}>{post.author?.displayName || post.author?.username || "Usuario"}</Link>
                    <p>@{post.author?.username || "kronos"} · {date(post.createdAt)}</p>
                  </div>
                </header>
                <Link className="k-post-content" to={`/post/${post._id}`}><p>{post.content}</p></Link>
                {post.media?.url && <div style={{ margin: "0 20px 12px", overflow: "hidden", borderRadius: 10, border: "1px solid var(--k-border)" }}><img src={mediaUrl(post.media.url)} alt={post.media.alt || ""} loading="lazy" style={{ width: "100%", maxHeight: 420, objectFit: "cover" }} /></div>}
                <div className="k-post-actions">
                  <Link className="k-button k-button-secondary" to={`/post/${post._id}`}>Ver detalle</Link>
                  <button type="button" className="k-button k-button-ghost" onClick={() => handleUnsave(post._id)}>Quitar</button>
                </div>
              </article>
            ))}
          </div>
          <div style={{ display: "flex", justifyContent: "center", marginTop: 24 }}>
            {hasMore ? (
              <button type="button" className="k-button k-button-secondary" onClick={() => load({ nextPage: page + 1, append: true })} disabled={loadingMore}>
                {loadingMore ? "Cargando..." : "Cargar más"}
              </button>
            ) : (
              <p className="k-muted" style={{ fontSize: "0.9rem" }}>No hay más guardados.</p>
            )}
          </div>
        </>
      )}
    </section>
  );
}
