import { useEffect, useState } from "react";
import { getMe, updateProfilePrivacy } from "../../services/usersService";
import { getUser, updateUser } from "../../services/authStorage";

const options = [
  { key: "showBio", label: "Mostrar mi biografía", description: "Otros usuarios podrán leerla al visitar tu perfil." },
  { key: "showFollowCounts", label: "Mostrar mis contadores de seguidores", description: "Muestra cuántas personas te siguen y a cuántas sigues. Tú siempre podrás ver tus contadores." },
  { key: "discoverable", label: "Aparecer en la búsqueda de usuarios", description: "Si lo desactivas, seguirán funcionando tu enlace de perfil y tus publicaciones." }
];
const normalize = value => Object.fromEntries(options.map(({ key }) => [key, value?.[key] !== false]));

export default function ProfilePrivacy() {
  const [privacy, setPrivacy] = useState(null);
  const [saved, setSaved] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true); setError("");
    getMe().then(user => {
      if (!active) return;
      const settings = normalize(user.profilePrivacy);
      setPrivacy(settings); setSaved(settings);
    }).catch(() => { if (active) setError("No se pudieron cargar tus opciones de privacidad."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [attempt]);

  async function save(event) {
    event.preventDefault();
    if (!privacy || saving) return;
    setSaving(true); setError(""); setMessage("");
    try {
      const result = normalize(await updateProfilePrivacy(privacy));
      setPrivacy(result); setSaved(result);
      updateUser({ ...getUser(), profilePrivacy: result });
      setMessage("Privacidad del perfil guardada.");
    } catch (requestError) {
      setError(requestError.response?.data?.error || "No se pudo guardar. Tus cambios siguen aquí para reintentar.");
    } finally { setSaving(false); }
  }

  return <section id="profile-privacy" className="k-surface" aria-labelledby="privacy-heading" style={{ padding: 20, marginTop: 24 }}>
    <h2 id="privacy-heading">Privacidad del perfil</h2>
    <p className="k-muted">Controla qué información muestras. Estas opciones no hacen privadas tus publicaciones, comentarios ni imágenes. Tus guardados solo los ves tú.</p>
    {loading ? <p role="status">Cargando privacidad…</p> : privacy && <form onSubmit={save} className="k-privacy-options">
      {options.map(option => <label key={option.key} htmlFor={`privacy-${option.key}`}>
        <input id={`privacy-${option.key}`} type="checkbox" checked={privacy[option.key]} disabled={saving}
          onChange={event => { setPrivacy(current => ({ ...current, [option.key]: event.target.checked })); setMessage(""); }} />
        <span>{option.label}<small className="k-muted">{option.description}</small></span>
      </label>)}
      <button type="submit" className="k-button k-button-primary" disabled={saving || JSON.stringify(saved) === JSON.stringify(privacy)}>
        {saving ? "Guardando privacidad…" : "Guardar privacidad"}
      </button>
    </form>}
    {error && <p role="alert" className="k-state k-state-error">{error}</p>}
    {!loading && !privacy && <button type="button" className="k-button k-button-secondary" onClick={() => setAttempt(value => value + 1)}>Reintentar privacidad</button>}
    {message && <p role="status" className="k-state k-state-success">{message}</p>}
  </section>;
}
