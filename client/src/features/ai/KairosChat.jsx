import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { MessageSquarePlus, Paperclip, Search, Send, Trash2 } from "lucide-react";
import {
  createChatConversation,
  deleteChatConversation,
  getChatConversation,
  listChatConversations,
  renameChatConversation,
  searchChatConversation,
  sendKairosMessage,
  uploadChatAttachment
} from "../../services/aiService";
import { queryKeys } from "../../services/queryKeys";
import { mediaUrl } from "../../services/mediaUrl";
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
  // Búsqueda dentro del hilo. Antes solo se podía recorrer a ojo y un hilo de
  // cien mensajes no se recorre; la lista de resultados salta al mensaje.
  const [busqueda, setBusqueda] = useState("");
  const [resultados, setResultados] = useState(null);
  const [buscando, setBuscando] = useState(false);
  const [destacado, setDestacado] = useState(-1);
  // Adjuntos del mensaje que se está escribiendo. Se suben al elegirlos para
  // que el envío sea un JSON normal y la miniatura se vea antes de mandar.
  const [adjuntos, setAdjuntos] = useState([]);
  const [subiendoAdjunto, setSubiendoAdjunto] = useState(false);
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

  async function elegirAdjunto(event) {
    const archivos = Array.from(event.target.files || []);
    event.target.value = "";
    if (!archivos.length) return;

    setError("");
    setSubiendoAdjunto(true);
    try {
      const subidos = [];
      for (const archivo of archivos) {
        // El tope también vive en el servidor; aquí se corta antes para no
        // subir 10 MB y que el envío falle después.
        if (adjuntos.length + subidos.length >= 3) {
          setError("Un mensaje puede llevar hasta tres adjuntos.");
          break;
        }
        subidos.push(await uploadChatAttachment(archivo));
      }
      setAdjuntos((prev) => [...prev, ...subidos]);
    } catch (requestError) {
      setError(requestError?.response?.data?.error || requestError?.message || "No se pudo adjuntar el archivo.");
    } finally {
      setSubiendoAdjunto(false);
    }
  }

  /**
   * Busca en el hilo abierto. Mínimo dos caracteres: una letra devuelve todo y
   * no es una búsqueda. Limpiar el campo limpia los resultados.
   */
  async function buscarEnHilo(event) {
    event?.preventDefault?.();
    const consulta = busqueda.trim();
    if (consulta.length < 2) {
      setError("Escribe al menos dos caracteres para buscar.");
      setResultados(null);
      return;
    }
    if (!conversationId || buscando) return;

    setBuscando(true);
    setError("");
    try {
      setResultados(await searchChatConversation(conversationId, consulta));
    } catch (requestError) {
      setResultados(null);
      setError(requestError?.response?.data?.error || requestError?.message || "No se pudo buscar en el hilo.");
    } finally {
      setBuscando(false);
    }
  }

  /** Salta al mensaje encontrado y lo resalta un momento. */
  function irAlMensaje(indice) {
    setDestacado(indice);
    if (typeof document !== "undefined") {
      const nodo = document.getElementById(`k-chat-msg-${indice}`);
      nodo?.scrollIntoView?.({ behavior: "smooth", block: "center" });
    }
  }

  async function send(event) {
    event?.preventDefault?.();
    const message = draft.trim();
    // Un mensaje puede ser solo un adjunto: obligar a escribir texto para
    // mandar una captura es una fricción inventada.
    if ((!message && adjuntos.length === 0) || sending) return;

    let id = conversationId;
    // El primer mensaje de la bandeja crea el hilo: así no hay conversaciones
    // vacías en la lista si el usuario se arrepiente antes de escribir.
    if (!id) {
      id = await startConversation();
      if (!id) return;
    }

    const adjuntosDelMensaje = adjuntos;
    setSending(true);
    setError("");
    setNotice("");
    // Eco inmediato del mensaje propio: el servidor confirmará con el hilo
    // completo, pero la pantalla no se queda muda mientras responde.
    queryClient.setQueryData(queryKeys.chatConversation(id), (cache) => ({
      conversation: cache?.conversation || { _id: id },
      messages: [
        ...(cache?.messages || []),
        { _id: `local-${Date.now()}`, role: "user", content: message, adjuntos: adjuntosDelMensaje, estado: "ok", createdAt: new Date().toISOString() }
      ]
    }));
    setDraft("");
    setAdjuntos([]);

    try {
      const result = await sendKairosMessage({
        message,
        conversationId: id,
        // Sin adjuntos el campo no viaja: el contrato anterior no cambia.
        ...(adjuntosDelMensaje.length ? { adjuntos: adjuntosDelMensaje } : {})
      });
      if (result?.conversationId) {
        await queryClient.invalidateQueries({ queryKey: queryKeys.chatConversation(id) });
      }
      refreshList();
    } catch (requestError) {
      const detail = requestError?.response?.data?.error || requestError?.message || "Kairos no respondió.";
      setError(detail);
      // El texto y los adjuntos vuelven al compositor: nadie reescribe su
      // mensaje porque el proveedor falló.
      if (message) setDraft(message);
      if (adjuntosDelMensaje.length) setAdjuntos(adjuntosDelMensaje);
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
          <form className="k-chat-search" onSubmit={buscarEnHilo} role="search">
            <label className="k-sr-only" htmlFor="k-chat-search-input">Buscar en este hilo</label>
            <input
              id="k-chat-search-input"
              type="search"
              value={busqueda}
              onChange={(event) => {
                setBusqueda(event.target.value);
                if (!event.target.value.trim()) {
                  setResultados(null);
                  setDestacado(-1);
                }
              }}
              placeholder="Buscar en este hilo…"
              maxLength={80}
            />
            <button className="k-button k-button-secondary" type="submit" disabled={buscando}>
              <Search size={15} aria-hidden="true" /> {buscando ? "Buscando…" : "Buscar"}
            </button>
          </form>

          {resultados && (
            <section className="k-chat-search-results" aria-label="Resultados en este hilo">
              <p className="k-muted" role="status">
                {resultados.total === 0
                  ? `Sin coincidencias para «${resultados.consulta}».`
                  : `${resultados.total} coincidencia${resultados.total === 1 ? "" : "s"} para «${resultados.consulta}».`}
              </p>
              {resultados.mensajes.length > 0 && (
                <ul>
                  {resultados.mensajes.map((hallazgo) => (
                    <li key={`${hallazgo.indice}-${hallazgo.role}`}>
                      <button
                        type="button"
                        className="k-button k-button-ghost"
                        onClick={() => irAlMensaje(hallazgo.indice)}
                      >
                        <strong>{hallazgo.role === "user" ? "Tú" : "Kairos"}:</strong> {hallazgo.extracto}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}

          <div className="k-chat-thread" role="log" aria-live="polite">
            {messages.length === 0 && (
              <EmptyState title="Escribe el primer mensaje" description="Kairos responde con el tono que tengas elegido en Ajustes." />
            )}
            {messages.map((item, indice) => (
              <article
                id={`k-chat-msg-${indice}`}
                className={`k-chat-message is-${item.role}${item.estado === "error" ? " is-error" : ""}${destacado === indice ? " is-destacado" : ""}`}
                key={item._id}
              >
                <span className="k-chat-role">{item.role === "user" ? "Tú" : "Kairos"}</span>
                {item.estado === "error" ? (
                  <p className="k-state k-state-error" role="alert">
                    {item.error || "Kairos no pudo responder a este mensaje."}
                  </p>
                ) : (
                  <p>{item.content}</p>
                )}
                {Array.isArray(item.adjuntos) && item.adjuntos.length > 0 && (
                  <ul className="k-chat-attachments">
                    {item.adjuntos.map((adjunto, posicion) => (
                      <li key={`${item._id}-adj-${posicion}`}>
                        {adjunto.kind === "image" ? (
                          <img src={mediaUrl(adjunto.url)} alt={adjunto.nombre || "Adjunto"} loading="lazy" />
                        ) : (
                          <a href={mediaUrl(adjunto.url)} target="_blank" rel="noopener noreferrer">
                            📄 {adjunto.nombre || "Archivo adjunto"}
                          </a>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
                <small className="k-muted">{fecha(item.createdAt)}{item.model ? ` · ${item.model}` : ""}</small>
              </article>
            ))}
            {sending && <p className="k-chat-typing" role="status">Kairos está escribiendo…</p>}
            <div ref={endRef} />
          </div>

          {(adjuntos.length > 0 || subiendoAdjunto) && (
            <ul className="k-chat-pending" aria-label="Adjuntos por enviar">
              {adjuntos.map((adjunto, posicion) => (
                <li key={`pendiente-${posicion}`}>
                  <span>{adjunto.kind === "image" ? "🖼️" : "📄"} {adjunto.nombre || "Adjunto"}</span>
                  <button
                    type="button"
                    className="k-button k-button-ghost"
                    onClick={() => setAdjuntos((prev) => prev.filter((_, indice) => indice !== posicion))}
                    aria-label={`Quitar ${adjunto.nombre || "adjunto"}`}
                  >
                    ✕
                  </button>
                </li>
              ))}
              {subiendoAdjunto && <li className="k-muted" role="status">Subiendo adjunto…</li>}
            </ul>
          )}

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
            <label className="k-button k-button-secondary k-chat-attach" title="Adjuntar imagen o texto">
              <Paperclip size={16} aria-hidden="true" />
              <span className="k-sr-only">Adjuntar archivo</span>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,text/plain,text/markdown,text/csv,application/json"
                multiple
                onChange={elegirAdjunto}
                disabled={sending || subiendoAdjunto}
              />
            </label>
            <button
              className="k-button k-button-primary"
              type="submit"
              disabled={sending || subiendoAdjunto || (!draft.trim() && adjuntos.length === 0)}
            >
              <Send size={16} aria-hidden="true" /> {sending ? "Enviando…" : "Enviar"}
            </button>
          </form>
        </>
      )}
    </section>
  );
}
