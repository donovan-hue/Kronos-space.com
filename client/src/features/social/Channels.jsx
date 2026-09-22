import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  createChannel,
  getChannelMessages,
  getChannels,
  sendChannelMessage,
  subscribeChannel,
  unsubscribeChannel
} from "../../services/channelsService";
import { getOrbits } from "../../services/orbitsService";
import Spinner from "../../components/ui/Spinner";
import EmptyState from "../../components/ui/EmptyState";

function errorMessage(error, fallback) {
  return error?.response?.data?.error || error?.message || fallback;
}

function formatDate(value) {
  if (!value) return "";
  return new Date(value).toLocaleString("es-MX", { dateStyle: "medium", timeStyle: "short" });
}

export default function Channels() {
  const [channels, setChannels] = useState([]);
  const [orbits, setOrbits] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [messages, setMessages] = useState([]);
  const [messageDraft, setMessageDraft] = useState("");
  const [createForm, setCreateForm] = useState({ orbitId: "", name: "", description: "", type: "announcement" });
  const [loading, setLoading] = useState(true);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const selected = channels.find((channel) => String(channel._id) === String(selectedId)) || null;
  const manageableOrbits = useMemo(
    () => orbits.filter((orbit) => orbit.role === "owner" || orbit.role === "moderator"),
    [orbits]
  );

  async function refresh() {
    setLoading(true);
    setError("");
    try {
      const [channelList, orbitList] = await Promise.all([getChannels(), getOrbits()]);
      setChannels(channelList);
      setOrbits(orbitList);
      setSelectedId((current) => current && channelList.some((channel) => String(channel._id) === String(current)) ? current : String(channelList[0]?._id || ""));
      setCreateForm((current) => ({ ...current, orbitId: current.orbitId || String(orbitList.find((orbit) => orbit.role === "owner" || orbit.role === "moderator")?._id || "") }));
    } catch (requestError) {
      setError(errorMessage(requestError, "No se pudieron cargar los canales."));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { refresh(); }, []);

  useEffect(() => {
    if (!selectedId) {
      setMessages([]);
      return undefined;
    }
    let active = true;
    setMessagesLoading(true);
    getChannelMessages(selectedId)
      .then((data) => { if (active) setMessages(Array.isArray(data?.messages) ? data.messages : []); })
      .catch((requestError) => { if (active) setError(errorMessage(requestError, "No se pudieron cargar los mensajes del canal.")); })
      .finally(() => { if (active) setMessagesLoading(false); });
    return () => { active = false; };
  }, [selectedId]);

  async function handleCreate(event) {
    event.preventDefault();
    setBusy("create");
    setError("");
    setNotice("");
    try {
      const channel = await createChannel(createForm);
      setChannels((current) => [channel, ...current]);
      setSelectedId(String(channel._id));
      setCreateForm((current) => ({ ...current, name: "", description: "" }));
      setNotice("Canal creado. Ya puedes publicar el primer mensaje.");
    } catch (requestError) {
      setError(errorMessage(requestError, "No se pudo crear el canal."));
    } finally {
      setBusy("");
    }
  }

  async function handleSubscription() {
    if (!selected) return;
    setBusy("subscribe");
    setError("");
    try {
      const updated = selected.subscribed
        ? await unsubscribeChannel(selected._id)
        : await subscribeChannel(selected._id);
      setChannels((current) => current.map((channel) => channel._id === updated._id ? updated : channel));
      setNotice(updated.subscribed ? "Suscripción activa." : "Suscripción cancelada.");
    } catch (requestError) {
      setError(errorMessage(requestError, "No se pudo actualizar la suscripción."));
    } finally {
      setBusy("");
    }
  }

  async function handleSend(event) {
    event.preventDefault();
    const text = messageDraft.trim();
    if (!selected || !text || busy === "send") return;
    setBusy("send");
    setError("");
    try {
      const message = await sendChannelMessage(selected._id, text);
      setMessages((current) => [...current, message]);
      setMessageDraft("");
      setChannels((current) => current.map((channel) => channel._id === selected._id ? { ...channel, lastMessageAt: message.createdAt } : channel));
    } catch (requestError) {
      setError(errorMessage(requestError, "No se pudo publicar en el canal."));
    } finally {
      setBusy("");
    }
  }

  const canPost = Boolean(selected && (selected.manageable || (selected.type === "discussion" && selected.subscribed)));

  return (
    <main className="k-page k-channels-page">
      <header className="k-page-header">
        <div>
          <p className="k-eyebrow">Comunidad en un solo lugar</p>
          <h1>Canales</h1>
          <p className="k-muted">Anuncios y conversaciones dentro de tus Órbitas, con responsables y suscripciones claras.</p>
        </div>
        <Link className="k-button k-button-secondary" to="/orbits">Ver Órbitas</Link>
      </header>
      {error && <p className="k-state k-state-error" role="alert">{error}</p>}
      {notice && <p className="k-state k-state-success" role="status">{notice}</p>}

      {manageableOrbits.length > 0 && (
        <section className="k-panel k-channel-create" aria-labelledby="new-channel-title">
          <div className="k-section-heading"><div><p className="k-eyebrow">Responsables de comunidad</p><h2 id="new-channel-title">Crear un canal</h2></div></div>
          <form className="k-channel-create-form" onSubmit={handleCreate}>
            <label>Órbita<select value={createForm.orbitId} onChange={(event) => setCreateForm((current) => ({ ...current, orbitId: event.target.value }))} required aria-label="Órbita del canal">{manageableOrbits.map((orbit) => <option key={orbit._id} value={orbit._id}>{orbit.name}</option>)}</select></label>
            <label>Nombre<input value={createForm.name} onChange={(event) => setCreateForm((current) => ({ ...current, name: event.target.value }))} maxLength={80} required placeholder="Anuncios" /></label>
            <label>Descripción<input value={createForm.description} onChange={(event) => setCreateForm((current) => ({ ...current, description: event.target.value }))} maxLength={300} placeholder="Qué se comparte aquí" /></label>
            <label>Tipo<select value={createForm.type} onChange={(event) => setCreateForm((current) => ({ ...current, type: event.target.value }))}><option value="announcement">Anuncios · solo responsables publican</option><option value="discussion">Discusión · suscriptores participan</option></select></label>
            <button type="submit" className="k-button k-button-primary" disabled={busy === "create"}>{busy === "create" ? "Creando..." : "Crear canal"}</button>
          </form>
        </section>
      )}

      {loading ? <Spinner size="lg" label="Cargando canales..." /> : channels.length === 0 ? (
        <EmptyState title="Aún no tienes canales visibles." description="Un propietario o moderador puede crear el primer canal desde una Órbita." />
      ) : (
        <section className="k-channel-layout" aria-label="Canales disponibles">
          <aside className="k-panel k-channel-list">
            <div className="k-section-heading"><h2>Mis canales</h2><span className="k-muted">{channels.length}</span></div>
            {channels.map((channel) => <button type="button" key={channel._id} className={`k-channel-list-item ${String(channel._id) === String(selectedId) ? "is-active" : ""}`} onClick={() => setSelectedId(String(channel._id))}><span><strong># {channel.name}</strong><small>{channel.orbit?.name} · {channel.type === "announcement" ? "anuncios" : "discusión"}</small></span><em>{channel.subscribersCount}</em></button>)}
          </aside>
          <section className="k-panel k-channel-thread" aria-labelledby="channel-title">
            {selected && <>
              <header className="k-channel-thread-header"><div><p className="k-eyebrow">{selected.orbit?.name} · {selected.type === "announcement" ? "ANUNCIOS" : "DISCUSIÓN"}</p><h2 id="channel-title"># {selected.name}</h2><p className="k-muted">{selected.description || "Sin descripción"}</p></div><button type="button" className="k-button k-button-secondary" onClick={handleSubscription} disabled={busy === "subscribe" || selected.manageable}>{selected.manageable ? "Responsable" : selected.subscribed ? "Cancelar suscripción" : "Suscribirme"}</button></header>
              {messagesLoading ? <Spinner label="Cargando mensajes..." /> : messages.length === 0 ? <EmptyState title="Todavía no hay mensajes en este canal." /> : <div className="k-channel-messages">{messages.map((message) => <article className="k-channel-message" key={message._id}><div className="k-channel-message-meta"><strong>{message.author?.displayName || message.author?.username || "Usuario"}</strong><time dateTime={message.createdAt}>{formatDate(message.createdAt)}</time></div><p>{message.text}</p></article>)}</div>}
              {canPost ? <form className="k-channel-send" onSubmit={handleSend}><textarea value={messageDraft} onChange={(event) => setMessageDraft(event.target.value)} maxLength={2000} placeholder={selected.type === "announcement" ? "Publica un anuncio para la comunidad" : "Escribe al canal"} aria-label="Mensaje del canal" /><button type="submit" className="k-button k-button-primary" disabled={busy === "send" || !messageDraft.trim()}>{busy === "send" ? "Publicando..." : "Publicar"}</button></form> : <p className="k-muted k-channel-readonly">{selected.type === "announcement" ? "Solo los responsables publican en este canal." : "Suscríbete para participar en la discusión."}</p>}
            </>}
          </section>
        </section>
      )}
    </main>
  );
}
