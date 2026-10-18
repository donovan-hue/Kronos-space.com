import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Search, CircleSlash2, Eye, EyeOff, Power, Clock, DoorClosed } from "lucide-react";
import { ESTADOS, MAPA_PANTALLAS, ORIGENES, buscarPantallas, totalesDelMapa } from "../../lib/screenIndex";

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

export default function ScreenIndex() {
  const [consulta, setConsulta] = useState("");
  const [filtroEstado, setFiltroEstado] = useState("todas");

  const areas = useMemo(() => {
    const resultado = buscarPantallas(consulta);
    if (filtroEstado === "todas") return resultado;
    return resultado
      .map((area) => ({ ...area, pantallas: area.pantallas.filter((pantalla) => pantalla.estado === filtroEstado) }))
      .filter((area) => area.pantallas.length > 0);
  }, [consulta, filtroEstado]);

  const totales = useMemo(() => totalesDelMapa(), []);
  const encontradas = areas.reduce((suma, area) => suma + area.pantallas.length, 0);

  return (
    <section className="page k-indice-page">
      <header className="k-page-header">
        <div>
          <h1>Todas las pantallas</h1>
          <p className="k-muted">
            {totales.total} pantallas y funciones en {MAPA_PANTALLAS.length} áreas. {totales.conRuta} tienen su
            dirección propia; el resto se abre con un botón, con una tecla o todavía no existe.
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
        <div className="k-indice-filtros" role="group" aria-label="Filtrar por estado">
          <button
            type="button"
            className={`k-indice-filtro${filtroEstado === "todas" ? " is-activo" : ""}`}
            onClick={() => setFiltroEstado("todas")}
            aria-pressed={filtroEstado === "todas"}
          >
            Todas · {totales.total}
          </button>
          {Object.entries(ESTADOS).map(([id, etiqueta]) => {
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
                        {pantalla.ruta && <code className="k-indice-ruta">{pantalla.ruta}</code>}
                        {pantalla.alias?.length > 0 && (
                          <span className="k-indice-alias">También: {pantalla.alias.join(" · ")}</span>
                        )}
                      </span>
                    </>
                  );
                  // Sin ruta no se enlaza: nada de botones que no lleven a
                  // ningún lado. Se muestra igual para que se sepa que existe.
                  return (
                    <li key={`${pantalla.nombre}-${pantalla.ruta || pantalla.estado}`} className={`k-indice-item es-${pantalla.estado}`}>
                      {pantalla.ruta ? (
                        <Link to={pantalla.ruta} className="k-indice-enlace">
                          {contenido}
                        </Link>
                      ) : (
                        <div className="k-indice-enlace es-sin-ruta">{contenido}</div>
                      )}
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
          Lo que aparece como Escondido existe y funciona, pero hoy solo se encuentra de casualidad. Lo que
          aparece como Próximamente todavía no está construido, y lo que se puede apagar depende de la
          configuración del servidor.
        </p>
      </aside>
    </section>
  );
}
