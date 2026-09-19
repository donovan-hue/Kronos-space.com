import { useState } from "react";
import { Link } from "react-router-dom";
import { searchGlobal, toggleFollow } from "../../services/usersService";
import { mediaUrl } from "../../services/mediaUrl";

const SCOPES = [
  ["all", "Todo"],
  ["users", "Personas"],
  ["posts", "Publicaciones"]
];

/** BLOQUE 009 — una pantalla para /search y /explore, con búsquedas reales. */
export default function UserSearch() {
  const [query, setQuery] = useState("");
  const [scope, setScope] = useState("all");
  const [results, setResults] = useState({ users: [], posts: [], totals: {}, hasMore: {} });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [actionUserId, setActionUserId] = useState("");

  async function search() {
    const value = query.trim();
    if (!value) {
      setResults({ users: [], posts: [], totals: {}, hasMore: {} });
      setError("");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const data = await searchGlobal(value, scope);
      setResults({
        users: Array.isArray(data?.users) ? data.users : [],
        posts: Array.isArray(data?.posts) ? data.posts : [],
        totals: data?.totals || {},
        hasMore: data?.hasMore || {}
      });
    } catch (requestError) {
      setResults({ users: [], posts: [], totals: {}, hasMore: {} });
      setError(requestError.response?.data?.error || "No se pudo completar la búsqueda.");
    } finally {
      setLoading(false);
    }
  }

  async function handleFollow(userId) {
    if (!userId || actionUserId) return;
    setActionUserId(userId);
    setError("");

    try {
      const data = await toggleFollow(userId);
      setResults((current) => ({
        ...current,
        users: current.users.map((user) => user._id === userId
          ? {
              ...user,
              isFollowing: Boolean(data.following),
              followersCount: user.followersCount === null
                ? null
                : Math.max(0, (user.followersCount || 0) + (data.following ? 1 : -1))
            }
          : user)
      }));
    } catch (requestError) {
      setError(requestError.response?.data?.error || "No se pudo actualizar el seguimiento.");
    } finally {
      setActionUserId("");
    }
  }

  function onKeyDown(event) {
    if (event.key === "Enter") {
      event.preventDefault();
      search();
    }
  }

  const hasResults = results.users.length > 0 || results.posts.length > 0;
  const searched = query.trim().length > 0;

  return (
    <section className="page">
      <header className="k-page-header">
        <div>
          <h1>Explorar</h1>
          <p>Encuentra personas y conversaciones públicas de tu comunidad.</p>
        </div>
      </header>

      <div className="k-search-row" role="search">
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={onKeyDown}
          maxLength={80}
          minLength={2}
          placeholder="Buscar personas o publicaciones..."
          aria-label="Buscar en Kronos"
        />
        <button className="k-button k-button-primary" type="button" onClick={search} disabled={loading || !query.trim()}>
          {loading ? "Buscando..." : "Buscar"}
        </button>
      </div>

      <div className="k-filter-row" role="group" aria-label="Tipo de resultado">
        {SCOPES.map(([value, label]) => (
          <button
            className={`k-button ${scope === value ? "k-button-primary" : "k-button-secondary"}`}
            type="button"
            key={value}
            onClick={() => setScope(value)}
            aria-pressed={scope === value}
          >
            {label}
          </button>
        ))}
      </div>

      {error && <p className="k-state k-state-error" role="alert">{error}</p>}

      {!loading && searched && !hasResults && !error && (
        <div className="k-empty-state">
          <h2>No encontramos resultados</h2>
          <p>Prueba con otro nombre, usuario o frase.</p>
        </div>
      )}

      {results.users.length > 0 && (
        <section className="k-search-section" aria-labelledby="search-people">
          <div className="k-section-heading">
            <h2 id="search-people">Personas</h2>
            <span className="k-muted">{results.totals.users || results.users.length} encontradas</span>
          </div>
          <div className="k-user-results">
            {results.users.map((user) => (
              <article className="k-surface k-user-result" key={user._id}>
                <Link className="k-avatar k-avatar-lg" to={user.username ? `/profile/${user.username}` : `/users/${user._id}`}>
                  {user.avatar ? <img src={mediaUrl(user.avatar)} alt="" /> : user.displayName?.slice(0, 1) || user.username?.slice(0, 1) || "K"}
                </Link>
                <div>
                  <Link to={user.username ? `/profile/${user.username}` : `/users/${user._id}`}><strong>{user.displayName || user.username}</strong></Link>
                  <p>@{user.username}</p>
                  {user.bio && <p>{user.bio}</p>}
                  {user.followersCount !== null && <small>{user.followersCount || 0} seguidores</small>}
                </div>
                <button className="k-button k-button-secondary" type="button" onClick={() => handleFollow(user._id)} disabled={actionUserId === user._id}>
                  {actionUserId === user._id ? "..." : user.isFollowing ? "Dejar de seguir" : "Seguir"}
                </button>
              </article>
            ))}
          </div>
        </section>
      )}

      {results.posts.length > 0 && (
        <section className="k-search-section" aria-labelledby="search-posts">
          <div className="k-section-heading">
            <h2 id="search-posts">Publicaciones</h2>
            <span className="k-muted">{results.totals.posts || results.posts.length} encontradas</span>
          </div>
          <div className="k-feed-list">
            {results.posts.map((post) => (
              <article className="k-surface k-search-post" key={post._id}>
                <p className="k-muted">{post.author?.displayName || post.author?.username || "Usuario"} · @{post.author?.username || "kronos"}</p>
                <Link to={`/post/${post._id}`}><p className="k-search-post-content">{post.content}</p></Link>
                {post.media?.url && <img src={mediaUrl(post.media.url)} alt={post.media.alt || ""} loading="lazy" />}
                <Link className="k-button k-button-ghost" to={`/post/${post._id}`}>Ver publicación</Link>
              </article>
            ))}
          </div>
        </section>
      )}
    </section>
  );
}
