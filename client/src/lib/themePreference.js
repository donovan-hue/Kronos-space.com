/**
 * KRONOS — apariencia (tema claro / oscuro / sistema).
 *
 * El sitio nace en negro profundo y ese es su tema de marca. Ajustes prometía
 * «apariencia» desde el principio y guardaba `appearance: "system"` en el
 * estado local, pero no existía ningún control ni código que lo leyera: el
 * campo ni siquiera estaba en el esquema del servidor.
 *
 * Contrato:
 * - `light | dark | system`; `system` sigue a `prefers-color-scheme`.
 * - La llave es `data-k-theme` en <html> (`light` | `dark`), igual que
 *   `data-k-motion`: las capas CSS ya saben leer atributos ahí.
 * - Se aplica ANTES de hidratar (main.jsx) para que el primer fotograma ya
 *   tenga el tema correcto: sin destello blanco al cargar.
 * - La preferencia vive en el perfil (servidor) y, como copia de arranque,
 *   en `localStorage` de este navegador.
 */

const STORAGE_KEY = "kronos.theme-preference";
const THEMES = ["light", "dark", "system"];

export const THEME_CHANGE_EVENT = "kronos:themechange";

export function normalizeTheme(value) {
  return THEMES.includes(value) ? value : "dark";
}

export function readThemePreference() {
  try {
    const value = window.localStorage.getItem(STORAGE_KEY);
    return value === null ? null : normalizeTheme(value);
  } catch {
    return null;
  }
}

export function systemPrefersLight() {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-color-scheme: light)").matches
  );
}

/** Tema efectivo (`light` | `dark`) para una preferencia dada. */
export function resolveTheme(preference) {
  const value = normalizeTheme(preference);
  if (value === "system") return systemPrefersLight() ? "light" : "dark";
  return value;
}

export function applyTheme(preference) {
  if (typeof document === "undefined") return "dark";
  const resolved = resolveTheme(preference);
  document.documentElement.setAttribute("data-k-theme", resolved);
  return resolved;
}

export function setThemePreference(preference) {
  const value = normalizeTheme(preference);
  try {
    window.localStorage.setItem(STORAGE_KEY, value);
  } catch {
    /* almacenamiento no disponible: el tema vive solo en esta pestaña */
  }
  applyTheme(value);
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(THEME_CHANGE_EVENT));
  }
  return value;
}

/** Última preferencia conocida: la del perfil si existe, si no la del navegador. */
export function initialThemePreference(profilePreference) {
  if (typeof profilePreference === "string") return normalizeTheme(profilePreference);
  return readThemePreference() ?? "dark";
}
