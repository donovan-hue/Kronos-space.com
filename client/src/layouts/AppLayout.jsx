import { useEffect, useRef, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigationType } from "react-router-dom";
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
  const navType = useNavigationType();
  const section = getCurrentSection(location.pathname);
  const sectionLabel = SECTION_LABELS[section] || "Kronos";
  const [searchOpen, setSearchOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [orbitOpen, setOrbitOpen] = useState(false);

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

  // Atajos globales de teclado: ⌘K / Ctrl+K, ? (ayuda) y G (mapa orbital)
  useEffect(() => {
    function handleKeyDown(event) {
      const activeTag = document.activeElement?.tagName?.toLowerCase();
      const isInputFocused = activeTag === "input" || activeTag === "textarea" || activeTag === "select" || document.activeElement?.isContentEditable;

      if ((event.metaKey || event.ctrlKey) && (event.key === "k" || event.key === "K")) {
        event.preventDefault();
        setSearchOpen((prev) => !prev);
        return;
      }

      if (event.key === "?" && !isInputFocused && !event.metaKey && !event.ctrlKey && !event.altKey) {
        event.preventDefault();
        setShortcutsOpen((prev) => !prev);
        return;
      }

      // G = mapa orbital. Ignora inputs (escribir «g» en un campo no abre
      // nada) y cualquier modificador, para no pisar atajos del sistema.
      if ((event.key === "g" || event.key === "G") && !isInputFocused && !event.metaKey && !event.ctrlKey && !event.altKey) {
        event.preventDefault();
        setOrbitOpen((prev) => !prev);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const plan = planRef.current;

  return (
    <div className="k-app-shell k-app-shell-navigation">
      <a className="k-skip-link" href="#main-content">Saltar al contenido principal</a>
      <OfflineNotice />
      <GlobalSearchModal isOpen={searchOpen} onClose={() => setSearchOpen(false)} />
      <ShortcutsModal isOpen={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
      <MenuDrawer isOpen={drawerOpen} onClose={() => setDrawerOpen(false)} />
      <OrbitMap
        open={orbitOpen}
        onClose={() => setOrbitOpen(false)}
        onNavigate={() => {
          // Marca el "salto espacial" para que la vista entrante reciba
          // el plan de zoom del mapa (ver planSectionShift).
          zoomStampRef.current = performance.now();
        }}
      />
      <div className="k-app-workspace">
        <FanNav onOpenMenu={() => setDrawerOpen(true)} />
        <div className="k-app-main-column" ref={scrollerRef}>
          <header className="k-app-topbar" aria-label="Contexto de navegación">
            <div className="k-app-topbar-context">
              <button
                type="button"
                className="k-topbar-menu-btn"
                onClick={() => setDrawerOpen(true)}
                aria-label="Abrir menú de todas las secciones"
                aria-haspopup="dialog"
                aria-expanded={drawerOpen}
                title="Ver todas las secciones"
              >
                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <line x1="3" y1="6" x2="21" y2="6" />
                  <line x1="3" y1="12" x2="21" y2="12" />
                  <line x1="3" y1="18" x2="21" y2="18" />
                </svg>
              </button>
              <button
                type="button"
                className="k-topbar-orbit-btn"
                onClick={() => setOrbitOpen(true)}
                aria-label="Abrir mapa orbital de navegación (G)"
                aria-haspopup="dialog"
                aria-expanded={orbitOpen}
                title="Mapa orbital (G)"
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <ellipse cx="12" cy="12" rx="8.6" ry="3.8" transform="rotate(-28 12 12)" />
                  <ellipse cx="12" cy="12" rx="8.6" ry="3.8" transform="rotate(28 12 12)" />
                  <circle cx="12" cy="12" r="1.7" />
                </svg>
              </button>
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
              <button
                type="button"
                className="k-topbar-shortcut-btn"
                onClick={() => setShortcutsOpen(true)}
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
                <Outlet />
              </motion.div>
            </AnimatePresence>
          </main>
        </div>
      </div>
    </div>
  );
}
