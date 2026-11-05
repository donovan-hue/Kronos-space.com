import { useEffect, useMemo, useState } from "react";
import { renderPrompt } from "./renderPrompt";
import {
  applyPromptPreset,
  createPromptPreset,
  deletePromptPreset,
  getPromptCatalog,
  getPromptPresets,
  updatePromptPreset,
} from "../../services/promptService";

/**
 * Biblioteca de prompts: catálogo de instrumentos + presets propios.
 *
 * Dos pestañas porque son dos cosas distintas: el catálogo es de todos y no
 * cambia; los presets son del usuario y se editan.
 *
 * Decisiones de interfaz:
 * - El instrumento elegido pinta sus campos; sin ellos el usuario no sabría
 *   qué le falta para armar el prompt.
 * - Guardar un preset no genera nada: solo lo deja listo. El botón «Usar»
 *   rellena el prompt del generador.
 * - Borrar pide confirmación en la propia fila (segundo clic), no con un
 *   `window.confirm`: el diálogo del navegador rompe el diseño y no se ve en
 *   móvil igual.
 */
export default function PromptLibrary({ onUsePrompt, onUseStyle }) {
  const [abierta, setAbierta] = useState(false);
  const [pestana, setPestana] = useState("catalogo");
  const [grupos, setGrupos] = useState([]);
  const [instrumentos, setInstrumentos] = useState([]);
  const [estilos, setEstilos] = useState([]);
  const [presets, setPresets] = useState([]);
  const [grupo, setGrupo] = useState("");
  const [busqueda, setBusqueda] = useState("");
  const [elegido, setElegido] = useState(null);
  const [valores, setValores] = useState({});
  const [nombre, setNombre] = useState("");
  const [mensaje, setMensaje] = useState("");
  const [cargando, setCargando] = useState(false);

  useEffect(() => {
    if (!abierta) return undefined;
    let vivo = true;
    setCargando(true);
    Promise.all([getPromptCatalog(), getPromptPresets()])
      .then(([catalogo, mios]) => {
        if (!vivo) return;
        setGrupos(catalogo.grupos);
        setInstrumentos(catalogo.instrumentos);
        setEstilos(catalogo.estilos);
        setPresets(mios.presets);
      })
      .catch(() => {
        if (vivo) setMensaje("No se pudo cargar la biblioteca.");
      })
      .finally(() => {
        if (vivo) setCargando(false);
      });
    return () => { vivo = false; };
  }, [abierta]);

  const visibles = useMemo(() => {
    const texto = busqueda.trim().toLowerCase();
    return instrumentos.filter((instrumento) => {
      if (grupo && instrumento.grupo !== grupo) return false;
      if (!texto) return true;
      return `${instrumento.nombre} ${instrumento.codigo}`.toLowerCase().includes(texto);
    });
  }, [instrumentos, grupo, busqueda]);

  function elegir(instrumento) {
    setElegido(instrumento);
    setValores({});
    setNombre("");
    setMensaje("");
  }

  // Misma función que usa el servidor (ver `renderPrompt.js`): lo que se ve
  // aquí es exactamente lo que se guarda.
  const textoArmado = elegido
    ? renderPrompt(elegido.template, elegido.campos.map((campo) => campo.clave), valores)
    : "";

  async function guardar() {
    if (!elegido) return;
    if (!nombre.trim()) {
      setMensaje("Ponle un nombre al preset.");
      return;
    }
    try {
      const preset = await createPromptPreset({
        nombre,
        tipo: "preset",
        instrumento: elegido.codigo,
        valores,
      });
      setPresets((lista) => [preset, ...lista]);
      setNombre("");
      setMensaje("Preset guardado.");
    } catch (error) {
      setMensaje(error.response?.data?.error || "No se pudo guardar el preset.");
    }
  }

  async function guardarEstilo() {
    const texto = valores.estiloVisual?.trim();
    if (!nombre.trim() || !texto) {
      setMensaje("El estilo necesita nombre y descripción.");
      return;
    }
    try {
      const preset = await createPromptPreset({ nombre, tipo: "estilo", estiloVisual: texto });
      setPresets((lista) => [preset, ...lista]);
      setNombre("");
      setValores({});
      setMensaje("Estilo guardado.");
    } catch (error) {
      setMensaje(error.response?.data?.error || "No se pudo guardar el estilo.");
    }
  }

  async function usar(preset) {
    try {
      const resultado = await applyPromptPreset(preset._id);
      if (resultado.estilo) {
        onUseStyle?.(preset);
        setMensaje(`Estilo «${preset.nombre}» aplicado.`);
      } else {
        onUsePrompt?.(resultado.prompt || preset.prompt || "");
        setMensaje(`Preset «${preset.nombre}» aplicado.`);
      }
      setPresets((lista) => lista.map((item) => (
        item._id === preset._id ? { ...item, usos: (item.usos || 0) + 1 } : item
      )));
    } catch (error) {
      setMensaje(error.response?.data?.error || "No se pudo aplicar el preset.");
    }
  }

  async function alternarFavorito(preset) {
    try {
      const actualizado = await updatePromptPreset(preset._id, { favorito: !preset.favorito });
      setPresets((lista) => lista.map((item) => (item._id === preset._id ? actualizado : item)));
    } catch {
      setMensaje("No se pudo cambiar el favorito.");
    }
  }

  async function borrar(preset) {
    try {
      await deletePromptPreset(preset._id);
      setPresets((lista) => lista.filter((item) => item._id !== preset._id));
      setMensaje("Preset borrado.");
    } catch {
      setMensaje("No se pudo borrar el preset.");
    }
  }

  if (!abierta) {
    return (
      <button className="k-button k-button-ghost" type="button" onClick={() => setAbierta(true)}>
        Biblioteca de prompts
      </button>
    );
  }

  return (
    <section className="k-prompt-library" aria-label="Biblioteca de prompts">
      <div className="k-prompt-library-head">
        <div className="k-prompt-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={pestana === "catalogo"}
            className={`k-prompt-tab${pestana === "catalogo" ? " is-active" : ""}`}
            onClick={() => setPestana("catalogo")}
          >
            Instrumentos
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={pestana === "mios"}
            className={`k-prompt-tab${pestana === "mios" ? " is-active" : ""}`}
            onClick={() => setPestana("mios")}
          >
            Mis presets ({presets.length})
          </button>
        </div>
        <button className="k-button k-button-ghost" type="button" onClick={() => setAbierta(false)}>Cerrar</button>
      </div>

      {mensaje && <p className="k-state" role="status">{mensaje}</p>}

      {pestana === "catalogo" ? (
        <>
          <div className="k-prompt-filters">
            <label>Grupo
              <select value={grupo} onChange={(event) => setGrupo(event.target.value)}>
                <option value="">Todos</option>
                {grupos.map((item) => <option key={item.id} value={item.id}>{item.nombre}</option>)}
              </select>
            </label>
            <label>Buscar
              <input
                type="search"
                value={busqueda}
                placeholder="Iluminación, cámara, voz…"
                onChange={(event) => setBusqueda(event.target.value)}
              />
            </label>
          </div>

          {cargando ? <p className="k-muted">Cargando catálogo…</p> : (
            <div className="k-prompt-grid">
              {visibles.map((instrumento) => (
                <button
                  key={instrumento.codigo}
                  type="button"
                  className={`k-prompt-card${elegido?.codigo === instrumento.codigo ? " is-active" : ""}`}
                  onClick={() => elegir(instrumento)}
                >
                  <span className="k-prompt-num">{String(instrumento.numero).padStart(2, "0")}</span>
                  <span className="k-prompt-name">{instrumento.nombre}</span>
                </button>
              ))}
            </div>
          )}

          {elegido && (
            <div className="k-prompt-instrument">
              <h3>{String(elegido.numero).padStart(2, "0")} · {elegido.nombre}</h3>
              {elegido.campos.map((campo) => (
                <label key={campo.clave}>{campo.etiqueta}
                  <input
                    value={valores[campo.clave] || ""}
                    placeholder={campo.ejemplo}
                    onChange={(event) => setValores((previo) => ({ ...previo, [campo.clave]: event.target.value }))}
                  />
                </label>
              ))}

              {elegido.codigo === "img_styles" || elegido.codigo === "img_negative" ? (
                <p className="k-muted k-field-hint">
                  Estilos disponibles: {estilos.map((estilo) => estilo.nombre).join(" · ")}
                </p>
              ) : null}

              {textoArmado && <pre className="k-prompt-preview">{textoArmado}</pre>}

              {elegido.codigo === "img_styles" ? (
                <div className="k-prompt-save">
                  <label>Nombre del estilo propio
                    <input value={nombre} onChange={(event) => setNombre(event.target.value)} maxLength={80} />
                  </label>
                  <label>Descripción visual
                    <textarea
                      value={valores.estiloVisual || ""}
                      placeholder="cromo líquido, reflejos nítidos, fondo negro"
                      onChange={(event) => setValores((previo) => ({ ...previo, estiloVisual: event.target.value }))}
                    />
                  </label>
                  <button className="k-button k-button-secondary" type="button" onClick={guardarEstilo}>
                    Guardar como estilo
                  </button>
                </div>
              ) : null}

              <div className="k-prompt-save">
                <label>Nombre del preset
                  <input value={nombre} onChange={(event) => setNombre(event.target.value)} maxLength={80} />
                </label>
                <button className="k-button k-button-secondary" type="button" onClick={guardar} disabled={!textoArmado}>
                  Guardar preset
                </button>
              </div>
            </div>
          )}
        </>
      ) : (
        <div className="k-prompt-presets">
          {presets.length === 0 ? (
            <p className="k-muted">Todavía no has guardado ningún preset.</p>
          ) : presets.map((preset) => (
            <article className="k-prompt-preset" key={preset._id}>
              <header>
                <strong>{preset.nombre}</strong>
                <span className="k-prompt-badge">
                  {preset.tipo === "estilo" ? "Estilo" : preset.instrumentoNombre || "Preset"}
                </span>
              </header>
              <p className="k-muted">
                {preset.tipo === "estilo" ? preset.estiloVisual : preset.prompt}
              </p>
              <footer>
                <button className="k-button k-button-secondary" type="button" onClick={() => usar(preset)}>Usar</button>
                <button
                  className="k-button k-button-ghost"
                  type="button"
                  aria-pressed={Boolean(preset.favorito)}
                  onClick={() => alternarFavorito(preset)}
                >
                  {preset.favorito ? "★ Favorito" : "☆ Favorito"}
                </button>
                <button className="k-button k-button-danger" type="button" onClick={() => borrar(preset)}>Borrar</button>
                <span className="k-muted">{preset.usos || 0} usos</span>
              </footer>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
