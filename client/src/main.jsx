import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles.css";
import "./styles/design-tokens.css";
import "./styles/design-system.css";
import "./styles/fan-nav.css";
import "./styles/chrome-minimal.css";
import { canonicalRedirectUrl } from "./services/publicUrl";

// Todos los alias públicos convergen antes de montar la aplicación. Así una
// sesión, un enlace compartido o un favorito nunca deja al usuario en una
// copia del frontend con una versión distinta.
const canonicalUrl = canonicalRedirectUrl(window.location);

if (canonicalUrl) {
  window.location.replace(canonicalUrl);
} else {
  ReactDOM.createRoot(document.getElementById("root")).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}
