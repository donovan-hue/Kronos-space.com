import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { generateVideo, getVideoHistory, getVideoJob } from "../../services/aiService";
import { videoPromptSchema } from "../../schemas";

export default function VideoGenerator() {
  const location = useLocation();
  const [videoUrl, setVideoUrl] = useState("");
  const [status, setStatus] = useState("");
  const [progress, setProgress] = useState(0);
  const [jobId, setJobId] = useState("");
  const [providerJobId, setProviderJobId] = useState("");
  const [message, setMessage] = useState("");
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);

  // RHF + Zod: prompt obligatorio ≤4000 (regla del backend).
  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(videoPromptSchema),
    defaultValues: { prompt: "", negativePrompt: "", style: "" },
  });

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
    const reuseState = location.state || {};
    if (reuseState.reusePrompt) setValue("prompt", reuseState.reusePrompt);
    if (Object.prototype.hasOwnProperty.call(reuseState, "reuseNegativePrompt")) {
      setValue("negativePrompt", reuseState.reuseNegativePrompt || "");
    }
    if (Object.prototype.hasOwnProperty.call(reuseState, "reuseStyle")) {
      setValue("style", reuseState.reuseStyle || "");
    }
  }, [location.state, setValue]);

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

  const generate = handleSubmit(async (data) => {
    if (loading) return;
    setLoading(true);
    setMessage("");

    try {
      const result = await generateVideo({
        prompt: data.prompt.trim(),
        negativePrompt: data.negativePrompt.trim(),
        style: data.style.trim()
      });
      const generation = result?.generation;
      setJobId(generation?._id || generation?.id || generation?.generationId || "");
      setProviderJobId(generation?.providerJobId || "");
      setStatus(generation?.status || "processing");
      setProgress(Number(generation?.progress) || 0);
      setVideoUrl(generation?.videoUrl || "");
      setMessage(result?.message || "Kairos está procesando tu video.");
      await loadHistory();
    } catch (error) {
      setMessage(error.response?.data?.error || "Error generando video.");
    } finally {
      setLoading(false);
    }
  });

  function reuse(item) {
    setValue("prompt", item.prompt || "");
    setValue("negativePrompt", item.negativePrompt || "");
    setValue("style", item.style || "");
    setStatus(item.status || "");
    setProgress(Number(item.progress) || 0);
    if (item.videoUrl) setVideoUrl(item.videoUrl);
    setMessage("Parámetros del video reutilizados.");
  }

  return (
    <section className="page k-kairos-tool-page">
      <header className="k-page-header">
        <div><h1>Generar video</h1><p>Construye una escena audiovisual desde una dirección creativa.</p></div>
        <div className="k-button-group"><Link className="k-button k-button-ghost" to="/kairos/video/jobs">Trabajos</Link><Link className="k-button k-button-ghost" to="/kairos">Volver a Kairos</Link></div>
      </header>
      <form className="k-ai-form k-surface" onSubmit={generate} noValidate>
        <label>Prompt<textarea placeholder="Una secuencia cinematográfica de acero y lluvia..." {...register("prompt")} /></label>
        {errors.prompt && <p className="k-field-error" role="alert">{errors.prompt.message}</p>}
        <label>Negative prompt<textarea placeholder="Elementos que quieres evitar" {...register("negativePrompt")} /></label>
        {errors.negativePrompt && <p className="k-field-error" role="alert">{errors.negativePrompt.message}</p>}
        <label>Estilo visual<input type="text" placeholder="cinematográfico, documental..." {...register("style")} /></label>
        {errors.style && <p className="k-field-error" role="alert">{errors.style.message}</p>}
        <button className="k-button k-button-ai" type="submit" disabled={loading}>{loading ? "KAIROS procesando..." : "Generar video"}</button>
      </form>
      {status && <p className="k-state" role="status">Estado: <strong>{status}</strong>{["queued", "processing"].includes(status) ? ` · ${progress}%` : ""}</p>}
      {message && <p className="k-state" role="status">{message}</p>}
      {videoUrl && <div className="k-ai-result k-card-ai"><video src={videoUrl} controls playsInline /></div>}
      <section className="k-history"><div className="k-section-heading"><h2>Historial de video</h2><span className="k-muted">{history.length} generaciones</span></div>{history.map((item) => <article className="k-surface k-history-row" key={item._id}><strong>{item.status}</strong><span>{item.prompt}</span><button className="k-button k-button-secondary" type="button" onClick={() => reuse(item)}>Reutilizar</button>{item.videoUrl ? <button className="k-button k-button-secondary" type="button" onClick={() => { setVideoUrl(item.videoUrl); setStatus(item.status); }}>Ver video</button> : <Link className="k-button k-button-secondary" to="/kairos/video/jobs">Ver estado</Link>}</article>)}</section>
    </section>
  );
}
