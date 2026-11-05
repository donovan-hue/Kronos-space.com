import { useState } from "react";
import { Link } from "react-router-dom";
import useNotifications from "./useNotifications";
import EmptyState from "../../components/ui/EmptyState";

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
  // La cápsula tenía una sola frase porque solo se emitía al abrirse. Ahora
  // también avisa la invitación, y el texto lo distingue por `ref`: decir "se
  // abrió" de una cápsula que sigue sellada sería mentir. La invitación se
  // emite con `ref.kind = "capsule"`; la apertura no lleva destino propio.
  const capsuleInvitation = item.type === "capsule" && item.ref?.kind === "capsule";
  const byType = {
    follow: `${actor} comenzó a seguirte.`,
    like: `${actor} indicó que le gusta tu publicación.`,
    comment: `${actor} comentó tu publicación.`,
    repost: `${actor} republicó tu publicación.`,
    save: `${actor} guardó tu publicación.`,
    moderation: `Actividad de moderación de ${actor}.`,
    capsule: capsuleInvitation
      ? `${actor} te invitó a colaborar en una cápsula del tiempo.`
      : `Se abrió una cápsula del tiempo de ${actor}.`,
    event: `${actor} confirmó su asistencia a tu evento.`,
    story: `${actor} respondió a tu historia.`,
    live: `${actor} te invitó a una sala en vivo.`,
    report: `Tu reporte fue revisado por moderación.`
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
  { key: "save", label: "Guardados" },
  { key: "event", label: "Eventos" },
  { key: "story", label: "Historias" },
  { key: "live", label: "En vivo" },
  { key: "capsule", label: "Cápsulas" },
  { key: "moderation,report", label: "Moderación" }
];

/**
 * A dónde lleva cada aviso.
 *
 * Antes todo lo que no fuera publicación terminaba en el perfil del actor o en
 * /notifications: "te invitaron a una sala" te dejaba mirando a una persona.
 * `item.ref` (que emite el servidor) dice QUÉ se abrió, así que el enlace
 * puede llevar al recurso real.
 */
function destinationFor(item, { postId, actorId }) {
  if (postId) return `/post/${encodeURIComponent(postId)}`;

  switch (item.ref?.kind) {
    case "story":
      // La bandeja es donde el autor ve las respuestas de sus historias.
      return "/stories/archive";
    case "capsule":
      return "/capsules";
    case "live":
      // /live no lee query string: la invitación se recupera al abrir la
      // pantalla (GET /live/invitations), así que basta con llegar a la sala
      // de espera donde aparece el botón "Entrar".
      return "/live";
    case "report":
      return "/moderation";
    default:
      break;
  }

  if (item.type === "capsule") return "/capsules";
  if (item.type === "moderation" || item.type === "report") return "/moderation";
  if (item.type === "story") return "/stories/archive";
  if (item.type === "live") return "/live";
  if (actorId) return `/profile/${encodeURIComponent(actorId)}`;
  return "/notifications";
}

/**
 * Notificaciones (contrato original: lista + marcar leídas) con las
 * extensiones del bloque 008:
 *   023 — frases para el catálogo completo de tipos.
 *   024 — filtros por tipo y paginación "cargar más" (page/hasMore).
 */
export default function Notifications() {
  const [filter, setFilter] = useState("");

  const {
    items,
    unread,
    loading,
    loadingMore,
    error,
    hasMore,
    loadMore,
    retry,
    mark,
    markAll
  } = useNotifications(filter);

  function changeFilter(key) {
    setFilter(key);
  }

  async function handleMarkAll() {
    if (!unread) return;
    await markAll();
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
          onClick={handleMarkAll}
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
        <div className="k-state k-state-error" role="alert">
          <p>{error}</p>
          <button type="button" className="k-button k-button-secondary" onClick={retry}>
            Reintentar
          </button>
        </div>
      )}

      {!error && items.length === 0 ? (
        <EmptyState title="No tienes notificaciones" description="La actividad de tu comunidad aparecerá aquí." />
      ) : items.length > 0 ? (
        <div className="k-notification-list">
          {items.map((item) => {
            const postId = typeof item.post === "string" ? item.post : item.post?._id;
            const actorId = item.actor?.username || item.actor?._id;
            const destination = destinationFor(item, { postId, actorId });
            return (
              <article
                className={`k-surface k-notification ${item.read ? "is-read" : "is-unread"}`}
                key={item._id}
              >
                <Link to={destination} onClick={() => !item.read && mark(item._id)}>
                  <span className="k-notification-state">{item.read ? "Leída" : "Sin leer"}</span>
                  <strong>{text(item)}</strong>
                  <time dateTime={item.createdAt}>{date(item.createdAt)}</time>
                </Link>
              </article>
            );
          })}
        </div>
      ) : null}

      {hasMore && (
        <button
          className="k-button k-button-ghost k-load-more"
          type="button"
          onClick={loadMore}
          disabled={loadingMore}
        >
          {loadingMore ? "Cargando..." : "Cargar más"}
        </button>
      )}
    </section>
  );
}
