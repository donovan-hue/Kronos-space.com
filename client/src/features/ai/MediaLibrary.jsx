import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  deleteImage,
  deleteVideo,
  getImageHistory,
  getVideoHistory
} from "../../services/aiService";
import { queryKeys } from "../../services/queryKeys";

function formatDate(value) {
  if (!value) return "";
  try { return new Date(value).toLocaleString("es-MX", { dateStyle: "medium", timeStyle: "short" }); } catch { return ""; }
}

function normalizeMedia(generations, type) {
  return generations.filter((generation) => type === "image" ? generation.imageUrl : generation.videoUrl).map((generation) => ({
    ...generation,
    mediaType: type,
    mediaUrl: type === "image" ? generation.imageUrl : generation.videoUrl
  }));
}

export default function MediaLibrary() {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState("all");
  const [deletingId, setDeletingId] = useState("");
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
    if (!item?._id || deletingId || !window.confirm("¿Eliminar este archivo multimedia?")) return;
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
          <h2>Biblioteca multimedia</h2>
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

      {error && <p className="k-state k-state-error" role="alert">{error}</p>}

      {loading ? (
        <p>Cargando biblioteca...</p>
      ) : visibleItems.length === 0 ? (
        <p className="media-library-empty">
          {filter === "all" ? "Todavía no tienes archivos multimedia." : `No tienes ${filter === "image" ? "imágenes" : "videos"} disponibles.`}
        </p>
      ) : (
        <div className="media-library-grid">
          {visibleItems.map((item) => (
            <article className="media-library-item" key={`${item.mediaType}-${item._id}`}>
              <div className="media-library-preview">
                {item.mediaType === "image" ? (
                  <img src={item.mediaUrl} alt={item.prompt || "Imagen multimedia"} loading="lazy" />
                ) : (
                  <video src={item.mediaUrl} controls preload="metadata" playsInline />
                )}
              </div>
              <div className="media-library-details">
                <span className="media-library-type">{item.mediaType === "image" ? "Imagen" : "Video"}</span>
                <p>{item.prompt}</p>
                <small>
                  {formatDate(item.createdAt)}
                  {item.status && ` · ${item.status}`}
                </small>
                <div className="media-library-actions">
                  <a href={item.mediaUrl} download target="_blank" rel="noreferrer">
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
      )}
    </section>
  );
}
