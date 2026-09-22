import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  createScriptProject,
  deleteScript,
  generateScript,
  getScriptHistory,
  updateScript
} from "../../services/aiService";
import {
  SCRIPT_FORMATS,
  SCRIPT_GENRES,
  SCRIPT_TYPES,
  scriptSchema,
} from "../../schemas";
import { useConfirm } from "../../components/feedback/ConfirmProvider";

const TYPES = SCRIPT_TYPES;
const GENRES = SCRIPT_GENRES;
const FORMATS = SCRIPT_FORMATS;

export default function ScriptGenerator() {
  const confirm = useConfirm();
  const location = useLocation();
  const [script, setScript] = useState(null);
  const [structure, setStructure] = useState(null);
  const [history, setHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  // RHF + Zod con el contrato del backend: enums de tipo/género/formato,
  // duración entera 1-180, tono ≤100, audiencia ≤200, prompt obligatorio.
  const {
    register,
    handleSubmit,
    reset: resetScriptForm,
    setValue,
    getValues,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(scriptSchema),
    defaultValues: {
      prompt: "",
      type: "video",
      genre: "general",
      format: "standard",
      tone: "",
      audience: "",
      durationMinutes: 5,
    },
  });

  async function loadHistory() {
    setHistoryLoading(true);
    setHistoryError("");
    try {
      const data = await getScriptHistory();
      setHistory(Array.isArray(data?.scripts) ? data.scripts : []);
    } catch (error) {
      const message = error.response?.data?.error || "No se pudo cargar el historial de scripts.";
      setHistoryError(message);
      setMessage(message);
    } finally {
      setHistoryLoading(false);
    }
  }

  useEffect(() => { loadHistory(); }, []);
  useEffect(() => {
    const reuseState = location.state || {};
    if (reuseState.reusePrompt) setValue("prompt", reuseState.reusePrompt);
    if (TYPES.includes(reuseState.reuseType)) setValue("type", reuseState.reuseType);
    if (GENRES.includes(reuseState.reuseGenre)) setValue("genre", reuseState.reuseGenre);
    if (FORMATS.includes(reuseState.reuseFormat)) setValue("format", reuseState.reuseFormat);
    if (Number.isInteger(reuseState.reuseDurationMinutes)) setValue("durationMinutes", reuseState.reuseDurationMinutes);
    if (Object.prototype.hasOwnProperty.call(reuseState, "reuseTone")) setValue("tone", reuseState.reuseTone || "");
    if (Object.prototype.hasOwnProperty.call(reuseState, "reuseAudience")) setValue("audience", reuseState.reuseAudience || "");
  }, [location.state, setValue]);

  function formValuesFromScript(item) {
    return {
      prompt: item.prompt || "",
      type: TYPES.includes(item.type) ? item.type : "custom",
      genre: GENRES.includes(item.genre) ? item.genre : "general",
      format: FORMATS.includes(item.format) ? item.format : "standard",
      tone: item.tone || "",
      audience: item.audience || "",
      durationMinutes: item.durationMinutes || 5,
    };
  }

  function selectScript(item) {
    setScript(item);
    setStructure(item.structure || null);
    resetScriptForm(formValuesFromScript(item));
  }

  function reuseScript(item) {
    setScript(null);
    setStructure(null);
    resetScriptForm(formValuesFromScript(item));
    setMessage("Parámetros del script reutilizados.");
  }

  function scrollToComposer() {
    if (window.navigator?.userAgent?.includes("jsdom")) return;
    try {
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch {
      // Algunos entornos no implementan el scroll del navegador.
    }
  }

  const generate = handleSubmit(async (data) => {
    if (loading) return;
    setLoading(true);
    setMessage("");

    try {
      const result = await generateScript({
        prompt: data.prompt.trim(),
        type: data.type,
        genre: data.genre,
        format: data.format,
        durationMinutes: Number(data.durationMinutes),
        tone: data.tone,
        audience: data.audience
      });
      if (!result?.script?.result || !result.script.structure) throw new Error("SCRIPT_INVALID_RESPONSE");
      selectScript(result.script);
      setMessage("Script generado correctamente.");
      await loadHistory();
    } catch (error) {
      setMessage(error.response?.data?.error || "Error generando script.");
    } finally {
      setLoading(false);
    }
  });

  async function copyResult() {
    if (!script?.result) return;
    try {
      if (!navigator.clipboard?.writeText) throw new Error("CLIPBOARD_UNAVAILABLE");
      await navigator.clipboard.writeText(script.result);
      setMessage("Script copiado al portapapeles.");
    } catch {
      setMessage("No se pudo copiar el script. Selecciona el texto manualmente.");
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
      const formValues = getValues();
      const project = await createScriptProject({
        sourceScript: script._id,
        title: structure.title,
        type: formValues.type,
        genre: formValues.genre,
        format: formValues.format,
        durationMinutes: Number(formValues.durationMinutes),
        tone: formValues.tone,
        audience: formValues.audience,
        structure
      });
      setMessage(`Proyecto “${project.title}” guardado.`);
    } catch (error) {
      setMessage(error.response?.data?.error || "No se pudo guardar el proyecto.");
    } finally {
      setSaving(false);
    }
  }

  async function removeHistory(item) {
    if (!item?._id || loading || saving) return;
    const ok = await confirm({
      title: "Eliminar guion",
      message: "¿Deseas eliminar este guion del historial?",
      confirmText: "Eliminar",
      danger: true
    });
    if (!ok) return;
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
      <header className="k-page-header"><div><h1>Generar y editar guion</h1><p>Da forma a una idea con estructura, tono y audiencia definidos.</p></div><Link className="k-button k-button-ghost" to="/kairos">Volver a Kairos</Link></header>
      <form className="k-ai-form k-surface" onSubmit={generate} noValidate>
        <label>Tipo<select {...register("type")}>{TYPES.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
        <label>Género<select {...register("genre")}>{GENRES.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
        <label>Formato<select {...register("format")}>{FORMATS.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
        <label>Duración en minutos<input type="number" min="1" max="180" {...register("durationMinutes")} /></label>
        {errors.durationMinutes && <p className="k-field-error" role="alert">{errors.durationMinutes.message}</p>}
        <label>Tono<input placeholder="Directo, cinematográfico..." {...register("tone")} /></label>
        {errors.tone && <p className="k-field-error" role="alert">{errors.tone.message}</p>}
        <label>Audiencia<input placeholder="Para quién es" {...register("audience")} /></label>
        {errors.audience && <p className="k-field-error" role="alert">{errors.audience.message}</p>}
        <label>Prompt<textarea placeholder="Escribe la idea central..." {...register("prompt")} /></label>
        {errors.prompt && <p className="k-field-error" role="alert">{errors.prompt.message}</p>}
        <button className="k-button k-button-ai" type="submit" disabled={loading}>{loading ? "KAIROS procesando..." : "Generar script"}</button>
      </form>
      {message && <p className="k-state" role="status">{message}</p>}

      {script && structure && (
        <section className="k-ai-result k-card-ai k-script-result" aria-label="Editor de guion">
          <div className="k-section-heading"><h2>Editor de guion</h2><div className="k-button-group"><button className="k-button k-button-secondary" type="button" onClick={copyResult}>Copiar</button><button className="k-button k-button-secondary" type="button" onClick={saveEditor} disabled={saving}>{saving ? "Guardando..." : "Guardar edición"}</button><button className="k-button k-button-primary" type="button" onClick={saveProject} disabled={saving}>Guardar proyecto</button></div></div>
          <label>Título<input value={structure.title || ""} onChange={(event) => setStructure((current) => ({ ...current, title: event.target.value }))} maxLength={200} /></label>
          <label>Logline / premisa<textarea value={structure.logline || ""} onChange={(event) => setStructure((current) => ({ ...current, logline: event.target.value }))} /></label>
          <label>Narrativa: inicio<textarea value={structure.narrative?.beginning || ""} onChange={(event) => setStructure((current) => ({ ...current, narrative: { ...current.narrative, beginning: event.target.value } }))} /></label>
          <label>Narrativa: desarrollo<textarea value={structure.narrative?.middle || ""} onChange={(event) => setStructure((current) => ({ ...current, narrative: { ...current.narrative, middle: event.target.value } }))} /></label>
          <label>Narrativa: cierre<textarea value={structure.narrative?.ending || ""} onChange={(event) => setStructure((current) => ({ ...current, narrative: { ...current.narrative, ending: event.target.value } }))} /></label>
          <label>Cierre final<textarea value={structure.closing || ""} onChange={(event) => setStructure((current) => ({ ...current, closing: event.target.value }))} /></label>
          <pre>{script.result}</pre>
        </section>
      )}

      <section className="k-history" aria-label="Historial de scripts">
        <div className="k-section-heading">
          <div><h2>Historial de scripts</h2><span className="k-muted">{history.length} generaciones</span></div>
          <button className="k-button k-button-secondary" type="button" onClick={loadHistory} disabled={historyLoading}>
            {historyLoading ? "Cargando..." : "Actualizar"}
          </button>
        </div>
        {historyError && (
          <div className="k-state k-state-error" role="alert">
            <p>{historyError}</p>
            <button className="k-button k-button-secondary" type="button" onClick={loadHistory} disabled={historyLoading}>
              Reintentar
            </button>
          </div>
        )}
        {historyLoading ? (
          <p className="k-feed-state">Cargando historial de scripts...</p>
        ) : !historyError && history.length === 0 ? (
          <p className="k-empty-state">Todavía no tienes scripts generados.</p>
        ) : history.length > 0 ? (
          history.map((item) => (
            <article className="k-history-row k-surface" key={item._id}>
              <button type="button" onClick={() => selectScript(item)}><strong>{item.type}</strong><span>{item.prompt}</span></button>
              <div className="k-button-group">
                <button className="k-button k-button-secondary" type="button" onClick={() => { reuseScript(item); scrollToComposer(); }}>Reutilizar</button>
                <button className="k-button k-button-ghost" type="button" onClick={() => removeHistory(item)} disabled={saving}>Eliminar</button>
              </div>
            </article>
          ))
        ) : null}
      </section>
    </section>
  );
}
