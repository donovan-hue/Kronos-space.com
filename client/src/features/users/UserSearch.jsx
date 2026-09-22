import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { searchGlobal, toggleFollow } from "../../services/usersService";
import { mediaUrl } from "../../services/mediaUrl";
import PostMedia from "../social/components/PostMedia";
import { queryKeys } from "../../services/queryKeys";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import EmptyState from "@/components/ui/EmptyState";

const SCOPES = [
  ["all", "Todo"],
  ["users", "Personas"],
  ["posts", "Publicaciones"]
];

const EMPTY_RESULTS = { users: [], posts: [], totals: {}, hasMore: {} };

/** BLOQUE 009 — una pantalla para /search y /explore, con búsquedas reales. */
export default function UserSearch() {
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const [query, setQuery] = useState("");
  const [scope, setScope] = useState("all");
  // La búsqueda se dispara al enviar (botón/Enter), no por tecleo: aquí
  // vive el texto enviado; la consulta vive en el caché de TanStack.
  const [submitted, setSubmitted] = useState("");
  const [actionUserId, setActionUserId] = useState("");
  const [loadingMoreScope, setLoadingMoreScope] = useState("");
  const [actionError, setActionError] = useState("");

  useEffect(() => {
    const initial = searchParams.get("q") || searchParams.get("tag") || "";
    if (initial.trim().length >= 2) {
      setQuery(initial);
      setSubmitted(initial);
    }
  }, [searchParams]);

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
    const value = query.trim();
    setActionError("");
    if (value.length < 2) {
      setSubmitted("");
      setActionError("Escribe al menos 2 caracteres para buscar.");
      return;
    }
    setSubmitted(value);
  }

  function clearSearch() {
    setQuery("");
    setSubmitted("");
    setActionError("");
  }

  async function retrySearch() {
    if (!submitted) return;
    setActionError("");
    await searchQuery.refetch();
  }

  async function handleLoadMore(resultScope) {
    if (!submitted || loadingMoreScope || !["users", "posts"].includes(resultScope)) return;
    const nextPage = (searchQuery.data?.pagesByScope?.[resultScope] || 1) + 1;
    setLoadingMoreScope(resultScope);
    setActionError("");

    try {
      const nextResults = await searchGlobal(submitted, resultScope, { page: nextPage });
      queryClient.setQueryData(queryKeys.search(submitted, scope), (current) => {
        const existing = current || EMPTY_RESULTS;
        const users = resultScope === "users"
          ? [...(existing.users || []), ...(nextResults.users || [])]
          : existing.users || [];
        const posts = resultScope === "posts"
          ? [...(existing.posts || []), ...(nextResults.posts || [])]
          : existing.posts || [];
        return {
          ...existing,
          page: nextResults.page || existing.page || 1,
          limit: nextResults.limit || existing.limit,
          totals: {
            ...(existing.totals || {}),
            [resultScope]: nextResults.totals?.[resultScope] ?? existing.totals?.[resultScope] ?? 0
          },
          hasMore: {
            ...(existing.hasMore || {}),
            [resultScope]: Boolean(nextResults.hasMore?.[resultScope])
          },
          pagesByScope: {
            ...(existing.pagesByScope || {}),
            [resultScope]: nextResults.page || nextPage
          },
          users: Array.from(new Map(users.map((user) => [String(user._id), user])).values()),
          posts: Array.from(new Map(posts.map((post) => [String(post._id), post])).values())
        };
      });
    } catch (requestError) {
      setActionError(requestError.response?.data?.error || "No se pudieron cargar más resultados.");
    } finally {
      setLoadingMoreScope("");
    }
  }

  async function handleFollow(userId) {
    if (!userId || actionUserId) return;
    setActionUserId(userId);
    setActionError("");

    try {
      const data = await toggleFollow(userId);
      queryClient.setQueriesData({ queryKey: ["search"] }, (current) => {
        if (!current) return current;
        return {
          ...current,
          users: (current.users || []).map((user) => String(user._id) === String(userId)
            ? {
                ...user,
                isFollowing: Boolean(data.following),
                followersCount: user.followersCount === null
                  ? null
                  : Math.max(0, (user.followersCount || 0) + (data.following ? 1 : -1))
              }
            : user)
        };
      });
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
  const searched = submitted.trim().length > 0;

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
        <Button type="button" onClick={search} disabled={loading || query.trim().length < 2}>
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

      {error && (
        <div className="k-state k-state-error" role="alert">
          <p>{error}</p>
          {submitted && (
            <Button type="button" variant="secondary" onClick={retrySearch} disabled={loading}>
              Reintentar
            </Button>
          )}
        </div>
      )}

      {!loading && !searched && !error && (
        <EmptyState
          title="Empieza a explorar"
          description="Busca personas o publicaciones usando al menos 2 caracteres."
          action={(
            <Button type="button" variant="secondary" onClick={() => document.querySelector('[aria-label="Buscar en Kronos"]')?.focus()}>
              Buscar en Kronos
            </Button>
          )}
        />
      )}

      {!loading && searched && !hasResults && !error && (
        <EmptyState
          title="No encontramos resultados"
          description="Prueba con otro nombre, usuario o frase."
          action={(
            <Button type="button" variant="secondary" onClick={clearSearch}>
              Limpiar búsqueda
            </Button>
          )}
        />
      )}

      {loading && (
        <div className="k-feed-state" role="status" aria-label="Buscando resultados">
          <span className="k-skeleton" />
          <span className="k-skeleton k-skeleton-wide" />
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
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <Button asChild variant="secondary">
                    <Link to={`/messages/${user._id}`}>Mensaje</Link>
                  </Button>
                  <Button variant="secondary" type="button" onClick={() => handleFollow(user._id)} disabled={actionUserId === user._id}>
                    {actionUserId === user._id ? "..." : user.isFollowing ? "Dejar de seguir" : "Seguir"}
                  </Button>
                </div>
              </article>
            ))}
          </div>
          {results.hasMore?.users && (
            <div style={{ display: "flex", justifyContent: "center", marginTop: 12 }}>
              <Button
                type="button"
                variant="secondary"
                onClick={() => handleLoadMore("users")}
                disabled={Boolean(loadingMoreScope)}
              >
                {loadingMoreScope === "users" ? "Cargando personas..." : "Ver más personas"}
              </Button>
            </div>
          )}
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
                <Link to={post.author?.username ? `/profile/${post.author.username}` : "/profile"}>
                  <p className="k-muted">{post.author?.displayName || post.author?.username || "Usuario"} · @{post.author?.username || "kronos"}</p>
                </Link>
                <Link to={`/post/${post._id}`}>
                  <p className="k-search-post-content">{post.content || "Publicación con multimedia"}</p>
                </Link>
                {post.hashtags?.length > 0 && (
                  <div className="k-hashtag-list" aria-label="Temas de la publicación">
                    {post.hashtags.map((tag) => (
                      <Link key={tag} to={`/explore?q=${encodeURIComponent(`#${tag}`)}`}>#{tag}</Link>
                    ))}
                  </div>
                )}
                <PostMedia media={post.media} mediaItems={post.mediaItems} content={post.content} compact />
                <Button asChild variant="ghost">
                  <Link to={`/post/${post._id}`}>Ver publicación</Link>
                </Button>
              </article>
            ))}
          </div>
          {results.hasMore?.posts && (
            <div style={{ display: "flex", justifyContent: "center", marginTop: 12 }}>
              <Button
                type="button"
                variant="secondary"
                onClick={() => handleLoadMore("posts")}
                disabled={Boolean(loadingMoreScope)}
              >
                {loadingMoreScope === "posts" ? "Cargando publicaciones..." : "Ver más publicaciones"}
              </Button>
            </div>
          )}
        </section>
      )}
    </section>
  );
}
