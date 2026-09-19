import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../services/apiClient";
import { getSocket } from "../../services/socket";

function date(value) {
  return value
    ? new Date(value).toLocaleString("es-MX", {
        dateStyle: "medium",
        timeStyle: "short"
      })
    : "";
}

/**
 * KRONOS-UI-023 — texto del catálogo completo de notificaciones.
 * Antes solo follow/like/comment tenían frase; el resto caía en un
 * genérico. Cada tipo del catálogo del backend tiene su frase.
 */
function text(item) {
  const actor = item.actor?.displayName || item.actor?.username || "Alguien";
  const byType = {
    follow: `${actor} comenzó a seguirte.`,
    like: `${actor} indicó que le gusta tu publicación.`,
    comment: `${actor} comentó tu publicación.`,
    repost: `${actor} republicó tu publicación.`,
    save: `${actor} guardó tu publicación.`,
    moderation: `Actividad de moderación de ${actor}.`
  };
  return byType[item.type] || `${actor} generó actividad en Kronos.`;
}

/** KRONOS-UI-024 — filtros disponibles (tipos del catálogo). */
const FILTERS = [
  { key: "", label: "Todas" },
  { key: "follow", label: "Seguidos" },
  { key: "like", label: "Me gusta" },
  { key: "comment", label: "Comentarios" },
  { key: "repost", label: "Republicaciones" },
  { key: "moderation", label: "Moderación" }
];

const PAGE_SIZE = 30;

/**
 * Notificaciones (contrato original: lista + marcar leídas) con las
 * extensiones del bloque 008:
 *   023 — frases para el catálogo completo de tipos.
 *   024 — filtros por tipo y paginación "cargar más" (page/hasMore).
 */
export default function Notifications() {
  const [items, setItems] = useState([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("");
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);

  const load = useCallback(
    async (nextFilter = filter, nextPage = 1, append = false) => {
      if (append) setLoadingMore(true);
      else setLoading(true);
      setError("");
      try {
        const params = { page: nextPage, limit: PAGE_SIZE };
        if (nextFilter) params.type = nextFilter;
        const { data } = await api.get("/notifications", { params });
        const list = Array.isArray(data?.notifications) ? data.notifications : [];
        setHasMore(Boolean(data?.hasMore));
        setUnread(Number(data?.unreadCount || 0));
        setPage(Number(data?.page || nextPage));
        setItems((current) => {
          if (!append) return list;
          const known = new Set(current.map((item) => String(item._id)));
          return [...current, ...list.filter((item) => !known.has(String(item._id)))];
        });
      } catch (requestError) {
        setError(
          requestError.response?.data?.error ||
            "No se pudieron cargar las notificaciones."
        );
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [filter]
  );

  useEffect(() => {
    setItems([]);
    load(filter, 1, false);
  }, [filter]); // eslint-disable-line react-hooks/exhaustive-deps

  function changeFilter(key) {
    setFilter(key);
  }

  // Socket: llegada en vivo (contrato original, sin cambios).
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return undefined;
    const receive = (item) => {
      if (!item?._id) return;
      setItems((current) =>
        current.some((existing) => String(existing._id) === String(item._id))
          ? current
          : [item, ...current]
      );
      setUnread((value) => value + 1);
    };
    socket.on("notification:new", receive);
    return () => socket.off("notification:new", receive);
  }, []);

  async function mark(id) {
    try {
      await api.patch(`/notifications/${id}/read`);
      setItems((current) =>
        current.map((item) =>
          String(item._id) === String(id) ? { ...item, read: true } : item
        )
      );
      setUnread((value) => Math.max(0, value - 1));
    } catch {
      setError("No se pudo marcar la notificación.");
    }
  }

  async function markAll() {
    if (!unread) return;
    try {
      await api.patch("/notifications/read-all");
      setItems((current) => current.map((item) => ({ ...item, read: true })));
      setUnread(0);
    } catch (requestError) {
      setError(
        requestError.response?.data?.error || "No se pudieron marcar todas."
      );
    }
  }

  if (loading) {
    return (
      <section className="page">
        <div className="k-feed-state">
          <span className="k-skeleton" />
          <span className="k-skeleton k-skeleton-wide" />
        </div>
      </section>
    );
  }

  return (
    <section className="page">
      <header className="k-page-header">
        <div>
          <h1>Notificaciones</h1>
          <p>{unread ? `${unread} sin leer` : "Todo al día"}</p>
        </div>
        <button
          className="k-button k-button-secondary"
          type="button"
          onClick={markAll}
          disabled={!unread}
        >
          Marcar todas como leídas
        </button>
      </header>

      <div className="k-filter-chips" role="group" aria-label="Filtrar notificaciones">
        {FILTERS.map((entry) => (
          <button
            key={entry.key || "all"}
            type="button"
            className={`k-chip ${filter === entry.key ? "is-active" : ""}`}
            aria-pressed={filter === entry.key}
            onClick={() => changeFilter(entry.key)}
          >
            {entry.label}
          </button>
        ))}
      </div>

      {error && (
        <p className="k-state k-state-error" role="alert">
          {error}
        </p>
      )}

      {items.length === 0 ? (
        <div className="k-empty-state">
          <h2>No tienes notificaciones</h2>
          <p>La actividad de tu comunidad aparecerá aquí.</p>
        </div>
      ) : (
        <div className="k-notification-list">
          {items.map((item) => {
            const destination = item.post
              ? `/post/${item.post._id}`
              : item.actor?._id
                ? `/users/${item.actor._id}`
                : "/notifications";
            return (
              <article
                className={`k-surface k-notification ${item.read ? "is-read" : "is-unread"}`}
                key={item._id}
              >
                <Link to={destination} onClick={() => !item.read && mark(item._id)}>
                  <strong>{text(item)}</strong>
                  <small>{date(item.createdAt)}</small>
                </Link>
              </article>
            );
          })}
        </div>
      )}

      {hasMore && (
        <button
          className="k-button k-button-ghost k-load-more"
          type="button"
          onClick={() => load(filter, page + 1, true)}
          disabled={loadingMore}
        >
          {loadingMore ? "Cargando..." : "Cargar más"}
        </button>
      )}
    </section>
  );
}
