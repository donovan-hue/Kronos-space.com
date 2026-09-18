import { useEffect, useState } from "react";
import { deleteVideo, getVideoHistory, getVideoJob } from "../../services/aiService";

const STATUS_LABELS = {
  queued: "En cola",
  processing: "Procesando",
  completed: "Completado",
  failed: "Fallido"
};

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

function statusLabel(status) {
  return STATUS_LABELS[status] || status || "Desconocido";
}

export default function VideoJobs() {
  const [jobs, setJobs] = useState([]);
  const [selectedVideo, setSelectedVideo] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [deletingId, setDeletingId] = useState("");
  const [error, setError] = useState("");

  async function loadJobs(showLoading = true) {
    if (showLoading) {
      setLoading(true);
    } else {
      setRefreshing(true);
    }

    setError("");

    try {
      const data = await getVideoHistory();

      setJobs(
        Array.isArray(data?.generations)
          ? data.generations
          : []
      );
    } catch (requestError) {
      console.error("KRONOS_VIDEO_JOBS_ERROR:", requestError);
      setError(
        requestError.response?.data?.error ||
          "No se pudieron cargar los trabajos de video."
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  async function refreshJob(job) {
    if (
      !job?._id ||
      !["queued", "processing"].includes(job.status)
    ) {
      return job;
    }

    try {
      const data = await getVideoJob(job._id);

      return data?.generation || job;
    } catch (requestError) {
      console.error(
        "KRONOS_VIDEO_JOB_REFRESH_ERROR:",
        requestError
      );
      return job;
    }
  }

  async function refreshProcessingJobs() {
    const processingJobs = jobs.filter((job) =>
      ["queued", "processing"].includes(job.status)
    );

    if (processingJobs.length === 0) {
      return;
    }

    const refreshedJobs = await Promise.all(
      processingJobs.map(refreshJob)
    );

    setJobs((currentJobs) =>
      currentJobs.map((currentJob) =>
        refreshedJobs.find(
          (refreshedJob) =>
            refreshedJob._id === currentJob._id
        ) || currentJob
      )
    );
  }

  useEffect(() => {
    loadJobs();
  }, []);

  useEffect(() => {
    const hasProcessingJobs = jobs.some((job) =>
      ["queued", "processing"].includes(job.status)
    );

    if (!hasProcessingJobs) {
      return undefined;
    }

    const interval = window.setInterval(
      refreshProcessingJobs,
      5000
    );

    return () => window.clearInterval(interval);
  }, [jobs]);

  async function deleteJob(job) {
    if (!job?._id || deletingId) {
      return;
    }

    if (!window.confirm("¿Eliminar este trabajo de video?")) {
      return;
    }

    setDeletingId(job._id);
    setError("");

    try {
      await deleteVideo(job._id);

      setJobs((currentJobs) =>
        currentJobs.filter(
          (currentJob) => currentJob._id !== job._id
        )
      );

      if (selectedVideo === job.videoUrl) {
        setSelectedVideo("");
      }
    } catch (requestError) {
      console.error(
        "KRONOS_VIDEO_JOB_DELETE_ERROR:",
        requestError
      );
      setError(
        requestError.response?.data?.error ||
          "No se pudo eliminar el trabajo de video."
      );
    } finally {
      setDeletingId("");
    }
  }

  return (
    <section className="page video-jobs">
      <header className="video-jobs-header">
        <div>
          <h2>Trabajos de video</h2>
          <p>Consulta el estado de tus procesos multimedia.</p>
        </div>

        <button
          type="button"
          onClick={() => loadJobs(false)}
          disabled={loading || refreshing}
        >
          {refreshing ? "Actualizando..." : "Actualizar"}
        </button>
      </header>

      {error && <p role="alert">{error}</p>}

      {loading ? (
        <p>Cargando trabajos...</p>
      ) : jobs.length === 0 ? (
        <p className="video-jobs-empty">
          Todavía no tienes trabajos de video.
        </p>
      ) : (
        <div className="video-jobs-list">
          {jobs.map((job) => (
            <article className="video-job" key={job._id}>
              <div className="video-job-heading">
                <span
                  className={`video-job-status status-${job.status}`}
                >
                  {statusLabel(job.status)}
                </span>
                <small>{formatDate(job.createdAt)}</small>
              </div>

              <p className="video-job-prompt">{job.prompt}</p>

              {job.error && (
                <p className="video-job-error" role="alert">
                  {job.error}
                </p>
              )}

              {job.videoUrl && (
                <div className="video-job-actions">
                  <button
                    type="button"
                    onClick={() => setSelectedVideo(job.videoUrl)}
                  >
                    Ver video
                  </button>
                  <a
                    href={job.videoUrl}
                    download
                    target="_blank"
                    rel="noreferrer"
                  >
                    Descargar
                  </a>
                  <button
                    type="button"
                    onClick={() => deleteJob(job)}
                    disabled={deletingId === job._id}
                  >
                    {deletingId === job._id
                      ? "Eliminando..."
                      : "Eliminar"}
                  </button>
                </div>
              )}

              {!job.videoUrl && (
                <button
                  type="button"
                  onClick={() => deleteJob(job)}
                  disabled={deletingId === job._id}
                >
                  {deletingId === job._id
                    ? "Eliminando..."
                    : "Eliminar"}
                </button>
              )}
            </article>
          ))}
        </div>
      )}

      {selectedVideo && (
        <section className="video-job-player">
          <div className="video-job-player-header">
            <h3>Resultado</h3>
            <button
              type="button"
              onClick={() => setSelectedVideo("")}
            >
              Cerrar
            </button>
          </div>
          <video
            src={selectedVideo}
            controls
            playsInline
          />
        </section>
      )}
    </section>
  );
}
