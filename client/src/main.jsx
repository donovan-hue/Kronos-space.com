import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
// Tailwind (capas) va primero: el CSS legado (sin capa) gana cualquier
// conflicto de cascada, por lo que las pantallas existentes no cambian.
import "./styles/tailwind.css";
import "./styles.css";
import "./styles/design-tokens.css";
import "./styles/design-system.css";
import "./styles/fan-nav.css";
import "./styles/chrome-minimal.css";
import "./styles/auth-refresh.css";
import "./styles/personality.css";
import "./styles/social-refresh.css";
import "./styles/aqua-theme.css";
import "./styles/collections.css";
import "./styles/circles.css";
import "./styles/orbits.css";
import "./styles/feed-preferences.css";
import "./styles/media.css";
import "./styles/stories.css";
import "./styles/vertical.css";
import "./styles/capsules.css";
import "./styles/pulse.css";
import "./styles/lineage.css";
import "./styles/analytics.css";
import "./styles/search.css";
// La navegación separada debe ganar a los estilos legacy cargados antes.
import "./styles/fan-nav.css";
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
