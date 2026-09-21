import { NavLink, Outlet, useLocation } from "react-router-dom";
import { AnimatePresence, motion } from "motion/react";
import FanNav, { getCurrentSection } from "../components/FanNav";
import OfflineNotice from "../components/feedback/OfflineNotice";

const SECTION_LABELS = {
  home: "Inicio",
  explore: "Explorar",
  create: "Crear publicación",
  messages: "Mensajes directos",
  groups: "Grupos",
  notifications: "Notificaciones",
  saved: "Guardados",
  profile: "Perfil",
  kairos: "Kairos",
  settings: "Configuración",
  moderation: "Moderación"
};

/**
 * Shell de la aplicación autenticada.
 *
 * La navegación está separada por dominios visibles: Social, Kairos y
 * Cuenta. Las rutas existentes se conservan; el shell únicamente hace
 * explícita la jerarquía para que el usuario descubra lo que ya existe.
 */
export default function AppLayout() {
  const location = useLocation();
  const section = getCurrentSection(location.pathname);
  const sectionLabel = SECTION_LABELS[section] || "Kronos";

  return (
    <div className="k-app-shell k-app-shell-navigation">
      <a className="k-skip-link" href="#main-content">Saltar al contenido principal</a>
      <OfflineNotice />
      <div className="k-app-workspace">
        <FanNav />
        <div className="k-app-main-column">
          <header className="k-app-topbar" aria-label="Contexto de navegación">
            <div className="k-app-topbar-context">
              <span className="k-app-topbar-kicker">KRONOS SOCIAL</span>
              <strong>{sectionLabel}</strong>
            </div>
            <nav className="k-app-topbar-actions" aria-label="Accesos de cuenta">
              <NavLink to="/notifications">Notificaciones</NavLink>
              <NavLink to="/profile">Perfil</NavLink>
            </nav>
          </header>
          <main id="main-content" className="k-main-content" tabIndex="-1">
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={location.pathname}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.18, ease: "easeOut" }}
                style={{ willChange: "opacity, transform" }}
              >
                <Outlet />
              </motion.div>
            </AnimatePresence>
          </main>
        </div>
      </div>
    </div>
  );
}
