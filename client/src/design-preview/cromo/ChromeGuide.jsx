import "../preview.css";
import "./chrome-guide.css";
import ThemeToggle from "../../components/theme/ThemeToggle.jsx";

/**
 * Laboratorio · muestrario del sistema de diseño «CROMO ESPEJO».
 *
 * No es producto: es la hoja de estilo viva. Enseña los componentes
 * REALES de la aplicación (clases `k-*`) con la piel vigente, para
 * revisar el diseño sin depender del backend. El sistema vive en
 * `client/src/styles/kronos-chrome.css`.
 */

// Los valores son TOKENS: la paleta se lee igual en claro y en oscuro,
// porque el tema solo reescribe los tokens (misma forma, otros tonos).
const PALETTE = [
  ["var(--k-bg)", "Fondo · --k-bg"],
  ["var(--k-panel)", "Panel · --k-panel"],
  ["var(--k-border-strong)", "Línea · --k-border-strong"],
  ["var(--k-text)", "Tinta · --k-text"],
  ["var(--k-text-soft)", "Plata · --k-text-soft"],
  ["var(--k-muted)", "Gris · --k-muted"],
  ["var(--k-warning)", "Aviso · --k-warning"],
  ["var(--k-danger)", "Error · --k-danger"],
  ["var(--k-material-chrome)", "Espejo · --k-material-chrome"],
  ["var(--k-ring-chrome)", "Aro · --k-ring-chrome"],
];

export default function ChromeGuide() {
  return (
    <div className="design-preview">
      <header className="dp-header">
        <a className="dp-wordmark" href="/design-preview">
          KRONOS<span>SPACE</span>
        </a>
        <span className="dp-badge">Laboratorio · Sistema «Cromo Espejo»</span>
      </header>

      <main className="cg">
        <div className="cg-head">
          <div>
            <h1>Sistema de diseño «Cromo Espejo»</h1>
            <p>
              Sistema propio de este proyecto: negro puro, cromo espejo, líneas de un
              píxel y aros en vez de rellenos sólidos. Sin verde y sin color de acento.
              Dos tonos (claro y oscuro) sobre una sola forma.
            </p>
          </div>
          <div className="cg-head-actions">
            <span className="k-eyebrow">kronos-chrome.css</span>
            {/* El mismo control que vive en Configuración: aquí se prueba
                el sistema completo en los dos tonos. */}
            <ThemeToggle />
          </div>
        </div>

        <section className="cg-section">
          <h2>01 · Marca</h2>
          <p>
            Rótulo del portón con relieve de tres capas (cuerpo extruido, cara cromada
            y aro con bisel) y barrido de luz. El texto legible es uno solo: las capas
            son decorativas.
          </p>
          <div className="cg-stage cg-lockup">
            <h1 className="brand-title" data-k-text="KRONOSPACE">KRONOSPACE</h1>
            <div className="cg-rule" />
            <div className="cg-tag">Time × Space Platform</div>
          </div>
        </section>

        <section className="cg-section">
          <h2>02 · Paleta</h2>
          <p>
            Sin color de marca: el acento es el cromo. Solo aviso y error conservan tono.
            Cambia el tema arriba para ver los dos tonos: oscuro (negro puro) y claro
            (blanco con los mismos tonos del laboratorio).
          </p>
          <div className="cg-swatches">
            {PALETTE.map(([value, label]) => (
              <figure className="cg-swatch" key={label}>
                <span style={{ background: value }} />
                <figcaption>{label}</figcaption>
              </figure>
            ))}
          </div>
        </section>

        <section className="cg-section">
          <h2>03 · Tipografía</h2>
          <p>
            Helvetica Neue / Helvetica / Arial. Titulares con espaciado neutro y
            micro-etiquetas en versalitas muy espaciadas.
          </p>
          <div className="cg-stage">
            <span className="k-eyebrow">Micro-etiqueta · .k-eyebrow</span>
            <h1 style={{ margin: "14px 0 8px", fontSize: "2rem" }}>Titular de pantalla</h1>
            <h2 style={{ margin: "0 0 8px", fontSize: "1.3rem" }}>Sección</h2>
            <p style={{ margin: "0 0 12px", maxWidth: 620 }}>
              Texto de lectura: el cuerpo usa plata suave sobre negro, con interlineado
              amplio. Nunca se fuerza mayúscula al contenido del usuario.
            </p>
            <div className="k-muted" style={{ fontSize: ".78rem" }}>
              Texto secundario en gris acero (.k-muted)
            </div>
          </div>
        </section>

        <section className="cg-section">
          <h2>04 · Botones</h2>
          <p>
            La firma: aro cromado con interior negro en las acciones principales;
            panel negro con línea en las secundarias; texto suelto en las fantasma.
          </p>
          <div className="cg-stage cg-row">
            <button className="k-button k-button-primary" type="button">Publicar</button>
            <button className="k-button k-button-secondary" type="button">Seguir</button>
            <button className="k-button k-button-ghost" type="button">Cancelar</button>
            <button className="k-button k-button-danger" type="button">Eliminar</button>
            <button className="k-button k-button-ai" type="button">Generar con Kairos</button>
            <button className="k-button k-button-primary" type="button" disabled>Deshabilitado</button>
            <button className="k-icon-button" type="button" aria-label="Adjuntar">＋</button>
          </div>
        </section>

        <section className="cg-section">
          <h2>05 · Campos</h2>
          <p>Aro de un píxel, interior negro; al enfocar, el aro se vuelve cromado completo.</p>
          <div className="cg-stage cg-grid">
            <div className="k-form-field">
              <label className="k-field-label" htmlFor="cg-mail">Correo</label>
              <input id="cg-mail" className="k-text-input" placeholder="tu@correo.com" />
            </div>
            <div className="k-form-field">
              <label className="k-field-label" htmlFor="cg-user">Usuario</label>
              <input id="cg-user" className="k-input" placeholder="@usuario" />
            </div>
            <div className="k-form-field" style={{ gridColumn: "1 / -1" }}>
              <label className="k-field-label" htmlFor="cg-bio">Biografía</label>
              <textarea id="cg-bio" className="k-text-input" rows={3} placeholder="Cuéntale algo a tu órbita…" />
            </div>
          </div>
        </section>

        <section className="cg-section">
          <h2>06 · Pastillas y pestañas</h2>
          <p>Insignias de sistema en versalitas; chips para filtros; pestaña activa con aro interior.</p>
          <div className="cg-stage">
            <div className="cg-row" style={{ marginBottom: 18 }}>
              <span className="k-badge">Borrador</span>
              <span className="k-badge k-badge-success">Confirmado</span>
              <span className="k-badge k-badge-warning">Pendiente</span>
              <span className="k-badge k-badge-danger">Error</span>
              <button className="k-chip" type="button">Todo</button>
              <button className="k-chip is-active" type="button">Personas</button>
              <button className="k-chip" type="button">Publicaciones</button>
            </div>
            <div className="k-tabs" role="tablist" aria-label="Ejemplo de pestañas">
              <button role="tab" aria-selected="true" type="button">Publicaciones</button>
              <button role="tab" aria-selected="false" type="button">Multimedia</button>
              <button role="tab" aria-selected="false" type="button">Gustos</button>
            </div>
          </div>
        </section>

        <section className="cg-section">
          <h2>07 · Superficies</h2>
          <p>Panel casi negro con línea de un píxel: la tarjeta del feed y el shell.</p>
          <div className="cg-stage cg-grid">
            <article className="k-post k-postdemo">
              <div className="k-post-header cg-row">
                <span className="k-avatar" aria-hidden="true">AR</span>
                <div>
                  <div className="k-post-author">Ana Ruiz</div>
                  <div className="k-muted" style={{ fontSize: ".72rem" }}>@anaruiz · hace 12 min</div>
                </div>
              </div>
              <p className="k-post-content">
                Primera cápsula programada para abrirse en 2031. Cinco años guardando un
                mensaje que ni yo recuerdo haber escrito.
              </p>
              <div className="k-row-actions cg-row">
                <button className="k-button k-button-ghost" type="button">Me gusta · 128</button>
                <button className="k-button k-button-ghost" type="button">Comentar · 14</button>
                <button className="k-button k-button-ghost" type="button">Guardar</button>
              </div>
            </article>
            <div className="k-surface" style={{ padding: 18 }}>
              <span className="k-eyebrow">Superficie</span>
              <p style={{ margin: "10px 0 0" }}>
                Panel del shell con la misma línea de un píxel. Sin brillos ni sombras de color.
              </p>
            </div>
          </div>
        </section>

        <section className="cg-section">
          <h2>08 · Avatares, historias y navegación</h2>
          <p>Aro cromado con interior negro; el destino activo se marca con aro, no con relleno.</p>
          <div className="cg-stage cg-grid">
            <div className="cg-row">
              <span className="k-avatar" aria-hidden="true">AR</span>
              <span className="k-avatar" aria-hidden="true">IM</span>
              <span className="k-avatar" aria-hidden="true">LF</span>
              <span className="k-story-ring" aria-hidden="true" style={{ display: "grid", placeItems: "center", width: 54, height: 54, borderRadius: "50%" }}>
                <span className="k-avatar" style={{ width: 44, height: 44 }}>N</span>
              </span>
            </div>
            <div className="cg-navdemo">
              <a className="k-navigation-item is-active" href="#cg" onClick={(event) => event.preventDefault()}>
                <span className="k-navigation-icon">◉</span>
                <span className="k-navigation-copy"><strong>Inicio</strong><small>Feed cronológico</small></span>
              </a>
              <a className="k-navigation-item" href="#cg" onClick={(event) => event.preventDefault()}>
                <span className="k-navigation-icon">◎</span>
                <span className="k-navigation-copy"><strong>Explorar</strong><small>Personas y publicaciones</small></span>
              </a>
            </div>
          </div>
        </section>

        <section className="cg-section">
          <h2>09 · Estados y avisos</h2>
          <p>Línea discontinua para los estados vacíos o de error; avisos tipo píldora.</p>
          <div className="cg-stage cg-grid">
            <div className="k-state">
              <div className="k-eyebrow">Sin publicaciones</div>
              <p style={{ margin: "8px 0 0" }}>Cuando publiques algo aparecerá aquí.</p>
            </div>
            <div className="k-state k-state-success">Guardado en tu biblioteca.</div>
            <div className="k-state k-state-warning">Revisa la fecha antes de programar.</div>
            <div className="k-state k-state-error">No se pudo enviar. Inténtalo de nuevo.</div>
            <div className="k-skeleton" style={{ height: 90 }} aria-hidden="true" />
            <div>
              <div className="k-toast k-toast-success" style={{ marginBottom: 10 }}>Publicación creada</div>
              <div className="k-toast k-toast-error">Tu sesión terminó</div>
            </div>
          </div>
        </section>

        <p className="cg-note">
          Este muestrario no modifica la cuenta ni la interfaz publicada. Para ver la
          aplicación real, abre <a href="/login">/login</a> (el interior requiere sesión y API).
        </p>

        <footer className="cg-row" style={{ marginTop: 28, color: "var(--k-steel)", fontSize: ".7rem", letterSpacing: ".14em", textTransform: "uppercase" }}>
          <span>KRONOS / CROMO ESPEJO</span>
          <a href="/design-preview">Volver al laboratorio ↗</a>
        </footer>
      </main>
    </div>
  );
}
