import { useEffect, useRef } from "react";

/**
 * KRONOS — restauración de foco para Diálogos CONTROLADOS (sin Trigger).
 *
 * Radix, al cerrar, devuelve el foco a `triggerRef` — pero los diálogos
 * de KRONOS (drawer, búsqueda) son controlados desde el
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
 *  3. Filtrar solo por `[data-slot="dialog-content"]` no basta: el
 *     cajón de secciones monta `DialogPrimitive.Content` a
 *     pelo, sin ese atributo, así que sus propios nodos entraban al rastro
 *     como si fueran de fuera; al cerrar se enfocaba un nodo que estaba a
 *     punto de desmontarse y el foco terminaba en `<body>` (lo recogía el
 *     refugio, no el disparador). El filtro abarca lo que Radix marca
 *     siempre: `[role="dialog"]`.
 *
 * El rastro lo lleva un escucha de `focusin` en fase de captura, a nivel de
 * documento: se recuerda el último elemento que recibió el foco estando FUERA
 * de un diálogo. Si ese disparador ya no existe al cerrar (menú que se
 * desmontó, entrada de archivo oculta), el refugio es el contenedor principal
 * (`#main-content`, ya focusable con tabIndex -1).
 */

const DENTRO_DE_UN_DIALOGO = '[data-slot="dialog-content"], [role="dialog"]';

function enDialogo(nodo) {
  return Boolean(nodo && typeof nodo.closest === "function" && nodo.closest(DENTRO_DE_UN_DIALOGO));
}

let ultimoFocoExterno = null;

if (typeof document !== "undefined") {
  document.addEventListener(
    "focusin",
    (event) => {
      const destino = event.target;
      if (destino && !enDialogo(destino)) {
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
  if (enDialogo(nodo)) return false;
  if (typeof nodo.checkVisibility === "function" && !nodo.checkVisibility()) return false;
  return window.getComputedStyle(nodo).display !== "none";
}

/**
 * Los filtros de arriba no bastan por sí solos: hay nodos que el navegador
 * considera presentes y sin embargo no aceptan el foco. El caso medido es la
 * entrada «Reportar» del menú de una publicación: vive en un `<details>` que
 * ya se cerró, y Chromium lo esconde con `content-visibility: hidden` (no con
 * `display: none`), así que `display` seguía diciendo «visible» y el foco se
 * quedaba en `<body>` — `focus()` sobre un nodo así es un no-op silencioso.
 * Por eso el veredicto final lo da el navegador: se enfoca y se comprueba.
 */
function enfocarCandidato(nodo) {
  if (!esDestinoValido(nodo)) return false;
  nodo.focus({ preventScroll: true });
  return document.activeElement === nodo;
}

/**
 * Red de seguridad: hay nodos que todavía existen al cerrar y desaparecen un
 * fotograma después (el menú de «Reportar» se desmonta con su propia salida).
 * Enfocarlos devuelve el foco al cuerpo cuando se van, así que se revisa al
 * siguiente fotograma y, si el foco se quedó a la deriva, se recoge.
 *
 * Se recoge en el MISMO destino que se eligió, no directamente en el refugio:
 * Radix también devuelve el foco por su cuenta al desmontar y su intento es
 * asincrónico, así que entre ambos hay una ventana en la que el documento se
 * queda sin foco. Revisar en ese hueco y saltar al contenedor principal
 * cambiaba el destino bueno por el de emergencia (el cajón perdía el
 * disparador). El refugio queda solo para cuando el destino ya no existe.
 *
 * La vigilancia dura {@link RECOGIDA_TOTAL_MS} y se corta sola en cuanto el
 * foco está en otro nodo válido: un solo chequeo no basta porque el menú de
 * «Más opciones» es un `<details>` nativo y su entrada de «Reportar» tarda
 * más de un fotograma en desaparecer (probado en navegador: con dos
 * chequeos el foco moría en el cuerpo).
 */
const RECOGIDA_CADA_MS = 120;
const RECOGIDA_TOTAL_MS = 2000;

function redDeSeguridad(destino) {
  const inicio = Date.now();
  const recoger = () => {
    if (typeof document === "undefined" || !document.body) return;
    const activo = document.activeElement;
    const aLaDeriva = !activo || activo === document.body || activo === document.documentElement;
    if (aLaDeriva) {
      // El destino otra vez, y solo si el navegador lo acepta; si no, el refugio.
      if (!enfocarCandidato(destino)) {
        const main = document.getElementById("main-content");
        if (main) main.focus({ preventScroll: true });
      }
    } else if (activo !== destino) {
      return;
    }
    if (Date.now() - inicio < RECOGIDA_TOTAL_MS) window.setTimeout(recoger, RECOGIDA_CADA_MS);
  };
  requestAnimationFrame(recoger);
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
    const destino = [ultimoFocoExterno, alMontar.current].find(enfocarCandidato);
    if (destino) {
      redDeSeguridad(destino);
      return;
    }
    const main = document.getElementById("main-content");
    if (main) {
      main.focus({ preventScroll: true });
      redDeSeguridad(null);
    }
  };
}
