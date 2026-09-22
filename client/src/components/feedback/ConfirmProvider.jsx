import { createContext, useCallback, useContext, useId, useRef, useState } from "react";

const ConfirmContext = createContext(null);

export function useConfirm() {
  const context = useContext(ConfirmContext);
  if (!context) {
    const fallback = (options) => {
      const msg =
        typeof options === "string"
          ? options
          : options?.title
          ? `${options.title}\n\n${options?.message || ""}`
          : options?.message || "¿Confirmar acción?";
      return Promise.resolve(typeof window !== "undefined" && window.confirm ? window.confirm(msg) : true);
    };
    fallback.confirm = fallback;
    return fallback;
  }
  return context.confirm;
}

export function ConfirmProvider({ children }) {
  const [dialog, setDialog] = useState(null);
  const resolveRef = useRef(null);
  const titleId = useId();

  const confirm = useCallback((options = {}) => {
    const config = typeof options === "string" ? { message: options } : options;
    const {
      title = "Confirmar acción",
      message = "¿Estás seguro de que deseas continuar?",
      confirmText = "Confirmar",
      cancelText = "Cancelar",
      danger = false,
      eyebrow = "CONFIRMACIÓN"
    } = config;

    return new Promise((resolve) => {
      resolveRef.current = resolve;
      setDialog({
        title,
        message,
        confirmText,
        cancelText,
        danger,
        eyebrow
      });
    });
  }, []);

  confirm.confirm = confirm;

  const handleClose = useCallback((value) => {
    setDialog(null);
    if (resolveRef.current) {
      resolveRef.current(value);
      resolveRef.current = null;
    }
  }, []);

  return (
    <ConfirmContext.Provider value={{ confirm }}>
      {children}
      {dialog && (
        <div
          className="k-confirm-backdrop"
          role="presentation"
          onClick={(e) => {
            if (e.target === e.currentTarget) handleClose(false);
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") handleClose(false);
          }}
        >
          <div
            className="k-confirm-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
          >
            {dialog.eyebrow && <span className="k-eyebrow k-confirm-eyebrow">{dialog.eyebrow}</span>}
            <h3 id={titleId} className="k-confirm-title">{dialog.title}</h3>
            <p className="k-confirm-message">{dialog.message}</p>
            <div className="k-confirm-actions">
              <button
                type="button"
                className="k-button k-button-ghost"
                onClick={() => handleClose(false)}
                autoFocus
              >
                {dialog.cancelText}
              </button>
              <button
                type="button"
                className={`k-button ${dialog.danger ? "k-button-danger" : "k-button-primary"}`}
                onClick={() => handleClose(true)}
              >
                {dialog.confirmText}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
}
