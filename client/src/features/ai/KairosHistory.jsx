import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  deleteImage,
  deleteScript,
  deleteVideo,
  getImageHistory,
  getScriptHistory,
  getVideoHistory
} from "../../services/aiService";
import { createPost } from "../../services/postsService";
import { mediaUrl } from "../../services/mediaUrl";
import { queryKeys } from "../../services/queryKeys";
import { useConfirm } from "../../components/feedback/ConfirmProvider";
import EmptyState from "../../components/ui/EmptyState";
import Spinner from "../../components/ui/Spinner";

function formatDate(value) {
  return value ? new Date(value).toLocaleString("es-MX", { dateStyle: "medium", timeStyle: "short" }) : "";
}

function isPublishableUrl(value) {
  return typeof value === "string" && (value.startsWith("/uploads/") || /^https?:\/\//i.test(value));
}

const FILTERS = [["all", "Todo"], ["image", "Imágenes"], ["video", "Videos"], ["script", "Scripts"]];

export default function KairosHistory() {
  const confirm = useConfirm();
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState("all");
  const [actionError, setActionError] = useState("");
  const [busy, setBusy] = useState("");

  const historyQuery = useQuery({
    queryKey: queryKeys.kairosHistory,
    queryFn: async () => {
      const [imagesResult, videosResult, scriptsResult] = await Promise.allSettled([
        getImageHistory(),
        getVideoHistory(),
        getScriptHistory()
      ]);
      const images = imagesResult.status === "fulfilled" ? imagesResult.value : null;
      const videos = videosResult.status === "fulfilled" ? videosResult.value : null;
      const scripts = scriptsResult.status === "fulfilled" ? scriptsResult.value : null;
      const fulfilled = [imagesResult, videosResult, scriptsResult].filter(
        (result) => result.status === "fulfilled"
      ).length;

      if (!fulfilled) {
        throw imagesResult.reason || videosResult.reason || scriptsResult.reason || new Error("KAIROS_HISTORY_UNAVAILABLE");
      }

      return {
        items: [
          ...(images?.generations || []).map((item) => ({ ...item, kind: "image", preview: item.imageUrl })),
          ...(videos?.generations || []).map((item) => ({ ...item, kind: "video", preview: item.videoUrl })),
          ...(scripts?.scripts || []).map((item) => ({ ...item, kind: "script" }))
        ].sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0)),
        partial: fulfilled < 3
      };
    },
  });

  const items = historyQuery.data?.items || [];
  const loading = historyQuery.isPending;
  const refreshing = historyQuery.isFetching && !loading;
  const error =
    actionError ||
    (historyQuery.error
      ? historyQuery.error.response?.data?.error || "No se pudo cargar el historial de Kairos."
      : historyQuery.data?.partial
        ? "No se pudo cargar una parte del historial de Kairos."
        : "");

  function setItems(updater) {
    queryClient.setQueryData(queryKeys.kairosHistory, (current) => {
      const items = typeof updater === "function"
        ? updater(current?.items || [])
        : updater;
      return {
        ...(current || {}),
        items,
        partial: Boolean(current?.partial)
      };
    });
  }

  const load = historyQuery.refetch;
  const visible = useMemo(() => filter === "all" ? items : items.filter((item) => item.kind === filter), [items, filter]);

  async function removeItem(item) {
    if (!item?._id || busy) return;
    const ok = await confirm({
      title: "Eliminar del historial",
      message: "¿Deseas eliminar esta generación del historial de Kairos?",
      confirmText: "Eliminar",
      danger: true
    });
    if (!ok) return;
    setBusy(`${item.kind}-${item._id}`);
    setActionError("");
    try {
      if (item.kind === "image") await deleteImage(item._id);
      else if (item.kind === "video") await deleteVideo(item._id);
      else await deleteScript(item._id);
      setItems((current) => current.filter((entry) => !(entry.kind === item.kind && entry._id === item._id)));
    } catch (requestError) {
      setActionError(requestError.response?.data?.error || "No se pudo eliminar la generación.");
    } finally {
      setBusy("");
    }
  }

  async function publishItem(item) {
    if (!item?._id || busy) return;
    const content = item.kind === "script"
      ? item.result?.trim()
      : `${item.kind === "image" ? "Imagen" : "Video"} generado con Kairos: ${item.prompt || "sin prompt"}`;
    if (!content) {
      setActionError("Este resultado no tiene contenido publicable.");
      return;
    }
    if (item.kind !== "script" && !isPublishableUrl(item.preview)) {
      setActionError("El resultado todavía no tiene una URL pública real para publicar.");
      return;
    }

    setBusy(`publish-${item.kind}-${item._id}`);
    setActionError("");
    try {
      await createPost(content, item.kind === "script" ? {
        lineage: { tool: "kairos-script", aiGenerated: true }
      } : {
        media: { url: item.preview, type: item.kind, alt: item.prompt || "Generación Kairos" },
        lineage: { tool: `kairos-${item.kind}`, aiGenerated: true }
      });
      setItems((current) => current.map((entry) => entry.kind === item.kind && entry._id === item._id ? { ...entry, published: true } : entry));
    } catch (requestError) {
      setActionError(requestError.response?.data?.error || "No se pudo publicar el resultado.");
    } finally {
      setBusy("");
    }
  }

  function reuseTarget(item) {
    if (item.kind === "image") return "/kairos/image";
    if (item.kind === "video") return "/kairos/video";
    return "/kairos/script";
  }

  return (
    <section className="page">
      <header className="k-page-header"><div><h1>Historial de generaciones</h1><p>Reutiliza, elimina o publica todo lo que has creado.</p></div><div><Link className="k-button k-button-ghost" to="/kairos">Kairos</Link><button className="k-button k-button-secondary" type="button" onClick={load} disabled={loading || refreshing}>{loading || refreshing ? "Cargando..." : "Actualizar"}</button></div></header>
      <div className="k-filter-row">{FILTERS.map(([value, label]) => <button className={`k-button ${filter === value ? "k-button-primary" : "k-button-secondary"}`} type="button" key={value} onClick={() => setFilter(value)} aria-pressed={filter === value}>{label}</button>)}</div>
      {error && (
        <div className="k-state k-state-error" role="alert">
          <p>{error}</p>
          <button className="k-button k-button-secondary" type="button" onClick={() => { setActionError(""); load(); }}>
            Reintentar
          </button>
        </div>
      )}
      {loading ? <Spinner size="lg" label="Cargando historial..." /> : !error && visible.length === 0 ? <EmptyState title="No hay generaciones todavía" description="Empieza creando algo con Kairos." action={<Link className="k-button k-button-ai" to="/kairos">Abrir Kairos</Link>} /> : visible.length > 0 ? <div className="k-history-list">{visible.map((item) => {
        const itemKey = `${item.kind}-${item._id}`;
        const itemBusy = busy === itemKey;
        const publishing = busy === `publish-${itemKey}`;
        return <article className="k-history-row k-surface" key={itemKey}>
          <strong>{item.kind === "image" ? "Imagen" : item.kind === "video" ? "Video" : "Script"}</strong>
          {item.preview && item.kind === "image" && <img src={mediaUrl(item.preview)} alt={item.prompt || "Generación Kairos"} />}
          {item.preview && item.kind === "video" && <video src={mediaUrl(item.preview)} controls preload="metadata" playsInline />}
          {item.kind === "script" && <p>{item.result?.slice(0, 240) || item.prompt}</p>}
          <span>{formatDate(item.createdAt)} · {item.status || "completed"}</span>
          <div className="k-button-group">
            <Link
              className="k-button k-button-secondary"
              to={reuseTarget(item)}
              state={{
                reusePrompt: item.prompt || "",
                reuseNegativePrompt: item.negativePrompt || "",
                reuseStyle: item.style || "",
                reuseType: item.type || "",
                reuseGenre: item.genre || "",
                reuseFormat: item.format || "",
                reuseDurationMinutes: item.durationMinutes,
                reuseTone: item.tone || "",
                reuseAudience: item.audience || ""
              }}
            >Reutilizar</Link>
            <button className="k-button k-button-secondary" type="button" onClick={() => publishItem(item)} disabled={Boolean(busy) || Boolean(item.published) || (item.kind !== "script" && !isPublishableUrl(item.preview))}>{publishing ? "Publicando..." : item.published ? "Publicado" : "Publicar"}</button>
            <button className="k-button k-button-ghost" type="button" onClick={() => removeItem(item)} disabled={Boolean(busy)}>{itemBusy ? "Eliminando..." : "Eliminar"}</button>
          </div>
        </article>;
      })}</div> : null}
    </section>
  );
}
