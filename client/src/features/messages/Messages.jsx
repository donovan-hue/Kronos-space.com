import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ImageOff } from "lucide-react";
import { getUser } from "../../services/authStorage";
import { getSocket } from "../../services/socket";
import { rememberConversation } from "../../services/fanContext";
import {
  getConversations,
  getMessages,
  markMessagesDelivered,
  markMessagesRead,
  sendMessage
} from "../../services/messagesService";
import MessageList from "./MessageList";
import MessageComposer from "./MessageComposer";
import useMessageSend from "./useMessageSend";

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

const TYPING_WINDOW_MS = 3000;
const TYPING_SEND_INTERVAL_MS = 3000;

/**
 * Mensajes 1-a-1 (contrato AUDIT-004) con las extensiones del bloque 008:
 * adjuntos (019), presencia y typing (020), estados y reintentos (021).
 */
export default function Messages() {
  const { userId } = useParams();
  const currentUserId = String(getUser()?._id || getUser()?.id || "");

  // Contexto para el fan nav: recordar la conversación abierta para que
  // "Perfil" regrese al perfil del usuario seleccionado (regla 4 del abanico).
  useEffect(() => {
    rememberConversation(userId || "");
  }, [userId]);

  const [conversations, setConversations] = useState([]);
  const [messages, setMessages] = useState([]);
  const [online, setOnline] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [connected, setConnected] = useState(true);
  const [peerTyping, setPeerTyping] = useState(false);
  const typingTimeoutRef = useRef(null);
  const lastTypingSentRef = useRef(0);

  const appendMessage = useCallback(
    (message) => {
      if (!message?._id) return;
      setMessages((items) => {
        const duplicate = items.some(
          (existing) =>
            ids(existing) === ids(message) ||
            (message.clientMessageId &&
              existing.clientMessageId === message.clientMessageId)
        );
        return duplicate ? items : [...items, message];
      });
    },
    []
  );

  const { pending, send, retry, remove } = useMessageSend({
    sendFn: useCallback(
      (payload) => sendMessage(userId, payload),
      [userId]
    ),
    onSent: appendMessage
  });

  async function load() {
    setLoading(true);
    setError("");
    try {
      if (userId) {
        const data = await getMessages(userId);
        setMessages(Array.isArray(data?.messages) ? data.messages : []);
        setOnline(Boolean(data?.online));
        // 021/contrato AUDIT-004: abrir la conversación entrega y lee.
        await markMessagesDelivered(userId).catch(() => {});
        await markMessagesRead(userId).catch(() => {});
      } else {
        const data = await getConversations();
        setConversations(Array.isArray(data?.conversations) ? data.conversations : []);
      }
    } catch (requestError) {
      setError(
        requestError.response?.data?.error || "No se pudieron cargar los mensajes."
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    setMessages([]);
    setOnline(null);
    setPeerTyping(false);
    load();
  }, [userId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Socket: mensajes nuevos, presencia y typing del interlocutor (020).
  useEffect(() => {
    const socket = getSocket();
    if (!socket || !userId) return undefined;

    const online = () => setConnected(true);
    const offline = () => setConnected(false);

    const receive = (message) => {
      const sender = ids(message?.sender);
      const receiver = ids(message?.receiver);
      const mine =
        (sender === currentUserId && receiver === String(userId)) ||
        (receiver === currentUserId && sender === String(userId));
      if (mine) appendMessage(message);
    };

    const presence = ({ userId: changedUserId, online: isOnline }) => {
      if (String(changedUserId) === String(userId)) setOnline(Boolean(isOnline));
    };

    const typing = ({ from }) => {
      if (String(from) !== String(userId)) return;
      setPeerTyping(true);
      clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = setTimeout(
        () => setPeerTyping(false),
        TYPING_WINDOW_MS
      );
    };

    socket.on("connect", online);
    socket.on("disconnect", offline);
    socket.on("message:new", receive);
    socket.on("presence:changed", presence);
    socket.on("typing:start", typing);

    return () => {
      socket.off("connect", online);
      socket.off("disconnect", offline);
      socket.off("message:new", receive);
      socket.off("presence:changed", presence);
      socket.off("typing:start", typing);
      clearTimeout(typingTimeoutRef.current);
    };
  }, [currentUserId, userId, appendMessage]);

  /** 020 — avisa typing al interlocutor (máx. 1 evento / 3 s). */
  function notifyTyping() {
    const socket = getSocket();
    if (!socket || !userId) return;
    const now = Date.now();
    if (now - lastTypingSentRef.current < TYPING_SEND_INTERVAL_MS) return;
    lastTypingSentRef.current = now;
    socket.emit("typing:start", { peerId: userId });
  }

  const other = useMemo(() => {
    const item = messages.find(
      (message) =>
        ids(message.sender) !== currentUserId ||
        ids(message.receiver) !== currentUserId
    );
    if (!item) return null;
    return ids(item.sender) === currentUserId ? item.receiver : item.sender;
  }, [messages, currentUserId]);

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

  if (!userId) {
    return (
      <section className="page">
        <header className="k-page-header">
          <div>
            <p className="k-eyebrow">KRONOS / MESSAGES</p>
            <h1>Mensajes</h1>
            <p>Conversaciones recientes.</p>
          </div>
        </header>
        {error && (
          <p className="k-state k-state-error" role="alert">
            {error}
          </p>
        )}
        {conversations.length === 0 ? (
          <div className="k-empty-state">
            <h2>No tienes conversaciones</h2>
            <p>Abre un perfil para iniciar un chat.</p>
          </div>
        ) : (
          <div className="k-conversation-list">
            {conversations.map((item) => (
              <Link
                className="k-surface k-conversation"
                key={item.user?._id}
                to={`/messages/${item.user?._id}`}
              >
                <strong>
                  {item.user?.displayName || item.user?.username || "Usuario"}
                  <span
                    className={`k-presence-dot ${item.user?.online ? "is-online" : ""}`}
                    role="img"
                    aria-label={item.user?.online ? "En línea" : "No en línea"}
                  />
                </strong>
                <span className="k-conversation-preview">
                  {item.latestMessage?.hasMedia && !item.latestMessage?.text ? (
                    <span className="k-conversation-media" aria-label="Mensaje con imagen">
                      <ImageOff size={13} aria-hidden="true" /> Imagen
                    </span>
                  ) : (
                    item.latestMessage?.text
                  )}
                </span>
                <small>
                  {date(item.latestMessage?.createdAt)}
                  {item.unreadCount ? ` · ${item.unreadCount} sin leer` : ""}
                </small>
              </Link>
            ))}
          </div>
        )}
      </section>
    );
  }

  return (
    <section className="page">
      <header className="k-page-header">
        <div>
          <p className="k-eyebrow">
            KRONOS / CHAT {connected ? "· EN LÍNEA" : "· RECONECTANDO"}
          </p>
          <h1>
            {other?.displayName || other?.username || "Conversación"}
            <span
              className={`k-presence-dot k-presence-dot-large ${online ? "is-online" : ""}`}
              role="img"
              aria-label={online ? "En línea" : "No en línea"}
            />
          </h1>
          <p>
            @{other?.username || userId}
            {online ? " · En línea" : ""}
          </p>
        </div>
        <Link className="k-button k-button-ghost" to="/messages">
          Volver
        </Link>
      </header>
      {error && (
        <p className="k-state k-state-error" role="alert">
          {error}
        </p>
      )}
      <MessageList
        messages={messages}
        pending={pending}
        currentUserId={currentUserId}
        variant="dm"
        typing={peerTyping}
        onRetry={retry}
        onRemovePending={remove}
      />
      <MessageComposer
        onSend={send}
        disabled={!connected}
        onTyping={notifyTyping}
      />
    </section>
  );
}
