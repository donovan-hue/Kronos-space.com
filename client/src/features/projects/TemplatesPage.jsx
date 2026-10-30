import { Link } from "react-router-dom";

import { PLANTILLAS } from "./templates";

/** PLANTILLAS DE FORMATO — reel, cuadrado, panorámica y portada con rótulos ya armados. */
export default function TemplatesPage() {
  return (
    <section className="page k-feature-page k-projects-page">
      <header className="k-page-header">
        <div>
          <h1>Plantillas de formato</h1>
          <p>Cuatro formatos con los rótulos ya escritos: vertical, cuadrado, panorámica y horizontal. Se pueden editar después.</p>
        </div>
        <div className="k-feature-actions">
          <Link className="k-button k-button-secondary" to="/projects">Volver a proyectos</Link>
        </div>
      </header>

      <ul className="k-templates-grid">
        {PLANTILLAS.map((plantilla) => (
          <li className="k-template-card k-surface" key={plantilla.id}>
            <div className={`k-template-preview is-${plantilla.id}`} aria-hidden="true">
              <span>{plantilla.nombre}</span>
            </div>
            <div className="k-template-body">
              <h2>{plantilla.nombre}</h2>
              <p className="k-muted">{plantilla.detalle}</p>
              <ul className="k-template-meta">
                <li>{plantilla.ratio}</li>
                <li>{plantilla.duracion}</li>
                <li>{plantilla.escenas.length} escenas</li>
              </ul>
              <ol className="k-template-scenes">
                {plantilla.escenas.map((escena) => (
                  <li key={escena.title}>{escena.title}</li>
                ))}
              </ol>
              <Link className="k-button k-button-primary" to={`/projects?plantilla=${plantilla.id}`}>
                Crear proyecto con esta plantilla
              </Link>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
