import { NavLink } from "react-router-dom";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { useDialogFocusRestore } from "../ui/useDialogFocusRestore.js";
import { DialogOverlay } from "@/components/ui/dialog";

import { NAV_GROUPS, NAV_EMOJIS, TAB_ITEM_IDS } from "../../navigation/model.jsx";
import { useNavFlags } from "../../navigation/useNavFlags";
import { KronosBrand } from "../brand/KronosBrand.jsx";

// Menú complementario: nunca repite los destinos de la barra inferior. De un
// destino que sí está en la barra solo se heredan sus subdestinos, para que
// ninguno quede sin acceso por no estar repetido aquí.
export default function MenuDrawer({ isOpen, onClose }) {
  const { filterItems } = useNavFlags();
  const groups = NAV_GROUPS.map((group) => {
    const visibles = filterItems(group.items);
    const propios = visibles.filter((item) => !TAB_ITEM_IDS.includes(item.id));
    const heredados = visibles
      .filter((item) => TAB_ITEM_IDS.includes(item.id))
      .flatMap((item) => item.children || []);
    return { ...group, items: propios, heredados };
  }).filter((group) => group.items.length || group.heredados.length);
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
            <div className="k-drawer-brand">
              <KronosBrand text="K" className="k-app-topbar-mark" size={0.95} />
              <DialogPrimitive.Title className="k-drawer-title">Secciones</DialogPrimitive.Title>
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
            Secciones adicionales de Kronos. Inicio, Explorar, Crear, Kairos y Perfil están en la barra inferior;
            las herramientas de Kairos se listan aquí. Pulsa Escape para cerrar.
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
                      <span className="k-drawer-item-icon" aria-hidden="true">{NAV_EMOJIS[item.emoji] || item.emoji}</span>
                      <span className="k-drawer-item-label">{item.label}</span>
                    </NavLink>
                  ))}
                  {group.heredados.map((child) => (
                    <NavLink key={child.to} to={child.to} end onClick={onClose} className="k-drawer-item">
                      <span className="k-drawer-item-icon" aria-hidden="true">{child.emoji}</span>
                      <span className="k-drawer-item-label">{child.label}</span>
                    </NavLink>
                  ))}
                </nav>
              </div>
            ))}
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
