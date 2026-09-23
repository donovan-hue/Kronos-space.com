import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { generateImage, getImageHistory } from "../../services/aiService";
import { mediaUrl } from "../../services/mediaUrl";
import { imagePromptSchema } from "../../schemas";
import EmptyState from "../../components/ui/EmptyState";

const STYLES = ["cinematic", "editorial", "concept-art", "photorealistic"];

export default function ImageGenerator() {
  const location = useLocation();
  const [imageUrl, setImageUrl] = useState("");
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  // RHF + Zod con las reglas del backend: prompt obligatorio ≤4000,
  // negativePrompt ≤2000, estilo del catálogo.
  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(imagePromptSchema),
    defaultValues: { prompt: "", negativePrompt: "", style: "cinematic" },
  });

  async function loadHistory() {
    try {
      const data = await getImageHistory();
      setHistory(Array.isArray(data?.generations) ? data.generations : []);
    } catch (error) {
      setMessage(error.response?.data?.error || "No se pudo cargar el historial visual.");
    }
  }

  useEffect(() => { loadHistory(); }, []);
  useEffect(() => {
    const reuseState = location.state || {};
    if (reuseState.reusePrompt) setValue("prompt", reuseState.reusePrompt);
    if (Object.prototype.hasOwnProperty.call(reuseState, "reuseNegativePrompt")) {
      setValue("negativePrompt", reuseState.reuseNegativePrompt || "");
    }
    if (STYLES.includes(reuseState.reuseStyle)) setValue("style", reuseState.reuseStyle);
  }, [location.state, setValue]);

  const generate = handleSubmit(async (data) => {
    if (loading) return;
    setLoading(true);
    setMessage("");

    try {
      const result = await generateImage({
        prompt: data.prompt.trim(),
        negativePrompt: data.negativePrompt.trim(),
        style: data.style
      });
      setImageUrl(result?.url || result?.imageUrl || "");
      setMessage(result?.message || "Generación completada.");
      await loadHistory();
    } catch (error) {
      setMessage(error.response?.data?.error || "Error generando imagen.");
    } finally {
      setLoading(false);
    }
  });

  /** Reutilizar una generación del historial llena el formulario. */
  function reuse(item) {
    setValue("prompt", item.prompt || "");
    setValue("negativePrompt", item.negativePrompt || "");
    setValue("style", STYLES.includes(item.style) ? item.style : "cinematic");
    setImageUrl(item.imageUrl);
  }

  return (
    <section className="page k-kairos-tool-page">
      <header className="k-page-header">
        <div><h1>Generar imagen</h1><p>Describe la dirección visual. Kairos se encarga del primer pase.</p></div>
        <Link className="k-button k-button-ghost" to="/kairos">Volver a Kairos</Link>
      </header>
      <div className="k-ai-workspace">
        <form className="k-ai-form k-surface" onSubmit={generate} noValidate>
          <label>Prompt<textarea placeholder="Una ciudad de titanio bajo la lluvia..." {...register("prompt")} /></label>
          {errors.prompt && <p className="k-field-error" role="alert">{errors.prompt.message}</p>}
          <label>Negative prompt<textarea placeholder="Elementos que quieres evitar" {...register("negativePrompt")} /></label>
          {errors.negativePrompt && <p className="k-field-error" role="alert">{errors.negativePrompt.message}</p>}
          <label>Estilo<select {...register("style")}>{STYLES.map((value) => <option key={value} value={value}>{value === "concept-art" ? "Concept art" : value[0].toUpperCase() + value.slice(1)}</option>)}</select></label>
          <button className="k-button k-button-ai" type="submit" disabled={loading}>{loading ? "KAIROS procesando..." : "Generar imagen"}</button>
        </form>
        <div className="k-ai-result k-card-ai">
          {imageUrl ? <img src={mediaUrl(imageUrl)} alt="" /> : <EmptyState icon={<SparklesPlaceholder />} title="Tu resultado aparecerá aquí" description="Genera una imagen para iniciar." />}
          {message && <p className="k-state" role="status">{message}</p>}
        </div>
      </div>
      <section className="k-history">
        <div className="k-section-heading"><h2>Últimas generaciones</h2><Link to="/kairos/history">Ver todo</Link></div>
        {history.length === 0 ? <p className="k-muted">Todavía no hay generaciones.</p> : <div className="k-history-grid">{history.filter((item) => item.imageUrl).map((item) => <button className="k-history-item" key={item._id} type="button" onClick={() => reuse(item)}><img src={mediaUrl(item.imageUrl)} alt={item.prompt || "Generación de Kairos"} /></button>)}</div>}
      </section>
    </section>
  );
}

function SparklesPlaceholder() { return <div className="k-kairos-placeholder" aria-hidden="true">✦</div>; }
