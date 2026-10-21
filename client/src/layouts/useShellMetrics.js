import { useEffect, useRef } from "react";

/** Mide el espacio que ocupa el shell; no supone alturas de texto ni safe-area.
 * visualViewport cubre teclados que no reducen dvh. Sin esa API se conserva
 * el scroll normal y los valores CSS de respaldo. */
export function useShellMetrics() {
  const ref = useRef(null);

  useEffect(() => {
    const shell = ref.current;
    if (!shell) return undefined;
    const header = shell.querySelector(".k-app-topbar");
    const nav = shell.querySelector(".k-mobile-navigation");
    const viewport = window.visualViewport;

    function measure() {
      const height = viewport?.height || window.innerHeight;
      const typing = document.activeElement?.matches(
        'textarea, input:not([type="checkbox"]):not([type="radio"]):not([type="range"]):not([type="file"]), [contenteditable="true"]'
      );
      // No confundir zoom con un teclado. Ocultar la barra mientras se escribe
      // deja espacio al compositor y evita que la barra cubra Enviar/Publicar.
      const keyboard = Boolean(typing && (viewport?.scale || 1) <= 1.05 && height < window.innerHeight * 0.8);
      shell.toggleAttribute("data-keyboard-open", keyboard);
      shell.style.setProperty("--k-viewport-h", `${height}px`);
      const headerHeight = header?.getBoundingClientRect().height;
      if (headerHeight) shell.style.setProperty("--k-topbar-h", `${headerHeight}px`);
      const navRect = nav?.getBoundingClientRect();
      const bottom = navRect?.height && !keyboard ? Math.max(0, window.innerHeight - navRect.top) + 12 : 0;
      shell.style.setProperty("--k-shell-bottom", `${bottom}px`);
    }

    measure();
    const observer = typeof ResizeObserver === "function" ? new ResizeObserver(measure) : null;
    if (header) observer?.observe(header);
    if (nav) observer?.observe(nav);
    window.addEventListener("resize", measure);
    viewport?.addEventListener("resize", measure);
    document.addEventListener("focusin", measure);
    document.addEventListener("focusout", measure);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", measure);
      viewport?.removeEventListener("resize", measure);
      document.removeEventListener("focusin", measure);
      document.removeEventListener("focusout", measure);
    };
  }, []);

  return ref;
}
