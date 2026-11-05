import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { getSessions, requestEmailVerification, revokeOtherSessions, revokeSession } from "../../services/authService";
import { changePassword, getMe, updatePreferences } from "../../services/usersService";
import { applyTheme, setThemePreference } from "../../lib/themePreference";
import { downloadDataExport, getExportStatus, requestDataExport } from "../../services/exportService";
import { useConfirm } from "../../components/feedback/ConfirmProvider";
import { pushSupported, pushPermission, pedirPermisoPush } from "../../lib/pushNotifications";

import ProfilePrivacy from "./ProfilePrivacy";
import DeleteAccount from "./DeleteAccount";

// Grupos de silencio. Deben coincidir con `MUTABLE_GROUPS` del servidor
// (`server/src/modules/notifications/notificationGroups.js`).
const MUTE_GROUPS = [
  { id: "comments", label: "Comentarios" },
  { id: "saves", label: "Guardados" },
  { id: "stories", label: "Historias" },
  { id: "*", label: "Seguidores, reacciones y republicaciones" }
];

const DEFAULT_PREFERENCES = {
  notifications: { inApp: true, email: false, muted: {} },
  content: { showSensitive: false },
  appearance: "dark",
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
    notifications: {
      ...DEFAULT_PREFERENCES.notifications,
      ...value?.notifications,
      muted: { ...(value?.notifications?.muted || {}) }
    },
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
  const { hash } = useLocation();
  const [privacyOpen, setPrivacyOpen] = useState(hash === "#privacy");
  useEffect(() => { if (hash === "#privacy") setPrivacyOpen(true); }, [hash]);
  const [user, setUser] = useState(null);
  const [preferences, setPreferences] = useState(DEFAULT_PREFERENCES);
  const [interestInput, setInterestInput] = useState("");
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [savingPreferences, setSavingPreferences] = useState(false);
  // Permiso de avisos del navegador (bloque 1.6). Se lee al montar porque el
  // usuario puede haberlo cambiado desde los ajustes del propio navegador.
  const [permisoAvisos, setPermisoAvisos] = useState(() => (typeof window === "undefined" ? "default" : pushPermission()));
  const [busySession, setBusySession] = useState("");
  const [requestingVerification, setRequestingVerification] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [passwordForm, setPasswordForm] = useState({ current: "", next: "", confirm: "" });
  const [passwordState, setPasswordState] = useState({ saving: false, error: "", done: false });
  const hasPassword = Boolean(user?.hasPassword);

  async function handleExportData() {
    if (exporting) return;
    setExporting(true);
    setError("");
    setMessage("");
    try {
      // La ventana de exportación dura 7 días desde que se solicita, y el
      // servidor permite descargar durante toda ella. Solicitarla de nuevo
      // dentro de la ventana responde 429, así que se consulta el estado
      // primero: si ya se puede descargar, se descarga directamente.
      //
      // Sin esto, un segundo clic —o un primero cuya descarga falló por red—
      // moría en el 429 de /request y nunca llegaba a /download, que habría
      // funcionado. El usuario quedaba bloqueado una semana con el archivo ya
      // disponible.
      const estado = await getExportStatus();
      if (!estado?.canDownload) {
        await requestDataExport();
      }
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
      // El perfil manda: si trae `appearance`, esa es la preferencia real.
      if (profile?.preferences?.appearance) {
        const remote = profile.preferences.appearance;
        setThemePreference(remote);
      }
    } catch (requestError) {
      setError(requestError.response?.data?.error || "No se pudo cargar la configuración.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  // Con `system` el tema tiene que seguir al dispositivo en vivo, no solo al
  // cargar: cambiar de claro a oscuro en el sistema se nota al instante.
  useEffect(() => {
    if (preferences.appearance !== "system" || typeof window.matchMedia !== "function") return undefined;
    const media = window.matchMedia("(prefers-color-scheme: light)");
    const onChange = () => applyTheme("system");
    media.addEventListener?.("change", onChange);
    return () => media.removeEventListener?.("change", onChange);
  }, [preferences.appearance]);

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

  /**
   * Apariencia. Se aplica al instante (sin esperar al servidor) y se guarda en
   * el perfil; si el guardado falla se revierte, para que la pantalla nunca
   * prometa un tema que no quedó guardado.
   */
  async function changeAppearance(next) {
    const previous = preferences.appearance;
    setThemePreference(next);
    setPreferences((current) => ({ ...current, appearance: next }));
    try {
      const saved = await updatePreferences({ appearance: next });
      setPreferences((current) => mergePreferences({ ...current, ...saved }));
      setMessage("Apariencia guardada.");
    } catch (requestError) {
      setThemePreference(previous);
      setPreferences((current) => ({ ...current, appearance: previous }));
      setError(requestError.response?.data?.error || "No se pudo guardar la apariencia.");
    }
  }

  async function savePassword(event) {
    event.preventDefault();
    if (passwordState.saving) return;
    setPasswordState({ saving: true, error: "", done: false });
    try {
      const result = await changePassword({
        currentPassword: passwordForm.current,
        newPassword: passwordForm.next,
        confirmPassword: passwordForm.confirm
      });
      setPasswordForm({ current: "", next: "", confirm: "" });
      setPasswordState({ saving: false, error: "", done: true });
      setUser((current) => ({ ...current, hasPassword: true }));
      setMessage(
        result?.revokedSessions
          ? `Contraseña actualizada. Se cerraron ${result.revokedSessions} ${result.revokedSessions === 1 ? "sesión" : "sesiones"} en otros dispositivos.`
          : "Contraseña actualizada."
      );
    } catch (requestError) {
      setPasswordState({
        saving: false,
        error: requestError.response?.data?.error || "No se pudo cambiar la contraseña.",
        done: false
      });
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
          <p>Cuenta, privacidad, publicaciones y seguridad, organizadas en un solo lugar.</p>
        </div>
      </header>

      {error && <p className="k-state k-state-error" role="alert">{error}</p>}
      {message && <p className="k-state k-state-success" role="status">{message}</p>}

      {user && (
        <div className="k-settings-grid">
          <details className="k-surface k-settings-section k-settings-disclosure">
        <summary><span>Cuenta</span><small>{user.displayName || user.username} · Correo y verificación</small></summary>
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
              {user.role === "admin" && (
                <>
                  <Link className="k-button k-button-secondary" to="/admin">
                    Administración
                  </Link>
                  {/* Los catálogos del estudio solo se podían llenar con curl:
                      POST /api/music y POST /api/voices son de administración y
                      no tenían pantalla. */}
                  <Link className="k-button k-button-secondary" to="/admin/catalogos">
                    Catálogos del estudio
                  </Link>
                </>
              )}
            </div>
          </details>


        </div>
      )}

      <details id="privacy" className="k-surface k-settings-section k-settings-disclosure" open={privacyOpen} onToggle={event => setPrivacyOpen(event.currentTarget.open)}>
        <summary><span>Privacidad y datos</span><small>Visibilidad del perfil, audiencias y exportación</small></summary>
        {user && <ProfilePrivacy embedded initialUser={user} />}
        <div className="k-settings-subsection">
          <h3>Audiencia de tus publicaciones</h3>
          <p className="k-muted">La visibilidad se elige en el editor de cada publicación. Ocultar datos del perfil no vuelve privadas tus publicaciones.</p>
          <Link className="k-button k-button-secondary" to="/circles">Gestionar círculos privados</Link>
        </div>
        <div className="k-settings-subsection">
        <h3>Exportar tus datos</h3>
        <p className="k-muted">
          Descarga todo lo que has creado: publicaciones, comentarios, reacciones,
          grupos, círculos y perfil en un archivo estructurado JSON.
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
        </div>

        <form className="k-settings-subsection k-password-form" onSubmit={savePassword}>
          <h3>{hasPassword ? "Cambiar contraseña" : "Crear una contraseña"}</h3>
          <p className="k-muted">
            {hasPassword
              ? "Al cambiarla se cerrarán las demás sesiones abiertas en otros dispositivos."
              : "Tu cuenta entró con Google y no tiene contraseña. Créala para poder iniciar sesión sin Google."}
          </p>
          {hasPassword && (
            <label>
              Contraseña actual
              <input
                className="k-input"
                type="password"
                autoComplete="current-password"
                value={passwordForm.current}
                onChange={(event) => setPasswordForm((current) => ({ ...current, current: event.target.value }))}
                disabled={passwordState.saving}
                required
              />
            </label>
          )}
          <label>
            Nueva contraseña
            <input
              className="k-input"
              type="password"
              autoComplete="new-password"
              minLength={8}
              maxLength={128}
              value={passwordForm.next}
              onChange={(event) => setPasswordForm((current) => ({ ...current, next: event.target.value }))}
              disabled={passwordState.saving}
              required
            />
            <small className="k-muted">Mínimo 8 caracteres.</small>
          </label>
          <label>
            Repite la nueva contraseña
            <input
              className="k-input"
              type="password"
              autoComplete="new-password"
              minLength={8}
              maxLength={128}
              value={passwordForm.confirm}
              onChange={(event) => setPasswordForm((current) => ({ ...current, confirm: event.target.value }))}
              disabled={passwordState.saving}
              required
            />
          </label>
          {passwordState.error && <p className="k-state k-state-error" role="alert">{passwordState.error}</p>}
          {passwordState.done && <p className="k-state k-state-success" role="status">Contraseña actualizada.</p>}
          <button
            className="k-button k-button-secondary"
            type="submit"
            disabled={passwordState.saving || !passwordForm.next || !passwordForm.confirm || (hasPassword && !passwordForm.current)}
          >
            {passwordState.saving ? "Guardando..." : hasPassword ? "Cambiar contraseña" : "Crear contraseña"}
          </button>
        </form>

        {user && <DeleteAccount user={user} onDeleted={onLogout} />}

        <div className="k-settings-subsection">
          <h3>Documentos del servicio</h3>
          <p className="k-muted">Qué se guarda, cómo se usa y qué se puede pedir.</p>
          <div className="k-auth-utility-row">
            <Link className="k-link-subtle" to="/terminos">Términos</Link>
            <Link className="k-link-subtle" to="/privacidad">Privacidad</Link>
            <Link className="k-link-subtle" to="/cookies">Cookies</Link>
            <Link className="k-link-subtle" to="/estado">Estado del servicio</Link>
          </div>
        </div>
      </details>

      <details className="k-surface k-settings-section k-settings-disclosure">
        <summary><span>Notificaciones y apariencia</span><small>Avisos, idioma y tema</small></summary>
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
              checked={preferences.notifications.email}
              disabled={savingPreferences}
              onChange={(event) => savePreferences({ ...preferences, notifications: { ...preferences.notifications, email: event.target.checked } })}
            />
            <span>
              Avisarme por correo
              <small className="k-muted">Seguidores, reacciones, comentarios y respuestas a tus historias. Los avisos de moderación y las invitaciones se quedan solo dentro de la aplicación.</small>
            </span>
          </label>
          <fieldset className="k-settings-mute" disabled={savingPreferences || !preferences.notifications.inApp}>
            <legend>Silenciar por tipo</legend>
            {MUTE_GROUPS.map((group) => (
              <label key={group.id}>
                <input
                  type="checkbox"
                  checked={Boolean(preferences.notifications.muted?.[group.id])}
                  onChange={(event) => savePreferences({
                    ...preferences,
                    notifications: {
                      ...preferences.notifications,
                      muted: { ...(preferences.notifications.muted || {}), [group.id]: event.target.checked }
                    }
                  })}
                />
                <span>{group.label}</span>
              </label>
            ))}
            <small className="k-muted">Los avisos de moderación y de reportes resueltos no se pueden silenciar: son decisiones sobre tu cuenta y tu contenido.</small>
          </fieldset>
          <fieldset className="k-settings-push">
            <legend>Avisos en este dispositivo</legend>
            <p className="k-muted">
              {permisoAvisos === "granted"
                ? "Este dispositivo puede mostrar avisos de KRONOS-SPACE."
                : permisoAvisos === "denied"
                  ? "El navegador tiene bloqueados los avisos de este sitio. Para activarlos hay que cambiarlo en los ajustes del navegador: la web no puede pedirlo otra vez."
                  : permisoAvisos === "unsupported"
                    ? "Este navegador no admite avisos del sistema."
                    : "El navegador puede mostrarte avisos de mensajes y menciones, aunque tengas la pestaña en segundo plano."}
            </p>
            <button
              type="button"
              className="k-button k-button-secondary"
              disabled={!pushSupported() || permisoAvisos === "granted" || permisoAvisos === "denied"}
              onClick={async () => setPermisoAvisos(await pedirPermisoPush())}
            >
              {permisoAvisos === "granted" ? "Permiso concedido" : "Permitir avisos"}
            </button>
            <small className="k-muted">
              Sin servidor de envío no hay avisos con la pestaña cerrada: estos avisos se muestran
              mientras KRONOS-SPACE está abierto.
            </small>
          </fieldset>
          <fieldset className="k-settings-appearance">
            <legend>Apariencia</legend>
            <div className="k-appearance-options">
              {[
                { id: "dark", label: "Oscuro", hint: "Tema de marca: negro profundo y cromo." },
                { id: "light", label: "Claro", hint: "Fondo claro para leer de día." },
                { id: "system", label: "Sistema", hint: "Sigue el ajuste de tu dispositivo." }
              ].map((option) => (
                <label key={option.id} className={`k-appearance-option${preferences.appearance === option.id ? " is-selected" : ""}`}>
                  <input
                    type="radio"
                    name="k-appearance"
                    value={option.id}
                    checked={preferences.appearance === option.id}
                    disabled={savingPreferences}
                    onChange={() => changeAppearance(option.id)}
                  />
                  <span>
                    {option.label}
                    <small className="k-muted">{option.hint}</small>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
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
            <small className="k-muted">
              {preferences.language === "en"
                ? "Kairos y el chat responden en inglés. Las pantallas siguen en español: la aplicación todavía no traduce su interfaz."
                : "Kairos y el chat responden en español. Las pantallas están en español; la interfaz todavía no se traduce."}
            </small>
          </label>
        </div>
      </details>

      <details className="k-surface k-settings-section k-feed-preferences-settings k-settings-disclosure">
        <summary><span>Publicaciones e inicio</span><small>Contenido, orden del feed e intereses</small></summary>
        <p className="k-muted">Elige si quieres ver lo más reciente, solo a quienes sigues o publicaciones relacionadas con tus intereses. Cada publicación puede explicar por qué aparece.</p>
        <fieldset className="k-content-choice" disabled={savingPreferences}>
          <legend>Qué quieres ver</legend>
          <label>
            <input type="radio" name="k-content-choice" checked={!preferences.content.showSensitive} onChange={() => savePreferences({ ...preferences, content: { ...preferences.content, showSensitive: false } })} />
            <span>
              <span aria-hidden="true">🛡️</span> Solo lo que elegí
              <small className="k-muted">Publicaciones, reels y videos de tus temas. Cambias de temas cuando quieras.</small>
            </span>
          </label>
          <label>
            <input type="radio" name="k-content-choice" checked={preferences.content.showSensitive} onChange={() => savePreferences({ ...preferences, content: { ...preferences.content, showSensitive: true } })} />
            <span>
              <span aria-hidden="true">🌐</span> También fuera de mis temas
              <small className="k-muted">Ves más cosas, siempre dentro de las reglas de la comunidad. No incluye contenido sensible.</small>
            </span>
          </label>
          <p className="k-content-choice-note">
            <span aria-hidden="true">⚖️</span>{" "}
            <Link className="k-link-subtle" to="/terminos">Reglas de contenido</Link>
            <span aria-hidden="true"> · </span>
            <Link className="k-link-subtle" to="/ayuda">Cómo funciona</Link>
          </p>
        </fieldset>
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
      </details>

      <details className="k-surface k-settings-section k-ai-personality-settings k-settings-disclosure">
        <summary><span>Asistente de IA</span><small>Personalidad y tono de las respuestas</small></summary>
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
      </details>

      <details className="k-surface k-settings-section k-settings-disclosure">
        <summary><span>Seguridad y dispositivos</span><small>Sesiones activas y cierre de accesos</small></summary>
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
      </details>



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
