import { useEffect, useState } from "react";
import axios from "axios";
import { API_URL } from "../../services/apiClient";
import { getToken } from "../../services/authStorage";

const API = API_URL;

function getAuthConfig() {
  return {
    headers: {
      Authorization:
        `Bearer ${getToken()}`
    }
  };
}

function formatDate(date) {
  if (!date) {
    return "";
  }

  try {
    return new Date(date).toLocaleString("es-MX", {
      dateStyle: "medium",
      timeStyle: "short"
    });
  } catch {
    return "";
  }
}

function normalizeMedia(generations, type) {
  return generations
    .filter((generation) =>
      type === "image"
        ? generation.imageUrl
        : generation.videoUrl
    )
    .map((generation) => ({
      ...generation,
      mediaType: type,
      mediaUrl:
        type === "image"
          ? generation.imageUrl
          : generation.videoUrl
    }));
}

export default function MediaLibrary() {
  const [items, setItems] = useState([]);
  const [filter, setFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState("");
  const [error, setError] = useState("");

  async function loadLibrary() {
    setLoading(true);
    setError("");

    try {
      const [imagesResult, videosResult] =
        await Promise.allSettled([
          axios.get(
            `${API}/ai/images/history`,
            getAuthConfig()
          ),
          axios.get(
            `${API}/ai/videos/history`,
            getAuthConfig()
          )
        ]);

      const images =
        imagesResult.status === "fulfilled" &&
        Array.isArray(
          imagesResult.value.data?.generations
        )
          ? normalizeMedia(
              imagesResult.value.data.generations,
              "image"
            )
          : [];

      const videos =
        videosResult.status === "fulfilled" &&
        Array.isArray(
          videosResult.value.data?.generations
        )
          ? normalizeMedia(
              videosResult.value.data.generations,
              "video"
            )
          : [];

      if (
        imagesResult.status === "rejected" &&
        videosResult.status === "rejected"
      ) {
        throw imagesResult.reason;
      }

      setItems(
        [...images, ...videos].sort(
          (first, second) =>
            new Date(second.createdAt || 0) -
            new Date(first.createdAt || 0)
        )
      );

      if (
        imagesResult.status === "rejected" ||
        videosResult.status === "rejected"
      ) {
        setError(
          "No se pudo cargar una parte de la biblioteca."
        );
      }
    } catch (requestError) {
      console.error(
        "KRONOS_MEDIA_LIBRARY_ERROR:",
        requestError
      );

      setItems([]);
      setError(
        requestError.response?.data?.error ||
          "No se pudo cargar la biblioteca multimedia."
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadLibrary();
  }, []);

  async function deleteItem(item) {
    if (!item?._id || deletingId) {
      return;
    }

    if (!window.confirm("¿Eliminar este archivo multimedia?")) {
      return;
    }

    setDeletingId(`${item.mediaType}-${item._id}`);
    setError("");

    try {
      await axios.delete(
        `${API}/ai/${item.mediaType === "image" ? "images" : "videos"}/${item._id}`,
        getAuthConfig()
      );

      setItems((currentItems) =>
        currentItems.filter(
          (currentItem) =>
            currentItem._id !== item._id ||
            currentItem.mediaType !== item.mediaType
        )
      );
    } catch (requestError) {
      console.error(
        "KRONOS_MEDIA_DELETE_ERROR:",
        requestError
      );
      setError(
        requestError.response?.data?.error ||
          "No se pudo eliminar el archivo multimedia."
      );
    } finally {
      setDeletingId("");
    }
  }

  const visibleItems = items.filter(
    (item) =>
      filter === "all" || item.mediaType === filter
  );

  return (
    <section className="page media-library">
      <header className="media-library-header">
        <div>
          <h2>Biblioteca multimedia</h2>
          <p>Imágenes y videos generados en Kronos.</p>
        </div>

        <button
          type="button"
          onClick={loadLibrary}
          disabled={loading}
        >
          {loading ? "Cargando..." : "Actualizar"}
        </button>
      </header>

      <div
        className="media-library-filters"
        role="group"
        aria-label="Filtrar biblioteca"
      >
        {[
          ["all", "Todo"],
          ["image", "Imágenes"],
          ["video", "Videos"]
        ].map(([value, label]) => (
          <button
            type="button"
            key={value}
            className={filter === value ? "active" : ""}
            onClick={() => setFilter(value)}
            aria-pressed={filter === value}
          >
            {label}
          </button>
        ))}
      </div>

      {error && <p role="alert">{error}</p>}

      {loading ? (
        <p>Cargando biblioteca...</p>
      ) : visibleItems.length === 0 ? (
        <p className="media-library-empty">
          {filter === "all"
            ? "Todavía no tienes archivos multimedia."
            : `No tienes ${
                filter === "image" ? "imágenes" : "videos"
              } disponibles.`}
        </p>
      ) : (
        <div className="media-library-grid">
          {visibleItems.map((item) => (
            <article
              className="media-library-item"
              key={`${item.mediaType}-${item._id}`}
            >
              <div className="media-library-preview">
                {item.mediaType === "image" ? (
                  <img
                    src={item.mediaUrl}
                    alt={item.prompt || "Imagen multimedia"}
                    loading="lazy"
                  />
                ) : (
                  <video
                    src={item.mediaUrl}
                    controls
                    preload="metadata"
                    playsInline
                  />
                )}
              </div>

              <div className="media-library-details">
                <span className="media-library-type">
                  {item.mediaType === "image"
                    ? "Imagen"
                    : "Video"}
                </span>
                <p>{item.prompt}</p>
                <small>
                  {formatDate(item.createdAt)}
                  {item.status && ` · ${item.status}`}
                </small>

                <div className="media-library-actions">
                  <a
                    href={item.mediaUrl}
                    download
                    target="_blank"
                    rel="noreferrer"
                  >
                    Descargar
                  </a>
                  <button
                    type="button"
                    onClick={() => deleteItem(item)}
                    disabled={
                      deletingId ===
                      `${item.mediaType}-${item._id}`
                    }
                  >
                    {deletingId ===
                    `${item.mediaType}-${item._id}`
                      ? "Eliminando..."
                      : "Eliminar"}
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
