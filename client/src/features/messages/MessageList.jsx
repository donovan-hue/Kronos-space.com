import { resolveMediaUrl } from "../../services/messagesService";
import EmptyState from "../../components/ui/EmptyState";

function date(value) {
  return value
    ? new Date(value).toLocaleString("es-MX", {
        dateStyle: "medium",
        timeStyle: "short"
      })
    : "";
}

function ids(value) {
  return String(value?._id || value || "");
}

function isOwn(message, currentUserId) {
  return ids(message?.sender) === String(currentUserId);
}

/**
 * KRONOS-UI-021/022 — estado visible de un mensaje propio.
 * DM: el campo `read` del backend ya indica que el destinatario leyó.
 * Grupo: se usa `readBy` (alguien más que no sea el autor).
 */
function ownStatus(message, currentUserId, variant) {
  if (variant === "group") {
    const readBy = Array.isArray(message.readBy) ? message.readBy : [];
    const readByOther = readBy.some(
      (userId) =>
        String(userId) !== String(message.sender) &&
        String(userId) !== String(currentUserId)
    );
    const readByMe = readBy.some(
      (userId) => String(userId) === String(currentUserId)
    );
    if (readByOther) return "read";
    if (readByMe || message.delivered) return "delivered";
    return "sent";
  }
  if (message.read) return "read";
  if (message.delivered) return "delivered";
  return "sent";
}

const STATUS_TEXT = {
  sending: "Enviando…",
  failed: "No se envió",
  sent: "Enviado",
  delivered: "Entregado",
  read: "Leído"
};

/**
 * Lista de mensajes compartida por el chat 1-a-1 y los grupos.
 *
 * props:
 * - messages: mensajes confirmados por el backend (orden cronológico).
 * - pending: mensajes locales en vuelo [{ id, text, media, status, error }]
 * - onRetry(pendingId) / onRemovePending(pendingId): reintento idempotente
 *   (mismo clientMessageId) y descarte — KRONOS-UI-021.
 * - variant: "dm" | "group" (cambia cómo se deriva el estado).
 * - typing: indicador "escribiendo" del interlocutor (020).
 * - emptyTitle/emptyText: estado vacío.
 */
export default function MessageList({
  messages = [],
  pending = [],
  currentUserId,
  variant = "dm",
  typing = false,
  emptyTitle = "Aún no hay mensajes",
  emptyText = "Escribe el primero.",
  onRetry,
  onRemovePending
}) {
  const items = [
    ...messages,
    ...pending.map((item) => ({
      _id: item.id,
      sender: { _id: currentUserId },
      text: item.text,
      media: item.media,
      createdAt: item.createdAt,
      __pending: true,
      __status: item.status,
      __error: item.error
    }))
  ];

  return (
    <div className="k-message-list" aria-live="polite">
      {items.length === 0 && (
        <EmptyState title={emptyTitle} description={emptyText} />
      )}
      {items.map((message) => {
        const own = isOwn(message, currentUserId);
        const pendingItem = message.__pending ? message : null;
        const status = pendingItem
          ? message.__status
          : own
            ? ownStatus(message, currentUserId, variant)
            : null;

        return (
          <article
            className={`k-message ${own ? "is-own" : ""}`}
            key={message._id}
          >
            {variant === "group" && !own && (
              <span className="k-message-author">
                {message.sender?.displayName || message.sender?.username || "Usuario"}
              </span>
            )}
            {message.media?.url && (
              <img
                className="k-message-media"
                src={resolveMediaUrl(message.media.url)}
                alt={message.media.alt || "Imagen del mensaje"}
                loading="lazy"
              />
            )}
            {message.text && <p>{message.text}</p>}
            <small className="k-message-meta">
              {date(message.createdAt)}
              {status && (
                <span className={`k-message-status is-${status}`} role="status">
                  {pendingItem?.__error ? STATUS_TEXT.failed : STATUS_TEXT[status]}
                </span>
              )}
              {pendingItem?.__status === "failed" && (
                <span className="k-message-actions">
                  <button
                    type="button"
                    className="k-button k-button-ghost k-message-retry"
                    onClick={() => onRetry?.(message._id)}
                  >
                    Reintentar
                  </button>
                  <button
                    type="button"
                    className="k-button k-button-ghost k-message-discard"
                    onClick={() => onRemovePending?.(message._id)}
                  >
                    Quitar
                  </button>
                </span>
              )}
            </small>
          </article>
        );
      })}
      {typing && (
        <p className="k-typing" role="status">
          Escribiendo…
        </p>
      )}
    </div>
  );
}
