import { Link } from "react-router-dom";
import CreatePost from "../social/CreatePost";

export default function StudioPage() {
  return (
    <section className="page">
      <header className="k-page-header">
        <div>
          <h1>Estudio de foto y video</h1>
          <p>Selecciona una foto para abrir el estudio. Para un video, adjúntalo y pulsa «Editar video». Filtros, ajustes, texto, música y voz usan el editor existente.</p>
          <p>Aplicar una edición no publica: revisa el compositor y confirma cuando quieras compartir.</p>
        </div>
        <Link className="k-button k-button-secondary" to="/pantallas">Todas las funciones</Link>
      </header>
      <CreatePost />
    </section>
  );
}
