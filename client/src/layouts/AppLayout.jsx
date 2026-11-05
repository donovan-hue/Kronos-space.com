import { Suspense, useEffect, useRef, useState } from "react";
import { NavLink, useOutlet, useLocation, useNavigationType } from "react-router-dom";
import { AnimatePresence, motion } from "motion/react";
import { useShellMetrics } from "./useShellMetrics";
import TabBar from "../components/navigation/TabBar";
import OfflineNotice from "../components/feedback/OfflineNotice";
import RouteFallback from "../components/feedback/RouteFallback";
import GlobalSearchModal from "../components/search/GlobalSearchModal";
import ShortcutsModal from "../components/shortcuts/ShortcutsModal";
import MenuDrawer from "../components/navigation/MenuDrawer";
import useUnreadNotifications from "../components/navigation/useUnreadNotifications";
import { getCurrentSection } from "../navigation/model.jsx";
import { planSectionShift } from "../navigation/navTransition";
import { KronosBrand } from "../components/brand/KronosBrand.jsx";

/**
 * Shell de la aplicación autenticada.
 *
 * La navegación combina la barra inferior de cinco destinos, el menú
 * complementario de secciones y una cabecera compacta con la marca y accesos
 * directos. El modelo de navegación y las rutas siguen siendo la fuente de
 * verdad para todos los destinos.
 */
export default function AppLayout() {
  const shellRef = useShellMetrics();
  const location = useLocation();
  // Freeze the routed element in each transition child. A live <Outlet />
  // inside an exiting child reads the new route and briefly mounts its editor
  // twice, discarding text typed during the exit animation.
  const outlet = useOutlet();
  const navType = useNavigationType();
  const section = getCurrentSection(location.pathname);
  // Un solo panel del shell puede poseer backdrop, foco y bloqueo de scroll.
  const [panel, setPanel] = useState(null);
  const searchOpen = panel === "search";
  const shortcutsOpen = panel === "shortcuts";
  const drawerOpen = panel === "drawer";
  // Campana: la cifra vive en el shell, no en la pantalla de notificaciones.
  const { count: unreadNotifications } = useUnreadNotifications();

  // Cierra overlays al volver/avanzar con la navegación del navegador.
  useEffect(() => {
    if (navType === "POP") setPanel(null);
  }, [navType, location.key]);

  // ---------------------------------------------------------------
  // Coreografía de planos según la distancia real entre secciones.
  // ---------------------------------------------------------------
  const sectionRef = useRef(section);
  const planRef = useRef({ enterX: 0, enterScale: 1, exitX: 0 });
  // El documento conserva el scroll nativo del navegador.
  useEffect(() => {
    if (typeof window === "undefined") return;
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [location.pathname]);

  if (sectionRef.current !== section) {
    planRef.current = planSectionShift(sectionRef.current, section, navType);
    sectionRef.current = section;
  }

  // Atajos globales de teclado: ⌘K / Ctrl+K y ? (ayuda).
  useEffect(() => {
    function handleKeyDown(event) {
      if (event.repeat || event.defaultPrevented) return;
      if (!panel && document.querySelector('[role="dialog"]')) return;
      const activeTag = document.activeElement?.tagName?.toLowerCase();
      const isInputFocused = activeTag === "input" || activeTag === "textarea" || activeTag === "select" || document.activeElement?.isContentEditable;

      if ((event.metaKey || event.ctrlKey) && (event.key === "k" || event.key === "K")) {
        event.preventDefault();
        if (panel && panel !== "search") return;
        setPanel((prev) => prev === "search" ? null : "search");
        return;
      }

      if (event.key === "?" && !isInputFocused && !event.metaKey && !event.ctrlKey && !event.altKey) {
        event.preventDefault();
        if (panel && panel !== "shortcuts") return;
        setPanel((prev) => prev === "shortcuts" ? null : "shortcuts");
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [panel]);

  const plan = planRef.current;

  return (
    <div ref={shellRef} className="k-app-shell k-app-shell-navigation">
      <a className="k-skip-link" href="#main-content">Saltar al contenido principal</a>
      <GlobalSearchModal isOpen={searchOpen} onClose={() => setPanel(null)} />
      <ShortcutsModal isOpen={shortcutsOpen} onClose={() => setPanel(null)} />
      <MenuDrawer isOpen={drawerOpen} onClose={() => setPanel(null)} />
      <div className="k-app-workspace">
        <div className="k-app-main-column">
          <header className="k-app-topbar" aria-label="Contexto de navegación">
            <OfflineNotice />
            <div className="k-app-topbar-context">
              <NavLink to="/home" className="k-app-topbar-brand" aria-label="KRONOS, ir a Inicio">
                <KronosBrand text="KRONOS" size={0.95} />
              </NavLink>
            </div>
            <nav className="k-app-topbar-actions" aria-label="Accesos rápidos">
              <button
                type="button"
                className="k-topbar-search-trigger k-topbar-icon-btn"
                onClick={() => setPanel("search")}
                aria-label="Abrir búsqueda global (⌘K)"
                title="Buscar (⌘K)"
                aria-haspopup="dialog"
                aria-expanded={searchOpen}
              >
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                  <circle cx="11" cy="11" r="7" />
                  <path d="m16.5 16.5 4.5 4.5" />
                </svg>
              </button>
              <NavLink
                to="/notifications"
                className={({ isActive }) => `k-topbar-icon-btn ${isActive ? "is-active" : ""}`}
                aria-label={
                  unreadNotifications > 0
                    ? `Notificaciones · ${unreadNotifications} sin leer`
                    : "Notificaciones"
                }
                title={
                  unreadNotifications > 0
                    ? `Notificaciones · ${unreadNotifications} sin leer`
                    : "Notificaciones"
                }
              >
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
                  <path d="M13.7 21a2 2 0 0 1-3.4 0" />
                </svg>
                {unreadNotifications > 0 && (
                  <span className="k-topbar-badge" aria-hidden="true">
                    {unreadNotifications > 99 ? "99+" : unreadNotifications}
                  </span>
                )}
              </NavLink>
              <NavLink
                to="/messages"
                className={({ isActive }) => `k-topbar-icon-btn ${isActive ? "is-active" : ""}`}
                aria-label="Mensajes"
                title="Mensajes"
              >
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <rect x="2.5" y="4.5" width="19" height="15" rx="2.5" />
                  <path d="m3 7 9 6 9-6" />
                </svg>
              </NavLink>
              <button
                type="button"
                className="k-topbar-menu-btn"
                onClick={() => setPanel("drawer")}
                aria-label="Abrir más secciones"
                aria-haspopup="dialog"
                aria-expanded={drawerOpen}
                title="Todas las secciones"
              >
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <rect x="3.5" y="3.5" width="6" height="6" rx="1" />
                  <rect x="14.5" y="3.5" width="6" height="6" rx="1" />
                  <rect x="3.5" y="14.5" width="6" height="6" rx="1" />
                  <rect x="14.5" y="14.5" width="6" height="6" rx="1" />
                </svg>
              </button>
            </nav>
          </header>
          <main id="main-content" className="k-main-content" tabIndex="-1">
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                className="k-route-view"
                key={location.pathname}
                initial={{ opacity: 0, y: 8, x: plan.enterX, scale: plan.enterScale }}
                animate={{ opacity: 1, y: 0, x: 0, scale: 1 }}
                exit={{ opacity: 0, y: -5, x: plan.exitX, scale: 1.008 }}
                transition={{ duration: 0.2, ease: [0.21, 0.6, 0.35, 1] }}
              >
                <Suspense fallback={<RouteFallback />}>
                  {outlet}
                </Suspense>
              </motion.div>
            </AnimatePresence>
          </main>
          <TabBar />
        </div>
      </div>
    </div>
  );
}
