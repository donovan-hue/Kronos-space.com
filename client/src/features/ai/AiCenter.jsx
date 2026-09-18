import { useEffect, useMemo, useRef, useState } from "react";
import { FileText, Image as ImageIcon, RefreshCw, RotateCcw, Send, Sparkles, Trash2, Video } from "lucide-react";
import {
  createScriptProject,
  deleteImageGeneration,
  deleteScript,
  deleteVideoGeneration,
  generateImage,
  generateScript,
  generateVideo,
  getImageHistory,
  getScriptHistory,
  getVideoHistory,
  getVideoStatus,
  updateScript
} from "../../services/aiService";
import { createPost } from "../../services/postsService";

const TABS = [
  ["image", "Imagen", ImageIcon],
  ["video", "Video", Video],
  ["script", "Guion", FileText],
  ["history", "Historial", RefreshCw]
];

const INITIAL_SCRIPT = {
  prompt: "",
  type: "custom",
  genre: "general",
  format: "standard",
  durationMinutes: 5,
  tone: "",
  audience: ""
};

function apiError(error, fallback) {
  return error?.response?.data?.error || error?.message || fallback;
}

function generationId(item) {
  return String(item?._id || item?.id || item?.generationId || "");
}

function date(value) {
  if (!value) return "";
  return new Date(value).toLocaleString("es-MX", { dateStyle: "medium", timeStyle: "short" });
}

function statusLabel(status) {
  return { queued: "En cola", processing: "Procesando", completed: "Completado", failed: "Fallido" }[status] || status || "Sin estado";
}

function cloneStructure(value) {
  return value ? JSON.parse(JSON.stringify(value)) : null;
}

function updateStructure(structure, path, value) {
  const next = cloneStructure(structure);
  if (!next) return next;
  let target = next;
  path.slice(0, -1).forEach((key) => { target = target[key]; });
  target[path[path.length - 1]] = value;
  return next;
}

function MediaHistoryCard({ item, kind, onReuse, onDelete, onPublish }) {
  const url = item.imageUrl || item.videoUrl || item.url || "";
  const label = kind === "image" ? "Imagen" : "Video";
  return (
    <article className="k-ai-history-card">
      <div className="k-ai-history-preview">
        {kind === "image" && url ? <img src={url} alt={item.prompt || "Imagen generada"} /> : kind === "video" && url ? <video controls preload="metadata"><source src={url} /></video> : <span>{statusLabel(item.status)}</span>}
      </div>
      <div className="k-ai-history-copy">
        <strong>{label} · {statusLabel(item.status)}</strong>
        <p>{item.prompt}</p>
        <small>{date(item.createdAt)}</small>
      </div>
      <div className="k-ai-history-actions">
        <button className="k-button k-button-ghost" type="button" onClick={() => onReuse(item)}><RotateCcw size={15} /> Reutilizar</button>
        {url && <button className="k-button k-button-ghost" type="button" onClick={() => onPublish(item)}><Send size={15} /> Publicar</button>}
        <button className="k-button k-button-ghost" type="button" onClick={() => onDelete(item)} aria-label={`Eliminar ${label.toLowerCase()}`}><Trash2 size={15} /></button>
      </div>
    </article>
  );
}

export default function AiCenter() {
  const [tab, setTab] = useState("image");
  const [imageControls, setImageControls] = useState({ prompt: "", negativePrompt: "", style: "" });
  const [videoControls, setVideoControls] = useState({ prompt: "", negativePrompt: "", style: "" });
  const [scriptForm, setScriptForm] = useState(INITIAL_SCRIPT);
  const [imageResult, setImageResult] = useState(null);
  const [videoResult, setVideoResult] = useState(null);
  const [scriptResult, setScriptResult] = useState(null);
  const [imageHistory, setImageHistory] = useState([]);
  const [videoHistory, setVideoHistory] = useState([]);
  const [scriptHistory, setScriptHistory] = useState([]);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const pollAttempts = useRef(0);

  async function loadHistory() {
    try {
      const [images, videos, scripts] = await Promise.all([getImageHistory(), getVideoHistory(), getScriptHistory()]);
      setImageHistory(images?.generations || []);
      setVideoHistory(videos?.generations || []);
      setScriptHistory(scripts?.scripts || []);
    } catch (requestError) {
      setError(apiError(requestError, "No se pudo cargar el historial de Kairos."));
    }
  }

  useEffect(() => { loadHistory(); }, []);

  useEffect(() => {
    const id = generationId(videoResult?.generation);
    if (!id || !["queued", "processing"].includes(videoResult?.generation?.status) || !videoResult?.generation?.providerJobId) return undefined;
    pollAttempts.current = 0;
    const timer = window.setInterval(async () => {
      pollAttempts.current += 1;
      if (pollAttempts.current > 30) {
        window.clearInterval(timer);
        setError("El video sigue en proceso. Puedes volver a consultar desde el historial.");
        return;
      }
      try {
        const response = await getVideoStatus(id);
        setVideoResult({ generation: response.generation });
        if (!["queued", "processing"].includes(response.generation?.status)) window.clearInterval(timer);
      } catch (requestError) {
        window.clearInterval(timer);
        setError(apiError(requestError, "No se pudo consultar el estado del video."));
      }
    }, 5000);
    return () => window.clearInterval(timer);
  }, [videoResult?.generation?._id, videoResult?.generation?.id, videoResult?.generation?.providerJobId]);

  function clearFeedback() { setError(""); setNotice(""); }

  async function handleImage(event) {
    event.preventDefault();
    clearFeedback();
    setBusy("image");
    try {
      const result = await generateImage(imageControls);
      setImageResult(result);
      setImageHistory((current) => [{ ...result, _id: generationId(result), prompt: imageControls.prompt, createdAt: new Date().toISOString() }, ...current.filter((item) => generationId(item) !== generationId(result))]);
      setNotice(result.status === "failed" ? result.message || "El proveedor de imágenes no está configurado." : "Imagen generada.");
    } catch (requestError) { setError(apiError(requestError, "No se pudo generar la imagen.")); }
    finally { setBusy(""); }
  }

  async function handleVideo(event) {
    event.preventDefault();
    clearFeedback();
    setBusy("video");
    try {
      const result = await generateVideo(videoControls);
      setVideoResult(result);
      setVideoHistory((current) => [result.generation, ...current.filter((item) => generationId(item) !== generationId(result.generation))]);
      setNotice(result.message || (result.generation?.status === "completed" ? "Video generado." : "Video en proceso."));
    } catch (requestError) { setError(apiError(requestError, "No se pudo iniciar el video.")); }
    finally { setBusy(""); }
  }

  async function handleScript(event) {
    event.preventDefault();
    clearFeedback();
    setBusy("script");
    try {
      const result = await generateScript(scriptForm);
      setScriptResult(result.script);
      setScriptHistory((current) => [result.script, ...current.filter((item) => generationId(item) !== generationId(result.script))]);
      setNotice("Guion generado. Puedes editarlo antes de guardarlo o publicarlo.");
    } catch (requestError) { setError(apiError(requestError, "No se pudo generar el guion.")); }
    finally { setBusy(""); }
  }

  async function saveScript() {
    if (!scriptResult?.structure) return;
    clearFeedback();
    setBusy("save-script");
    try {
      const result = await updateScript(generationId(scriptResult), scriptResult.structure);
      setScriptResult(result.script);
      setScriptHistory((current) => current.map((item) => generationId(item) === generationId(result.script) ? result.script : item));
      setNotice("Cambios del guion guardados.");
    } catch (requestError) { setError(apiError(requestError, "No se pudo guardar el guion.")); }
    finally { setBusy(""); }
  }

  async function saveProject() {
    if (!scriptResult?.structure) return;
    clearFeedback();
    setBusy("project");
    try {
      await createScriptProject({
        sourceScript: generationId(scriptResult),
        title: scriptResult.structure.title,
        type: scriptResult.type || scriptForm.type,
        genre: scriptResult.genre || scriptForm.genre,
        format: scriptResult.format || scriptForm.format,
        durationMinutes: scriptResult.durationMinutes || scriptForm.durationMinutes,
        tone: scriptResult.tone || scriptForm.tone,
        audience: scriptResult.audience || scriptForm.audience,
        structure: scriptResult.structure
      });
      setNotice("Proyecto guardado en tu espacio de guiones.");
    } catch (requestError) { setError(apiError(requestError, "No se pudo guardar el proyecto.")); }
    finally { setBusy(""); }
  }

  async function removeHistory(kind, item) {
    clearFeedback();
    const id = generationId(item);
    try {
      if (kind === "image") { await deleteImageGeneration(id); setImageHistory((current) => current.filter((entry) => generationId(entry) !== id)); }
      if (kind === "video") { await deleteVideoGeneration(id); setVideoHistory((current) => current.filter((entry) => generationId(entry) !== id)); }
      if (kind === "script") { await deleteScript(id); setScriptHistory((current) => current.filter((entry) => generationId(entry) !== id)); }
      setNotice("Elemento eliminado del historial.");
    } catch (requestError) { setError(apiError(requestError, "No se pudo eliminar el elemento.")); }
  }

  function reuseImage(item) { setImageControls({ prompt: item.prompt || "", negativePrompt: item.negativePrompt || "", style: item.style || "" }); setImageResult(item); setTab("image"); }
  function reuseVideo(item) { setVideoControls({ prompt: item.prompt || "", negativePrompt: item.negativePrompt || "", style: item.style || "" }); setVideoResult({ generation: item }); setTab("video"); }
  function reuseScript(item) { setScriptResult(item); setTab("script"); }

  async function publishMedia(item, kind) {
    const url = item.imageUrl || item.videoUrl || item.url;
    if (!url || (!url.startsWith("/") && !/^https?:\/\//i.test(url))) {
      setError("Este resultado aún no tiene una URL publicable. Espera a que el proveedor lo almacene.");
      return;
    }
    clearFeedback();
    setBusy(`publish-${kind}`);
    try {
      await createPost(`Creado con Kairos · ${item.prompt || "Generación multimedia"}`, { media: { url, type: kind === "video" ? "video" : "image", mimeType: kind === "video" ? "video/mp4" : "image/png", alt: item.prompt || `${kind === "video" ? "Video" : "Imagen"} generado por Kairos` } });
      setNotice("Resultado publicado en tu feed.");
    } catch (requestError) { setError(apiError(requestError, "No se pudo publicar el resultado.")); }
    finally { setBusy(""); }
  }

  async function publishScript(item) {
    clearFeedback();
    setBusy("publish-script");
    try {
      await createPost(`Guion creado con Kairos\n\n${item.result || item.structure?.title || "Guion"}`);
      setNotice("Guion publicado en tu feed.");
    } catch (requestError) { setError(apiError(requestError, "No se pudo publicar el guion.")); }
    finally { setBusy(""); }
  }

  const imageUrl = imageResult?.url || imageResult?.imageUrl;
  const currentVideo = videoResult?.generation;
  const editable = scriptResult?.structure;
  const historyCount = imageHistory.length + videoHistory.length + scriptHistory.length;
  const tabDescription = useMemo(() => ({ image: "Controles creativos para generar imágenes con el proveedor configurado.", video: "Jobs persistentes: el estado se consulta desde backend y no depende del navegador.", script: "Escribe, genera y edita un guion estructurado antes de guardarlo o publicarlo.", history: `${historyCount} elementos persistidos en tu historial.` }[tab]), [tab, historyCount]);

  return (
    <section className="page k-ai-center">
      <header className="k-page-header">
        <div><p className="k-eyebrow">KRONOS / KAIROS</p><h1>Centro creativo</h1><p>{tabDescription}</p></div>
        <Sparkles className="k-ai-mark" size={28} aria-hidden="true" />
      </header>

      <nav className="k-ai-tabs" aria-label="Módulos de Kairos">
        {TABS.map(([value, label, Icon]) => <button key={value} type="button" className={`k-ai-tab ${tab === value ? "is-active" : ""}`} onClick={() => { clearFeedback(); setTab(value); }}><Icon size={17} /> {label}</button>)}
      </nav>

      {error && <p className="k-state k-state-error" role="alert">{error}</p>}
      {notice && <p className="k-state k-state-success" role="status">{notice}</p>}

      {tab === "image" && <section className="k-ai-panel k-ai-image">
        <form onSubmit={handleImage} className="k-ai-form">
          <label>Prompt principal<textarea value={imageControls.prompt} onChange={(event) => setImageControls({ ...imageControls, prompt: event.target.value })} maxLength={4000} required placeholder="Describe la escena, sujeto, luz y composición..." /></label>
          <label>Prompt negativo <input value={imageControls.negativePrompt} onChange={(event) => setImageControls({ ...imageControls, negativePrompt: event.target.value })} maxLength={2000} placeholder="Elementos que quieres evitar" /></label>
          <label>Estilo <input value={imageControls.style} onChange={(event) => setImageControls({ ...imageControls, style: event.target.value })} maxLength={80} placeholder="Cinemático, editorial, analógico..." /></label>
          <button className="k-button k-button-primary" type="submit" disabled={busy === "image"}>{busy === "image" ? "Generando..." : "Generar imagen"}</button>
        </form>
        {imageUrl && <div className="k-ai-result"><img src={imageUrl} alt={imageControls.prompt || "Resultado de Kairos"} /><div className="k-ai-result-actions"><button className="k-button k-button-secondary" type="button" onClick={() => publishMedia(imageResult, "image")} disabled={busy === "publish-image"}><Send size={15} /> Publicar</button><button className="k-button k-button-ghost" type="button" onClick={() => reuseImage(imageResult)}><RotateCcw size={15} /> Reutilizar controles</button></div></div>}
      </section>}

      {tab === "video" && <section className="k-ai-panel k-ai-video">
        <form onSubmit={handleVideo} className="k-ai-form">
          <label>Prompt principal<textarea value={videoControls.prompt} onChange={(event) => setVideoControls({ ...videoControls, prompt: event.target.value })} maxLength={4000} required placeholder="Describe la acción, cámara, ritmo y atmósfera..." /></label>
          <label>Prompt negativo <input value={videoControls.negativePrompt} onChange={(event) => setVideoControls({ ...videoControls, negativePrompt: event.target.value })} maxLength={2000} placeholder="Elementos que quieres evitar" /></label>
          <label>Estilo <input value={videoControls.style} onChange={(event) => setVideoControls({ ...videoControls, style: event.target.value })} maxLength={80} placeholder="Documental, sci-fi, 16mm..." /></label>
          <button className="k-button k-button-primary" type="submit" disabled={busy === "video"}>{busy === "video" ? "Iniciando job..." : "Generar video"}</button>
        </form>
        {currentVideo && <div className="k-ai-job"><div className="k-ai-job-header"><strong>{statusLabel(currentVideo.status)}</strong><span>{currentVideo.progress || 0}%</span></div><div className="k-ai-progress"><span style={{ width: `${currentVideo.progress || 0}%` }} /></div>{currentVideo.videoUrl && <video controls preload="metadata"><source src={currentVideo.videoUrl} /></video>}<p className="k-muted">{currentVideo.status === "queued" || currentVideo.status === "processing" ? "El estado se actualiza con el job real del proveedor." : currentVideo.error || ""}</p></div>}
      </section>}

      {tab === "script" && <section className="k-ai-panel k-ai-script">
        {!scriptResult && <form onSubmit={handleScript} className="k-ai-form">
          <label>Idea o solicitud<textarea value={scriptForm.prompt} onChange={(event) => setScriptForm({ ...scriptForm, prompt: event.target.value })} maxLength={10000} required placeholder="Cuenta la historia que quieres desarrollar..." /></label>
          <div className="k-ai-form-grid"><label>Tipo<select value={scriptForm.type} onChange={(event) => setScriptForm({ ...scriptForm, type: event.target.value })}>{[["custom", "Personalizado"], ["video", "Video"], ["reel", "Reel"], ["youtube", "YouTube"], ["advertisement", "Publicidad"], ["story", "Historia"], ["presentation", "Presentación"]].map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label>Género<select value={scriptForm.genre} onChange={(event) => setScriptForm({ ...scriptForm, genre: event.target.value })}>{["general", "drama", "comedy", "thriller", "horror", "romance", "action", "documentary", "educational"].map((value) => <option key={value} value={value}>{value}</option>)}</select></label><label>Formato<select value={scriptForm.format} onChange={(event) => setScriptForm({ ...scriptForm, format: event.target.value })}>{["standard", "cinematic", "vertical", "documentary", "podcast", "presentation"].map((value) => <option key={value} value={value}>{value}</option>)}</select></label><label>Duración (minutos)<input type="number" min="1" max="180" value={scriptForm.durationMinutes} onChange={(event) => setScriptForm({ ...scriptForm, durationMinutes: Number(event.target.value) })} /></label><label>Tono<input value={scriptForm.tone} maxLength={100} onChange={(event) => setScriptForm({ ...scriptForm, tone: event.target.value })} /></label><label>Audiencia<input value={scriptForm.audience} maxLength={200} onChange={(event) => setScriptForm({ ...scriptForm, audience: event.target.value })} /></label></div>
          <button className="k-button k-button-primary" type="submit" disabled={busy === "script"}>{busy === "script" ? "Generando..." : "Generar guion"}</button>
        </form>}
        {scriptResult && editable && <div className="k-script-editor"><div className="k-script-editor-heading"><div><p className="k-eyebrow">EDITOR DE GUION</p><h2>{editable.title}</h2></div><button className="k-button k-button-ghost" type="button" onClick={() => setScriptResult(null)}>Nuevo guion</button></div><label>Título<input value={editable.title} onChange={(event) => setScriptResult({ ...scriptResult, structure: updateStructure(editable, ["title"], event.target.value) })} /></label><label>Logline<textarea value={editable.logline} onChange={(event) => setScriptResult({ ...scriptResult, structure: updateStructure(editable, ["logline"], event.target.value) })} /></label><div className="k-ai-form-grid">{["beginning", "middle", "ending"].map((key) => <label key={key}>{key === "beginning" ? "Inicio" : key === "middle" ? "Desarrollo" : "Cierre"}<textarea value={editable.narrative[key]} onChange={(event) => setScriptResult({ ...scriptResult, structure: updateStructure(editable, ["narrative", key], event.target.value) })} /></label>)}</div><label>Cierre<textarea value={editable.closing} onChange={(event) => setScriptResult({ ...scriptResult, structure: updateStructure(editable, ["closing"], event.target.value) })} /></label><div className="k-ai-actions"><button className="k-button k-button-primary" type="button" onClick={saveScript} disabled={busy === "save-script"}>{busy === "save-script" ? "Guardando..." : "Guardar cambios"}</button><button className="k-button k-button-secondary" type="button" onClick={saveProject} disabled={busy === "project"}>Guardar proyecto</button><button className="k-button k-button-ghost" type="button" onClick={() => publishScript(scriptResult)} disabled={busy === "publish-script"}><Send size={15} /> Publicar</button></div></div>}
      </section>}

      {tab === "history" && <section className="k-ai-history"><div className="k-section-heading"><h2>Historial de generaciones</h2><button className="k-button k-button-secondary" type="button" onClick={loadHistory}><RefreshCw size={15} /> Actualizar</button></div>{imageHistory.length === 0 && videoHistory.length === 0 && scriptHistory.length === 0 ? <div className="k-empty-state"><h2>Aún no hay generaciones</h2><p>Los resultados confirmados por el backend aparecerán aquí.</p></div> : <div className="k-ai-history-list">{imageHistory.map((item) => <MediaHistoryCard key={`image-${generationId(item)}`} item={item} kind="image" onReuse={reuseImage} onDelete={(entry) => removeHistory("image", entry)} onPublish={(entry) => publishMedia(entry, "image")} />)}{videoHistory.map((item) => <MediaHistoryCard key={`video-${generationId(item)}`} item={item} kind="video" onReuse={reuseVideo} onDelete={(entry) => removeHistory("video", entry)} onPublish={(entry) => publishMedia(entry, "video")} />)}{scriptHistory.map((item) => <article className="k-ai-history-card" key={`script-${generationId(item)}`}><div className="k-ai-history-preview"><FileText size={28} /></div><div className="k-ai-history-copy"><strong>Guion · {statusLabel(item.status)}</strong><p>{item.structure?.title || item.prompt}</p><small>{date(item.createdAt)}</small></div><div className="k-ai-history-actions"><button className="k-button k-button-ghost" type="button" onClick={() => reuseScript(item)}><RotateCcw size={15} /> Reutilizar</button><button className="k-button k-button-ghost" type="button" onClick={() => publishScript(item)}><Send size={15} /> Publicar</button><button className="k-button k-button-ghost" type="button" onClick={() => removeHistory("script", item)} aria-label="Eliminar guion"><Trash2 size={15} /></button></div></article>)}</div>}</section>}
    </section>
  );
}
