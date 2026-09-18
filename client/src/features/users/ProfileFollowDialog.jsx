import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getFollowers, getFollowing, toggleFollow } from "../../services/usersService";
import { mediaUrl } from "../../services/mediaUrl";

const PAGE_SIZE = 20;

export default function ProfileFollowDialog({ open, type, profile, currentUserId, onClose, onCountChange }) {
  const [users, setUsers] = useState([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [actionUserId, setActionUserId] = useState("");
  const [error, setError] = useState("");

  const isFollowers = type === "followers";
  const title = isFollowers ? "Seguidores" : "Siguiendo";

  async function load(nextPage = 1, append = false) {
    if (!profile?._id || (append && (loadingMore || !hasMore))) return;
    if (append) setLoadingMore(true);
    else setLoading(true);
    setError("");
    try {
      const data = isFollowers
        ? await getFollowers(profile._id, { page: nextPage, limit: PAGE_SIZE })
        : await getFollowing(profile._id, { page: nextPage, limit: PAGE_SIZE });
      const incoming = Array.isArray(data?.users) ? data.users : [];
      setUsers((current) => {
        if (!append) return incoming;
        const ids = new Set(current.map((item) => String(item._id)));
        return [...current, ...incoming.filter((item) => !ids.has(String(item._id)))];
      });
      setPage(nextPage);
      setHasMore(Boolean(data?.hasMore));
    } catch (requestError) {
      const status = requestError.response?.status;
      if (status === 403) setError("Esta lista no está disponible por la privacidad del perfil.");
      else setError(requestError.response?.data?.error || "No se pudo cargar la lista.");
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }

  useEffect(() => {
    if (!open) return;
    setUsers([]);
    setPage(1);
    setHasMore(false);
    load(1, false);
  }, [open, type, profile?._id]);

  async function handleToggleFollow(userId) {
    if (!userId || actionUserId || String(userId) === String(currentUserId)) return;
    setActionUserId(userId);
    setError("");
    const previous = users.find((user) => String(user._id) === String(userId));
    const previousFollowing = Boolean(previous?.isFollowing);
    setUsers((current) => current.map((user) => String(user._id) === String(userId) ? { ...user, isFollowing: !previousFollowing } : user));
    try {
      const result = await toggleFollow(userId);
      const following = Boolean(result.following);
      setUsers((current) => current.map((user) => String(user._id) === String(userId) ? { ...user, isFollowing: following } : user));
      if (String(userId) === String(profile?._id) && typeof onCountChange === "function") {
        onCountChange(following ? 1 : -1);
      }
    } catch (requestError) {
      setUsers((current) => current.map((user) => String(user._id) === String(userId) ? { ...user, isFollowing: previousFollowing } : user));
      setError(requestError.response?.data?.error || "No se pudo actualizar el seguimiento.");
    } finally {
      setActionUserId("");
    }
  }

  if (!open) return null;

  return (
    <div className="k-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose?.(); }}>
      <section className="k-follow-dialog k-modal" role="dialog" aria-modal="true" aria-labelledby="profile-follow-title">
        <header className="k-follow-dialog-header">
          <div>
            <p className="k-eyebrow">PERFIL / RED</p>
            <h3 id="profile-follow-title">{title} de @{profile?.username || "usuario"}</h3>
          </div>
          <button className="k-button k-button-ghost" type="button" onClick={onClose}>Cerrar</button>
        </header>

        {error && <p className="k-state k-state-error" role="alert">{error}</p>}

        {loading ? (
          <div className="k-feed-state">
            <span className="k-skeleton" />
            <span className="k-skeleton k-skeleton-wide" />
          </div>
        ) : users.length === 0 ? (
          <div className="k-empty-state">
            <h4>{isFollowers ? "Aún no hay seguidores" : "Aún no sigue a nadie"}</h4>
            <p className="k-muted">La lista aparecerá aquí cuando haya conexiones reales.</p>
          </div>
        ) : (
          <div className="k-follow-list">
            {users.map((user) => {
              const isSelf = String(user._id) === String(currentUserId);
              return (
                <article className="k-follow-card" key={user._id}>
                  <Link className="k-avatar" to={user.username ? `/profile/${user.username}` : `/users/${user._id}`}>
                    {user.avatar ? <img src={mediaUrl(user.avatar)} alt="" loading="lazy" /> : (user.displayName || user.username || "U").slice(0, 1).toUpperCase()}
                  </Link>
                  <div className="k-follow-card-copy">
                    <Link to={user.username ? `/profile/${user.username}` : `/users/${user._id}`}><strong>{user.displayName || user.username || "Usuario"}</strong></Link>
                    {user.username && <span className="k-muted">@{user.username}</span>}
                    {user.bio && <p>{user.bio}</p>}
                  </div>
                  {!isSelf && (
                    <button
                      className={`k-button ${user.isFollowing ? "k-button-secondary" : "k-button-primary"}`}
                      type="button"
                      onClick={() => handleToggleFollow(user._id)}
                      disabled={actionUserId === user._id}
                      aria-pressed={Boolean(user.isFollowing)}
                    >
                      {actionUserId === user._id ? "..." : user.isFollowing ? "Dejar de seguir" : "Seguir"}
                    </button>
                  )}
                </article>
              );
            })}
          </div>
        )}

        {users.length > 0 && hasMore && (
          <div className="k-follow-dialog-footer">
            <button className="k-button k-button-secondary" type="button" onClick={() => load(page + 1, true)} disabled={loadingMore}>
              {loadingMore ? "Cargando..." : "Ver más"}
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
