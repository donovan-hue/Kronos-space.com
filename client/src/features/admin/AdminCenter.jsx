import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getAdminOverview, getAdminUsers, updateUserRole } from "../../services/adminService";

export default function AdminCenter() {
  const [overview, setOverview] = useState(null);
  const [users, setUsers] = useState([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");

  async function load(value = query) {
    setLoading(true);
    setError("");
    try {
      const [summary, result] = await Promise.all([getAdminOverview(), getAdminUsers({ q: value })]);
      setOverview(summary);
      setUsers(Array.isArray(result?.users) ? result.users : []);
    } catch (requestError) {
      setError(requestError.response?.data?.error || "No se pudo cargar la administración.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(""); }, []);

  async function changeRole(user) {
    const nextRole = user.role === "admin" ? "user" : "admin";
    if (!window.confirm(`${nextRole === "admin" ? "Dar" : "Quitar"} permisos de administrador a @${user.username}?`)) return;
    setBusy(user._id);
    setError("");
    try {
      const updated = await updateUserRole(user._id, nextRole);
      setUsers((current) => current.map((item) => item._id === updated._id ? updated : item));
    } catch (requestError) {
      setError(requestError.response?.data?.error || "No se pudo actualizar el rol.");
    } finally {
      setBusy("");
    }
  }

  return (
    <section className="page">
      <header className="k-page-header">
        <div>
          <h1>Administración</h1>
          <p>Revisión de usuarios y operaciones de confianza y seguridad.</p>
        </div>
        <Link className="k-button k-button-ghost" to="/settings/security">
          Cola de reportes
        </Link>
      </header>

      {error && <p className="k-state k-state-error" role="alert">{error}</p>}

      {loading ? (
        <div className="k-feed-state">
          <span className="k-skeleton" />
          <span className="k-skeleton k-skeleton-wide" />
        </div>
      ) : (
        <>
          <div className="k-settings-grid" aria-label="Resumen administrativo">
            <section className="k-surface k-settings-section">
              <p className="k-eyebrow">USUARIOS</p>
              <h2>{overview?.users ?? 0}</h2>
            </section>
            <section className="k-surface k-settings-section">
              <p className="k-eyebrow">PUBLICACIONES</p>
              <h2>{overview?.posts ?? 0}</h2>
            </section>
            <section className="k-surface k-settings-section">
              <p className="k-eyebrow">REPORTES PENDIENTES</p>
              <h2>{overview?.pendingReports ?? 0}</h2>
            </section>
            <section className="k-surface k-settings-section">
              <p className="k-eyebrow">POSTS OCULTOS</p>
              <h2>{overview?.hiddenPosts ?? 0}</h2>
            </section>
          </div>

          <form
            className="k-search-row"
            role="search"
            onSubmit={(event) => { event.preventDefault(); load(query); }}
          >
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              maxLength={80}
              placeholder="Buscar por nombre, usuario o email"
              aria-label="Buscar usuarios para administración"
            />
            <button className="k-button k-button-primary" type="submit" disabled={loading}>
              Buscar
            </button>
          </form>

          <section className="k-search-section">
            <div className="k-section-heading">
              <h2>Usuarios</h2>
              <span className="k-muted">{users.length} en esta vista</span>
            </div>
            <div className="k-session-list">
              {users.map((user) => (
                <article className="k-session-item" key={user._id}>
                  <div>
                    <strong>{user.displayName || user.username}</strong>
                    <p>@{user.username} · {user.email}</p>
                    <small className="k-muted">Rol: {user.role === "admin" ? "Administrador" : "Usuario"}</small>
                  </div>
                  <div className="k-button-group">
                    <Link className="k-button k-button-ghost" to={user.username ? `/profile/${user.username}` : `/users/${user._id}`}>
                      Perfil
                    </Link>
                    <button
                      className="k-button k-button-secondary"
                      type="button"
                      onClick={() => changeRole(user)}
                      disabled={busy === user._id}
                    >
                      {busy === user._id ? "Guardando..." : user.role === "admin" ? "Quitar admin" : "Hacer admin"}
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </section>
        </>
      )}
    </section>
  );
}
