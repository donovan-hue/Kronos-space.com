import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ImageOff } from "lucide-react";
import { getUser } from "../../services/authStorage";
import { getSocket } from "../../services/socket";
import { rememberConversation } from "../../services/fanContext";
import { queryKeys } from "../../services/queryKeys";
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

  // ------- Capa de datos: TanStack Query -------
  // La lista de conversaciones y el hilo con cada usuario son estado de
  // servidor: viven en el caché de queries. Presencia, typing y conexión
  // son efímeros del socket y permanecen como estado local.
  const queryClient = useQueryClient();

  const conversationsQuery = useQuery({
    queryKey: queryKeys.conversations,
    queryFn: getConversations,
    enabled: !userId,
    staleTime: 15_000,
  });

  const messagesQuery = useQuery({
    queryKey: queryKeys.messages(userId),
    queryFn: () => getMessages(userId),
    enabled: Boolean(userId),
  });

  const conversations = useMemo(
    () =>
      Array.isArray(conversationsQuery.data?.conversations)
        ? conversationsQuery.data.conversations
        : [],
    [conversationsQuery.data]
  );

  const messages = useMemo(
    () =>
      Array.isArray(messagesQuery.data?.messages)
        ? messagesQuery.data.messages
        : [],
    [messagesQuery.data]
  );

  const activeError = userId ? messagesQuery.error : conversationsQuery.error;
  const loading = userId ? messagesQuery.isPending : conversationsQuery.isPending;
  const error = activeError
    ? activeError.response?.data?.error || "No se pudieron cargar los mensajes."
    : "";

  const [online, setOnline] = useState(null);
  const [connected, setConnected] = useState(true);
  const [peerTyping, setPeerTyping] = useState(false);
  const typingTimeoutRef = useRef(null);
  const lastTypingSentRef = useRef(0);

  // 021/contrato AUDIT-004: abrir la conversación entrega y lee (una vez
  // por interlocutor; al volver hay datos en caché y no se repite).
  const markedForRef = useRef("");
  useEffect(() => {
    if (!userId || !messagesQuery.data || markedForRef.current === userId) return;
    markedForRef.current = userId;
    markMessagesDelivered(userId).catch(() => {});
    markMessagesRead(userId).catch(() => {});
  }, [userId, messagesQuery.data]);

  // Presencia inicial del interlocutor; después la actualizan los sockets.
  useEffect(() => {
    if (userId) setOnline(Boolean(messagesQuery.data?.online));
  }, [userId, messagesQuery.data]);

  useEffect(() => {
    setPeerTyping(false);
  }, [userId]);

  const appendMessage = useCallback(
    (message) => {
      if (!message?._id) return;
      queryClient.setQueryData(queryKeys.messages(userId), (cache) => {
        const items = Array.isArray(cache?.messages) ? cache.messages : [];
        const duplicate = items.some(
          (existing) =>
            ids(existing) === ids(message) ||
            (message.clientMessageId &&
              existing.clientMessageId === message.clientMessageId)
        );
        return duplicate ? cache : { ...cache, messages: [...items, message] };
      });
      queryClient.invalidateQueries({ queryKey: queryKeys.conversations });
    },
    [queryClient, userId]
  );

  const { pending, send, retry, remove } = useMessageSend({
    sendFn: useCallback(
      (payload) => sendMessage(userId, payload),
      [userId]
    ),
    onSent: appendMessage
  });

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
    if (userId && messagesQuery.data?.user) return messagesQuery.data.user;
    const item = messages.find(
      (message) =>
        ids(message.sender) !== currentUserId ||
        ids(message.receiver) !== currentUserId
    );
    if (!item) return null;
    return ids(item.sender) === currentUserId ? item.receiver : item.sender;
  }, [messages, messagesQuery.data?.user, currentUserId, userId]);

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
            <h1>Mensajes</h1>
            <p>Conversaciones recientes.</p>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Link className="k-button k-button-secondary" to="/explore">
              Nuevo mensaje
            </Link>
            <Link className="k-button k-button-secondary" to="/conversations">
              Grupos
            </Link>
          </div>
        </header>
        {error && (
          <div className="k-state k-state-error" role="alert">
            <p>{error}</p>
            <button type="button" className="k-button k-button-secondary" onClick={() => conversationsQuery.refetch()}>
              Reintentar
            </button>
          </div>
        )}
        {conversations.length === 0 ? (
          <div className="k-empty-state">
            <h2>No tienes conversaciones</h2>
            <p>Busca una persona para iniciar un chat.</p>
            <Link className="k-button k-button-primary" to="/explore">
              Buscar personas
            </Link>
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
            {connected ? "EN LÍNEA" : "RECONECTANDO"}
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
        <div className="k-state k-state-error" role="alert">
          <p>{error}</p>
          <button type="button" className="k-button k-button-secondary" onClick={() => messagesQuery.refetch()}>
            Reintentar
          </button>
        </div>
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
