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

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
