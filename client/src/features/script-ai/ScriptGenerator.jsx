import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  createScriptProject,
  deleteScript,
  generateScript,
  getScriptHistory,
  updateScript
} from "../../services/aiService";

const TYPES = ["video", "reel", "youtube", "advertisement", "story", "presentation", "custom"];
const GENRES = ["general", "drama", "comedy", "thriller", "horror", "romance", "action", "documentary", "educational"];
const FORMATS = ["standard", "cinematic", "vertical", "documentary", "podcast", "presentation"];

export default function ScriptGenerator() {
  const location = useLocation();
  const [prompt, setPrompt] = useState("");
  const [type, setType] = useState("video");
  const [genre, setGenre] = useState("general");
  const [format, setFormat] = useState("standard");
  const [tone, setTone] = useState("");
  const [audience, setAudience] = useState("");
  const [durationMinutes, setDurationMinutes] = useState(5);
  const [script, setScript] = useState(null);
  const [structure, setStructure] = useState(null);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  async function loadHistory() {
    try {
      const data = await getScriptHistory();
      setHistory(Array.isArray(data?.scripts) ? data.scripts : []);
    } catch (error) {
      setMessage(error.response?.data?.error || "No se pudo cargar el historial de scripts.");
    }
  }

  useEffect(() => { loadHistory(); }, []);
  useEffect(() => {
    if (location.state?.reusePrompt) setPrompt(location.state.reusePrompt);
  }, [location.state]);

  function selectScript(item) {
    setScript(item);
    setStructure(item.structure || null);
    setPrompt(item.prompt || "");
    setType(item.type || "custom");
    setGenre(item.genre || "general");
    setFormat(item.format || "standard");
    setTone(item.tone || "");
    setAudience(item.audience || "");
    setDurationMinutes(item.durationMinutes || 5);
  }

  async function generate(event) {
    event.preventDefault();
    if (!prompt.trim() || loading) return;
    setLoading(true);
    setMessage("");

    try {
      const data = await generateScript({
        prompt: prompt.trim(), type, genre, format,
        durationMinutes: Number(durationMinutes), tone, audience
      });
      if (!data?.script?.result || !data.script.structure) throw new Error("SCRIPT_INVALID_RESPONSE");
      selectScript(data.script);
      setMessage("Script generado correctamente.");
      await loadHistory();
    } catch (error) {
      setMessage(error.response?.data?.error || "Error generando script.");
    } finally {
      setLoading(false);
    }
  }

  async function saveEditor() {
    if (!script?._id || !structure || saving) return;
    setSaving(true);
    setMessage("");
    try {
      const updated = await updateScript(script._id, structure);
      setScript(updated);
      setStructure(updated.structure);
      setHistory((current) => current.map((item) => item._id === updated._id ? updated : item));
      setMessage("Edición del guion guardada.");
    } catch (error) {
      setMessage(error.response?.data?.error || "No se pudo guardar la edición. Revisa los campos del guion.");
    } finally {
      setSaving(false);
    }
  }

  async function saveProject() {
    if (!script?._id || !structure || saving) return;
    setSaving(true);
    setMessage("");
    try {
      const project = await createScriptProject({
        sourceScript: script._id,
        title: structure.title,
        type, genre, format,
        durationMinutes: Number(durationMinutes), tone, audience, structure
      });
      setMessage(`Proyecto “${project.title}” guardado.`);
    } catch (error) {
      setMessage(error.response?.data?.error || "No se pudo guardar el proyecto.");
    } finally {
      setSaving(false);
    }
  }

  async function removeHistory(item) {
    if (!item?._id || loading || saving || !window.confirm("¿Eliminar este guion del historial?")) return;
    setSaving(true);
    try {
      await deleteScript(item._id);
      setHistory((current) => current.filter((entry) => entry._id !== item._id));
      if (script?._id === item._id) { setScript(null); setStructure(null); }
      setMessage("Guion eliminado del historial.");
    } catch (error) {
      setMessage(error.response?.data?.error || "No se pudo eliminar el guion.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="page k-kairos-tool-page">
      <header className="k-page-header"><div><p className="k-eyebrow">KAIROS / SCRIPT ENGINE</p><h1>Generar y editar guion</h1><p>Da forma a una idea con estructura, tono y audiencia definidos.</p></div><Link className="k-button k-button-ghost" to="/kairos">Volver a Kairos</Link></header>
      <form className="k-ai-form k-surface" onSubmit={generate}>
        <label>Tipo<select value={type} onChange={(event) => setType(event.target.value)}>{TYPES.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
        <label>Género<select value={genre} onChange={(event) => setGenre(event.target.value)}>{GENRES.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
        <label>Formato<select value={format} onChange={(event) => setFormat(event.target.value)}>{FORMATS.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
        <label>Duración en minutos<input type="number" min="1" max="180" value={durationMinutes} onChange={(event) => setDurationMinutes(event.target.value)} /></label>
        <label>Tono<input value={tone} onChange={(event) => setTone(event.target.value)} maxLength={100} placeholder="Directo, cinematográfico..." /></label>
        <label>Audiencia<input value={audience} onChange={(event) => setAudience(event.target.value)} maxLength={200} placeholder="Para quién es" /></label>
        <label>Prompt<textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} maxLength={10000} placeholder="Escribe la idea central..." required /></label>
        <button className="k-button k-button-ai" type="submit" disabled={loading}>{loading ? "KAIROS procesando..." : "Generar script"}</button>
      </form>
      {message && <p className="k-state" role="status">{message}</p>}

      {script && structure && (
        <section className="k-ai-result k-card-ai k-script-result" aria-label="Editor de guion">
          <div className="k-section-heading"><h2>Editor de guion</h2><div className="k-button-group"><button className="k-button k-button-secondary" type="button" onClick={() => navigator.clipboard.writeText(script.result || "")}>Copiar</button><button className="k-button k-button-secondary" type="button" onClick={saveEditor} disabled={saving}>{saving ? "Guardando..." : "Guardar edición"}</button><button className="k-button k-button-primary" type="button" onClick={saveProject} disabled={saving}>Guardar proyecto</button></div></div>
          <label>Título<input value={structure.title || ""} onChange={(event) => setStructure((current) => ({ ...current, title: event.target.value }))} maxLength={200} /></label>
          <label>Premisa<textarea value={structure.logline || ""} onChange={(event) => setStructure((current) => ({ ...current, logline: event.target.value }))} /></label>
          <pre>{script.result}</pre>
        </section>
      )}

      <section className="k-history"><div className="k-section-heading"><h2>Historial de scripts</h2><span className="k-muted">{history.length} generaciones</span></div>{history.map((item) => <article className="k-history-row k-surface" key={item._id}><button type="button" onClick={() => selectScript(item)}><strong>{item.type}</strong><span>{item.prompt}</span></button><div className="k-button-group"><button className="k-button k-button-secondary" type="button" onClick={() => { setPrompt(item.prompt || ""); window.scrollTo({ top: 0, behavior: "smooth" }); }}>Reutilizar</button><button className="k-button k-button-ghost" type="button" onClick={() => removeHistory(item)} disabled={saving}>Eliminar</button></div></article>)}</section>
    </section>
  );
}
