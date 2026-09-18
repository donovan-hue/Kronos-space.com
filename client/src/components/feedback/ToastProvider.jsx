import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

const ToastContext = createContext(null);

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const dismiss = useCallback((id) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const showToast = useCallback((message, { tone = "info", timeout = 5000 } = {}) => {
    const text = typeof message === "string" ? message.trim() : "";
    if (!text) return;
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    setToasts((current) => [...current, { id, message: text, tone }].slice(-4));
    if (timeout > 0) window.setTimeout(() => dismiss(id), timeout);
  }, [dismiss]);

  const value = useMemo(() => ({ showToast, dismiss }), [showToast, dismiss]);

  return <ToastContext.Provider value={value}>{children}<div className="k-toast-region" aria-live="polite" aria-relevant="additions" aria-label="Avisos de Kronos">{toasts.map((toast) => <div className={`k-toast k-toast-${toast.tone}`} role="status" key={toast.id}><span>{toast.message}</span><button type="button" className="k-toast-dismiss" onClick={() => dismiss(toast.id)} aria-label="Cerrar aviso">×</button></div>)}</div></ToastContext.Provider>;
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error("useToast debe usarse dentro de ToastProvider");
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
