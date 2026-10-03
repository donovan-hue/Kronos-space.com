import { useEffect, useState } from "react";
import {
  THEME_CHANGE_EVENT,
  currentTheme,
  setThemePreference
} from "../../lib/themePreference.js";

/**
 * KRONOS — conmutador de tema de la interfaz: dos estilos, CLARO y OSCURO.
 *
 * Es un control real (no decorativo): guarda la elección en este navegador y
 * la aplica al instante en `<html data-k-theme>`. El tema claro usa los mismos
 * tonos del laboratorio de diseño; el oscuro, la piel «Cromo Espejo».
 * Vive en Configuración, junto al resto de preferencias de apariencia.
 */

const OPTIONS = [
  ["light", "Claro"],
  ["dark", "Oscuro"]
];

export default function ThemeToggle() {
  const [theme, setTheme] = useState(() => currentTheme());

  useEffect(() => {
    const sync = () => setTheme(currentTheme());
    window.addEventListener(THEME_CHANGE_EVENT, sync);
    return () => window.removeEventListener(THEME_CHANGE_EVENT, sync);
  }, []);

  return (
    <div className="k-theme-switch" role="group" aria-label="Tema de la interfaz">
      {OPTIONS.map(([value, label]) => (
        <button
          key={value}
          type="button"
          className={`k-theme-switch-option ${theme === value ? "is-active" : ""}`}
          aria-pressed={theme === value}
          onClick={() => setTheme(setThemePreference(value))}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
