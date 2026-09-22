import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { AnimatePresence, motion } from "motion/react";
import FanNav, { getCurrentSection } from "../components/FanNav";
import OfflineNotice from "../components/feedback/OfflineNotice";
import GlobalSearchModal from "../components/search/GlobalSearchModal";

const SECTION_LABELS = {
  home: "Inicio",
  explore: "Explorar",
  create: "Centro de creación",
  messages: "Mensajes directos",
  groups: "Grupos",
  channels: "Canales",
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
  const [searchOpen, setSearchOpen] = useState(false);

  // Atajo global de teclado ⌘K / Ctrl+K
  useEffect(() => {
    function handleKeyDown(event) {
      if ((event.metaKey || event.ctrlKey) && (event.key === "k" || event.key === "K")) {
        event.preventDefault();
        setSearchOpen((prev) => !prev);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  return (
    <div className="k-app-shell k-app-shell-navigation">
      <a className="k-skip-link" href="#main-content">Saltar al contenido principal</a>
      <OfflineNotice />
      <GlobalSearchModal isOpen={searchOpen} onClose={() => setSearchOpen(false)} />
      <div className="k-app-workspace">
        <FanNav />
        <div className="k-app-main-column">
          <header className="k-app-topbar" aria-label="Contexto de navegación">
            <div className="k-app-topbar-context">
              <span className="k-app-topbar-mark" aria-hidden="true">K</span>
              <strong>{sectionLabel}</strong>
            </div>
            <button
              type="button"
              className="k-topbar-search-trigger"
              onClick={() => setSearchOpen(true)}
              aria-label="Abrir búsqueda global (⌘K)"
            >
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <circle cx="11" cy="11" r="7" />
                <path d="m16.5 16.5 4.5 4.5" />
              </svg>
              <span>Buscar personas, temas, órbitas…</span>
              <kbd>⌘K</kbd>
            </button>
            <nav className="k-app-topbar-actions" aria-label="Accesos rápidos">
              <NavLink to="/explore">Explorar</NavLink>
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
