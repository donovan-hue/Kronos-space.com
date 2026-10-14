import { useEffect, useRef } from "react";

/**
 * KRONOS — restauración de foco para Diálogos CONTROLADOS (sin Trigger).
 *
 * Radix, al cerrar, devuelve el foco a `triggerRef` — pero los diálogos
 * de KRONOS (drawer, mapa orbital, búsqueda) son controlados desde el
 * shell con `open` externo: no montan un `Dialog.Trigger`, así que ese
 * ref está vacío y el foco moría en <body> al cerrar (teclado y
 * lectores de pantalla perdían la posición).
 *
 * Dos trampas que costaron medidas y que aquí quedan documentadas:
 *
 *  1. Leer `document.activeElement` al montar el contenido no sirve: Radix
 *     ya movió el foco adentro, así que se tomaba un nodo del propio
 *     diálogo y, al desmontarse, el foco se perdía otra vez.
 *  2. Tampoco sirve congelar el destino en el montaje: el foco del
 *     disparador (el botón que abrió) llega *después* — el efecto de React
 *     corre antes de que el navegador asiente el clic. El destino se decide
 *     al cerrar, con el rastro más reciente.
 *
 * El rastro lo lleva un escucha de `focusin` en fase de captura, a nivel de
 * documento: se recuerda el último elemento que recibió el foco estando FUERA
 * de un diálogo. Si ese disparador ya no existe al cerrar (menú que se
 * desmontó, entrada de archivo oculta), el refugio es el contenedor principal
 * (`#main-content`, ya focusable con tabIndex -1).
 */

let ultimoFocoExterno = null;

if (typeof document !== "undefined") {
  document.addEventListener(
    "focusin",
    (event) => {
      const destino = event.target;
      if (destino && typeof destino.closest === "function" && !destino.closest('[data-slot="dialog-content"]')) {
        ultimoFocoExterno = destino;
      }
    },
    true
  );
}

function esDestinoValido(nodo) {
  if (!nodo || typeof nodo.focus !== "function") return false;
  if (nodo === document.body || nodo === document.documentElement) return false;
  if (!document.contains(nodo)) return false;
  return window.getComputedStyle(nodo).display !== "none";
}

/**
 * Red de seguridad: hay nodos que todavía existen al cerrar y desaparecen un
 * fotograma después (el menú de «Reportar» se desmonta con su propia salida).
 * Enfocarlos devuelve el foco al cuerpo cuando se van, así que se revisa al
 * siguiente fotograma y, si el foco se quedó a la deriva, se recoge.
 */
function redDeSeguridad() {
  const recoger = () => {
    const activo = document.activeElement;
    if (activo && activo !== document.body && activo !== document.documentElement) return;
    const main = document.getElementById("main-content");
    if (main) main.focus({ preventScroll: true });
  };
  requestAnimationFrame(recoger);
  window.setTimeout(recoger, 120);
}

/**
 * @param {boolean} open estado del diálogo
 * @returns {(event: Event) => void} handler para onCloseAutoFocus
 */
export function useDialogFocusRestore(open = true) {
  const alMontar = useRef(null);

  useEffect(() => {
    if (!open || typeof document === "undefined") return;
    const activo = document.activeElement;
    if (activo && activo !== document.body && typeof activo.focus === "function") alMontar.current = activo;
  }, [open]);

  return function onCloseAutoFocus(event) {
    // Se anula el intento por defecto (buscar un Trigger inexistente)…
    event.preventDefault();
    const destino = [ultimoFocoExterno, alMontar.current].find(esDestinoValido);
    if (destino) {
      destino.focus({ preventScroll: true });
      redDeSeguridad();
      return;
    }
    const main = document.getElementById("main-content");
    if (main) {
      main.focus({ preventScroll: true });
      redDeSeguridad();
    }
  };
}
