import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { searchGlobal, toggleFollow } from "../../services/usersService";
import { mediaUrl } from "../../services/mediaUrl";
import { queryKeys } from "../../services/queryKeys";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const SCOPES = [
  ["all", "Todo"],
  ["users", "Personas"],
  ["posts", "Publicaciones"]
];

const EMPTY_RESULTS = { users: [], posts: [], totals: {}, hasMore: {} };

/** BLOQUE 009 — una pantalla para /search y /explore, con búsquedas reales. */
export default function UserSearch() {
  const queryClient = useQueryClient();
  const [query, setQuery] = useState("");
  const [scope, setScope] = useState("all");
  // La búsqueda se dispara al enviar (botón/Enter), no por tecleo: aquí
  // vive el texto enviado; la consulta vive en el caché de TanStack.
  const [submitted, setSubmitted] = useState("");
  const [actionUserId, setActionUserId] = useState("");
  const [actionError, setActionError] = useState("");

  const searchQuery = useQuery({
    queryKey: queryKeys.search(submitted, scope),
    queryFn: () => searchGlobal(submitted, scope),
    enabled: submitted.trim().length >= 2,
    staleTime: 60_000,
  });

  const loading = searchQuery.isFetching;
  const results = searchQuery.data || EMPTY_RESULTS;
  const error =
    actionError ||
    (searchQuery.error
      ? searchQuery.error.response?.data?.error || "No se pudo completar la búsqueda."
      : "");

  function search() {
    setSubmitted(query.trim());
  }

  async function handleFollow(userId) {
    if (!userId || actionUserId) return;
    setActionUserId(userId);
    setActionError("");

    try {
      const data = await toggleFollow(userId);
      queryClient.setQueryData(queryKeys.search(submitted, scope), (current) => ({
        ...(current || EMPTY_RESULTS),
        users: (current?.users || []).map((user) => user._id === userId
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
      setActionError(
        requestError.response?.data?.error || "No se pudo actualizar el seguimiento."
      );
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
        <Input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={onKeyDown}
          maxLength={80}
          minLength={2}
          placeholder="Buscar personas o publicaciones..."
          aria-label="Buscar en Kronos"
        />
        <Button type="button" onClick={search} disabled={loading || !query.trim()}>
          {loading ? "Buscando..." : "Buscar"}
        </Button>
      </div>

      <div className="k-filter-row" role="group" aria-label="Tipo de resultado">
        {SCOPES.map(([value, label]) => (
          <Button
            variant={scope === value ? "default" : "secondary"}
            type="button"
            key={value}
            onClick={() => setScope(value)}
            aria-pressed={scope === value}
          >
            {label}
          </Button>
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
                <Link to={user.username ? `/profile/${user.username}` : `/users/${user._id}`}>
                  <Avatar
                    size="lg"
                    src={user.avatar ? mediaUrl(user.avatar) : undefined}
                    alt={user.displayName || user.username || "Usuario"}
                    fallback={(user.displayName?.slice(0, 1) || user.username?.slice(0, 1) || "K").toUpperCase()}
                  />
                </Link>
                <div>
                  <Link to={user.username ? `/profile/${user.username}` : `/users/${user._id}`}><strong>{user.displayName || user.username}</strong></Link>
                  <p>@{user.username}</p>
                  {user.bio && <p>{user.bio}</p>}
                  {user.followersCount !== null && <small>{user.followersCount || 0} seguidores</small>}
                </div>
                <Button variant="secondary" type="button" onClick={() => handleFollow(user._id)} disabled={actionUserId === user._id}>
                  {actionUserId === user._id ? "..." : user.isFollowing ? "Dejar de seguir" : "Seguir"}
                </Button>
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
                <Button asChild variant="ghost">
                  <Link to={`/post/${post._id}`}>Ver publicación</Link>
                </Button>
              </article>
            ))}
          </div>
        </section>
      )}
    </section>
  );
}
