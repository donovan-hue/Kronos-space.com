/**
 * KRONOS · preferencia de TEMA (claro / oscuro).
 *
 * Solo estética: la elección se guarda en este navegador (igual que la
 * preferencia de movimiento) y se refleja en `<html data-k-theme="light|dark">`,
 * que es la llave de la paleta de `kronos-chrome.css`. No viaja al servidor,
 * no toca datos de la cuenta y se puede revertir en cualquier momento.
 *
 * Los tonos del tema claro son los mismos del laboratorio de diseño
 * (`design-preview/preview.css`, bloque `[data-theme="light"]`).
 */

export const THEME_STORAGE_KEY = "kronos.theme-preference";
export const THEME_CHANGE_EVENT = "kronos:theme-change";
export const THEMES = ["dark", "light"];
export const DEFAULT_THEME = "dark";

export function readThemePreference() {
  try {
    const value = localStorage.getItem(THEME_STORAGE_KEY);
    return THEMES.includes(value) ? value : null;
  } catch {
    return null;
  }
}

/** Tema vigente: la elección guardada o el de fábrica (oscuro). */
export function currentTheme() {
  return readThemePreference() || DEFAULT_THEME;
}

/** Escribe el tema en el documento. Antes de hidratar evita el destello. */
export function applyTheme(theme) {
  if (typeof document === "undefined") return;
  const next = THEMES.includes(theme) ? theme : DEFAULT_THEME;
  const root = document.documentElement;
  root.setAttribute("data-k-theme", next);
  // Los controles nativos (scrollbars, selectores, autofill) siguen el tema.
  root.style.colorScheme = next;
}

/** Guarda, aplica y avisa. Devuelve el tema aplicado. */
export function setThemePreference(theme) {
  const next = THEMES.includes(theme) ? theme : DEFAULT_THEME;

  try {
    localStorage.setItem(THEME_STORAGE_KEY, next);
  } catch {
    /* almacenamiento bloqueado: el tema se aplica igual en esta pestaña */
  }

  applyTheme(next);

  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(THEME_CHANGE_EVENT, { detail: { theme: next } }));
  }

  return next;
}
