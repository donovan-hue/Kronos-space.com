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
import { SECTION_LABELS, getCurrentSection } from "../navigation/model.jsx";
import { planSectionShift } from "../navigation/navTransition";
import { KronosBrand } from "../components/brand/KronosBrand.jsx";

/**
 * Shell de la aplicación autenticada.
 *
 * La navegación es un sistema de dos capas que comparten el MISMO
 * modelo (navigation/model.jsx):
 *
 *   1. Barra inferior de cinco destinos, fija a cualquier ancho, y menú de
 *      secciones con el resto del modelo. Una sola barra superior acompaña a
 *      ambas: marca, contexto de sección y accesos (búsqueda, notificaciones,
 *      mensajes, atajos). Los destinos son los reales del router y se
 *      distinguen por su emoji y su nombre. Sin marcos, sin descripciones y
 *      sin mapa flotante: la lista es la única forma de elegir destino.
 *   2. Transiciones direccionales: entre secciones, el plano nuevo
 *      entra desde el lado hacia el que apunta el recorrido dentro del
 *      anillo (afuera → entra por la derecha; POP invierte). La
 *      continuidad mantiene la orientación: no es decoración.
 *
 * La cadena es INTERACCIÓN → ESTADO → ROUTER → PANTALLA REAL → DATOS
 * REALES: ninguna capa de navegación mantiene rutas propias.
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
  const sectionLabel = SECTION_LABELS[section] || "Kronos";
  // Un solo panel del shell puede poseer backdrop, foco y bloqueo de scroll.
  const [panel, setPanel] = useState(null);
  const [panelLocation, setPanelLocation] = useState(location.key);
  if (panelLocation !== location.key) {
    setPanelLocation(location.key);
    setPanel(null);
  }
  const searchOpen = panel === "search";
  const shortcutsOpen = panel === "shortcuts";
  const drawerOpen = panel === "drawer";

  // ---------------------------------------------------------------
  // Coreografía de planos (render-phase, idempotente bajo StrictMode):
  // al cambiar de sección se calcula UNA vez el plan de entrada/salida
  // según la distancia real entre secciones. En montaje/refresh no hay
  // sección previa → reposo (las vistas nunca se re-animan solas).
  // ---------------------------------------------------------------
  const sectionRef = useRef(section);
  const planRef = useRef({ enterX: 0, enterScale: 1, exitX: 0 });
  // KRONOS-NATURAL-SCROLL — el documento vuelve a utilizar el scroll
  // nativo del navegador. Los overlays/drawers pueden bloquear el body
  // temporalmente sin convertir una columna interna en el scroller.
  useEffect(() => {
    if (typeof window === "undefined") return;
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [location.pathname]);

  if (sectionRef.current !== section) {
    planRef.current = planSectionShift(sectionRef.current, section, navType);
    sectionRef.current = section;
  }

  // Atajos globales de teclado: ⌘K / Ctrl+K y ? (ayuda)
  useEffect(() => {
    function handleKeyDown(event) {
      if (event.repeat || event.defaultPrevented) return;
      // No apilar el shell sobre diálogos de una pantalla (editar, reportar…).
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
        return;
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
              <button
                type="button"
                className="k-topbar-menu-btn"
                onClick={() => setPanel("drawer")}
                aria-label="Abrir más secciones"
                aria-haspopup="dialog"
                aria-expanded={drawerOpen}
                title="Más secciones"
              >
                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <line x1="3" y1="6" x2="21" y2="6" />
                  <line x1="3" y1="12" x2="21" y2="12" />
                  <line x1="3" y1="18" x2="21" y2="18" />
                </svg>
              </button>
              <KronosBrand text="K" className="k-app-topbar-mark" size={0.95} />
              <strong>{sectionLabel}</strong>
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
                aria-label="Notificaciones"
                title="Notificaciones"
              >
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
                  <path d="M13.7 21a2 2 0 0 1-3.4 0" />
                </svg>
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
                className="k-topbar-shortcut-btn"
                onClick={() => setPanel("shortcuts")}
                title="Atajos de teclado (?)"
                aria-label="Ver atajos de teclado (?)"
                aria-haspopup="dialog"
                aria-expanded={shortcutsOpen}
              >
                ?
              </button>
            </nav>
          </header>
          <main id="main-content" className="k-main-content" tabIndex="-1">
            {/* La salida del mapa cierra con el foco restaurado en su
                trigger (Radix); aquí solo se consume el plan. */}
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                className="k-route-view"
                key={location.pathname}
                initial={{ opacity: 0, y: 8, x: plan.enterX, scale: plan.enterScale }}
                animate={{ opacity: 1, y: 0, x: 0, scale: 1 }}
                exit={{ opacity: 0, y: -5, x: plan.exitX, scale: 1.008 }}
                transition={{ duration: 0.2, ease: [0.21, 0.6, 0.35, 1] }}
              >
                {/* FASE 8 — la ruta llega en su propio trozo de JavaScript.
                    El límite de suspensión vive AQUÍ, dentro del shell: la
                    navegación y la cabecera siguen en pantalla y solo el
                    contenido muestra el estado de carga. */}
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
