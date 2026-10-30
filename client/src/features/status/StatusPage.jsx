import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import Spinner from "../../components/ui/Spinner";
import { getServiceHealth } from "../../services/statusService";
import { LEGAL_LINKS } from "../legal/legalDocuments";

const RECONSULTA_MS = 60_000;

function estadoDe(health) {
  if (!health) return { tono: "", texto: "Comprobando…" };
  if (!health.reachable) return { tono: "k-state-error", texto: "Sin respuesta" };
  if (health.ok) return { tono: "k-state-success", texto: "Funcionando" };
  return { tono: "k-state-error", texto: "Servicio degradado" };
}

function marcaDe(valor) {
  if (!valor) return "no disponible";
  const fecha = new Date(valor);
  return Number.isNaN(fecha.getTime()) ? "no disponible" : fecha.toLocaleString("es-MX");
}

/**
 * ESTADO DEL SERVICIO — página pública.
 *
 * Lee el mismo `GET /api/health` que consultan los Monitores de despliegue y
 * la verificación del CI: no inventa un semáforo propio ni oculta lo que el
 * endpoint ya dice. `realtime` y `database` vienen del proceso, no de una
 * cifra fija — por eso la página puede afirmar «degradado» sin parecer rota.
 */
export default function StatusPage() {
  const [health, setHealth] = useState(null);
  const [comprobadoEn, setComprobadoEn] = useState("");
  const [cargando, setCargando] = useState(true);

  const consultar = useCallback(async () => {
    const resultado = await getServiceHealth();
    setHealth(resultado);
    setComprobadoEn(new Date().toISOString());
    setCargando(false);
  }, []);

  useEffect(() => {
    consultar();
    const temporizador = setInterval(consultar, RECONSULTA_MS);
    return () => clearInterval(temporizador);
  }, [consultar]);

  const estado = estadoDe(health);

  return (
    <main className="page k-feature-page">
      <header className="k-page-header">
        <div>
          <p className="k-eyebrow">KRONOS-SPACE · ESTADO DEL SERVICIO</p>
          <h1>Estado del servicio</h1>
          <p className="k-muted">
            Lo que responde la plataforma ahora mismo, medido desde su propio endpoint de salud.
          </p>
        </div>
        <div className="k-button-group">
          <button type="button" className="k-button k-button-secondary" onClick={consultar} disabled={cargando}>
            {cargando ? "Comprobando…" : "Volver a comprobar"}
          </button>
        </div>
      </header>

      <section className="k-surface k-settings-section" aria-label="Resumen del estado">
        <p className={`k-state ${estado.tono}`} role="status">{estado.texto}</p>
        {cargando && !health ? <Spinner label="Consultando el estado del servicio…" /> : null}
        <div className="k-session-list">
          <article className="k-session-item">
            <div>
              <strong>API</strong>
              <p>{health?.reachable ? "responde" : "sin respuesta"}</p>
            </div>
            <small className="k-muted">{health?.status ? `código HTTP ${health.status}` : "—"}</small>
          </article>
          <article className="k-session-item">
            <div>
              <strong>Base de datos</strong>
              <p>{health?.database || "comprobando"}</p>
            </div>
          </article>
          <article className="k-session-item">
            <div>
              <strong>Tiempo real</strong>
              <p>{health?.realtime ? "activo" : "no confirmado"}</p>
            </div>
          </article>
          <article className="k-session-item">
            <div>
              <strong>Versión desplegada</strong>
              <p>{health?.build?.commitShort || "sin dato"}</p>
            </div>
            <small className="k-muted">{health?.build?.branch || "rama sin publicar"}</small>
          </article>
          <article className="k-session-item">
            <div>
              <strong>Proceso iniciado</strong>
              <p>{marcaDe(health?.startedAt)}</p>
            </div>
            <small className="k-muted">comprobado {marcaDe(comprobadoEn)}</small>
          </article>
        </div>
        <p className="k-muted">
          La verificación se repite cada minuto y con el botón de arriba. Esta página no es un
          monitor externo: consulta a la propia plataforma, así que si la plataforma está caída
          no puede informar de nada.
        </p>
      </section>

      <section className="k-surface k-settings-section" aria-label="Documentos y ayuda">
        <h2>Documentos</h2>
        <div className="k-auth-utility-row">
          {LEGAL_LINKS.map((enlace) => (
            <Link key={enlace.slug} to={`/${enlace.slug}`} className="k-link-subtle">
              {enlace.label}
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}
