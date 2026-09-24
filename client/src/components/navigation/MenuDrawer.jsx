import { NavLink } from "react-router-dom";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { useDialogFocusRestore } from "../ui/useDialogFocusRestore.js";
import { DialogOverlay } from "@/components/ui/dialog";

import { NAV_GROUPS, NAV_ICONS, MOBILE_ITEM_IDS } from "../../navigation/model.jsx";
import { useNavFlags } from "../../navigation/useNavFlags";

// Menú complementario móvil: nunca repite los destinos de la barra inferior.
export default function MenuDrawer({ isOpen, onClose }) {
  const { filterItems } = useNavFlags();
  const groups = NAV_GROUPS.map((group) => ({ ...group, items: filterItems(group.items).filter((item) => !MOBILE_ITEM_IDS.includes(item.id)) }))
    .filter((group) => group.items.length);
  // El disparador vive en la barra superior: al cerrar, el foco vuelve a él.
  const handleCloseFocus = useDialogFocusRestore(isOpen);
  return (
    <DialogPrimitive.Root open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogPrimitive.Portal>
        <DialogOverlay />
        <DialogPrimitive.Content
          className="k-drawer-panel"
          onCloseAutoFocus={handleCloseFocus}
        >
          <header className="k-drawer-header">
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span className="k-app-topbar-mark" aria-hidden="true">K</span>
              <DialogPrimitive.Title className="k-drawer-title">Más secciones</DialogPrimitive.Title>
            </div>
            <DialogPrimitive.Close asChild>
              <button
                type="button"
                className="k-button k-button-ghost k-drawer-close"
                aria-label="Cerrar menú"
              >
                ✕
              </button>
            </DialogPrimitive.Close>
          </header>

          <DialogPrimitive.Description className="k-sr-only">
            Secciones adicionales de Kronos. Inicio, Explorar, Crear, Mensajes y Perfil están en la barra inferior. Pulsa Escape para cerrar.
          </DialogPrimitive.Description>

          <div className="k-drawer-scroll">
            {groups.map((group) => (
              <div key={group.id} className="k-drawer-group">
                <h4 id={`drawer-group-${group.id}`}>{group.label}</h4>
                <nav className="k-drawer-grid" aria-labelledby={`drawer-group-${group.id}`}>
                  {group.items.map((item) => (
                    <NavLink
                      key={item.id}
                      to={item.to}
                      end
                      onClick={onClose}
                      className={({ isActive }) => `k-drawer-item ${isActive ? "is-active" : ""}`}
                    >
                      <span className="k-drawer-item-icon" aria-hidden="true">{NAV_ICONS[item.icon]}</span>
                      <span className="k-drawer-item-label">{item.label}</span>
                    </NavLink>
                  ))}
                  {group.id === "kairos" && group.items.flatMap((item) => (item.children || []).map((child) => (
                    <NavLink key={child.to} to={child.to} end onClick={onClose} className="k-drawer-item">
                      <span className="k-drawer-item-icon" aria-hidden="true">{NAV_ICONS[item.icon]}</span>
                      <span className="k-drawer-item-label">{child.label}</span>
                    </NavLink>
                  )))}
                </nav>
              </div>
            ))}
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
