import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { generateVideo, getVideoHistory, getVideoJob } from "../../services/aiService";

export default function VideoGenerator() {
  const location = useLocation();
  const [prompt, setPrompt] = useState("");
  const [videoUrl, setVideoUrl] = useState("");
  const [status, setStatus] = useState("");
  const [progress, setProgress] = useState(0);
  const [jobId, setJobId] = useState("");
  const [providerJobId, setProviderJobId] = useState("");
  const [message, setMessage] = useState("");
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);

  async function loadHistory() {
    try {
      const data = await getVideoHistory();
      setHistory(Array.isArray(data?.generations) ? data.generations : []);
    } catch (error) {
      setMessage(error.response?.data?.error || "No se pudo cargar el historial de video.");
    }
  }

  useEffect(() => { loadHistory(); }, []);
  useEffect(() => {
    if (location.state?.reusePrompt) setPrompt(location.state.reusePrompt);
  }, [location.state]);

  useEffect(() => {
    if (!jobId || !providerJobId || !["queued", "processing"].includes(status)) return undefined;
    let active = true;
    const refresh = async () => {
      try {
        const data = await getVideoJob(jobId);
        const generation = data?.generation;
        if (!active || !generation) return;
        setStatus(generation.status || "processing");
        setProviderJobId(generation.providerJobId || "");
        setProgress(Number(generation.progress) || 0);
        if (generation.videoUrl) setVideoUrl(generation.videoUrl);
        if (generation.error) setMessage(generation.error);
      } catch {
        // El historial y la siguiente iteración mantienen el último estado conocido.
      }
    };
    refresh();
    const interval = window.setInterval(refresh, 5000);
    return () => { active = false; window.clearInterval(interval); };
  }, [jobId, providerJobId, status]);

  async function generate(event) {
    event.preventDefault();
    if (!prompt.trim() || loading) return;
    setLoading(true);
    setMessage("");

    try {
      const data = await generateVideo({ prompt: prompt.trim() });
      const generation = data?.generation;
      setJobId(generation?._id || generation?.id || generation?.generationId || "");
      setProviderJobId(generation?.providerJobId || "");
      setStatus(generation?.status || "processing");
      setProgress(Number(generation?.progress) || 0);
      setVideoUrl(generation?.videoUrl || "");
      setMessage(data?.message || "Kairos está procesando tu video.");
      await loadHistory();
    } catch (error) {
      setMessage(error.response?.data?.error || "Error generando video.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="page k-kairos-tool-page">
      <header className="k-page-header">
        <div><p className="k-eyebrow">KAIROS / VIDEO ENGINE</p><h1>Generar video</h1><p>Construye una escena audiovisual desde una dirección creativa.</p></div>
        <div className="k-button-group"><Link className="k-button k-button-ghost" to="/ai/video/jobs">Trabajos</Link><Link className="k-button k-button-ghost" to="/kairos">Volver a Kairos</Link></div>
      </header>
      <form className="k-ai-form k-surface" onSubmit={generate}>
        <label>Prompt<textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} maxLength={4000} placeholder="Una secuencia cinematográfica de acero y lluvia..." required /></label>
        <button className="k-button k-button-ai" type="submit" disabled={loading}>{loading ? "KAIROS procesando..." : "Generar video"}</button>
      </form>
      {status && <p className="k-state" role="status">Estado: <strong>{status}</strong>{["queued", "processing"].includes(status) ? ` · ${progress}%` : ""}</p>}
      {message && <p className="k-state" role="status">{message}</p>}
      {videoUrl && <div className="k-ai-result k-card-ai"><video src={videoUrl} controls playsInline /></div>}
      <section className="k-history"><div className="k-section-heading"><h2>Historial de video</h2><span className="k-muted">{history.length} generaciones</span></div>{history.map((item) => <article className="k-surface k-history-row" key={item._id}><strong>{item.status}</strong><span>{item.prompt}</span>{item.videoUrl ? <button className="k-button k-button-secondary" type="button" onClick={() => { setVideoUrl(item.videoUrl); setStatus(item.status); }}>Ver video</button> : <Link className="k-button k-button-secondary" to="/ai/video/jobs">Ver estado</Link>}</article>)}</section>
    </section>
  );
}
