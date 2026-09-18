import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { generateImage, getImageHistory } from "../../services/aiService";

const STYLES = ["cinematic", "editorial", "concept-art", "photorealistic"];

export default function ImageGenerator() {
  const location = useLocation();
  const [prompt, setPrompt] = useState("");
  const [negativePrompt, setNegativePrompt] = useState("");
  const [style, setStyle] = useState("cinematic");
  const [imageUrl, setImageUrl] = useState("");
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

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
    if (location.state?.reusePrompt) setPrompt(location.state.reusePrompt);
  }, [location.state]);

  async function generate(event) {
    event.preventDefault();
    if (!prompt.trim() || loading) return;
    setLoading(true);
    setMessage("");

    try {
      const data = await generateImage({
        prompt: prompt.trim(),
        negativePrompt: negativePrompt.trim(),
        style
      });
      setImageUrl(data?.url || data?.imageUrl || "");
      setMessage(data?.message || "Generación completada.");
      await loadHistory();
    } catch (error) {
      setMessage(error.response?.data?.error || "Error generando imagen.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="page k-kairos-tool-page">
      <header className="k-page-header">
        <div><p className="k-eyebrow">KAIROS / IMAGE ENGINE</p><h1>Generar imagen</h1><p>Describe la dirección visual. Kairos se encarga del primer pase.</p></div>
        <Link className="k-button k-button-ghost" to="/kairos">Volver a Kairos</Link>
      </header>
      <div className="k-ai-workspace">
        <form className="k-ai-form k-surface" onSubmit={generate}>
          <label>Prompt<textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} maxLength={4000} placeholder="Una ciudad de titanio bajo la lluvia..." required /></label>
          <label>Negative prompt<textarea value={negativePrompt} onChange={(event) => setNegativePrompt(event.target.value)} maxLength={2000} placeholder="Elementos que quieres evitar" /></label>
          <label>Estilo<select value={style} onChange={(event) => setStyle(event.target.value)}>{STYLES.map((value) => <option key={value} value={value}>{value === "concept-art" ? "Concept art" : value[0].toUpperCase() + value.slice(1)}</option>)}</select></label>
          <button className="k-button k-button-ai" type="submit" disabled={loading}>{loading ? "KAIROS procesando..." : "Generar imagen"}</button>
        </form>
        <div className="k-ai-result k-card-ai">
          {imageUrl ? <img src={imageUrl} alt={prompt} /> : <div className="k-empty-state"><SparklesPlaceholder /><h2>Tu resultado aparecerá aquí</h2><p>Genera una imagen para iniciar.</p></div>}
          {message && <p className="k-state" role="status">{message}</p>}
        </div>
      </div>
      <section className="k-history">
        <div className="k-section-heading"><h2>Últimas generaciones</h2><Link to="/kairos/history">Ver todo</Link></div>
        {history.length === 0 ? <p className="k-muted">Todavía no hay generaciones.</p> : <div className="k-history-grid">{history.filter((item) => item.imageUrl).map((item) => <button className="k-history-item" key={item._id} type="button" onClick={() => { setImageUrl(item.imageUrl); setPrompt(item.prompt || ""); setNegativePrompt(item.negativePrompt || ""); setStyle(item.style || "cinematic"); }}><img src={item.imageUrl} alt={item.prompt || "Generación de Kairos"} /></button>)}</div>}
      </section>
    </section>
  );
}

function SparklesPlaceholder() { return <div className="k-kairos-placeholder" aria-hidden="true">✦</div>; }
