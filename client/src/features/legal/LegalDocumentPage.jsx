import { Link } from "react-router-dom";
import { LEGAL_LINKS, VERSION_LEGAL } from "./legalDocuments";

/**
 * Hoja de un documento legal.
 *
 * Se escribe con las clases que ya existen en la hoja única de estilos: una
 * página de texto no necesita una hoja propia, y el barrido de utilidades del
 * CI falla si aparece una clase sin regla.
 */
export default function LegalDocumentPage({ doc }) {
  if (!doc) return null;
  const hermanas = LEGAL_LINKS.filter((enlace) => enlace.slug !== doc.slug);

  return (
    <main className="page k-feature-page">
      <header className="k-page-header">
        <div>
          <p className="k-eyebrow">{doc.eyebrow}</p>
          <h1>{doc.title}</h1>
          <p className="k-muted">{doc.intro}</p>
          <p className="k-muted">Versión {VERSION_LEGAL}</p>
        </div>
        <div className="k-auth-utility-row">
          {hermanas.map((enlace) => (
            <Link key={enlace.slug} to={`/${enlace.slug}`} className="k-link-subtle">
              {enlace.label}
            </Link>
          ))}
        </div>
      </header>

      {doc.sections.map((seccion) => (
        <section className="k-surface k-settings-section" key={seccion.heading}>
          <h2>{seccion.heading}</h2>
          {(seccion.paragraphs || []).map((parrafo, indice) => (
            // El documento es estático: el orden no cambia entre renders.
            <p key={`${seccion.heading}-${indice}`}>{parrafo}</p>
          ))}
          {seccion.list && (
            <ul>
              {seccion.list.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          )}
        </section>
      ))}

      <p className="k-muted">
        <Link to="/" className="k-link-subtle">Volver al inicio</Link>
        {" · "}
        <Link to="/estado" className="k-link-subtle">Estado del servicio</Link>
      </p>
    </main>
  );
}
