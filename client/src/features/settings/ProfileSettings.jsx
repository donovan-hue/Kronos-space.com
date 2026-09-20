import { Link } from "react-router-dom";
import ProfilePrivacy from "./ProfilePrivacy";

/**
 * Página de privacidad del perfil.
 *
 * Los datos visibles del perfil (nombre, biografía, avatar y portada) viven
 * en la pantalla del perfil. Esta página solo aloja los controles de
 * privacidad que no tienen otro hogar en la app.
 */
export default function ProfileSettings() {
  return (
    <section className="page">
      <header className="k-page-header">
        <div>
          <h1>Configurar privacidad</h1>
          <p>Elige qué parte de tu perfil ven las demás personas.</p>
        </div>
        <Link className="k-button k-button-ghost" to="/profile">
          Ir a mi perfil
        </Link>
      </header>
      <ProfilePrivacy />
    </section>
  );
}
