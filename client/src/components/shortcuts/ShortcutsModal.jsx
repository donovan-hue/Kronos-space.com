import { useEffect } from "react";
import { AnimatePresence, motion } from "motion/react";

const SHORTCUTS = [
  { key: "⌘K / Ctrl+K", desc: "Abrir búsqueda global (personas, temas, órbitas)" },
  { key: "Esc", desc: "Cerrar modales, menús y diálogos de confirmación" },
  { key: "?", desc: "Ver este panel de ayuda de atajos de teclado" },
  { key: "G", desc: "Abrir el mapa orbital de navegación (todos los destinos)" },
  { key: "↑ / ↓", desc: "Navegar verticalmente entre videos y resultados" },
  { key: "Tab / Shift+Tab", desc: "Navegar entre elementos interactivos con foco accesible" },
  { key: "Enter", desc: "Activar botón o abrir primer resultado de búsqueda" }
];

export default function ShortcutsModal({ isOpen, onClose }) {
  useEffect(() => {
    function handleKeyDown(event) {
      if (event.key === "Escape" && isOpen) {
        onClose();
      }
    }
    if (isOpen) {
      window.addEventListener("keydown", handleKeyDown);
    }
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  return (
    <AnimatePresence>
      {isOpen && (
        <div
          className="k-confirm-backdrop"
          role="presentation"
          onClick={(e) => {
            if (e.target === e.currentTarget) onClose();
          }}
        >
          <motion.div
            className="k-confirm-dialog k-shortcuts-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="shortcuts-dialog-title"
            initial={{ opacity: 0, scale: 0.95, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 8 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <p className="k-eyebrow k-confirm-eyebrow">KRONOS SPACE</p>
                <h3 id="shortcuts-dialog-title" className="k-confirm-title">
                  Atajos de teclado
                </h3>
              </div>
              <button
                type="button"
                className="k-button k-button-ghost"
                onClick={onClose}
                aria-label="Cerrar atajos"
                style={{ width: 36, height: 36, padding: 0 }}
              >
                ✕
              </button>
            </div>

            <div className="k-shortcuts-list">
              {SHORTCUTS.map((shortcut) => (
                <div className="k-shortcut-item" key={shortcut.key}>
                  <kbd className="k-shortcut-key">{shortcut.key}</kbd>
                  <span className="k-shortcut-desc">{shortcut.desc}</span>
                </div>
              ))}
            </div>

            <div className="k-confirm-actions" style={{ marginTop: 8 }}>
              <button
                type="button"
                className="k-button k-button-primary"
                onClick={onClose}
                autoFocus
              >
                Entendido
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
