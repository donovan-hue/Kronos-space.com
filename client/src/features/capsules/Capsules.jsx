import { useCallback, useEffect, useMemo, useState } from "react";
import { Hourglass, Lock, Trash2, Unlock, UserPlus } from "lucide-react";
import Spinner from "../../components/ui/Spinner";
import {
  addCapsuleMessage,
  cancelCapsule,
  createCapsule,
  deleteCapsule,
  getCapsules,
  inviteCapsuleContributor,
  sealCapsule
} from "../../services/capsulesService";

const STATE_LABELS = {
  draft: "Borrador",
  scheduled: "Sellada",
  opened: "Abierta",
  cancelled: "Cancelada"
};

function localTimezone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

function formatOpenDate(value) {
  if (!value) return "";
  return new Date(value).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function countdown(msUntilOpen) {
  if (typeof msUntilOpen !== "number" || msUntilOpen <= 0) return "lista para abrirse";
  const totalMinutes = Math.floor(msUntilOpen / 60000);
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;
  if (days > 0) return `se abre en ${days} d ${hours} h`;
  if (hours > 0) return `se abre en ${hours} h ${minutes} min`;
  return `se abre en ${minutes} min`;
}

/**
 * CÁPSULAS DEL TIEMPO — Fase 5 del plan maestro.
 *
 * El contenido se cifra en el servidor y no viaja en las respuestas hasta
 * que la cápsula se abre. Aquí se crea (con mensaje inicial y zona
 * horaria propia), se invitan colaboradores, se sella, se cancela y se
 * leen los mensajes revelados. Sin tiempo simulado: la cuenta regresiva
 * usa `msUntilOpen` que entrega el backend.
 */
export default function Capsules() {
  const [capsules, setCapsules] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");

  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [opensAt, setOpensAt] = useState("");
  const [creating, setCreating] = useState(false);

  const [newMessage, setNewMessage] = useState("");
  const [inviteUsername, setInviteUsername] = useState("");
  const [confirming, setConfirming] = useState("");

  const load = useCallback(async () => {
    try {
      const list = await getCapsules();
      setCapsules(Array.isArray(list) ? list : []);
      setError("");
    } catch (requestError) {
      setError(requestError?.response?.data?.error || "No se pudieron cargar tus cápsulas.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const selected = useMemo(
    () => capsules.find((capsule) => String(capsule._id) === String(selectedId)) || null,
    [capsules, selectedId]
  );

  function replaceCapsule(next) {
    setCapsules((current) => {
      const others = current.filter((capsule) => capsule._id !== next._id);
      return [next, ...others].sort((a, b) => new Date(a.opensAt) - new Date(b.opensAt));
    });
  }

  async function handleCreate(event) {
    event.preventDefault();
    if (creating) return;
    if (!title.trim() || !opensAt) {
      setError("La cápsula necesita título y fecha de apertura.");
      return;
    }
    setCreating(true);
    setError("");
    try {
      const capsule = await createCapsule({
        title: title.trim(),
        opensAt: new Date(opensAt).toISOString(),
        timezone: localTimezone(),
        message: message.trim()
      });
      setTitle("");
      setMessage("");
      setOpensAt("");
      setCapsules((current) => [capsule, ...current]);
      setSelectedId(capsule._id);
    } catch (requestError) {
      setError(requestError?.response?.data?.error || "No se pudo crear la cápsula.");
    } finally {
      setCreating(false);
    }
  }

  async function run(action, capsuleId) {
    if (busy) return;
    setBusy(action);
    setError("");
    try {
      return await ({
        message: () => addCapsuleMessage(capsuleId, newMessage.trim()),
        invite: () => inviteCapsuleContributor(capsuleId, inviteUsername.trim()),
        seal: () => sealCapsule(capsuleId),
        cancel: () => cancelCapsule(capsuleId),
        remove: () => deleteCapsule(capsuleId)
      }[action]());
    } catch (requestError) {
      setError(requestError?.response?.data?.error || "La acción no se pudo completar.");
      return null;
    } finally {
      setBusy("");
    }
  }

  async function handleAction(action, capsuleId) {
    if (action === "message" && !newMessage.trim()) return;
    if (action === "invite" && !inviteUsername.trim()) return;
    const result = await run(action, capsuleId);
    if (!result) return;
    if (action === "message") setNewMessage("");
    if (action === "invite") setInviteUsername("");
    if (action === "remove") {
      setCapsules((current) => current.filter((capsule) => capsule._id !== capsuleId));
      if (selectedId === capsuleId) setSelectedId("");
      return;
    }
    replaceCapsule(result);
  }

  return (
    <section className="page k-capsules" aria-labelledby="k-capsules-title">
      <header className="k-page-header">
        <div>
          <p className="k-eyebrow">TIEMPO</p>
          <h1 id="k-capsules-title">Cápsulas del tiempo</h1>
          <p className="k-muted">Guarda un mensaje cifrado que solo se revelará en la fecha que elijas.</p>
        </div>
      </header>

      {error && <p className="k-capsule-error" role="alert">{error}</p>}

      <div className="k-capsules-layout">
        <form className="k-surface k-capsule-create" onSubmit={handleCreate} aria-label="Crear cápsula">
          <h2>Nueva cápsula</h2>
          <label className="k-capsule-field">
            Título
            <input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={160} placeholder="Carta al 2030" />
          </label>
          <label className="k-capsule-field">
            Fecha de apertura
            <input
              type="datetime-local"
              value={opensAt}
              onChange={(event) => setOpensAt(event.target.value)}
              aria-label="Fecha de apertura de la cápsula"
            />
            <small className="k-muted">Tu zona horaria: {localTimezone()}</small>
          </label>
          <label className="k-capsule-field">
            Primer mensaje (cifrado al guardar)
            <textarea
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              rows={3}
              maxLength={2000}
              placeholder="Qué quieres decirle al futuro?"
            />
          </label>
          <button className="k-button k-button-primary" type="submit" disabled={creating}>
            {creating ? "Creando..." : "Crear cápsula"}
          </button>
        </form>

        <div className="k-capsule-list" aria-live="polite">
          {loading ? (
            <Spinner label="Cargando cápsulas..." />
          ) : capsules.length === 0 ? (
            <div className="k-surface k-capsule-empty">
              <Hourglass size={22} aria-hidden="true" />
              <p className="k-muted">Aún no tienes cápsulas. Crea la primera: un mensaje que se abrirá en el futuro.</p>
            </div>
          ) : (
            capsules.map((capsule) => (
              <button
                key={capsule._id}
                type="button"
                className={`k-capsule-card ${selectedId === capsule._id ? "is-selected" : ""}`}
                onClick={() => setSelectedId(capsule._id)}
                aria-pressed={selectedId === capsule._id}
              >
                <span className="k-capsule-card-head">
                  <strong>{capsule.title}</strong>
                  <small className={`k-capsule-state is-${capsule.state}`}>
                    {capsule.state === "opened" ? <Unlock size={12} aria-hidden="true" /> : <Lock size={12} aria-hidden="true" />}
                    {STATE_LABELS[capsule.state]}
                  </small>
                </span>
                <small className="k-muted">
                  {formatOpenDate(capsule.opensAt)} · {capsule.messagesCount} {capsule.messagesCount === 1 ? "mensaje" : "mensajes"}
                  {capsule.contributorsCount > 0 ? ` · ${capsule.contributorsCount + 1} personas` : ""}
                </small>
                {capsule.state === "scheduled" && (
                  <small className="k-capsule-countdown">{countdown(capsule.msUntilOpen)}</small>
                )}
              </button>
            ))
          )}
        </div>

        {selected && (
          <article className="k-surface k-capsule-detail" aria-label={`Cápsula ${selected.title}`}>
            <header className="k-capsule-detail-head">
              <div>
                <h2>{selected.title}</h2>
                <p className="k-muted">
                  {STATE_LABELS[selected.state]} · se abre {formatOpenDate(selected.opensAt)} ({selected.timezone})
                </p>
              </div>
              <div className="k-inline-actions">
                {selected.canSeal && (
                  <button type="button" className="k-button k-button-primary" disabled={Boolean(busy)} onClick={() => handleAction("seal", selected._id)}>
                    {busy === "seal" ? "Sellando..." : "Sellar cápsula"}
                  </button>
                )}
                {selected.canCancel && confirming !== selected._id && (
                  <button type="button" className="k-button k-button-ghost" onClick={() => setConfirming(selected._id)}>
                    Cancelar
                  </button>
                )}
                {selected.canCancel && confirming === selected._id && (
                  <>
                    <button type="button" className="k-button k-button-primary" disabled={Boolean(busy)} onClick={() => { setConfirming(""); handleAction("cancel", selected._id); }}>
                      Sí, cancelar
                    </button>
                    <button type="button" className="k-button k-button-ghost" onClick={() => setConfirming("")}>No</button>
                  </>
                )}
                {selected.mine && (
                  <button type="button" className="k-capsule-icon" aria-label="Eliminar cápsula" onClick={() => handleAction("remove", selected._id)} disabled={Boolean(busy)}>
                    <Trash2 size={16} />
                  </button>
                )}
              </div>
            </header>

            {selected.state === "scheduled" && (
              <p className="k-capsule-sealed-note">
                <Lock size={14} aria-hidden="true" /> Sellada y cifrada. {countdown(selected.msUntilOpen)}. Nadie puede leerla antes, ni siquiera tú.
              </p>
            )}
            {selected.state === "cancelled" && (
              <p className="k-capsule-sealed-note">Cancelada: el contenido se destruirá con la cápsula y nunca se revelará.</p>
            )}

            {selected.canMessage && (
              <form
                className="k-capsule-message-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  handleAction("message", selected._id);
                }}
              >
                <label className="k-sr-only" htmlFor="k-capsule-message">Nuevo mensaje para la cápsula</label>
                <textarea
                  id="k-capsule-message"
                  value={newMessage}
                  onChange={(event) => setNewMessage(event.target.value)}
                  rows={2}
                  maxLength={2000}
                  placeholder={selected.mine ? "Añade otro mensaje antes de sellar" : "Aporta tu mensaje antes de que se selle"}
                />
                <button className="k-button k-button-secondary" type="submit" disabled={Boolean(busy) || !newMessage.trim()}>
                  {busy === "message" ? "Guardando..." : "Añadir mensaje"}
                </button>
              </form>
            )}

            {selected.canInvite && (
              <form
                className="k-capsule-invite-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  handleAction("invite", selected._id);
                }}
              >
                <label htmlFor="k-capsule-invite">Invitar colaborador (usuario)</label>
                <span className="k-capsule-invite-row">
                  <UserPlus size={15} aria-hidden="true" />
                  <input
                    id="k-capsule-invite"
                    value={inviteUsername}
                    onChange={(event) => setInviteUsername(event.target.value)}
                    placeholder="nombre_de_usuario"
                    aria-label="Invitar colaborador por usuario"
                  />
                  <button className="k-button k-button-secondary" type="submit" disabled={Boolean(busy) || !inviteUsername.trim()}>
                    Invitar
                  </button>
                </span>
                <small className="k-muted">Podrán aportar mensajes hasta que sellas la cápsula y leerla cuando se abra.</small>
              </form>
            )}

            {selected.messages.length > 0 && (
              <div className={`k-capsule-messages ${selected.state === "opened" ? "is-revealed" : ""}`}>
                {selected.messages.map((entry, index) => (
                  <blockquote key={index} className="k-capsule-message">
                    <p>{entry.text}</p>
                    <footer>
                      <strong>{entry.author.displayName || entry.author.username || "Anónimo"}</strong>
                      <small className="k-muted">{formatOpenDate(entry.createdAt)}</small>
                    </footer>
                  </blockquote>
                ))}
              </div>
            )}
          </article>
        )}
      </div>
    </section>
  );
}
