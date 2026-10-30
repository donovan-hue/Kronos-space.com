import { Link } from "react-router-dom";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "../ui/dialog";

// Exportada porque el centro de ayuda la lista también: dos copias de los atajos
// son dos formas de desincronizarse cuando se añade uno.
export const SHORTCUTS = [
  { key: "⌘K / Ctrl+K", desc: "Abrir búsqueda global (personas, temas, publicaciones)" },
  { key: "Esc", desc: "Cerrar modales, menús y diálogos de confirmación" },
  { key: "?", desc: "Ver este panel de ayuda de atajos de teclado" },
  { key: "↑ / ↓", desc: "Navegar verticalmente entre videos y resultados" },
  { key: "Tab / Shift+Tab", desc: "Navegar entre elementos interactivos con foco accesible" },
  { key: "Enter", desc: "Activar botón o abrir primer resultado de búsqueda" }
];

export default function ShortcutsModal({ isOpen, onClose }) {
  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent>
        <DialogTitle>Atajos de teclado</DialogTitle>
        <DialogDescription>Accesos de teclado de Kronos Space.</DialogDescription>
        <div className="k-shortcuts-list">
          {SHORTCUTS.map((shortcut) => (
            <div className="k-shortcut-item" key={shortcut.key}>
              <kbd className="k-shortcut-key">{shortcut.key}</kbd>
              <span className="k-shortcut-desc">{shortcut.desc}</span>
            </div>
          ))}
        </div>
        <p className="k-muted">
          Este panel son los atajos. Lo que hace cada pantalla, qué se guarda de tu
          cuenta y lo que la plataforma todavía no hace está en el centro de ayuda:{" "}
          <Link to="/ayuda" className="k-link-subtle" onClick={onClose}>
            Centro de ayuda
          </Link>
          .
        </p>
        <button type="button" className="k-button k-button-primary" onClick={onClose}>Entendido</button>
      </DialogContent>
    </Dialog>
  );
}
