import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Combina clases condicionales (clsx) y resuelve conflictos de
 * utilidades Tailwind conservando la última (tailwind-merge).
 * Estándar shadcn/ui — punto único para componer className.
 */
export function cn(...inputs) {
  return twMerge(clsx(inputs));
}
