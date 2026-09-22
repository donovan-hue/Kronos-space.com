import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getSessions, requestEmailVerification, revokeOtherSessions, revokeSession } from "../../services/authService";
import { getMe, updatePreferences } from "../../services/usersService";
import { downloadDataExport, getExportStatus, requestDataExport } from "../../services/exportService";
import { useConfirm } from "../../components/feedback/ConfirmProvider";

const DEFAULT_PREFERENCES = {
  notifications: { inApp: true, email: false },
  content: { showSensitive: false },
  appearance: "system",
  language: "es-MX",
  aiPersonality: "normal",
  feed: { mode: "latest", interests: [] }
};

const AI_PERSONALITIES = [
  { id: "normal", name: "Normal", description: "Natural, equilibrado y amable." },
  { id: "direct", name: "Directo", description: "Claro, breve y orientado a soluciones." },
  { id: "sarcastic", name: "Sarcástico", description: "Irónico e ingenioso, sin perder utilidad." },
  { id: "grumpy", name: "Mal humor", description: "Seco y con poca paciencia, pero respetuoso." }
];

function mergePreferences(value) {
  return {
    ...DEFAULT_PREFERENCES,
    ...value,
    notifications: { ...DEFAULT_PREFERENCES.notifications, ...value?.notifications },
    content: { ...DEFAULT_PREFERENCES.content, ...value?.content },
    feed: { ...DEFAULT_PREFERENCES.feed, ...value?.feed, interests: Array.isArray(value?.feed?.interests) ? value.feed.interests : [] }
  };
}

function sessionName(session) {
  const agent = session.userAgent || "Dispositivo sin identificar";
  return agent.length > 85 ? `${agent.slice(0, 82)}…` : agent;
}

export default function Settings({ onLogout }) {
  const confirm = useConfirm();
  const [user, setUser] = useState(null);
  const [preferences, setPreferences] = useState(DEFAULT_PREFERENCES);
  const [interestInput, setInterestInput] = useState("");
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [savingPreferences, setSavingPreferences] = useState(false);
  const [busySession, setBusySession] = useState("");
  const [requestingVerification, setRequestingVerification] = useState(false);
  const [exporting, setExporting] = useState(false);

  async function handleExportData() {
    if (exporting) return;
    setExporting(true);
    setError("");
    setMessage("");
    try {
      await requestDataExport();
      await downloadDataExport();
      setMessage("Tu archivo de datos se ha descargado correctamente.");
    } catch (requestError) {
      setError(requestError.response?.data?.error || "No se pudo generar la exportación de datos.");
    } finally {
      setExporting(false);
    }
  }

  async function handleRequestVerification() {
    if (requestingVerification) return;
    setRequestingVerification(true);
    setError("");
    setMessage("");
    try {
      const result = await requestEmailVerification();
      setMessage(result.message || "Correo de verificación enviado. Revisa tu bandeja de entrada.");
    } catch (requestError) {
      setError(requestError.response?.data?.error || "No se pudo solicitar la verificación de correo.");
    } finally {
      setRequestingVerification(false);
    }
  }

  async function load() {
    setLoading(true);
    setError("");
    try {
      const [profile, activeSessions] = await Promise.all([getMe(), getSessions()]);
      setUser(profile);
      const savedPreferences = mergePreferences(profile?.preferences);
      setPreferences(savedPreferences);
      setInterestInput(savedPreferences.feed.interests.join(", "));
      setSessions(activeSessions);
    } catch (requestError) {
      setError(requestError.response?.data?.error || "No se pudo cargar la configuración.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function savePreferences(next) {
    setPreferences(next);
    setSavingPreferences(true);
    setError("");
    try {
      const saved = await updatePreferences(next);
      setPreferences(mergePreferences(saved));
      setMessage("Preferencias guardadas.");
    } catch (requestError) {
      setError(requestError.response?.data?.error || "No se pudieron guardar las preferencias.");
    } finally {
      setSavingPreferences(false);
    }
  }

  async function saveFeedInterests(event) {
    event.preventDefault();
    const interests = [...new Set(interestInput
      .split(",")
      .map((item) => item.trim().replace(/^#/, "").toLowerCase())
      .filter(Boolean))].slice(0, 20);
    const next = { ...preferences, feed: { ...preferences.feed, interests } };
    await savePreferences(next);
    setInterestInput(interests.join(", "));
  }

  async function closeSession(session) {
    if (!session?.id || busySession) return;
    const ok = await confirm({
      title: "Cerrar sesión",
      message: "¿Deseas cerrar esta sesión de tu cuenta?",
      confirmText: "Cerrar sesión",
      danger: true
    });
    if (!ok) return;
    setBusySession(session.id);
    setError("");
    try {
      const result = await revokeSession(session.id);
      if (result.current) {
        await onLogout();
        return;
      }
      setSessions((current) => current.filter((item) => item.id !== session.id));
      setMessage("Sesión cerrada.");
    } catch (requestError) {
      setError(requestError.response?.data?.error || "No se pudo cerrar la sesión.");
    } finally {
      setBusySession("");
    }
  }

  async function closeOtherSessions() {
    if (busySession) return;
    const ok = await confirm({
      title: "Cerrar todas las demás sesiones",
      message: "¿Deseas cerrar todas las demás sesiones activas en otros dispositivos?",
      confirmText: "Cerrar las demás",
      danger: true
    });
    if (!ok) return;
    setBusySession("others");
    setError("");
    try {
      await revokeOtherSessions();
      setSessions((current) => current.filter((item) => item.current));
      setMessage("Las demás sesiones se cerraron.");
    } catch (requestError) {
      setError(requestError.response?.data?.error || "No se pudieron cerrar las demás sesiones.");
    } finally {
      setBusySession("");
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
    <section className="page settings-page">
      <header className="k-page-header">
        <div>
          <h1>Configuración</h1>
          <p>Administra cuenta, preferencias y sesiones.</p>
        </div>
      </header>

      {error && <p className="k-state k-state-error" role="alert">{error}</p>}
      {message && <p className="k-state k-state-success" role="status">{message}</p>}

      {user && (
        <div className="k-settings-grid">
          <section className="k-surface k-settings-section">
            <p className="k-eyebrow">CUENTA</p>
            <h2>{user.displayName || user.username}</h2>
            <p>@{user.username}</p>
            <p>
              {user.email}{" "}
              <span
                className={`k-badge ${user.emailVerified ? "k-badge-success" : "k-badge-warning"}`}
                style={{ marginLeft: 6, fontSize: "0.75rem", padding: "2px 8px", borderRadius: 6, background: "rgba(255, 255, 255, 0.08)", color: user.emailVerified ? "#f2f2f2" : "#b8b8b8" }}
              >
                {user.emailVerified ? "Verificado" : "Sin verificar"}
              </span>
            </p>
            {!user.emailVerified && (
              <div style={{ marginBottom: 12 }}>
                <button
                  type="button"
                  className="k-button k-button-ghost"
                  onClick={handleRequestVerification}
                  disabled={requestingVerification}
                  style={{ fontSize: "0.85rem" }}
                >
                  {requestingVerification ? "Enviando enlace..." : "Reenviar correo de verificación"}
                </button>
              </div>
            )}
            <div className="k-button-group">
              <Link className="k-button k-button-primary" to="/profile">
                Ver mi perfil
              </Link>
              <Link className="k-button k-button-secondary" to="/settings/profile">
                Privacidad del perfil
              </Link>
              {user.role === "admin" && (
                <Link className="k-button k-button-secondary" to="/admin">
                  Administración
                </Link>
              )}
            </div>
          </section>

          <section className="k-surface k-settings-section">
            <p className="k-eyebrow">PRIVACIDAD Y SEGURIDAD</p>
            <h2>Moderación</h2>
            <p className="k-muted">Bloqueos, silencios, publicaciones ocultas y reportes de tu cuenta.</p>
            <div className="k-button-group">
              <Link className="k-button k-button-secondary" to="/settings/security">
                Abrir privacidad y seguridad
              </Link>
            </div>
          </section>
        </div>
      )}

      <section className="k-surface k-settings-section">
        <p className="k-eyebrow">PREFERENCIAS</p>
        <h2>Experiencia</h2>
        <div className="k-privacy-options">
          <label>
            <input
              type="checkbox"
              checked={preferences.notifications.inApp}
              disabled={savingPreferences}
              onChange={(event) => savePreferences({ ...preferences, notifications: { ...preferences.notifications, inApp: event.target.checked } })}
            />
            <span>
              Notificaciones dentro de la aplicación
              <small className="k-muted">Cuando se desactiva, no se guardan nuevos avisos sociales para tu cuenta.</small>
            </span>
          </label>
          <label>
            <input
              type="checkbox"
              checked={preferences.content.showSensitive}
              disabled={savingPreferences}
              onChange={(event) => savePreferences({ ...preferences, content: { ...preferences.content, showSensitive: event.target.checked } })}
            />
            <span>
              Mostrar contenido marcado como sensible
              <small className="k-muted">La preferencia queda guardada; el etiquetado de contenido sensible se incorporará cuando ese tipo de publicaciones exista.</small>
            </span>
          </label>
          <label>
            Idioma
            <select
              value={preferences.language}
              disabled={savingPreferences}
              onChange={(event) => savePreferences({ ...preferences, language: event.target.value })}
            >
              <option value="es-MX">Español (México)</option>
              <option value="en">English</option>
            </select>
          </label>
          <label>
            Apariencia
            <select
              value={preferences.appearance}
              disabled={savingPreferences}
              onChange={(event) => savePreferences({ ...preferences, appearance: event.target.value })}
            >
              <option value="system">Según el sistema</option>
              <option value="dark">Oscura</option>
            </select>
          </label>
        </div>
      </section>

      <section className="k-surface k-settings-section k-feed-preferences-settings">
        <p className="k-eyebrow">TU FEED</p>
        <h2>Configura tu inicio</h2>
        <p className="k-muted">Elige si quieres ver lo más reciente, solo a quienes sigues o publicaciones relacionadas con tus intereses. Cada publicación puede explicar por qué aparece.</p>
        <div className="k-feed-preference-mode">
          <label>
            Modo del feed
            <select
              value={preferences.feed.mode}
              disabled={savingPreferences}
              onChange={(event) => savePreferences({ ...preferences, feed: { ...preferences.feed, mode: event.target.value } })}
            >
              <option value="latest">Más reciente · cronológico</option>
              <option value="following">Siguiendo · personas que sigues</option>
              <option value="interests">Intereses · temas que elegiste</option>
            </select>
          </label>
        </div>
        <form className="k-feed-interests-form" onSubmit={saveFeedInterests}>
          <label>
            Tus intereses
            <input value={interestInput} onChange={(event) => setInterestInput(event.target.value)} maxLength={900} placeholder="arte, diseño, música, tecnología" aria-label="Intereses del feed" />
            <small className="k-muted">Separa temas con comas. También puedes escribirlos con #.</small>
          </label>
          <button className="k-button k-button-primary" type="submit" disabled={savingPreferences}>Guardar intereses</button>
        </form>
        {preferences.feed.interests.length > 0 && <div className="k-interest-chips" aria-label="Intereses guardados">{preferences.feed.interests.map((interest) => <span key={interest}>#{interest}</span>)}</div>}
        <Link className="k-button k-button-ghost" to="/home">Ver mi feed</Link>
      </section>

      <section className="k-surface k-settings-section k-ai-personality-settings">
        <p className="k-eyebrow">KAIROS AI</p>
        <h2>Personalidad de la IA</h2>
        <p className="k-muted">El tono se conserva en tus conversaciones y traducciones. No cambia la precisión ni la seguridad.</p>
        <div className="k-personality-grid" role="radiogroup" aria-label="Personalidad de Kairos AI">
          {AI_PERSONALITIES.map((personality) => (
            <label
              className={`k-personality-option ${preferences.aiPersonality === personality.id ? "is-selected" : ""}`}
              key={personality.id}
            >
              <input
                type="radio"
                name="ai-personality"
                value={personality.id}
                checked={preferences.aiPersonality === personality.id}
                disabled={savingPreferences}
                onChange={() => savePreferences({ ...preferences, aiPersonality: personality.id })}
              />
              <span>
                <strong>{personality.name}</strong>
                <small>{personality.description}</small>
              </span>
            </label>
          ))}
        </div>
      </section>

      <section className="k-surface k-settings-section">
        <p className="k-eyebrow">SEGURIDAD</p>
        <h2>Sesiones y dispositivos</h2>
        <p className="k-muted">Cierra dispositivos que no reconozcas. Al revocar una sesión, su access token también deja de funcionar.</p>
        <div className="k-session-list">
          {sessions.length === 0 ? (
            <p className="k-muted">No hay sesiones activas registradas.</p>
          ) : (
            sessions.map((session) => (
              <article className="k-session-item" key={session.id}>
                <div>
                  <strong>{session.current ? "Este dispositivo" : "Dispositivo"}</strong>
                  <p>{sessionName(session)}</p>
                  <small className="k-muted">
                    {session.ipHint ? `${session.ipHint} · ` : ""}
                    Vence {session.expiresAt ? new Date(session.expiresAt).toLocaleDateString("es-MX") : "próximamente"}
                  </small>
                </div>
                <button
                  className="k-button k-button-ghost"
                  type="button"
                  onClick={() => closeSession(session)}
                  disabled={Boolean(busySession)}
                >
                  {busySession === session.id ? "Cerrando..." : "Cerrar"}
                </button>
              </article>
            ))
          )}
        </div>
        {sessions.some((session) => !session.current) && (
          <button
            className="k-button k-button-secondary"
            type="button"
            onClick={closeOtherSessions}
            disabled={Boolean(busySession)}
          >
            {busySession === "others" ? "Cerrando..." : "Cerrar las demás"}
          </button>
        )}
      </section>

      <section className="k-surface k-settings-section">
        <p className="k-eyebrow">PORTABILIDAD</p>
        <h2>Tus datos</h2>
        <p className="k-muted">
          Descarga todo lo que has creado: publicaciones, comentarios, reacciones,
          órbitas, círculos y perfil en un archivo estructurado JSON.
        </p>
        <div style={{ marginTop: 12 }}>
          <button
            className="k-button k-button-secondary"
            type="button"
            onClick={handleExportData}
            disabled={exporting}
          >
            {exporting ? "Preparando tu archivo..." : "Descargar mis datos"}
          </button>
        </div>
      </section>

      <section className="k-surface k-settings-section">
        <p className="k-eyebrow">SESIÓN</p>
        <h2>Cerrar sesión</h2>
        <p className="k-muted">Cierra este dispositivo de forma segura.</p>
        <button className="k-button k-button-danger" type="button" onClick={onLogout}>
          Cerrar sesión
        </button>
      </section>
    </section>
  );
}
