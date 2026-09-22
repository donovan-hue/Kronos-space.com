import { Navigate, Outlet, useLocation } from "react-router-dom";
import Spinner from "../components/ui/Spinner";

/**
 * Mientras la sesión se hidrata (`ready === false`) muestra un esqueleto
 * en lugar de redirigir a /login: evita el parpadeo de "no autenticado"
 * en cada recarga con sesión válida.
 */
export default function ProtectedRoute({ user, ready = true }) {
  const location = useLocation();

  if (!ready) {
    return (
      <section className="page" aria-label="Cargando sesión">
        <div className="k-feed-state">
          <Spinner label="Verificando tu sesión…" />
        </div>
      </section>
    );
  }

  return user ? <Outlet /> : <Navigate replace to="/login" state={{ from: location }} />;
}
