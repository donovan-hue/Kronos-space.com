import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { MessageSquarePlus, Send, Trash2 } from "lucide-react";
import {
  createChatConversation,
  deleteChatConversation,
  getChatConversation,
  listChatConversations,
  renameChatConversation,
  sendKairosMessage
} from "../../services/aiService";
import { queryKeys } from "../../services/queryKeys";
import { useConfirm } from "../../components/feedback/ConfirmProvider";
import EmptyState from "../../components/ui/EmptyState";

/* ============================================================
   KAIROS — conversación

   `POST /api/ai/chat` existía desde el principio, pero el cliente solo lo
   usaba para reescribir el borrador de una publicación y el servidor no
   guardaba nada: no había pantalla de conversación ni forma de continuar un
   hilo. Aquí está la pantalla, con la conversación en el servidor
   (`ChatConversation`), el estado de cada respuesta y sin reenviar el
   historial completo en cada mensaje.

   La tarjeta de Kairos solo se ofrece si el proveedor está configurado: la
   pantalla lee `GET /kairos/capacidades` y, si falta la clave, lo dice en
   lugar de fallar al enviar el primer mensaje.
   ============================================================ */

function fecha(value) {
  return value ? new Date(value).toLocaleString("es-MX", { dateStyle: "medium", timeStyle: "short" }) : "";
}

export default function KairosChat() {
  const { conversationId = "" } = useParams();
  const navigate = useNavigate();
  const confirm = useConfirm();
  const queryClient = useQueryClient();

  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const endRef = useRef(null);

  const listQuery = useQuery({
    queryKey: queryKeys.chatConversations,
    queryFn: listChatConversations
  });

  const threadQuery = useQuery({
    queryKey: queryKeys.chatConversation(conversationId || "none"),
    queryFn: () => getChatConversation(conversationId),
    enabled: Boolean(conversationId)
  });

  const conversations = useMemo(
    () => (Array.isArray(listQuery.data) ? listQuery.data : []),
    [listQuery.data]
  );
  const messages = useMemo(
    () => (Array.isArray(threadQuery.data?.messages) ? threadQuery.data.messages : []),
    [threadQuery.data]
  );
  const conversation = threadQuery.data?.conversation || null;

  const loading = conversationId ? threadQuery.isPending : listQuery.isPending;

  useEffect(() => {
    endRef.current?.scrollIntoView?.({ block: "end" });
  }, [messages.length, sending]);

  const refreshList = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: queryKeys.chatConversations });
  }, [queryClient]);

  async function startConversation() {
    setError("");
    try {
      const created = await createChatConversation();
      if (created?._id) {
        refreshList();
        // Desde la bandeja se entra al hilo recién creado; desde el composer
        // del hilo solo se necesita el id (ya estamos dentro).
        if (!conversationId) navigate(`/kairos/chat/${created._id}`);
        return created._id;
      }
      throw new Error("El servidor no confirmó la conversación.");
    } catch (requestError) {
      setError(requestError?.response?.data?.error || requestError?.message || "No se pudo abrir la conversación.");
      return "";
    }
  }

  async function send(event) {
    event?.preventDefault?.();
    const message = draft.trim();
    if (!message || sending) return;

    let id = conversationId;
    // El primer mensaje de la bandeja crea el hilo: así no hay conversaciones
    // vacías en la lista si el usuario se arrepiente antes de escribir.
    if (!id) {
      id = await startConversation();
      if (!id) return;
    }

    setSending(true);
    setError("");
    setNotice("");
    // Eco inmediato del mensaje propio: el servidor confirmará con el hilo
    // completo, pero la pantalla no se queda muda mientras responde.
    queryClient.setQueryData(queryKeys.chatConversation(id), (cache) => ({
      conversation: cache?.conversation || { _id: id },
      messages: [
        ...(cache?.messages || []),
        { _id: `local-${Date.now()}`, role: "user", content: message, estado: "ok", createdAt: new Date().toISOString() }
      ]
    }));
    setDraft("");

    try {
      const result = await sendKairosMessage({ message, conversationId: id });
      if (result?.conversationId) {
        await queryClient.invalidateQueries({ queryKey: queryKeys.chatConversation(id) });
      }
      refreshList();
    } catch (requestError) {
      const detail = requestError?.response?.data?.error || requestError?.message || "Kairos no respondió.";
      setError(detail);
      // El servidor guardó el mensaje y el error: se recarga el hilo real en
      // vez de inventar una respuesta que no existió.
      if (queryClient) {
        await queryClient.invalidateQueries({ queryKey: queryKeys.chatConversation(id) });
        refreshList();
      }
    } finally {
      setSending(false);
    }
  }

  async function removeConversation(target) {
    const ok = await confirm({
      title: "Eliminar conversación",
      message: "¿Deseas eliminar esta conversación con Kairos? No se puede deshacer.",
      confirmText: "Eliminar",
      danger: true
    });
    if (!ok) return;
    try {
      await deleteChatConversation(target);
      if (String(target) === String(conversationId)) {
        setNotice("Conversación eliminada.");
        navigate("/kairos/chat");
      }
      refreshList();
      queryClient.removeQueries({ queryKey: queryKeys.chatConversation(target) });
    } catch (requestError) {
      setError(requestError?.response?.data?.error || "No se pudo eliminar la conversación.");
    }
  }

  async function renameCurrent() {
    if (!conversationId) return;
    const title = window.prompt("Nuevo título de la conversación", conversation?.title || "");
    if (title === null) return;
    try {
      await renameChatConversation(conversationId, title);
      await queryClient.invalidateQueries({ queryKey: queryKeys.chatConversation(conversationId) });
      refreshList();
    } catch (requestError) {
      setError(requestError?.response?.data?.error || "No se pudo cambiar el título.");
    }
  }

  if (loading) {
    return (
      <section className="page k-kairos-chat">
        <div className="k-feed-state">
          <span className="k-skeleton" />
          <span className="k-skeleton k-skeleton-wide" />
        </div>
      </section>
    );
  }

  return (
    <section className="page k-kairos-chat" aria-labelledby="k-chat-title">
      <header className="k-page-header">
        <div>
          <p className="k-eyebrow">KAIROS</p>
          <h1 id="k-chat-title">{conversationId ? conversation?.title || "Conversación" : "Conversaciones"}</h1>
          <p className="k-muted">Pregunta, piensa en voz alta y vuelve donde lo dejaste.</p>
        </div>
        <div className="k-chat-header-actions">
          <Link className="k-button k-button-ghost" to="/kairos">Volver al estudio</Link>
          {conversationId ? (
            <>
              <button type="button" className="k-button k-button-secondary" onClick={renameCurrent}>
                Cambiar título
              </button>
              <button type="button" className="k-button k-button-ghost" onClick={() => removeConversation(conversationId)}>
                Eliminar
              </button>
            </>
          ) : null}
        </div>
      </header>

      {error && <p className="k-state k-state-error" role="alert">{error}</p>}
      {notice && <p className="k-state k-state-success" role="status">{notice}</p>}

      {!conversationId ? (
        <>
          <div className="k-chat-new">
            <button type="button" className="k-button k-button-primary" onClick={startConversation}>
              <MessageSquarePlus size={16} aria-hidden="true" /> Nueva conversación
            </button>
          </div>
          {listQuery.error && (
            <p className="k-state k-state-error" role="alert">
              {listQuery.error?.response?.data?.error || "No se pudieron cargar tus conversaciones."}
            </p>
          )}
          {conversations.length === 0 ? (
            <EmptyState
              title="Todavía no has hablado con Kairos"
              description="Abre una conversación y pregunta lo que quieras: queda guardada en tu cuenta."
            />
          ) : (
            <ul className="k-chat-list" aria-label="Conversaciones con Kairos">
              {conversations.map((item) => (
                <li key={item._id}>
                  <Link className="k-surface k-chat-item" to={`/kairos/chat/${item._id}`}>
                    <strong>{item.title || "Conversación sin título"}</strong>
                    <span className="k-chat-preview">{item.preview || "Sin mensajes todavía"}</span>
                    <small className="k-muted">{fecha(item.lastMessageAt)} · {item.messagesCount} mensajes</small>
                  </Link>
                  <button
                    type="button"
                    className="k-button k-button-ghost k-chat-remove"
                    onClick={() => removeConversation(item._id)}
                    aria-label={`Eliminar ${item.title || "la conversación"}`}
                  >
                    <Trash2 size={15} aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      ) : (
        <>
          <div className="k-chat-thread" role="log" aria-live="polite">
            {messages.length === 0 && (
              <EmptyState title="Escribe el primer mensaje" description="Kairos responde con el tono que tengas elegido en Ajustes." />
            )}
            {messages.map((item) => (
              <article className={`k-chat-message is-${item.role}${item.estado === "error" ? " is-error" : ""}`} key={item._id}>
                <span className="k-chat-role">{item.role === "user" ? "Tú" : "Kairos"}</span>
                {item.estado === "error" ? (
                  <p className="k-state k-state-error" role="alert">
                    {item.error || "Kairos no pudo responder a este mensaje."}
                  </p>
                ) : (
                  <p>{item.content}</p>
                )}
                <small className="k-muted">{fecha(item.createdAt)}{item.model ? ` · ${item.model}` : ""}</small>
              </article>
            ))}
            {sending && <p className="k-chat-typing" role="status">Kairos está escribiendo…</p>}
            <div ref={endRef} />
          </div>

          <form className="k-chat-composer" onSubmit={send}>
            <label className="k-sr-only" htmlFor="k-chat-input">Mensaje para Kairos</label>
            <textarea
              id="k-chat-input"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                // Enter envía; Shift+Enter hace salto de línea.
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  send(event);
                }
              }}
              maxLength={4000}
              rows={2}
              placeholder="Escribe tu mensaje…"
              disabled={sending}
            />
            <button className="k-button k-button-primary" type="submit" disabled={sending || !draft.trim()}>
              <Send size={16} aria-hidden="true" /> {sending ? "Enviando…" : "Enviar"}
            </button>
          </form>
        </>
      )}
    </section>
  );
}
