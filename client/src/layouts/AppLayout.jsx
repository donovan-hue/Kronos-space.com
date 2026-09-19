import { useLocation } from "react-router-dom";
import { Outlet } from "react-router-dom";
import { AnimatePresence, motion } from "motion/react";
import FanNav from "../components/FanNav";
import OfflineNotice from "../components/feedback/OfflineNotice";

/**
 * Shell de la app autenticada: sin barra superior de marca (la
 * navegación completa vive en el abanico inferior, FanNav). El nombre
 * de la marca solo se muestra en las pantallas de autenticación
 * (Login/Registro/Recuperación), no en cada pantalla interna.
 *
 * Transición de pantalla: al cambiar de ruta, la vista saliente se
 * desvanece (~0.12s) y la entrante sube 10px con un fade (~0.18s).
 * Solo se anima UN contenedor por navegación (transform+opacity, sin
 * afectar listas) y AnimatePresence initial={false} evita animar el
 * primer render. Con prefers-reduced-motion solo queda el desvanecido.
 */
export default function AppLayout() {
  const location = useLocation();

  return (
    <div className="k-app-shell k-app-shell-fan">
      <a className="k-skip-link" href="#main-content">Saltar al contenido principal</a>
      <OfflineNotice />
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
      <FanNav />
    </div>
  );
}
