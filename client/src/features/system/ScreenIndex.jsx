import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Search, CircleSlash2, Eye, EyeOff, Power, Clock, DoorClosed } from "lucide-react";
import { ESTADOS, MAPA_PANTALLAS, ORIGENES, buscarPantallas, destinoPantalla, totalesDelMapa } from "../../lib/screenIndex";

/* ============================================================
   TODAS LAS PANTALLAS — el índice

   Una sola pantalla con la ruta de todo: lo que está a la vista, lo
   escondido, lo que se puede apagar y lo que viene. Se busca por
   nombre, descripción o ruta, y cada renglón dice de dónde se llega.
   ============================================================ */

const ICONO_ESTADO = {
  visible: Eye,
  escondido: EyeOff,
  apagable: Power,
  proximamente: Clock,
  fuera: DoorClosed
};

export default function ScreenIndex({ user }) {
  const [consulta, setConsulta] = useState("");
  const [filtroEstado, setFiltroEstado] = useState("todas");
  const [filtroArea, setFiltroArea] = useState("todas");

  const areas = useMemo(() => {
    const resultado = buscarPantallas(consulta).filter((area) => filtroArea === "todas" || area.id === filtroArea);
    if (filtroEstado === "todas") return resultado;
    return resultado
      .map((area) => ({ ...area, pantallas: area.pantallas.filter((pantalla) => pantalla.estado === filtroEstado) }))
      .filter((area) => area.pantallas.length > 0);
  }, [consulta, filtroEstado, filtroArea]);

  const totales = useMemo(() => totalesDelMapa(), []);
  const encontradas = areas.reduce((suma, area) => suma + area.pantallas.length, 0);

  return (
    <section className="page k-indice-page">
      <header className="k-page-header">
        <div>
          <h1>Todas las pantallas</h1>
          <p className="k-muted">
            {totales.total} pantallas y funciones en {MAPA_PANTALLAS.length} áreas. {totales.conRuta} tienen su
            dirección definida. Las dos fichas de infraestructura son informativas; no son herramientas de usuario.
          </p>
        </div>
      </header>

      <div className="k-indice-controles">
        <label className="k-indice-buscar">
          <Search size={18} aria-hidden="true" />
          <input
            type="search"
            value={consulta}
            onChange={(evento) => setConsulta(evento.target.value)}
            placeholder="Busca una pantalla: guardados, órbitas, kairos, ajustes..."
            aria-label="Buscar una pantalla"
          />
        </label>
        <label className="k-feature-area-filter">Área
          <select className="k-input" value={filtroArea} onChange={(event) => setFiltroArea(event.target.value)}>
            <option value="todas">Todas las áreas</option>
            {MAPA_PANTALLAS.map((area) => <option key={area.id} value={area.id}>{area.titulo}</option>)}
          </select>
        </label>
        <div className="k-indice-filtros" role="group" aria-label="Filtrar por estado">
          <button
            type="button"
            className={`k-indice-filtro${filtroEstado === "todas" ? " is-activo" : ""}`}
            onClick={() => setFiltroEstado("todas")}
            aria-pressed={filtroEstado === "todas"}
          >
            Todas · {totales.total}
          </button>
          {Object.entries(ESTADOS).filter(([id]) => totales.porEstado[id] > 0).map(([id, etiqueta]) => {
            const Icono = ICONO_ESTADO[id];
            return (
              <button
                key={id}
                type="button"
                className={`k-indice-filtro es-${id}${filtroEstado === id ? " is-activo" : ""}`}
                onClick={() => setFiltroEstado(id)}
                aria-pressed={filtroEstado === id}
              >
                <Icono size={14} aria-hidden="true" />
                {etiqueta} · {totales.porEstado[id]}
              </button>
            );
          })}
        </div>
      </div>

      <p role="status" aria-live="polite">{encontradas} funciones encontradas.</p>
      {encontradas === 0 ? (
        <p className="k-state" role="status">
          No hay ninguna pantalla que coincida con "{consulta}".
        </p>
      ) : (
        <div className="k-indice-areas">
          {areas.map((area) => (
            <section className="k-indice-area" key={area.id} aria-labelledby={`indice-${area.id}`}>
              <header className="k-indice-area-header">
                <h2 id={`indice-${area.id}`}>{area.titulo}</h2>
                <p>{area.nota}</p>
              </header>
              <ul className="k-indice-lista">
                {area.pantallas.map((pantalla) => {
                  const Icono = ICONO_ESTADO[pantalla.estado];
                  const contenido = (
                    <>
                      <span className="k-indice-nombre">{pantalla.nombre}</span>
                      <span className="k-indice-detalle">{pantalla.descripcion}</span>
                      <span className="k-indice-meta">
                        <span className={`k-indice-estado es-${pantalla.estado}`}>
                          <Icono size={13} aria-hidden="true" />
                          {ESTADOS[pantalla.estado]}
                        </span>
                        <span className="k-indice-origen">Se llega: {ORIGENES[pantalla.origen]}</span>
                        {pantalla.acceso === "admin" && <span>Solo administradores</span>}
                        {pantalla.tipoRuta === "ficha" && <span>Ficha informativa · no operativa</span>}
                        {pantalla.ruta && <code className="k-indice-ruta">{pantalla.ruta}</code>}
                        {pantalla.alias?.length > 0 && (
                          <span className="k-indice-alias">También: {pantalla.alias.join(" · ")}</span>
                        )}
                      </span>
                    </>
                  );
                  // Las rutas con parámetros abren una ficha donde elegir el
                  // recurso real; las pendientes explican su estado sin fingir servicio.
                  return (
                    <li key={`${pantalla.nombre}-${pantalla.ruta || pantalla.estado}`} className={`k-indice-item es-${pantalla.estado}`}>
                      <Link
                        to={pantalla.acceso === "admin" && user?.role !== "admin" ? pantalla.rutaFicha : destinoPantalla(pantalla)}
                        className="k-indice-enlace"
                      >
                        {contenido}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}

      <aside className="k-indice-nota">
        <CircleSlash2 size={18} aria-hidden="true" />
        <p>
          Cada función se puede localizar desde este directorio. Las rutas que requieren un usuario,
          publicación u órbita permiten buscar un recurso existente o escribir su identificador.
          Las fichas de infraestructura no prometen un panel operativo. Las funciones apagables dependen
          del servidor y Administración conserva sus permisos.
        </p>
      </aside>
    </section>
  );
}
