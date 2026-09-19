import { Outlet } from "react-router-dom";
import FanNav from "../components/FanNav";
import OfflineNotice from "../components/feedback/OfflineNotice";

/**
 * Shell de la app autenticada: sin barra superior de marca (la
 * navegación completa vive en el abanico inferior, FanNav). El nombre
 * de la marca solo se muestra en las pantallas de autenticación
 * (Login/Registro/Recuperación), no en cada pantalla interna.
 */
export default function AppLayout() {
  return (
    <div className="k-app-shell k-app-shell-fan">
      <a className="k-skip-link" href="#main-content">Saltar al contenido principal</a>
      <OfflineNotice />
      <main id="main-content" className="k-main-content" tabIndex="-1">
        <Outlet />
      </main>
      <FanNav />
    </div>
  );
}
