import { NavLink } from "react-router-dom";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { useDialogFocusRestore } from "../ui/useDialogFocusRestore.js";
import { DialogOverlay } from "@/components/ui/dialog";

const MENU_GROUPS = [
  {
    id: "social",
    title: "Social y Contenido",
    items: [
      {
        id: "home",
        label: "Inicio",
        to: "/home",
        icon: (
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M3 10.5 12 3l9 7.5" />
            <path d="M5 9.5V20h14V9.5" />
            <path d="M9.5 20v-5.5h5V20" />
          </svg>
        )
      },
      {
        id: "explore",
        label: "Explorar",
        to: "/explore",
        icon: (
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="11" cy="11" r="7" />
            <path d="m16.5 16.5 4.5 4.5" />
          </svg>
        )
      },
      {
        id: "vertical",
        label: "Videos",
        to: "/vertical",
        icon: (
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="7" y="3" width="10" height="18" rx="2.5" />
            <path d="m10.5 10 4 2-4 2V10Z" />
          </svg>
        )
      },
      {
        id: "pulse",
        label: "Pulso",
        to: "/pulse",
        icon: (
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M3 12h4l2.5-6 4 12 2.5-6H21" />
          </svg>
        )
      },
      {
        id: "orbits",
        label: "Comunidades",
        to: "/orbits",
        icon: (
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="9" cy="8" r="3" />
            <circle cx="16" cy="9" r="2.5" />
            <path d="M3.5 19a5.5 5.5 0 0 1 11 0M14.5 15a4.5 4.5 0 0 1 6 4" />
          </svg>
        )
      },
      {
        id: "circles",
        label: "Círculos",
        to: "/circles",
        icon: (
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="8" />
            <circle cx="12" cy="12" r="3" />
          </svg>
        )
      },
      {
        id: "live",
        label: "En vivo",
        to: "/live",
        icon: (
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="3" />
            <path d="M7.2 7.2a6.8 6.8 0 0 0 0 9.6M16.8 7.2a6.8 6.8 0 0 1 0 9.6" />
          </svg>
        )
      },
      {
        id: "channels",
        label: "Canales",
        to: "/channels",
        icon: (
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M4 6h16M4 12h16M4 18h10" />
          </svg>
        )
      },
      {
        id: "capsules",
        label: "Mensajes Programados",
        to: "/capsules",
        icon: (
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="8.5" />
            <path d="M12 7.5V12l3 2" />
          </svg>
        )
      },
      {
        id: "create",
        label: "Centro de Creación",
        to: "/create",
        icon: (
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="4" y="4" width="16" height="16" rx="3" />
            <path d="M12 8.5v7M8.5 12h7" />
          </svg>
        )
      }
    ]
  },
  {
    id: "comms",
    title: "Mensajes y Actividad",
    items: [
      {
        id: "messages",
        label: "Mensajes Directos",
        to: "/messages",
        icon: (
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5Z" />
          </svg>
        )
      },
      {
        id: "groups",
        label: "Grupos",
        to: "/conversations",
        icon: (
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M17 6.1H7a3 3 0 0 0-3 3v5a3 3 0 0 0 3 3h1.5v2.5L12 17.1h5a3 3 0 0 0 3-3v-5a3 3 0 0 0-3-3Z" />
          </svg>
        )
      },
      {
        id: "notifications",
        label: "Notificaciones",
        to: "/notifications",
        icon: (
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M6 16v-5a6 6 0 0 1 12 0v5l1.6 2.4H4.4Z" />
            <path d="M10.2 20.6a2 2 0 0 0 3.6 0" />
          </svg>
        )
      },
      {
        id: "saved",
        label: "Guardados",
        to: "/saved",
        icon: (
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16Z" />
          </svg>
        )
      },
      {
        id: "analytics",
        label: "Analítica",
        to: "/analytics",
        icon: (
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M3 20h18M6 16v-4M12 16V8M18 16v-6" />
          </svg>
        )
      }
    ]
  },
  {
    id: "kairos",
    title: "Estudio IA (Kairos)",
    items: [
      {
        id: "kairos-hub",
        label: "Centro de IA",
        to: "/kairos",
        icon: (
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="m12 3 2 5.5L19.5 10l-5.5 1.5L12 17l-2-5.5L4.5 10l5.5-1.5L12 3Z" />
          </svg>
        )
      },
      {
        id: "kairos-image",
        label: "Generador de Imágenes",
        to: "/kairos/image",
        icon: (
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="3" y="3" width="18" height="18" rx="3" />
            <circle cx="8.5" cy="8.5" r="1.5" />
            <path d="m21 15-5-5L5 21" />
          </svg>
        )
      },
      {
        id: "kairos-video",
        label: "Generador de Videos",
        to: "/kairos/video",
        icon: (
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="2" y="4" width="15" height="16" rx="2.5" />
            <path d="m17 9 5-3v12l-5-3" />
          </svg>
        )
      },
      {
        id: "kairos-script",
        label: "Generador de Guiones",
        to: "/kairos/script",
        icon: (
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <line x1="16" y1="13" x2="8" y2="13" />
            <line x1="16" y1="17" x2="8" y2="17" />
          </svg>
        )
      }
    ]
  },
  {
    id: "account",
    title: "Tu Cuenta",
    items: [
      {
        id: "profile",
        label: "Mi Perfil",
        to: "/profile",
        icon: (
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="8" r="4" />
            <path d="M5 20a7 7 0 0 1 14 0" />
          </svg>
        )
      },
      {
        id: "settings",
        label: "Configuración",
        to: "/settings",
        icon: (
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
          </svg>
        )
      },
      {
        id: "moderation",
        label: "Seguridad y Moderación",
        to: "/moderation",
        icon: (
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 3.5 19 6v5.2c0 4.3-2.9 7.7-7 9.3-4.1-1.6-7-5-7-9.3V6Z" />
            <path d="m9 12 2 2 4-4" />
          </svg>
        )
      }
    ]
  }
];

/**
 * KRONOS MENU DRAWER — acceso completo a todas las pantallas.
 *
 * KRONOS-UIX-AUDIT: el panel se construyó sobre un `<div>` con la clase
 * `.k-dialog-backdrop`, que no existe en ninguna hoja de estilos. Sin
 * fondo oscurecido, sin bloqueo de scroll, sin foco atrapado y sin
 * z-index: el menú inferior de la app (`z-index: var(--k-z-nav)`) tapaba
 * los últimos elementos del cajón y «clic fuera para cerrar» no
 * funcionaba porque el backdrop medía 0px. Se migró a los primitivos de
 * Radix Dialog (portal al body, overlay del kit, foco atrapado, Escape,
 * bloqueo de scroll) conservando el diseño deslizante existente
 * (`.k-drawer-panel`, animaciones y reglas de reduced-motion en
 * fan-nav.css).
 */
export default function MenuDrawer({ isOpen, onClose }) {
  // El disparador vive en la barra superior: al cerrar, el foco vuelve a él.
  const handleCloseFocus = useDialogFocusRestore(isOpen);
  return (
    <DialogPrimitive.Root open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogPrimitive.Portal>
        <DialogOverlay />
        <DialogPrimitive.Content
          className="k-drawer-panel k-surface"
          onCloseAutoFocus={handleCloseFocus}
        >
          <header className="k-drawer-header">
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span className="k-app-topbar-mark" aria-hidden="true">K</span>
              <DialogPrimitive.Title as="strong">Todas las Secciones</DialogPrimitive.Title>
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
            Menú con todas las secciones de Kronos. Pulsa Escape para cerrar.
          </DialogPrimitive.Description>

          <div className="k-drawer-scroll">
            {MENU_GROUPS.map((group) => (
              <div key={group.id} className="k-drawer-group">
                <h4 id={`drawer-group-${group.id}`}>{group.title}</h4>
                <nav className="k-drawer-grid" aria-labelledby={`drawer-group-${group.id}`}>
                  {group.items.map((item) => (
                    <NavLink
                      key={item.id}
                      to={item.to}
                      onClick={onClose}
                      className={({ isActive }) => `k-drawer-item ${isActive ? "is-active" : ""}`}
                    >
                      <span className="k-drawer-item-icon" aria-hidden="true">{item.icon}</span>
                      <span className="k-drawer-item-label">{item.label}</span>
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
