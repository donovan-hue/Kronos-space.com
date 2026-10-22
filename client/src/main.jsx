import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import ErrorBoundary from "./app/ErrorBoundary";
import { applyMotionPreference, readMotionPreference } from "./lib/motionPreference.js";
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

ReactDOM.createRoot(document.getElementById("root")).render(
    <React.StrictMode>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </React.StrictMode>
  );
}
