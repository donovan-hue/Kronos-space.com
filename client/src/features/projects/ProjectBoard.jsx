import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  createProjectVersion,
  deleteProject,
  deleteProjectVersion,
  getProject,
  updateProject
} from "../../services/projectsService";
import { NOMBRE_FORMATO } from "./templates";
import { useToast } from "../../components/feedback/ToastProvider";
import { useConfirm } from "../../components/feedback/ConfirmProvider";

const nombreVersion = (version, indice) => version.label || `Versión ${indice + 1}`;

const TABS = [
  { id: "escenas", label: "Guion y escenas" },
  { id: "musica", label: "Música" },
  { id: "versiones", label: "Versiones" }
];

let KEY = 0;
const newSceneKey = () => `s${Date.now()}-${KEY++}`;

/** Compara dos versiones escena por escena. */
function comparar(a, b) {
  const left = a?.snapshot?.scenes || [];
  const right = b?.snapshot?.scenes || [];
  const total = Math.max(left.length, right.length);
  const filas = [];
  for (let i = 0; i < total; i += 1) {
    const l = left[i];
    const r = right[i];
    const cambio =
      (l?.title || "") !== (r?.title || "") ||
      (l?.script || "") !== (r?.script || "") ||
      (l?.mediaUrl || "") !== (r?.mediaUrl || "");
    filas.push({ index: i, left: l, right: r, cambio });
  }
  return {
    filas,
    cambiadas: filas.filter((fila) => fila.cambio).length,
    escenasA: left.length,
    escenasB: right.length
  };
}

export default function ProjectBoard() {
  const { projectId } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = TABS.some((item) => item.id === searchParams.get("tab"))
    ? searchParams.get("tab")
    : "escenas";

  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const confirm = useConfirm();
  const navigate = useNavigate();

  const proyecto = useQuery({
    queryKey: ["project", projectId],
    queryFn: () => getProject(projectId),
    enabled: Boolean(projectId)
  });

  const [titulo, setTitulo] = useState("");
  const [brief, setBrief] = useState("");
  const [formato, setFormato] = useState("libre");
  const [escenas, setEscenas] = useState([]);
  const [musicaTitulo, setMusicaTitulo] = useState("");
  const [musicaUrl, setMusicaUrl] = useState("");
  const [error, setError] = useState("");
  const [etiquetaVersion, setEtiquetaVersion] = useState("");
  const [compararA, setCompararA] = useState("");
  const [compararB, setCompararB] = useState("");

  const project = proyecto.data;

  useEffect(() => {
    if (!project) return;
    setTitulo(project.title || "");
    setBrief(project.brief || "");
    setFormato(project.format || "libre");
    setEscenas((project.scenes || []).map((scene) => ({ ...scene, key: newSceneKey() })));
    setMusicaTitulo(project.musicTitle || "");
    setMusicaUrl(project.musicUrl || "");
  }, [project]);

  const guardar = useMutation({
    mutationFn: () =>
      updateProject(projectId, {
        title: titulo,
        brief,
        format: formato,
        musicTitle: musicaTitulo,
        musicUrl: musicaUrl,
        scenes: escenas.map((scene, index) => ({
          order: index,
          title: scene.title || "",
          script: scene.script || "",
          mediaUrl: scene.mediaUrl || "",
          mediaType: scene.mediaType || ""
        }))
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["project", projectId] });
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      setError("");
      showToast("Proyecto guardado.", { tone: "success" });
    },
    onError: (err) => setError(err.response?.data?.error || err.message || "No se pudo guardar.")
  });

  const guardarVersion = useMutation({
    mutationFn: () => createProjectVersion(projectId, etiquetaVersion),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["project", projectId] });
      setEtiquetaVersion("");
      showToast("Versión guardada.", { tone: "success" });
    },
    onError: (err) => setError(err.response?.data?.error || err.message || "No se pudo guardar la versión.")
  });

  const borrarVersion = useMutation({
    mutationFn: (versionId) => deleteProjectVersion(projectId, versionId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["project", projectId] })
  });

  const borrarProyecto = useMutation({
    mutationFn: () => deleteProject(projectId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      navigate("/projects");
    }
  });

  const versiones = project?.versions || [];
  const versionA = versiones.find((version) => version._id === compararA) || null;
  const versionB = versiones.find((version) => version._id === compararB) || null;
  const diff = useMemo(() => (versionA && versionB ? comparar(versionA, versionB) : null), [versionA, versionB]);

  function mover(indice, delta) {
    setEscenas((actual) => {
      const destino = indice + delta;
      if (destino < 0 || destino >= actual.length) return actual;
      const copia = [...actual];
      [copia[indice], copia[destino]] = [copia[destino], copia[indice]];
      return copia;
    });
  }

  function editarEscena(indice, campo, valor) {
    setEscenas((actual) => actual.map((scene, i) => (i === indice ? { ...scene, [campo]: valor } : scene)));
  }

  if (proyecto.isPending) {
    return <section className="page k-feature-page"><p role="status">Cargando proyecto…</p></section>;
  }

  if (proyecto.isError || !project) {
    return (
      <section className="page k-feature-page">
        <div className="k-state k-state-error" role="alert">
          <p>No se pudo cargar el proyecto.</p>
          <div className="k-feature-actions">
            <button className="k-button k-button-secondary" type="button" onClick={() => proyecto.refetch()}>Reintentar</button>
            <Link className="k-button k-button-secondary" to="/projects">Volver a proyectos</Link>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="page k-feature-page k-project-board">
      <header className="k-page-header">
        <div>
          <p className="k-eyebrow">{NOMBRE_FORMATO[project.format] || project.format}</p>
          <input
            className="k-project-title-input"
            value={titulo}
            maxLength={120}
            aria-label="Nombre del proyecto"
            onChange={(event) => setTitulo(event.target.value)}
          />
          <p className="k-muted">
            {escenas.length} escenas · {versiones.length} versiones · actualizado{" "}
            {new Date(project.updatedAt).toLocaleDateString("es-MX")}
          </p>
        </div>
        <div className="k-feature-actions">
          <button className="k-button k-button-primary" type="button" onClick={() => guardar.mutate()} disabled={guardar.isPending}>
            {guardar.isPending ? "Guardando…" : "Guardar cambios"}
          </button>
          <Link className="k-button k-button-secondary" to="/projects">Proyectos</Link>
        </div>
      </header>

      {error && <p className="k-state k-state-error" role="alert">{error}</p>}

      <nav className="k-project-tabs" role="tablist" aria-label="Secciones del proyecto">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            id={`project-tab-${item.id}`}
            aria-controls={`project-panel-${item.id}`}
            className="k-project-tab"
            aria-selected={tab === item.id}
            onClick={() => setSearchParams(item.id === "escenas" ? {} : { tab: item.id })}
          >
            {item.label}
          </button>
        ))}
      </nav>

      {tab === "escenas" && (
        <div className="k-project-panel" role="tabpanel" id="project-panel-escenas" aria-labelledby="project-tab-escenas">
          <label className="k-project-brief">
            Idea o encargo
            <textarea className="k-input" rows={3} maxLength={2000} value={brief} onChange={(event) => setBrief(event.target.value)} />
          </label>

          <ol className="k-project-scenes">
            {escenas.map((scene, indice) => (
              <li className="k-project-scene k-surface" key={scene.key}>
                <div className="k-project-scene-head">
                  <span className="k-project-scene-order">{indice + 1}</span>
                  <input
                    className="k-input"
                    value={scene.title || ""}
                    maxLength={120}
                    placeholder="Título de la escena"
                    aria-label={`Título de la escena ${indice + 1}`}
                    onChange={(event) => editarEscena(indice, "title", event.target.value)}
                  />
                  <div className="k-project-scene-tools">
                    <button className="k-button k-button-ghost" type="button" onClick={() => mover(indice, -1)} aria-label="Subir escena">↑</button>
                    <button className="k-button k-button-ghost" type="button" onClick={() => mover(indice, 1)} aria-label="Bajar escena">↓</button>
                    <button
                      className="k-button k-button-ghost"
                      type="button"
                      onClick={() => setEscenas((actual) => actual.filter((_, i) => i !== indice))}
                      aria-label="Quitar escena"
                    >
                      ✕
                    </button>
                  </div>
                </div>
                <textarea
                  className="k-input"
                  rows={3}
                  maxLength={4000}
                  placeholder="Guion o indicaciones de esta escena"
                  aria-label={`Guion de la escena ${indice + 1}`}
                  value={scene.script || ""}
                  onChange={(event) => editarEscena(indice, "script", event.target.value)}
                />
                <input
                  className="k-input"
                  type="url"
                  placeholder="Enlace de la toma (imagen, video o audio)"
                  aria-label={`Enlace de la toma de la escena ${indice + 1}`}
                  value={scene.mediaUrl || ""}
                  onChange={(event) => editarEscena(indice, "mediaUrl", event.target.value)}
                />
              </li>
            ))}
          </ol>

          <div className="k-feature-actions">
            <button
              className="k-button k-button-secondary"
              type="button"
              onClick={() => setEscenas((actual) => [...actual, { key: newSceneKey(), title: "", script: "", mediaUrl: "", mediaType: "" }])}
            >
              Añadir escena
            </button>
          </div>
        </div>
      )}

      {tab === "musica" && (
        <div className="k-project-panel k-surface" role="tabpanel" id="project-panel-musica" aria-labelledby="project-tab-musica">
          <h2>Música de la pieza</h2>
          <p className="k-muted">Se guarda con la versión, así cada corte conserva su pista.</p>
          <label>
            Título de la pista
            <input className="k-input" value={musicaTitulo} maxLength={160} onChange={(event) => setMusicaTitulo(event.target.value)} />
          </label>
          <label>
            Enlace o archivo del servidor
            <input className="k-input" type="url" value={musicaUrl} onChange={(event) => setMusicaUrl(event.target.value)} />
          </label>
          {musicaUrl && <audio controls preload="none" src={musicaUrl} aria-label="Pista del proyecto" />}
          <div className="k-feature-actions">
            <Link className="k-button k-button-secondary" to="/kairos/catalogs">Ver catálogo de música</Link>
            <button className="k-button k-button-primary" type="button" onClick={() => guardar.mutate()} disabled={guardar.isPending}>
              Guardar música
            </button>
          </div>
        </div>
      )}

      {tab === "versiones" && (
        <div className="k-project-panel" role="tabpanel" id="project-panel-versiones" aria-labelledby="project-tab-versiones">
          <div className="k-project-version-new k-surface">
            <h2>Guardar una versión</h2>
            <p className="k-muted">Congela el guion, la música y el formato tal como están ahora.</p>
            <div className="k-projects-create-row">
              <label>
                Etiqueta (opcional)
                <input className="k-input" value={etiquetaVersion} maxLength={80} placeholder={`Versión ${versiones.length + 1}`} onChange={(event) => setEtiquetaVersion(event.target.value)} />
              </label>
              <button className="k-button k-button-primary" type="button" onClick={() => guardarVersion.mutate()} disabled={guardarVersion.isPending}>
                {guardarVersion.isPending ? "Guardando…" : "Guardar versión"}
              </button>
            </div>
          </div>

          {!versiones.length && <p role="status">Todavía no hay versiones guardadas.</p>}

          {versiones.length > 0 && (
            <ul className="k-project-versions">
              {versiones.map((version, indice) => (
                <li className="k-project-version k-surface" key={version._id}>
                  <div>
                    <strong>{nombreVersion(version, indice)}</strong>
                    <span className="k-muted">
                      {new Date(version.createdAt).toLocaleString("es-MX")} · {version.scenesCount} escenas
                    </span>
                  </div>
                  <div className="k-feature-actions">
                    <button className="k-button k-button-secondary" type="button" aria-label={`Usar ${nombreVersion(version, indice)} como A`} onClick={() => setCompararA(version._id)}>A</button>
                    <button className="k-button k-button-secondary" type="button" aria-label={`Usar ${nombreVersion(version, indice)} como B`} onClick={() => setCompararB(version._id)}>B</button>
                    <button className="k-button k-button-ghost" type="button" aria-label={`Eliminar ${nombreVersion(version, indice)}`} onClick={() => borrarVersion.mutate(version._id)}>Eliminar</button>
                  </div>
                </li>
              ))}
            </ul>
          )}

          {versiones.length > 0 && (
            <div className="k-project-compare">
              <h2>Comparar versiones</h2>
              <div className="k-projects-create-row">
                <label>
                  Versión A
                  <select className="k-input" value={compararA} onChange={(event) => setCompararA(event.target.value)}>
                    <option value="">Elige…</option>
                    {versiones.map((version, indice) => <option key={version._id} value={version._id}>{nombreVersion(version, indice)}</option>)}
                  </select>
                </label>
                <label>
                  Versión B
                  <select className="k-input" value={compararB} onChange={(event) => setCompararB(event.target.value)}>
                    <option value="">Elige…</option>
                    {versiones.map((version, indice) => <option key={version._id} value={version._id}>{nombreVersion(version, indice)}</option>)}
                  </select>
                </label>
              </div>

              {diff && (
                <>
                  <p role="status">
                    {diff.cambiadas} escena(s) distintas · A tiene {diff.escenasA}, B tiene {diff.escenasB}
                  </p>
                  <div className="k-compare-grid">
                    <div className="k-compare-head">Escena</div>
                    <div className="k-compare-head">A · {versionA.label || "Versión A"}</div>
                    <div className="k-compare-head">B · {versionB.label || "Versión B"}</div>
                    {diff.filas.map((fila) => (
                      <div className={`k-compare-row${fila.cambio ? " is-changed" : ""}`} key={fila.index}>
                        <span className="k-compare-index">{fila.index + 1}</span>
                        <div>
                          <strong>{fila.left?.title || "—"}</strong>
                          <p>{fila.left?.script || ""}</p>
                        </div>
                        <div>
                          <strong>{fila.right?.title || "—"}</strong>
                          <p>{fila.right?.script || ""}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          <div className="k-project-danger">
            <button
              className="k-button k-button-ghost"
              type="button"
              onClick={async () => {
                const seguro = await confirm({
                  title: "Eliminar el proyecto",
                  message: "Se borra el tablero y sus versiones. No se puede deshacer.",
                  confirmText: "Eliminar",
                  danger: true
                });
                if (seguro) borrarProyecto.mutate();
              }}
            >
              Eliminar proyecto
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
