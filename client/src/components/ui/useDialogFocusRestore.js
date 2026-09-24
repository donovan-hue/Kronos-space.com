import { useEffect, useRef } from "react";

/**
 * KRONOS — restauración de foco para Diálogos CONTROLADOS (sin Trigger).
 *
 * Radix, al cerrar, devuelve el foco a `triggerRef` — pero los diálogos
 * de KRONOS (drawer, mapa orbital, búsqueda) son controlados desde el
 * shell con `open` externo: no montan un `Dialog.Trigger`, así que ese
 * ref está vacío y el foco moría en <body> al cerrar (teclado y
 * lectores de pantalla perdían la posición). Este hook captura el
 * elemento activo al abrir y lo reenfoca al desmontar el Content; si el
 * disparador desapareció, el refugio es el contenedor principal
 * (`#main-content`, ya focusable con tabIndex -1).
 *
 * @param {boolean} open estado del diálogo
 * @returns {(event: Event) => void} handler para onCloseAutoFocus
 */
export function useDialogFocusRestore(open = true) {
  const restoreRef = useRef(null);

  useEffect(() => {
    if (open && typeof document !== "undefined") {
      restoreRef.current = document.activeElement;
    }
  }, [open]);

  return function onCloseAutoFocus(event) {
    // Se anula el intento por defecto (buscar un Trigger inexistente)…
    event.preventDefault();
    const target = restoreRef.current;
    if (target && typeof target.focus === "function" && document.contains(target) && window.getComputedStyle(target).display !== "none") {
      target.focus({ preventScroll: true });
      return;
    }
    const main = document.getElementById("main-content");
    if (main) main.focus({ preventScroll: true });
  };
}
