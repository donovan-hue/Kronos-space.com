import { useEffect, useState } from "react";
import {
  deleteScriptProject,
  exportScriptProject,
  getScriptProject,
  listScriptProjects
} from "../../services/aiService";
import { useConfirm } from "../../components/feedback/ConfirmProvider";
import Spinner from "../../components/ui/Spinner";
import EmptyState from "../../components/ui/EmptyState";

/**
 * Proyectos de guion guardados.
 *
 * El backend tenía listar, leer, editar, exportar y borrar desde el principio y
 * el cliente solo llamaba a «guardar»: un proyecto se podía crear y nunca
 * volver a abrir. Esta sección cierra ese círculo sin duplicar el editor: al
 * abrir un proyecto devuelve su estructura al editor de guiones, que es donde
 * se trabaja (`onOpen`).
 */

function formatDate(value) {
  if (!value) return "";
  try {
    return new Date(value).toLocaleString("es-MX", { dateStyle: "medium", timeStyle: "short" });
  } catch {
    return "";
  }
}

export default function ScriptProjects({ onOpen, refreshKey = 0 }) {
  const confirm = useConfirm();
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      setProjects(await listScriptProjects());
    } catch (requestError) {
      setError(requestError.response?.data?.error || "No se pudieron cargar los proyectos de guion.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [refreshKey]);

  async function open(project) {
    if (!project?._id || busy) return;
    setBusy(`open-${project._id}`);
    setError("");
    try {
      const full = await getScriptProject(project._id);
      onOpen?.(full);
    } catch (requestError) {
      setError(requestError.response?.data?.error || "No se pudo abrir el proyecto.");
    } finally {
      setBusy("");
    }
  }

  async function download(project, format) {
    if (!project?._id || busy) return;
    setBusy(`export-${project._id}`);
    setError("");
    try {
      const content = await exportScriptProject(project._id, format);
      const type = format === "json" ? "application/json" : "text/plain;charset=utf-8";
      const url = window.URL.createObjectURL(new Blob([content], { type }));
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", `${(project.title || "guion").replace(/[^\w.-]+/g, "-")}.${format}`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (requestError) {
      setError(requestError.response?.data?.error || "No se pudo exportar el proyecto.");
    } finally {
      setBusy("");
    }
  }

  async function remove(project) {
    if (!project?._id || busy) return;
    const ok = await confirm({
      title: "Eliminar proyecto",
      message: `¿Deseas eliminar el proyecto «${project.title}»? Los guiones del historial no se tocan.`,
      confirmText: "Eliminar",
      danger: true
    });
    if (!ok) return;
    setBusy(`delete-${project._id}`);
    setError("");
    try {
      await deleteScriptProject(project._id);
      setProjects((current) => current.filter((item) => item._id !== project._id));
    } catch (requestError) {
      setError(requestError.response?.data?.error || "No se pudo eliminar el proyecto.");
    } finally {
      setBusy("");
    }
  }

  return (
    <section className="k-history" aria-label="Proyectos de guion">
      <div className="k-section-heading">
        <div><h2>Proyectos de guion</h2><span className="k-muted">{projects.length} guardados</span></div>
        <button className="k-button k-button-secondary" type="button" onClick={load} disabled={loading}>
          {loading ? "Cargando..." : "Actualizar"}
        </button>
      </div>

      {error && (
        <div className="k-state k-state-error" role="alert">
          <p>{error}</p>
          <button className="k-button k-button-secondary" type="button" onClick={load}>Reintentar</button>
        </div>
      )}

      {loading ? (
        <Spinner size="lg" label="Cargando proyectos..." />
      ) : projects.length === 0 ? (
        <EmptyState
          title="Todavía no hay proyectos guardados"
          description="Genera un guion y pulsa «Guardar proyecto» para conservar su estructura."
        />
      ) : (
        <div className="k-history-list">
          {projects.map((project) => {
            const key = project._id;
            return (
              <article className="k-history-row k-surface" key={key}>
                <strong>{project.title}</strong>
                <span>
                  {formatDate(project.updatedAt || project.createdAt)} · {project.type} · {project.genre} ·{" "}
                  {project.durationMinutes} min
                </span>
                <p>{project.result?.slice(0, 200) || project.structure?.logline || "Sin logline."}</p>
                <div className="k-button-group">
                  <button
                    className="k-button k-button-secondary"
                    type="button"
                    onClick={() => open(project)}
                    disabled={Boolean(busy)}
                  >
                    {busy === `open-${key}` ? "Abriendo..." : "Abrir"}
                  </button>
                  <button
                    className="k-button k-button-secondary"
                    type="button"
                    onClick={() => download(project, "txt")}
                    disabled={Boolean(busy)}
                  >
                    {busy === `export-${key}` ? "Exportando..." : "Exportar .txt"}
                  </button>
                  <button
                    className="k-button k-button-secondary"
                    type="button"
                    onClick={() => download(project, "json")}
                    disabled={Boolean(busy)}
                  >
                    Exportar .json
                  </button>
                  <button
                    className="k-button k-button-ghost"
                    type="button"
                    onClick={() => remove(project)}
                    disabled={Boolean(busy)}
                  >
                    {busy === `delete-${key}` ? "Eliminando..." : "Eliminar"}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
