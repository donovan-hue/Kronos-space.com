import { useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { createProject, getProjects } from "../../services/projectsService";
import { NOMBRE_FORMATO, PLANTILLAS, plantillaPorId } from "./templates";
import EmptyState from "../../components/ui/EmptyState";
import { useToast } from "../../components/feedback/ToastProvider";

/** PROYECTOS — lista de piezas con su plantilla y su avance. */
export default function ProjectsPage() {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const plantilla = plantillaPorId(searchParams.get("plantilla") || "");

  const [titulo, setTitulo] = useState(plantilla ? `${plantilla.nombre} sin título` : "");
  const [formato, setFormato] = useState(plantilla?.format || "libre");
  const [brief, setBrief] = useState("");
  const [error, setError] = useState("");

  const proyectos = useQuery({
    queryKey: ["projects"],
    queryFn: () => getProjects()
  });

  const crear = useMutation({
    mutationFn: () =>
      createProject({
        title: titulo,
        brief,
        format: formato,
        scenes: plantilla ? plantilla.escenas : []
      }),
    onSuccess: (project) => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      showToast("Proyecto creado.", { tone: "success" });
      navigate(`/projects/${project._id}`);
    },
    onError: (err) => setError(err.response?.data?.error || err.message || "No se pudo crear el proyecto.")
  });

  function enviar(event) {
    event.preventDefault();
    setError("");
    if (!titulo.trim()) {
      setError("Ponle un nombre al proyecto.");
      return;
    }
    crear.mutate();
  }

  const resumen = useMemo(
    () => (proyectos.data || []).reduce(
      (acc, project) => ({
        escenas: acc.escenas + (project.scenes?.length || 0),
        versiones: acc.versiones + (project.versionsCount || 0)
      }),
      { escenas: 0, versiones: 0 }
    ),
    [proyectos.data]
  );

  return (
    <section className="page k-feature-page k-projects-page">
      <header className="k-page-header">
        <div>
          <h1>Proyectos</h1>
          <p>Un tablero por pieza: guion, tomas, música y versiones.</p>
        </div>
        <div className="k-feature-actions">
          <Link className="k-button k-button-secondary" to="/projects/plantillas">Plantillas de formato</Link>
          <Link className="k-button k-button-secondary" to="/pantallas">Todas las funciones</Link>
        </div>
      </header>

      <form className="k-projects-create k-surface" onSubmit={enviar}>
        <h2>Nuevo proyecto</h2>
        <div className="k-projects-create-row">
          <label>
            Nombre
            <input
              className="k-input"
              type="text"
              maxLength={120}
              value={titulo}
              onChange={(event) => setTitulo(event.target.value)}
              placeholder="Reel de lanzamiento"
            />
          </label>
          <label>
            Formato
            <select className="k-input" value={formato} onChange={(event) => setFormato(event.target.value)}>
              {Object.entries(NOMBRE_FORMATO).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </label>
        </div>
        <label>
          Idea o encargo
          <textarea
            className="k-input"
            rows={3}
            maxLength={2000}
            value={brief}
            onChange={(event) => setBrief(event.target.value)}
            placeholder="Para qué es, a quién habla y qué debe quedar claro."
          />
        </label>
        <div className="k-feature-actions">
          <button className="k-button k-button-primary" type="submit" disabled={crear.isPending}>
            {crear.isPending ? "Creando…" : plantilla ? `Crear con ${plantilla.nombre}` : "Crear proyecto"}
          </button>
          {plantilla && (
            <Link className="k-button k-button-ghost" to="/projects">Empezar sin plantilla</Link>
          )}
        </div>
        {error && <p className="k-state k-state-error" role="alert">{error}</p>}
      </form>

      <div className="k-projects-summary" role="status">
        <span><strong>{(proyectos.data || []).length}</strong> proyectos</span>
        <span><strong>{resumen.escenas}</strong> escenas</span>
        <span><strong>{resumen.versiones}</strong> versiones guardadas</span>
      </div>

      {proyectos.isPending && <p role="status">Cargando proyectos…</p>}
      {proyectos.isError && (
        <div className="k-state k-state-error" role="alert">
          <p>No se pudieron cargar los proyectos.</p>
          <button className="k-button k-button-secondary" type="button" onClick={() => proyectos.refetch()}>
            Reintentar
          </button>
        </div>
      )}

      {!proyectos.isPending && !proyectos.isError && !(proyectos.data || []).length && (
        <EmptyState
          title="Todavía no hay proyectos"
          description="Crea el primero o parte de una plantilla de formato."
          action={<Link className="k-button k-button-secondary" to="/projects/plantillas">Ver plantillas</Link>}
        />
      )}

      <ul className="k-projects-list">
        {(proyectos.data || []).map((project) => (
          <li className="k-project-card k-surface" key={project._id}>
            <Link className="k-project-card-link" to={`/projects/${project._id}`}>
              <div className="k-project-card-head">
                <span className="k-project-format">{NOMBRE_FORMATO[project.format] || project.format}</span>
                <h2>{project.title}</h2>
              </div>
              {project.brief && <p className="k-muted">{project.brief}</p>}
              <div className="k-project-meta">
                <span>{project.scenes?.length || 0} escenas</span>
                <span>{project.versionsCount || 0} versiones</span>
                {project.updatedAt && (
                  <time dateTime={project.updatedAt}>
                    {new Date(project.updatedAt).toLocaleDateString("es-MX")}
                  </time>
                )}
              </div>
            </Link>
          </li>
        ))}
      </ul>

      {PLANTILLAS.length > 0 && (
        <aside className="k-projects-tip k-muted">
          <p>Las plantillas traen los rótulos escritos: puedes cambiarlos después.</p>
        </aside>
      )}
    </section>
  );
}
