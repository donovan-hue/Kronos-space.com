import { useMemo, useState } from "react";
import "../preview.css";
import "./kronos-reference.css";
// El archivo de referencia vive en la raíz del repositorio
// (`kronos.html`, añadido en el commit 3caeebb). Se importa como texto
// para mostrarlo EXACTO: sin copiarlo, sin reescribirlo y sin que su
// CSS toque la aplicación. Si el archivo cambia, esta vista cambia.
import referenceHtml from "../../../../kronos.html?raw";

const WIDTHS = [
  ["390", "Móvil 390"],
  ["768", "Tablet 768"],
  ["1280", "Escritorio 1280"],
];

/**
 * Laboratorio de diseño · comparación con la referencia kronos.html.
 *
 * No es la aplicación: es el archivo de referencia renderizado aislado
 * (iframe con `srcdoc`) para poder compararlo con la interfaz real que
 * sirve hoy el cliente. La ruta existe solo en el servidor de diseño
 * (`npm run dev:design`) y en la aplicación se abre con /design-preview/kronos.
 */
export default function KronosReferencePreview() {
  const [width, setWidth] = useState("390");
  const [frameKey, setFrameKey] = useState(0);
  const html = useMemo(() => referenceHtml, []);
  const height = width === "1280" ? 820 : 780;

  return (
    <div className="design-preview">
      <header className="dp-header">
        <a className="dp-wordmark" href="/design-preview">
          KRONOS<span>SPACE</span>
        </a>
        <span className="dp-badge">Laboratorio · Referencia kronos.html</span>
      </header>

      <main className="kr-preview">
        <div className="kr-bar">
          <h1>Referencia de diseño (archivo `kronos.html`, sin modificar)</h1>
          <div className="dp-options" role="group" aria-label="Ancho de la vista">
            {WIDTHS.map(([value, label]) => (
              <label key={value}>
                <input
                  type="radio"
                  name="kr-width"
                  value={value}
                  checked={width === value}
                  onChange={() => setWidth(value)}
                />
                <span>{label}</span>
              </label>
            ))}
          </div>
          <button
            type="button"
            className="dp-motion"
            onClick={() => setFrameKey((value) => value + 1)}
          >
            Reiniciar la referencia
          </button>
        </div>

        <ul className="kr-tags">
          <li>
            <strong>Origen:</strong> kronos.html (raíz del repositorio)
          </li>
          <li>
            <strong>Estado en la app:</strong> no integrado — el cliente sirve la piel verdant
            (aqua-theme.css)
          </li>
          <li>
            <strong>Esta vista:</strong> solo comparación, no modifica la cuenta ni la interfaz
          </li>
        </ul>

        <div className="kr-stage" style={{ width: `${width}px`, maxWidth: "100%", height }}>
          <iframe
            key={frameKey}
            title="Referencia de diseño kronos.html"
            srcDoc={html}
            loading="lazy"
          />
        </div>

        <p className="kr-note">
          Dentro del marco se ejecuta el prototipo completo (splash, acceso, inicio, órbitas,
          Kairos, ajustes…). Es interactivo: sus propios botones y su router por hash funcionan.
          Para ver la interfaz que sirve hoy la aplicación, abre <a href="/login">/login</a> o el
          informe <code>docs/client/REVISION-DISENO-KRONOS-REFERENCIA.md</code>.
        </p>

        <footer className="kr-foot">
          <span>KRONOS / LABORATORIO DE DISEÑO</span>
          <a href="/design-preview">Volver al laboratorio ↗</a>
        </footer>
      </main>
    </div>
  );
}
