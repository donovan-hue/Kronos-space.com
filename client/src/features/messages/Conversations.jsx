import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ImageOff, Users, X } from "lucide-react";
import { getUser } from "../../services/authStorage";
import { getSocket } from "../../services/socket";
import { searchUsers } from "../../services/usersService";
import {
  createGroup,
  deleteGroup,
  getGroup,
  listGroups,
  markGroupRead,
  sendGroupMessage,
  updateGroupMembers
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

const MAX_PICKED = 9; // más el creador = 10 en el backend

/**
 * KRONOS-UI-022 — grupos: lista de conversaciones, creación y hilo
 * compartido. Los mensajes 1-a-1 viven en /messages (sin cambios de
 * contrato); aquí solo entran los grupos.
 */
export default function Conversations() {
  const { conversationId } = useParams();

  if (conversationId) {
    return <GroupThread conversationId={conversationId} />;
  }

  return <GroupList />;
}

// ---------------------------------------------------------------
// Lista de grupos
// ---------------------------------------------------------------

function GroupList() {
  const [conversations, setConversations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [picked, setPicked] = useState([]);
  const [formError, setFormError] = useState("");
  const navigate = useNavigate();
  const currentUserId = String(getUser()?._id || getUser()?.id || "");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const data = await listGroups();
      setConversations(Array.isArray(data?.conversations) ? data.conversations : []);
    } catch (requestError) {
      setError(
        requestError.response?.data?.error || "No se pudieron cargar los grupos."
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    const value = query.trim();
    if (!value) {
      setResults([]);
      return undefined;
    }
    const timer = setTimeout(async () => {
      try {
        const data = await searchUsers(value);
        setResults(
          (Array.isArray(data?.users) ? data.users : [])
            .filter((user) => ids(user) !== currentUserId)
            .slice(0, 8)
        );
      } catch {
        setResults([]);
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [query, currentUserId]);

  function togglePicked(user) {
    setPicked((items) => {
      const exists = items.some((item) => ids(item) === ids(user));
      if (exists) return items.filter((item) => ids(item) !== ids(user));
      if (items.length >= MAX_PICKED) return items;
      return [...items, user];
    });
  }

  async function handleCreate(event) {
    event.preventDefault();
    setFormError("");
    if (picked.length < 1) {
      setFormError("Agrega al menos un usuario más para formar el grupo.");
      return;
    }
    setCreating(true);
    try {
      const data = await createGroup({
        name: name.trim(),
        memberIds: picked.map((user) => ids(user))
      });
      if (data?.conversation?._id) {
        navigate(`/conversations/${data.conversation._id}`);
      }
    } catch (requestError) {
      setFormError(
        requestError.response?.data?.error || "No se pudo crear el grupo."
      );
    } finally {
      setCreating(false);
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
          <p className="k-eyebrow">KRONOS / GROUPS</p>
          <h1>Grupos</h1>
          <p>Conversaciones entre varias personas.</p>
        </div>
        <button
          className="k-button k-button-primary"
          type="button"
          onClick={() => setCreating((value) => !value)}
          aria-expanded={creating}
        >
          {creating ? "Cerrar" : "Nuevo grupo"}
        </button>
      </header>

      {creating && (
        <form className="k-surface k-group-form" onSubmit={handleCreate}>
          <label>
            <span>Nombre del grupo (opcional)</span>
            <input
              className="k-input"
              type="text"
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={60}
              placeholder="Ej. Equipo Kronos"
            />
          </label>
          <label>
            <span>Buscar personas</span>
            <input
              className="k-input"
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Nombre de usuario o @usuario"
            />
          </label>
          {results.length > 0 && (
            <div className="k-group-results" role="listbox" aria-label="Resultados de búsqueda">
              {results.map((user) => (
                <button
                  key={ids(user)}
                  type="button"
                  role="option"
                  aria-selected={picked.some((item) => ids(item) === ids(user))}
                  className="k-group-result"
                  onClick={() => togglePicked(user)}
                >
                  {user.displayName || user.username} <small>@{user.username}</small>
                </button>
              ))}
            </div>
          )}
          <div className="k-group-picked">
            {picked.map((user) => (
              <span className="k-chip" key={ids(user)}>
                {user.displayName || user.username}
                <button
                  type="button"
                  aria-label={`Quitar a ${user.username}`}
                  onClick={() => togglePicked(user)}
                >
                  <X size={13} aria-hidden="true" />
                </button>
              </span>
            ))}
            {picked.length === 0 && (
              <small className="k-muted">Aún no agregas personas (máx. {MAX_PICKED} más tú).</small>
            )}
          </div>
          {formError && (
            <p className="k-state k-state-error" role="alert">
              {formError}
            </p>
          )}
          <button className="k-button k-button-primary" type="submit" disabled={creating}>
            {creating ? "Creando..." : "Crear grupo"}
          </button>
        </form>
      )}

      {error && (
        <p className="k-state k-state-error" role="alert">
          {error}
        </p>
      )}

      {conversations.length === 0 && !creating ? (
        <div className="k-empty-state">
          <h2>No tienes grupos</h2>
          <p>Crea uno para conversar con varias personas.</p>
        </div>
      ) : (
        <div className="k-conversation-list">
          {conversations.map((item) => {
            const members = Array.isArray(item.members) ? item.members : [];
            return (
              <Link
                className="k-surface k-conversation"
                key={ids(item)}
                to={`/conversations/${ids(item)}`}
              >
                <strong>
                  <Users size={15} aria-hidden="true" />
                  {item.name || `Grupo de ${members[0]?.username || "usuarios"}`}
                </strong>
                <span className="k-conversation-preview">
                  {item.latestMessage?.hasMedia && !item.latestMessage?.text ? (
                    <span className="k-conversation-media" aria-label="Mensaje con imagen">
                      <ImageOff size={13} aria-hidden="true" /> Imagen
                    </span>
                  ) : (
                    item.latestMessage?.text || "Sin mensajes todavía"
                  )}
                </span>
                <small>
                  {date(item.latestMessage?.createdAt || item.updatedAt)}
                  {item.unreadCount ? ` · ${item.unreadCount} sin leer` : ""}
                </small>
              </Link>
            );
          })}
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------
// Hilo de un grupo
// ---------------------------------------------------------------

function GroupThread({ conversationId }) {
  const currentUserId = String(getUser()?._id || getUser()?.id || "");
  const navigate = useNavigate();

  const [conversation, setConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [onlineMap, setOnlineMap] = useState({});
  const [joined, setJoined] = useState(false);
  const [joinError, setJoinError] = useState("");
  const [connected, setConnected] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showMembers, setShowMembers] = useState(false);
  const [memberQuery, setMemberQuery] = useState("");
  const [memberResults, setMemberResults] = useState([]);
  const [busy, setBusy] = useState(false);

  const joinedRef = useRef(false);

  const appendMessage = useCallback((message) => {
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
  }, []);

  const { pending, send, retry, remove } = useMessageSend({
    sendFn: useCallback(
      (payload) => sendGroupMessage(conversationId, payload),
      [conversationId]
    ),
    onSent: appendMessage
  });

  async function load() {
    setLoading(true);
    setError("");
    try {
      const data = await getGroup(conversationId);
      setConversation(data?.conversation || null);
      setMessages(Array.isArray(data?.messages) ? data.messages : []);
      setOnlineMap(
        Object.fromEntries(
          (data?.conversation?.members || []).map((member) => [
            ids(member),
            Boolean(member.online)
          ])
        )
      );
      await markGroupRead(conversationId).catch(() => {});
    } catch (requestError) {
      const status = requestError.response?.status;
      if (status === 403 || status === 404) {
        setJoinError(
          requestError.response?.data?.error ||
            "No puedes ver esta conversación."
        );
        setLoading(false);
      } else {
        setError(
          requestError.response?.data?.error || "No se pudo cargar el grupo."
        );
        setLoading(false);
      }
    }
  }

  useEffect(() => {
    setMessages([]);
    setConversation(null);
    setJoined(false);
    setJoinError("");
    load();
  }, [conversationId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Socket: sala del grupo (con verificación de membresía en el server).
  // Si la conexión cae y vuelve, se vuelve a pedir la sala.
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return undefined;

    joinedRef.current = false;

    const online = () => {
      setConnected(true);
      joinRoom();
    };

    const offline = () => setConnected(false);

    const receive = (message) => {
      if (ids(message?.conversation) === String(conversationId)) {
        appendMessage(message);
        markGroupRead(conversationId).catch(() => {});
      }
    };

    const presence = ({ userId, online: isOnline }) => {
      setOnlineMap((map) => ({ ...map, [String(userId)]: Boolean(isOnline) }));
    };

    function joinRoom() {
      if (joinedRef.current) return;
      socket.once("conversation:joined", (result) => {
        if (ids(result?.conversationId) === String(conversationId)) {
          joinedRef.current = true;
          setJoined(true);
        }
      });
      socket.once("conversation:error", (result) => {
        if (ids(result?.conversationId) !== String(conversationId)) return;
        setJoinError(
          result?.code === "CONVERSATION_NOT_MEMBER"
            ? "No eres miembro de esta conversación."
            : "No se pudo unirse a la conversación."
        );
      });
      socket.emit("conversation:join", { conversationId });
    }

    socket.on("connect", online);
    socket.on("disconnect", offline);
    socket.on("message:new", receive);
    socket.on("presence:changed", presence);

    if (socket.connected) joinRoom();

    return () => {
      socket.off("connect", online);
      socket.off("disconnect", offline);
      socket.off("message:new", receive);
      socket.off("presence:changed", presence);
      if (joinedRef.current) {
        socket.emit("conversation:leave", { conversationId });
      }
      joinedRef.current = false;
    };
  }, [conversationId, appendMessage]);

  useEffect(() => {
    const value = memberQuery.trim();
    if (!value || !showMembers) {
      setMemberResults([]);
      return undefined;
    }
    const timer = setTimeout(async () => {
      try {
        const data = await searchUsers(value);
        setMemberResults(
          (Array.isArray(data?.users) ? data.users : [])
            .filter((user) => ids(user) !== currentUserId)
            .slice(0, 8)
        );
      } catch {
        setMemberResults([]);
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [memberQuery, showMembers, currentUserId]);

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

  if (joinError || !conversation) {
    return (
      <section className="page">
        <header className="k-page-header">
          <div>
            <p className="k-eyebrow">KRONOS / GROUPS</p>
            <h1>Grupo</h1>
          </div>
          <Link className="k-button k-button-ghost" to="/conversations">
            Volver
          </Link>
        </header>
        <div className="k-empty-state">
          <h2>No puedes ver este grupo</h2>
          <p>{joinError}</p>
        </div>
      </section>
    );
  }

  const members = Array.isArray(conversation.members) ? conversation.members : [];
  const isCreator = ids(conversation.createdBy) === currentUserId;

  async function addMember(userId) {
    setBusy(true);
    try {
      await updateGroupMembers(conversationId, { add: [userId] });
      const data = await getGroup(conversationId);
      setConversation(data?.conversation || null);
      setMemberQuery("");
      setMemberResults([]);
    } catch (requestError) {
      setError(requestError.response?.data?.error || "No se pudo agregar al miembro.");
    } finally {
      setBusy(false);
    }
  }

  async function removeMember(userId) {
    setBusy(true);
    try {
      await updateGroupMembers(conversationId, { remove: [userId] });
      const data = await getGroup(conversationId);
      setConversation(data?.conversation || null);
    } catch (requestError) {
      setError(requestError.response?.data?.error || "No se pudo quitar al miembro.");
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    if (!window.confirm("¿Eliminar este grupo? La conversación dejará de estar disponible.")) {
      return;
    }
    setBusy(true);
    try {
      await deleteGroup(conversationId);
      navigate("/conversations");
    } catch (requestError) {
      setError(requestError.response?.data?.error || "No se pudo eliminar el grupo.");
      setBusy(false);
    }
  }

  return (
    <section className="page">
      <header className="k-page-header">
        <div>
          <p className="k-eyebrow">
            KRONOS / GROUP CHAT {connected ? "· EN LÍNEA" : "· RECONECTANDO"}
          </p>
          <h1>{conversation.name || `Grupo de ${members[0]?.username || "usuarios"}`}</h1>
          <p>
            {members.length} miembros
            {joined ? "" : " · uniendo..."}
          </p>
        </div>
        <div className="k-group-header-actions">
          <Link className="k-button k-button-ghost" to="/conversations">
            Volver
          </Link>
          {isCreator && (
            <button
              className="k-button k-button-ghost"
              type="button"
              onClick={() => setShowMembers((value) => !value)}
              aria-expanded={showMembers}
            >
              Miembros
            </button>
          )}
        </div>
      </header>

      {error && (
        <p className="k-state k-state-error" role="alert">
          {error}
        </p>
      )}

      {showMembers && (
        <div className="k-surface k-group-members">
          <label>
            <span>Agregar miembro (solo el creador)</span>
            <input
              className="k-input"
              type="search"
              value={memberQuery}
              onChange={(event) => setMemberQuery(event.target.value)}
              placeholder="Buscar usuario"
              disabled={busy}
            />
          </label>
          {memberResults.length > 0 && (
            <div className="k-group-results">
              {memberResults
                .filter(
                  (user) =>
                    !members.some((member) => ids(member) === ids(user))
                )
                .map((user) => (
                  <button
                    key={ids(user)}
                    type="button"
                    className="k-group-result"
                    onClick={() => addMember(ids(user))}
                    disabled={busy}
                  >
                    Agregar a @{user.username}
                  </button>
                ))}
            </div>
          )}
          <ul className="k-member-list">
            {members.map((member) => (
              <li key={ids(member)}>
                <span className={`k-presence-dot ${onlineMap[ids(member)] ? "is-online" : ""}`} role="img" aria-label={onlineMap[ids(member)] ? "En línea" : "No en línea"} />
                <strong>{member.displayName || member.username}</strong>
                <small>@{member.username}</small>
                {ids(member) === currentUserId && <em> tú</em>}
                {isCreator && ids(member) !== currentUserId && (
                  <button
                    type="button"
                    className="k-button k-button-ghost"
                    onClick={() => removeMember(ids(member))}
                    disabled={busy}
                  >
                    Quitar
                  </button>
                )}
              </li>
            ))}
          </ul>
          {isCreator && (
            <button
              type="button"
              className="k-button k-button-ghost k-group-delete"
              onClick={handleDelete}
              disabled={busy}
            >
              Eliminar grupo
            </button>
          )}
        </div>
      )}

      <MessageList
        messages={messages}
        pending={pending}
        currentUserId={currentUserId}
        variant="group"
        emptyTitle="Aún no hay mensajes en este grupo"
        emptyText="Escribe el primero."
        onRetry={retry}
        onRemovePending={remove}
      />
      <MessageComposer onSend={send} disabled={!connected} />
    </section>
  );
}
