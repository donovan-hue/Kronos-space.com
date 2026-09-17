import ProfilePrivacy from "./ProfilePrivacy";
import { mediaUrl } from "../../services/mediaUrl";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../services/apiClient";
import { uploadAvatar } from "../../services/usersService";

export default function ProfileSettings() {
  const [form, setForm] = useState({ displayName: "", bio: "", avatar: "" });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const fileRef = useRef(null);

  useEffect(() => {
    api.get("/users/me")
      .then(({ data }) => setForm({ displayName: data.displayName || "", bio: data.bio || "", avatar: mediaUrl(data.avatar) }))
      .catch((requestError) => setError(requestError.response?.data?.error || "No se pudo cargar el perfil."))
      .finally(() => setLoading(false));
  }, []);

  function change(event) {
    setForm((current) => ({ ...current, [event.target.name]: event.target.value }));
    setMessage("");
    setError("");
  }

  async function handleFile(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError("");
    setMessage("");
    try {
      const updated = await uploadAvatar(file);
      setForm({ displayName: updated.displayName || "", bio: updated.bio || "", avatar: mediaUrl(updated.avatar) });
      setMessage("Avatar subido correctamente.");
    } catch (e) {
      setError(e.response?.data?.error || e.message || "No se pudo subir el avatar.");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function save(event) {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    setError("");
    try {
      const { data } = await api.patch("/users/me", {
        displayName: form.displayName.trim(),
        bio: form.bio.trim(),
        avatar: form.avatar.trim()
      });
      setForm({ displayName: data.displayName || "", bio: data.bio || "", avatar: mediaUrl(data.avatar) });
      setMessage("Perfil guardado correctamente.");
    } catch (requestError) {
      setError(requestError.response?.data?.error || "No se pudo guardar el perfil.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <section className="page"><div className="k-feed-state"><span className="k-skeleton" /><span className="k-skeleton k-skeleton-wide" /></div></section>;
  return (
    <section className="page">
      <header className="k-page-header">
        <div>
          <p className="k-eyebrow">KRONOS / SETTINGS / PROFILE</p>
          <h1>Editar perfil</h1>
          <p>Actualiza la información que verá tu comunidad.</p>
        </div>
        <Link className="k-button k-button-ghost" to="/settings">Volver a configuración</Link>
      </header>
      <form className="k-ai-form k-surface" onSubmit={save}>
        <label htmlFor="profile-display-name">Nombre visible<input id="profile-display-name" name="displayName" value={form.displayName} onChange={change} maxLength={100} required /></label>
        <label htmlFor="profile-bio">Biografía<textarea id="profile-bio" name="bio" value={form.bio} onChange={change} maxLength={500} /></label>
        <label htmlFor="profile-avatar">URL del avatar<input id="profile-avatar" name="avatar" type="url" value={form.avatar} onChange={change} maxLength={2000} placeholder="https://..." /></label>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={handleFile} disabled={uploading || saving} style={{ display: "none" }} />
          <button type="button" className="k-button k-button-secondary" onClick={() => fileRef.current?.click()} disabled={uploading || saving}>
            {uploading ? "Subiendo..." : "Subir imagen"}
          </button>
          <span className="k-muted" style={{ fontSize: "0.85rem" }}>JPG/PNG/WebP, máx 10 MB</span>
        </div>
        {form.avatar && (
          <div style={{ overflow: "hidden", borderRadius: 12, border: "1px solid var(--k-border)", maxWidth: 240 }}>
            <img src={mediaUrl(form.avatar)} alt="Preview avatar" style={{ width: "100%", display: "block" }} />
          </div>
        )}
        {error && <p className="k-state k-state-error" role="alert">{error}</p>}
        {message && <p className="k-state k-state-success" role="status">{message}</p>}
        <div className="k-button-group" style={{ display: "flex", gap: 12 }}>
          <Link className="k-button k-button-secondary" to="/profile">Cancelar</Link>
          <button className="k-button k-button-primary" type="submit" disabled={saving || uploading}>{saving ? "Guardando..." : "Guardar cambios"}</button>
        </div>
      </form>
      <ProfilePrivacy />
    </section>
  );
}
