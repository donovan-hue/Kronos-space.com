import { Link } from "react-router-dom";
import { SHORTCUTS } from "../../components/shortcuts/ShortcutsModal.jsx";
import {
  AYUDA_ACTUALIZADA,
  AYUDA_CABECERA,
  AYUDA_ENLACES,
  AYUDA_SECCIONES,
  gruposDeAyuda
} from "./ayuda";

/**
 * CENTRO DE AYUDA — `/ayuda`, pública.
 *
 * Vive fuera del árbol protegido por la misma razón que los documentos legales:
 * quien aún no tiene cuenta es justamente quien tiene dudas. No pide sesión y no
 * redirige al acceso.
 *
 * Usa las clases que ya existen en la hoja única (una página de texto no
 * necesita hoja propia, y el barrido de utilidades del CI falla ante una clase
 * sin regla). La lista de pantallas no está escrita aquí: se genera desde
 * `navigation/model.jsx` vía `gruposDeAyuda()`, para que la ayuda y el menú no
 * puedan contar dos cosas distintas.
 */
export default function AyudaPage() {
  const grupos = gruposDeAyuda();

  return (
    <main className="page k-feature-page">
      <header className="k-page-header">
        <div>
          <p className="k-eyebrow">{AYUDA_CABECERA.eyebrow}</p>
          <h1>{AYUDA_CABECERA.title}</h1>
          <p className="k-muted">{AYUDA_CABECERA.intro}</p>
          <p className="k-muted">Actualizada el {AYUDA_ACTUALIZADA}</p>
        </div>

        <nav className="k-feature-actions" aria-label="Índice del centro de ayuda">
          <a className="k-link-subtle" href="#pantallas">Pantallas</a>
          {AYUDA_SECCIONES.map((seccion) => (
            <a key={seccion.id} className="k-link-subtle" href={`#${seccion.id}`}>
              {seccion.titulo}
            </a>
          ))}
          <a className="k-link-subtle" href="#atajos">Atajos</a>
        </nav>
      </header>

      <section id="pantallas" className="k-surface k-settings-section">
        <h2>Qué hay en cada pantalla</h2>
        <p className="k-muted">
          Los nombres y el orden son los del menú de navegación. Las pantallas de la
          aplicación piden cuenta: esta página solo enlaza lo que se puede leer sin
          entrar.
        </p>
        {grupos.map((grupo) => (
          <div key={grupo.id}>
            <h3>{grupo.etiqueta}</h3>
            <ul className="k-indice-lista">
              {grupo.destinos.map((destino) => (
                <li key={destino.id}>
                  <strong>
                    <span aria-hidden="true">{destino.emoji}</span> {destino.etiqueta}
                  </strong>
                  <p>{destino.texto || "Aún sin explicar en este centro."}</p>
                  {destino.hijos.length > 0 && (
                    <p className="k-muted">Herramientas: {destino.hijos.join(" · ")}</p>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </section>

      {AYUDA_SECCIONES.map((seccion) => (
        <section id={seccion.id} key={seccion.id} className="k-surface k-settings-section">
          <h2>{seccion.titulo}</h2>
          {seccion.parrafos.map((parrafo, indice) => (
            // Contenido estático: el orden no cambia entre renders.
            <p key={`${seccion.id}-${indice}`}>{parrafo}</p>
          ))}
        </section>
      ))}

      <section id="atajos" className="k-surface k-settings-section">
        <h2>Atajos de teclado</h2>
        <p className="k-muted">
          Los mismos que lista el panel de atajos del sitio, el que abre la tecla «?».
        </p>
        <div className="k-shortcuts-list">
          {SHORTCUTS.map((atajo) => (
            <div className="k-shortcut-item" key={atajo.key}>
              <kbd className="k-shortcut-key">{atajo.key}</kbd>
              <span className="k-shortcut-desc">{atajo.desc}</span>
            </div>
          ))}
        </div>
      </section>

      <p className="k-muted">
        Esta página se escribe leyendo el código: si una pantalla, un control de
        privacidad o un límite cambian, cambian aquí en el mismo commit. El detalle
        completo de rutas está en <code>docs/RUTAS-Y-NAVEGACION.md</code> y los
        límites declarados, en <code>docs/LIMITES-Y-DEUDA.md</code>.
      </p>

      <div className="k-auth-utility-row">
        {AYUDA_ENLACES.map((enlace) => (
          <Link key={enlace.to} to={enlace.to} className="k-link-subtle">
            {enlace.label}
          </Link>
        ))}
      </div>
    </main>
  );
}
