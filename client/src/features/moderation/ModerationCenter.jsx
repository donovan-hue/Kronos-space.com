import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  getBlockedUsers,
  getHiddenPosts,
  getModerationOverview,
  getMutedUsers,
  getMyReports,
  getReportQueue,
  unblockUser,
  unhidePost,
  unmuteUser,
  updateReport
} from "../../services/moderationService";
import { mediaUrl } from "../../services/mediaUrl";

/**
 * KRONOS-UI-011 — centro de moderación.
 *
 * Reúne lo que el usuario decidió (bloqueos, silencios, publicaciones
 * ocultas) y sus reportes. Los moderadores ven además la cola de
 * revisión; el resto de usuarios no tiene acceso a ella (403).
 *
 * Los conteos vienen del backend: la interfaz no fabrica números.
 */
const TABS = [
  { id: "blocks", label: "Bloqueados" },
  { id: "mutes", label: "Silenciados" },
  { id: "hidden", label: "Ocultas" },
  { id: "reports", label: "Mis reportes" }
];

function formatDate(value) {
  if (!value) return "";

  try {
    return new Date(value).toLocaleString("es-MX", {
      dateStyle: "medium",
      timeStyle: "short"
    });
  } catch {
    return "";
  }
}

export default function ModerationCenter() {
  const [activeTab, setActiveTab] = useState("blocks");
  const [overview, setOverview] = useState(null);
  const [items, setItems] = useState([]);
  const [queue, setQueue] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busyId, setBusyId] = useState("");
  const [queueError, setQueueError] = useState("");

  const loadTab = useCallback(async (tab) => {
    setLoading(true);
    setError("");

    try {
      if (tab === "blocks") setItems((await getBlockedUsers()).users || []);
      else if (tab === "mutes") setItems((await getMutedUsers()).users || []);
      else if (tab === "hidden") setItems((await getHiddenPosts()).posts || []);
      else setItems((await getMyReports()).reports || []);
    } catch (requestError) {
      setError(requestError.response?.data?.error || "No se pudo cargar esta sección.");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;

    getModerationOverview()
      .then(data => { if (active) setOverview(data); })
      .catch(() => { if (active) setOverview(null); });

    return () => { active = false; };
  }, []);

  useEffect(() => { loadTab(activeTab); }, [activeTab, loadTab]);

  useEffect(() => {
    let active = true;

    if (!overview?.isModerator) {
      setQueue([]);
      return undefined;
    }

    getReportQueue({ status: "pending" })
      .then(data => { if (active) setQueue(data.reports || []); })
      .catch(requestError => {
        if (active) setQueueError(requestError.response?.data?.error || "No se pudo cargar la cola de revisión.");
      });

    return () => { active = false; };
  }, [overview?.isModerator]);

  async function removeItem(item) {
    const id = item._id;
    if (busyId) return;
    setBusyId(id);
    setMessage("");
    setError("");

    try {
      if (activeTab === "blocks") {
        await unblockUser(id);
        setMessage(`Desbloqueaste a @${item.username}.`);
      } else if (activeTab === "mutes") {
        await unmuteUser(id);
        setMessage(`Dejaste de silenciar a @${item.username}.`);
      } else if (activeTab === "hidden") {
        await unhidePost(id);
        setMessage("La publicación vuelve a aparecer en tu feed.");
      }

      setItems(current => current.filter(entry => entry._id !== id));
      setOverview(current => {
        if (!current) return current;
        const key = activeTab === "blocks" ? "blocks" : activeTab === "mutes" ? "mutes" : "hidden";
        return { ...current, [key]: Math.max(0, (current[key] || 0) - 1) };
      });
    } catch (requestError) {
      setError(requestError.response?.data?.error || "No se pudo completar la acción.");
    } finally {
      setBusyId("");
    }
  }

  async function resolveReport(reportId, status) {
    if (busyId) return;
    setBusyId(reportId);
    setError("");

    try {
      const updated = await updateReport(reportId, { status });

      setQueue(current => current.filter(report => report._id !== reportId || updated.status !== "resolved"));
      setMessage("Reporte actualizado.");
    } catch (requestError) {
      setError(requestError.response?.data?.error || "No se pudo actualizar el reporte.");
    } finally {
      setBusyId("");
    }
  }

  return (
    <section className="page moderation-page">
      <header className="k-page-header">
        <div>
          <p className="k-eyebrow">KRONOS / SEGURIDAD</p>
          <h1>Privacidad y seguridad</h1>
          <p>Controla a quién bloqueas o silencias, qué ocultas y qué has reportado.</p>
        </div>
        <Link className="k-button k-button-ghost" to="/settings">Volver a configuración</Link>
      </header>

      {overview && (
        <div className="k-settings-grid" aria-label="Resumen de moderación">
          <section className="k-surface k-settings-section"><p className="k-eyebrow">BLOQUEADOS</p><h2>{overview.blocks}</h2></section>
          <section className="k-surface k-settings-section"><p className="k-eyebrow">SILENCIADOS</p><h2>{overview.mutes}</h2></section>
          <section className="k-surface k-settings-section"><p className="k-eyebrow">PUBLICACIONES OCULTAS</p><h2>{overview.hidden}</h2></section>
          <section className="k-surface k-settings-section"><p className="k-eyebrow">REPORTES ENVIADOS</p><h2>{overview.reports}</h2></section>
        </div>
      )}

      <div className="k-tabs" role="tablist" aria-label="Secciones de seguridad">
        {TABS.map(tab => (
          <button
            key={tab.id}
            role="tab"
            id={`moderation-tab-${tab.id}`}
            aria-selected={activeTab === tab.id}
            aria-controls={`moderation-panel-${tab.id}`}
            className={activeTab === tab.id ? "is-active" : ""}
            type="button"
            onClick={() => { setMessage(""); setActiveTab(tab.id); }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {error && <p className="k-state k-state-error" role="alert">{error}</p>}
      {message && <p className="k-state k-state-success" role="status">{message}</p>}

      <div id={`moderation-panel-${activeTab}`} role="tabpanel" aria-labelledby={`moderation-tab-${activeTab}`} className="k-moderation-panel">
        {loading ? (
          <div className="k-feed-state"><span className="k-skeleton" /><span className="k-skeleton k-skeleton-wide" /></div>
        ) : items.length === 0 ? (
          <div className="k-empty-state">
            <h2>Nada por aquí</h2>
            <p>
              {activeTab === "blocks" && "No bloqueaste a nadie. Puedes hacerlo desde el perfil de un usuario."}
              {activeTab === "mutes" && "No silenciaste a nadie. Silenciar solo afecta a tu propio feed."}
              {activeTab === "hidden" && "No ocultaste publicaciones. Ocultar no borra nada ni avisa al autor."}
              {activeTab === "reports" && "No enviaste reportes. Puedes reportar publicaciones, comentarios y perfiles."}
            </p>
          </div>
        ) : activeTab === "hidden" ? (
          <div className="k-feed-list">
            {items.map(post => (
              <article className="k-surface k-moderation-item" key={post._id}>
                <div>
                  <strong>{post.author?.displayName || post.author?.username || "Usuario"}</strong>
                  <p className="k-muted">@{post.author?.username || "kronos"} · {formatDate(post.createdAt)}</p>
                  {post.media?.url && <img src={mediaUrl(post.media.url)} alt={post.media.alt || ""} loading="lazy" />}
                  <p>{post.content}</p>
                </div>
                <div className="k-button-group">
                  <Link className="k-button k-button-ghost" to={`/post/${post._id}`}>Ver</Link>
                  <button className="k-button k-button-secondary" type="button" onClick={() => removeItem(post)} disabled={busyId === post._id}>
                    {busyId === post._id ? "Restaurando..." : "Restaurar"}
                  </button>
                </div>
              </article>
            ))}
          </div>
        ) : activeTab === "reports" ? (
          <div className="k-feed-list">
            {items.map(report => (
              <article className="k-surface k-moderation-item" key={report._id}>
                <div>
                  <strong>{report.targetType === "user" ? "Perfil" : report.targetType === "post" ? "Publicación" : "Comentario"} reportado</strong>
                  <p className="k-muted">{formatDate(report.createdAt)} · Motivo: {report.reason}</p>
                  {report.details && <p>{report.details}</p>}
                </div>
                <span className={`k-badge k-badge-${report.status}`}>{report.status}</span>
              </article>
            ))}
          </div>
        ) : (
          <div className="k-feed-list">
            {items.map(user => (
              <article className="k-surface k-moderation-item" key={user._id}>
                <div>
                  <strong>{user.displayName || user.username}</strong>
                  <p className="k-muted">@{user.username}</p>
                </div>
                <div className="k-button-group">
                  <Link className="k-button k-button-ghost" to={user.username ? `/profile/${user.username}` : `/users/${user._id}`}>Ver perfil</Link>
                  <button className="k-button k-button-secondary" type="button" onClick={() => removeItem(user)} disabled={busyId === user._id}>
                    {busyId === user._id ? "Guardando..." : activeTab === "blocks" ? "Desbloquear" : "Quitar silencio"}
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>

      {overview?.isModerator && (
        <section className="k-surface k-settings-section">
          <p className="k-eyebrow">COLA DE REVISIÓN</p>
          <h2>Reportes pendientes</h2>
          {queueError && <p className="k-state k-state-error" role="alert">{queueError}</p>}
          {queue.length === 0 ? (
            <p className="k-muted">No hay reportes pendientes.</p>
          ) : (
            <div className="k-feed-list">
              {queue.map(report => (
                <article className="k-moderation-item" key={report._id}>
                  <div>
                    <strong>{(report.targetType || "").toUpperCase()}</strong>
                    <p className="k-muted">
                      {formatDate(report.createdAt)} · Motivo: {report.reason}
                      {report.reporter?.username ? ` · Reporta: @${report.reporter.username}` : ""}
                    </p>
                    {report.details && <p>{report.details}</p>}
                  </div>
                  <div className="k-button-group">
                    <button className="k-button k-button-primary" type="button" onClick={() => resolveReport(report._id, "resolved")} disabled={busyId === report._id}>
                      Marcar resuelto
                    </button>
                    <button className="k-button k-button-ghost" type="button" onClick={() => resolveReport(report._id, "dismissed")} disabled={busyId === report._id}>
                      Descartar
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      )}
    </section>
  );
}
