import { Link, useLocation } from "react-router-dom";
import EmptyState from "../components/ui/EmptyState";

/**
 * KRONOS-UIX-AUDIT — pantalla 404 real.
 *
 * Antes, cualquier ruta declarada de más caía en el comodín `*` que
 * redirigía en silencio a /home: el usuario no sabía que la URL estaba
 * mal, perdía el contexto del enlace (por ejemplo, un enlace compartido
 * roto) y el historial del navegador no reflejaba el error. La pantalla
 * conserva el layout de la app (navegación disponible), muestra la ruta
 * intentada y ofrece acciones de salida claras para no quedar atrapado.
 */
export default function NotFound() {
  const location = useLocation();
  const attempted = location.pathname + location.search;

  return (
    <section className="page" aria-label="Página no encontrada">
      <EmptyState
        eyebrow="ERROR 404"
        icon={<span aria-hidden="true" style={{ fontSize: "2rem" }}>◌</span>}
        title="Esta órbita no existe"
        description={
          <>
            No encontramos <code style={{ color: "var(--k-text)", wordBreak: "break-all" }}>{attempted}</code>. Puede que
            el enlace esté mal escrito, que la página se moviera o que ya no exista.
          </>
        }
        action={
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, justifyContent: "center" }}>
            <Link className="k-button k-button-primary" to="/home">
              Volver al inicio
            </Link>
            <Link className="k-button k-button-secondary" to="/explore">
              Explorar
            </Link>
          </div>
        }
      />
    </section>
  );
}
