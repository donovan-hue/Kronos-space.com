import { Link } from "react-router-dom";

/**
 * Página 404 real (M-3). Antes, cualquier ruta desconocida redirigía en
 * silencio a /home o /login, ocultando deep-links rotos y confundiendo
 * analítica y depuración.
 */
export default function NotFound() {
  return (
    <section className="page" aria-labelledby="not-found-title">
      <div className="k-feed-state">
        <p className="k-eyebrow">Error 404</p>
        <h2 id="not-found-title">Esta página no existe</h2>
        <p>Es posible que el enlace esté roto o que la dirección sea incorrecta.</p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Link className="k-button k-button-primary" to="/home">
            Ir al inicio
          </Link>
          <Link className="k-button k-button-secondary" to="/explore">
            Explorar
          </Link>
        </div>
      </div>
    </section>
  );
}
