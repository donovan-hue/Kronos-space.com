import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";

const ToastContext = createContext(null);

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  // B-9: los temporizadores de auto-cierre se rastrean para limpiarlos
  // al descartar manualmente o al desmontar el provider.
  const timers = useRef(new Map());

  const dismiss = useCallback((id) => {
    const timer = timers.current.get(id);
    if (timer) {
      window.clearTimeout(timer);
      timers.current.delete(id);
    }
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  useEffect(() => {
    const tracked = timers.current;
    return () => {
      tracked.forEach((timer) => window.clearTimeout(timer));
      tracked.clear();
    };
  }, []);

  const showToast = useCallback((message, { tone = "info", timeout = 5000 } = {}) => {
    const text = typeof message === "string" ? message.trim() : "";
    if (!text) return;
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    setToasts((current) => [...current, { id, message: text, tone }].slice(-4));
    if (timeout > 0) timers.current.set(id, window.setTimeout(() => dismiss(id), timeout));
  }, [dismiss]);

  const value = useMemo(() => ({ showToast, dismiss }), [showToast, dismiss]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        className="k-toast-region"
        aria-live="polite"
        aria-relevant="additions"
        aria-label="Avisos de Kronos"
      >
        {/* Máximo 4 avisos: la animación (entrada, reordenación al
            cerrar uno y salida) es barata y siempre en transform/opacity. */}
        <AnimatePresence initial={false}>
          {toasts.map((toast) => (
            <motion.div
              key={toast.id}
              layout
              initial={{ opacity: 0, y: 16, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.97 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              className={`k-toast k-toast-${toast.tone}`}
              role={toast.tone === "error" ? "alert" : "status"}
            >
              <span>{toast.message}</span>
              <button
                type="button"
                className="k-toast-dismiss"
                onClick={() => dismiss(toast.id)}
                aria-label="Cerrar aviso"
              >
                ×
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    // Fallback seguro (mismo patrón que useConfirm): fuera del provider
    // —por ejemplo en pruebas unitarias que montan una pantalla aislada—
    // el aviso degrada a window.alert sin romper el render.
    return {
      showToast: (message) => {
        const text = typeof message === "string" ? message.trim() : "";
        if (text && typeof window !== "undefined" && window.alert) window.alert(text);
      },
      dismiss: () => {}
    };
  }
  return context;
}

export function useOnlineStatus() {
  const [online, setOnline] = useState(() => typeof navigator === "undefined" ? true : navigator.onLine);
  useEffect(() => {
    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => { window.removeEventListener("online", onOnline); window.removeEventListener("offline", onOffline); };
  }, []);
  return online;
}
