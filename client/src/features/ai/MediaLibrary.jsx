import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  deleteImage,
  deleteVideo,
  getImageHistory,
  getVideoHistory
} from "../../services/aiService";
import { queryKeys } from "../../services/queryKeys";
import { mediaUrl } from "../../services/mediaUrl";
import { useConfirm } from "../../components/feedback/ConfirmProvider";
import Spinner from "../../components/ui/Spinner";
import EmptyState from "../../components/ui/EmptyState";

function formatDate(value) {
  if (!value) return "";
  try { return new Date(value).toLocaleString("es-MX", { dateStyle: "medium", timeStyle: "short" }); } catch { return ""; }
}

/**
 * Una entrada por **generación**, no por archivo.
 *
 * Una generación de cuatro variaciones es una sola pieza con cuatro imágenes:
 * se borra junta y se elige cuál se ve. Antes solo se mostraba la principal y
 * las demás quedaban invisibles aunque el historial las tuviera.
 */
function normalizeMedia(generations, type) {
  return generations
    .filter((generation) => (type === "image" ? generation.imageUrl : generation.videoUrl))
    .map((generation) => {
      const principal = type === "image" ? generation.imageUrl : generation.videoUrl;
      const variantes = type === "image" && Array.isArray(generation.variants)
        ? generation.variants.filter(Boolean)
        : [];
      return {
        ...generation,
        mediaType: type,
        mediaUrl: principal,
        // La principal primero y sin duplicados: el historial antiguo tiene
        // `variants` vacío y esta lista queda con un solo elemento.
        variantes: [principal, ...variantes.filter((url) => url !== principal)]
      };
    });
}

export default function MediaLibrary() {
  const confirm = useConfirm();
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState("all");
  const [deletingId, setDeletingId] = useState("");
  // Variante visible por generación (`imagen-<id>` → url), para no mostrar
  // siempre la primera.
  const [varianteVisible, setVarianteVisible] = useState({});
  const [actionError, setActionError] = useState("");

  const libraryQuery = useQuery({
    queryKey: queryKeys.kairosMedia,
    queryFn: async () => {
      const [imagesResult, videosResult] = await Promise.allSettled([getImageHistory(), getVideoHistory()]);
      const images = imagesResult.status === "fulfilled" && Array.isArray(imagesResult.value?.generations) ? normalizeMedia(imagesResult.value.generations, "image") : [];
      const videos = videosResult.status === "fulfilled" && Array.isArray(videosResult.value?.generations) ? normalizeMedia(videosResult.value.generations, "video") : [];
      if (imagesResult.status === "rejected" && videosResult.status === "rejected") throw imagesResult.reason;
      return {
        items: [...images, ...videos].sort((first, second) => new Date(second.createdAt || 0) - new Date(first.createdAt || 0)),
        partial: imagesResult.status === "rejected" || videosResult.status === "rejected",
      };
    },
  });

  const items = libraryQuery.data?.items || [];
  const loading = libraryQuery.isPending;
  const error =
    actionError ||
    (libraryQuery.error
      ? libraryQuery.error.response?.data?.error || "No se pudo cargar la biblioteca multimedia."
      : libraryQuery.data?.partial
        ? "No se pudo cargar una parte de la biblioteca."
        : "");

  const loadLibrary = libraryQuery.refetch;

  async function deleteItem(item) {
    if (!item?._id || deletingId) return;
    const ok = await confirm({
      title: "Eliminar multimedia",
      message: "¿Deseas eliminar este archivo multimedia de tu biblioteca?",
      confirmText: "Eliminar",
      danger: true
    });
    if (!ok) return;
    const key = `${item.mediaType}-${item._id}`;
    setDeletingId(key);
    setActionError("");
    try {
      if (item.mediaType === "image") await deleteImage(item._id);
      else await deleteVideo(item._id);
      queryClient.setQueryData(queryKeys.kairosMedia, (cache) =>
        cache
          ? {
              ...cache,
              items: cache.items.filter((entry) => entry._id !== item._id || entry.mediaType !== item.mediaType),
            }
          : cache
      );
    } catch (requestError) {
      setActionError(requestError.response?.data?.error || "No se pudo eliminar el archivo multimedia.");
    } finally {
      setDeletingId("");
    }
  }

  const visibleItems = items.filter((item) => filter === "all" || item.mediaType === filter);

  return (
    <section className="page media-library">
      <header className="media-library-header">
        <div>
          <h1>Biblioteca multimedia</h1>
          <p>Imágenes y videos generados.</p>
        </div>
        <button className="k-button k-button-secondary" type="button" onClick={loadLibrary} disabled={loading}>
          {loading ? "Cargando..." : "Actualizar"}
        </button>
      </header>

      <div className="media-library-filters" role="group" aria-label="Filtrar biblioteca">
        {[["all", "Todo"], ["image", "Imágenes"], ["video", "Videos"]].map(([value, label]) => (
          <button
            className={`k-button ${filter === value ? "k-button-primary" : "k-button-secondary"}`}
            type="button"
            key={value}
            onClick={() => setFilter(value)}
            aria-pressed={filter === value}
          >
            {label}
          </button>
        ))}
      </div>

      {error && (
        <div className="k-state k-state-error" role="alert">
          <p>{error}</p>
          <button className="k-button k-button-secondary" type="button" onClick={() => { setActionError(""); loadLibrary(); }}>
            Reintentar
          </button>
        </div>
      )}

      {loading ? (
        <Spinner size="lg" label="Cargando biblioteca..." />
      ) : !error && visibleItems.length === 0 ? (
        <EmptyState
          title={filter === "all" ? "Todavía no tienes archivos multimedia." : `No tienes ${filter === "image" ? "imágenes" : "videos"} disponibles.`}
          description="Todo lo que generes con Kairos aparecerá aquí."
          className="media-library-empty"
        />
      ) : visibleItems.length > 0 ? (
        <div className="media-library-grid">
          {visibleItems.map((item) => (
            <article className="media-library-item" key={`${item.mediaType}-${item._id}`}>
              <div className="media-library-preview">
                {item.mediaType === "image" ? (
                  <img
                    src={mediaUrl(varianteVisible[`${item.mediaType}-${item._id}`] || item.mediaUrl)}
                    alt={item.prompt || "Imagen multimedia"}
                    loading="lazy"
                  />
                ) : (
                  <video src={mediaUrl(item.mediaUrl)} controls preload="metadata" playsInline />
                )}
              </div>
              {item.variantes.length > 1 && (
                <div className="media-library-variants" role="group" aria-label={`Variaciones de ${item.prompt || "esta generación"}`}>
                  {item.variantes.map((url, indice) => {
                    const clave = `${item.mediaType}-${item._id}`;
                    const activa = (varianteVisible[clave] || item.mediaUrl) === url;
                    return (
                      <button
                        key={url}
                        type="button"
                        className={`media-library-variant${activa ? " is-active" : ""}`}
                        aria-pressed={activa}
                        aria-label={`Variación ${indice + 1} de ${item.variantes.length}`}
                        onClick={() => setVarianteVisible((previo) => ({ ...previo, [clave]: url }))}
                      >
                        <img src={mediaUrl(url)} alt="" loading="lazy" />
                      </button>
                    );
                  })}
                </div>
              )}
              <div className="media-library-details">
                <span className="media-library-type">{item.mediaType === "image" ? "Imagen" : "Video"}</span>
                <p>{item.prompt}</p>
                <small>
                  {formatDate(item.createdAt)}
                  {item.status && ` · ${item.status}`}
                  {item.variantes.length > 1 && ` · ${item.variantes.length} variaciones en una pieza`}
                </small>
                <div className="media-library-actions">
                  <a
                    href={mediaUrl(varianteVisible[`${item.mediaType}-${item._id}`] || item.mediaUrl)}
                    download
                    target="_blank"
                    rel="noreferrer"
                  >
                    Descargar
                  </a>
                  <button
                    className="k-button k-button-ghost"
                    type="button"
                    onClick={() => deleteItem(item)}
                    disabled={deletingId === `${item.mediaType}-${item._id}`}
                  >
                    {deletingId === `${item.mediaType}-${item._id}` ? "Eliminando..." : "Eliminar"}
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      ) : null}
    </section>
  );
}
