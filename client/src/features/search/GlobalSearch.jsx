import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Search, UserRound } from "lucide-react";
import { globalSearch } from "../../services/searchService";

const TYPES = [
  ["all", "Todo"],
  ["users", "Personas"],
  ["posts", "Publicaciones"]
];

function initials(user) {
  return user?.displayName?.slice(0, 1) || user?.username?.slice(0, 1) || "K";
}

function formatDate(value) {
  if (!value) return "";
  return new Date(value).toLocaleDateString("es-MX", { dateStyle: "medium" });
}

export default function GlobalSearch({ explore = false }) {
  const [query, setQuery] = useState("");
  const [type, setType] = useState("all");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");

  async function runSearch(nextType = type, nextPage = 1, append = false) {
    const value = query.trim();
    if (!value) {
      setResult(null);
      setError("");
      return;
    }

    append ? setLoadingMore(true) : setLoading(true);
    setError("");

    try {
      const data = await globalSearch(value, { type: nextType, page: nextPage });
      setResult((current) => append
        ? { ...data, users: [...(current?.users || []), ...(data.users || [])], posts: [...(current?.posts || []), ...(data.posts || [])] }
        : data);
    } catch (requestError) {
      setError(requestError.response?.data?.error || "No se pudo completar la búsqueda.");
    } finally {
      append ? setLoadingMore(false) : setLoading(false);
    }
  }

  useEffect(() => {
    if (!query.trim()) return undefined;
    const timer = window.setTimeout(() => runSearch(type), 260);
    return () => window.clearTimeout(timer);
  }, [type]);

  function changeType(nextType) {
    setType(nextType);
    if (query.trim()) runSearch(nextType);
  }

  const users = result?.users || [];
  const posts = result?.posts || [];
  const empty = result && !loading && users.length === 0 && posts.length === 0;

  return (
    <section className="page">
      <header className="k-page-header">
        <div>
          <p className="k-eyebrow">KRONOS / {explore ? "EXPLORE" : "SEARCH"}</p>
          <h1>{explore ? "Explora Kronos Space" : "Búsqueda global"}</h1>
          <p>Encuentra personas y publicaciones sin salir de la plataforma.</p>
        </div>
      </header>

      <form className="k-search-row" onSubmit={(event) => { event.preventDefault(); runSearch(); }}>
        <Search size={18} aria-hidden="true" />
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          maxLength={80}
          placeholder="Busca usernames, nombres o contenido..."
          aria-label="Búsqueda global"
        />
        <button className="k-button k-button-primary" type="submit" disabled={loading || !query.trim()}>
          {loading ? "Buscando..." : "Buscar"}
        </button>
      </form>

      <div className="k-filter-chips" role="tablist" aria-label="Tipo de búsqueda">
        {TYPES.map(([value, label]) => (
          <button key={value} className={`k-chip ${type === value ? "is-active" : ""}`} type="button" role="tab" aria-selected={type === value} onClick={() => changeType(value)}>
            {label}
          </button>
        ))}
      </div>

      {error && <p className="k-state k-state-error" role="alert">{error}</p>}
      {loading && <div className="k-feed-state"><span className="k-skeleton" /><span className="k-skeleton k-skeleton-wide" /></div>}
      {!loading && !result && <div className="k-empty-state"><UserRound size={28} aria-hidden="true" /><h2>Empieza a explorar</h2><p>Busca un perfil o una palabra clave para ver resultados reales.</p></div>}
      {empty && <div className="k-empty-state"><h2>Sin coincidencias</h2><p>Prueba con otra palabra o cambia el filtro.</p></div>}

      {!loading && result && users.length > 0 && (
        <section className="k-search-section" aria-labelledby="search-users-title">
          <div className="k-section-heading"><h2 id="search-users-title">Personas</h2><span className="k-muted">{users.length}</span></div>
          <div className="k-user-results">
            {users.map((user) => (
              <article className="k-surface k-user-result" key={user._id}>
                <Link className="k-avatar k-avatar-lg" to={`/profile/${user.username}`} aria-label={`Abrir perfil de ${user.displayName || user.username}`}>
                  {user.avatar ? <img src={user.avatar} alt="" /> : initials(user)}
                </Link>
                <div>
                  <Link to={`/profile/${user.username}`}><strong>{user.displayName || user.username}</strong></Link>
                  <p>@{user.username}</p>
                  {user.bio && <p>{user.bio}</p>}
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      {!loading && result && posts.length > 0 && (
        <section className="k-search-section" aria-labelledby="search-posts-title">
          <div className="k-section-heading"><h2 id="search-posts-title">Publicaciones</h2><span className="k-muted">{posts.length}</span></div>
          <div className="k-feed-list">
            {posts.map((post) => (
              <article className="k-post" key={post._id}>
                <header className="k-post-header">
                  <Link className="k-avatar" to={`/profile/${post.author?.username || ""}`}>{initials(post.author)}</Link>
                  <div><Link className="k-post-author" to={`/profile/${post.author?.username || ""}`}>{post.author?.displayName || post.author?.username || "Usuario"}</Link><p className="k-muted">@{post.author?.username || "kronos"} · {formatDate(post.createdAt)}</p></div>
                </header>
                <Link className="k-post-content" to={`/post/${post._id}`}><p>{post.content}</p></Link>
              </article>
            ))}
          </div>
        </section>
      )}

      {!loading && result?.hasMore && (
        <button className="k-button k-button-secondary k-load-more" type="button" onClick={() => runSearch(type, Number(result.page || 1) + 1, true)} disabled={loadingMore}>
          {loadingMore ? "Cargando..." : "Cargar más"}
        </button>
      )}
    </section>
  );
}
