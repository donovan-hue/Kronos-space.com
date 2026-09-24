import { useEffect, useRef, useState } from "react";
import { useOutlet, useLocation, useNavigationType } from "react-router-dom";
import { AnimatePresence, motion } from "motion/react";
import FanNav, { getCurrentSection } from "../components/FanNav";
import OfflineNotice from "../components/feedback/OfflineNotice";
import GlobalSearchModal from "../components/search/GlobalSearchModal";
import ShortcutsModal from "../components/shortcuts/ShortcutsModal";
import MenuDrawer from "../components/navigation/MenuDrawer";
import OrbitMap from "../components/navigation/OrbitMap";
import { SECTION_LABELS } from "../navigation/model.jsx";
import { planSectionShift } from "../navigation/navTransition";

/**
 * Shell de la aplicación autenticada.
 *
 * KRONOS-NAV3D — la navegación es un sistema espacial con tres capas
 * coherentes que comparten el MISMO modelo (navigation/model.jsx):
 *
 *   1. Shell plano: sidebar/bottom bar con profundidad material (los
 *      ítems reales del router, ahora con jerarquía legible en Z).
 *   2. Mapa orbital (tecla G): selección espacial de destinos reales;
 *      al elegir, el contenido entra con un "zoom al plano" destino.
 *   3. Transiciones direccionales: entre secciones, el plano nuevo
 *      entra desde el lado hacia el que apunta el recorrido dentro del
 *      anillo (afuera → entra por la derecha; POP invierte). La
 *      continuidad mantiene la orientación: no es decoración.
 *
 * La cadena es INTERACCIÓN → ESTADO → ROUTER → PANTALLA REAL → DATOS
 * REALES: ninguna capa 3D mantiene rutas propias.
 */
export default function AppLayout() {
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
  const orbitOpen = panel === "orbit";

  // ---------------------------------------------------------------
  // Coreografía de planos (render-phase, idempotente bajo StrictMode):
  // al cambiar de sección se calcula UNA vez el plan de entrada/salida
  // según la distancia real entre secciones. En montaje/refresh no hay
  // sección previa → reposo (las vistas nunca se re-animan solas).
  // ---------------------------------------------------------------
  const sectionRef = useRef(section);
  const planRef = useRef({ enterX: 0, enterScale: 1, exitX: 0 });
  const zoomStampRef = useRef(0);
  // KRONOS-SCROLL-CONTAINED — el scroll de la app vive ahora en la
  // columna principal, no en <body>. Así, cuando un diálogo de Radix
  // (drawer del hamburguesa, mapa orbital, buscador) bloquea el scroll
  // del body, no hay nada que desplazar: abrir o cerrar un panel no
  // mueve las publicaciones ni un píxel. Efecto colateral bueno: al
  // ser la columna el scroller directo, el topbar sticky se comporta
  // igual de bien y el reseteo por sección queda bajo nuestro control.
  const scrollerRef = useRef(null);

  useEffect(() => {
    if (typeof document === "undefined") return undefined;
    document.body.classList.add("k-app-scroll-contained");
    return () => document.body.classList.remove("k-app-scroll-contained");
  }, []);

  // Cambiar de ruta = empezar arriba (el contenedor de scroll es común a
  // todas las pantallas; sin esto heredarías el desplazamiento anterior).
  useEffect(() => {
    if (scrollerRef.current) scrollerRef.current.scrollTop = 0;
  }, [location.pathname]);

  if (sectionRef.current !== section) {
    const fromOrbit = performance.now() - zoomStampRef.current < 700;
    planRef.current = planSectionShift(sectionRef.current, section, navType, {
      zoom: fromOrbit
    });
    sectionRef.current = section;
  }

  // En escritorio la barra lateral ya contiene todos los destinos.
  // Al cruzar el breakpoint no debe quedar el overlay de un menú móvil.
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return undefined;
    const media = window.matchMedia("(max-width: 700px)");
    const closeDesktopDrawer = () => {
      if (!media.matches) setPanel((current) => current === "drawer" ? null : current);
    };
    media.addEventListener("change", closeDesktopDrawer);
    return () => media.removeEventListener("change", closeDesktopDrawer);
  }, []);

  // Atajos globales de teclado: ⌘K / Ctrl+K, ? (ayuda) y G (mapa orbital)
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

      // G = mapa orbital. Ignora inputs (escribir «g» en un campo no abre
      // nada) y cualquier modificador, para no pisar atajos del sistema.
      if ((event.key === "g" || event.key === "G") && !isInputFocused && !event.metaKey && !event.ctrlKey && !event.altKey) {
        event.preventDefault();
        if (panel && panel !== "orbit") return;
        setPanel((prev) => prev === "orbit" ? null : "orbit");
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [panel]);

  const plan = planRef.current;

  return (
    <div className="k-app-shell k-app-shell-navigation">
      <a className="k-skip-link" href="#main-content">Saltar al contenido principal</a>
      <OfflineNotice />
      <GlobalSearchModal isOpen={searchOpen} onClose={() => setPanel(null)} />
      <ShortcutsModal isOpen={shortcutsOpen} onClose={() => setPanel(null)} />
      <MenuDrawer isOpen={drawerOpen} onClose={() => setPanel(null)} />
      <OrbitMap
        open={orbitOpen}
        onClose={() => setPanel(null)}
        onNavigate={() => {
          // Marca el "salto espacial" para que la vista entrante reciba
          // el plan de zoom del mapa (ver planSectionShift).
          zoomStampRef.current = performance.now();
        }}
      />
      <div className="k-app-workspace">
        <FanNav />
        <div className="k-app-main-column" ref={scrollerRef}>
          <header className="k-app-topbar" aria-label="Contexto de navegación">
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
              <span className="k-app-topbar-mark" aria-hidden="true">K</span>
              <strong>{sectionLabel}</strong>
            </div>
            <button
              type="button"
              className="k-topbar-search-trigger"
              onClick={() => setPanel("search")}
              aria-label="Abrir búsqueda global (⌘K)"
              aria-haspopup="dialog"
              aria-expanded={searchOpen}
            >
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <circle cx="11" cy="11" r="7" />
                <path d="m16.5 16.5 4.5 4.5" />
              </svg>
              <span>Buscar personas, temas, órbitas…</span>
              <kbd>⌘K</kbd>
            </button>
            <nav className="k-app-topbar-actions" aria-label="Accesos rápidos">
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
                key={location.pathname}
                initial={{ opacity: 0, y: 8, x: plan.enterX, scale: plan.enterScale }}
                animate={{ opacity: 1, y: 0, x: 0, scale: 1 }}
                exit={{ opacity: 0, y: -5, x: plan.exitX, scale: 1.008 }}
                transition={{ duration: 0.2, ease: [0.21, 0.6, 0.35, 1] }}
                style={{ willChange: "opacity, transform" }}
              >
                {outlet}
              </motion.div>
            </AnimatePresence>
          </main>
        </div>
      </div>
    </div>
  );
}
