import { useEffect, useState } from "react";
import { deleteVideo, getVideoHistory, getVideoJob } from "../../services/aiService";
import { mediaUrl } from "../../services/mediaUrl";
import { useConfirm } from "../../components/feedback/ConfirmProvider";
import Spinner from "../../components/ui/Spinner";
import EmptyState from "../../components/ui/EmptyState";

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
  const confirm = useConfirm();
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
      job.providerJobId && ["queued", "processing"].includes(job.status)
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

    const ok = await confirm({
      title: "Eliminar trabajo de video",
      message: "¿Deseas eliminar este trabajo de video?",
      confirmText: "Eliminar",
      danger: true
    });
    if (!ok) {
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

      {error && (
        <div className="k-state k-state-error" role="alert">
          <p>{error}</p>
          <button type="button" onClick={() => loadJobs()} disabled={refreshing || loading}>
            Reintentar
          </button>
        </div>
      )}

      {loading ? (
        <Spinner size="lg" label="Cargando trabajos..." />
      ) : !error && jobs.length === 0 ? (
        <EmptyState
          title="Todavía no tienes trabajos de video."
          description="Genera un video con Kairos y su progreso aparecerá aquí."
          className="video-jobs-empty"
        />
      ) : jobs.length > 0 ? (
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

              {job.status === "queued" || job.status === "processing" ? (
                <div className="video-job-progress" aria-label={`Progreso ${job.progress || 0}%`}>
                  <div className="video-job-progress-track"><span style={{ width: `${Math.max(0, Math.min(100, Number(job.progress) || 0))}%` }} /></div>
                  <small>{Number(job.progress) || 0}% · actualización automática</small>
                </div>
              ) : null}

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
                    href={mediaUrl(job.videoUrl)}
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
      ) : null}

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
            src={mediaUrl(selectedVideo)}
            controls
            playsInline
          />
        </section>
      )}
    </section>
  );
}
