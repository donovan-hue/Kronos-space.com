import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import ErrorBoundary from "./app/ErrorBoundary";
import { applyMotionPreference, readMotionPreference } from "./lib/motionPreference.js";
import { applyTheme, readThemePreference } from "./lib/themePreference.js";
import "./styles/app.css";
import { canonicalRedirectUrl } from "./services/publicUrl";

// Todos los alias públicos convergen antes de montar la aplicación. Así una
// sesión, un enlace compartido o un favorito nunca deja al usuario en una
// copia del frontend con una versión distinta.
const canonicalUrl = canonicalRedirectUrl(window.location);

if (canonicalUrl) {
  window.location.replace(canonicalUrl);
} else {
  // La preferencia de movimiento se aplica antes de hidratar: el primer
// fotograma ya nace animado o congelado, nunca a medias.
const motionPref = readMotionPreference();
applyMotionPreference(motionPref === "reduced" ? "reduced" : "full");

// El tema se aplica antes de hidratar, por la misma razón que el movimiento:
// el primer fotograma ya sale con el fondo correcto y no hay destello.
applyTheme(readThemePreference() ?? "dark");

// Service worker (bloque 1.6): guarda el armazón para una recarga sin red y
  // permite que los avisos del navegador salgan por el sistema. Solo en
  // producción: en desarrollo serviría módulos viejos y volvería loco a Vite.
  if (import.meta.env.PROD && "serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    });
  }

  ReactDOM.createRoot(document.getElementById("root")).render(
    <React.StrictMode>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </React.StrictMode>
  );
}
