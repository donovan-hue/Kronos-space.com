import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  deleteImage,
  deleteScript,
  deleteVideo,
  getImageHistory,
  getScriptHistory,
  getVideoHistory
} from "../../services/aiService";

function formatDate(value) {
  return value ? new Date(value).toLocaleString("es-MX", { dateStyle: "medium", timeStyle: "short" }) : "";
}

const FILTERS = [["all", "Todo"], ["image", "Imágenes"], ["video", "Videos"], ["script", "Scripts"]];

export default function KairosHistory() {
  const [items, setItems] = useState([]);
  const [filter, setFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [deleting, setDeleting] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const [images, videos, scripts] = await Promise.all([getImageHistory(), getVideoHistory(), getScriptHistory()]);
      const normalized = [
        ...(images?.generations || []).map((item) => ({ ...item, kind: "image", preview: item.imageUrl })),
        ...(videos?.generations || []).map((item) => ({ ...item, kind: "video", preview: item.videoUrl })),
        ...(scripts?.scripts || []).map((item) => ({ ...item, kind: "script" }))
      ].sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
      setItems(normalized);
    } catch (requestError) {
      setError(requestError.response?.data?.error || "No se pudo cargar el historial de Kairos.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);
  const visible = useMemo(() => filter === "all" ? items : items.filter((item) => item.kind === filter), [items, filter]);

  async function removeItem(item) {
    if (!item?._id || deleting || !window.confirm("¿Eliminar esta generación del historial?")) return;
    setDeleting(`${item.kind}-${item._id}`);
    setError("");
    try {
      if (item.kind === "image") await deleteImage(item._id);
      else if (item.kind === "video") await deleteVideo(item._id);
      else await deleteScript(item._id);
      setItems((current) => current.filter((entry) => !(entry.kind === item.kind && entry._id === item._id)));
    } catch (requestError) {
      setError(requestError.response?.data?.error || "No se pudo eliminar la generación.");
    } finally {
      setDeleting("");
    }
  }

  function reuseTarget(item) {
    if (item.kind === "image") return "/kairos/image";
    if (item.kind === "video") return "/kairos/video";
    return "/kairos/script";
  }

  return <section className="page"><header className="k-page-header"><div><p className="k-eyebrow">KAIROS / HISTORY</p><h1>Historial de generaciones</h1><p>Reutiliza, elimina o consulta todo lo que has creado.</p></div><div><Link className="k-button k-button-ghost" to="/kairos">Kairos</Link><button className="k-button k-button-secondary" type="button" onClick={load} disabled={loading}>{loading ? "Cargando..." : "Actualizar"}</button></div></header><div className="k-filter-row">{FILTERS.map(([value, label]) => <button className={`k-button ${filter === value ? "k-button-primary" : "k-button-secondary"}`} type="button" key={value} onClick={() => setFilter(value)} aria-pressed={filter === value}>{label}</button>)}</div>{error && <p className="k-state k-state-error" role="alert">{error}</p>}{loading ? <div className="k-feed-state"><span className="k-skeleton" /><span className="k-skeleton k-skeleton-wide" /></div> : visible.length === 0 ? <div className="k-empty-state"><h2>No hay generaciones todavía</h2><p>Empieza creando algo con Kairos.</p><Link className="k-button k-button-ai" to="/kairos">Abrir Kairos</Link></div> : <div className="k-history-list">{visible.map((item) => <article className="k-history-row k-surface" key={`${item.kind}-${item._id}`}><strong>{item.kind === "image" ? "Imagen" : item.kind === "video" ? "Video" : "Script"}</strong>{item.preview && item.kind === "image" && <img src={item.preview} alt={item.prompt || "Generación Kairos"} />}{item.preview && item.kind === "video" && <video src={item.preview} controls preload="metadata" playsInline />}{item.kind === "script" && <p>{item.result?.slice(0, 180) || item.prompt}</p>}<span>{formatDate(item.createdAt)} · {item.status || "completed"}</span><div className="k-button-group"><Link className="k-button k-button-secondary" to={reuseTarget(item)} state={{ reusePrompt: item.prompt || "" }}>Reutilizar</Link><button className="k-button k-button-ghost" type="button" onClick={() => removeItem(item)} disabled={deleting === `${item.kind}-${item._id}`}>{deleting === `${item.kind}-${item._id}` ? "Eliminando..." : "Eliminar"}</button></div></article>)}</div>}</section>;
}
