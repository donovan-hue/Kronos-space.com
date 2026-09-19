import { Link } from "react-router-dom";
import ProfilePrivacy from "./ProfilePrivacy";

/**
 * Página de privacidad del perfil.
 *
 * KRONOS-AUDIT-006: los datos básicos del perfil (nombre, biografía,
 * avatar, portada) se editan en un único lugar — el modal "Editar perfil"
 * dentro de Profile.jsx, que además permite recortar imágenes. Esta página
 * ya no repite ese formulario: solo aloja los controles de privacidad que
 * no tienen otro hogar en la app.
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
