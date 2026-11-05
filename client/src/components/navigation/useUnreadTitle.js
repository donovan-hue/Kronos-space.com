import { useEffect } from "react";

/**
 * Cifra de avisos sin leer en el título de la pestaña.
 *
 * La campana y el menú ya muestran el contador, pero quien trabaja con la
 * pestaña en segundo plano (lo normal: mirar otra cosa mientras llega una
 * respuesta) no veía nada. El título es el único sitio que el navegador
 * mantiene visible fuera de la ventana.
 *
 * Se restaura el título original al desmontar o al volver a cero, para no
 * dejar «(3)» pegado si la cuenta cierra sesión.
 */
const DEFAULT_TITLE = "KRONOS-SPACE · Tu tiempo Tu espacio Tu dominio";

export function titleWithUnread(count, base = DEFAULT_TITLE) {
  const total = Number(count) || 0;
  const clean = String(base || DEFAULT_TITLE).replace(/^\(\d+\+?\)\s*/, "");
  if (total <= 0) return clean;
  return `(${total > 99 ? "99+" : total}) ${clean}`;
}

export default function useUnreadTitle(count) {
  const total = Number(count) || 0;

  useEffect(() => {
    if (typeof document === "undefined") return;
    const previous = document.title || DEFAULT_TITLE;
    document.title = titleWithUnread(total, previous);
    return () => {
      document.title = String(previous).replace(/^\(\d+\+?\)\s*/, "") || DEFAULT_TITLE;
    };
  }, [total]);
}
