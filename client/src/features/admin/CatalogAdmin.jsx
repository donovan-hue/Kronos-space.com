import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  obtenerCatalogoMusica,
  publicarPista,
  actualizarPista,
  eliminarPista
} from "../../services/musicService";
import {
  obtenerVoces,
  registrarVoz,
  actualizarVoz,
  eliminarVoz
} from "../../services/voiceService";
import { mediaUrl } from "../../services/mediaUrl";

/**
 * Administración de los catálogos del estudio (voces y música).
 *
 * `POST /api/music` y `POST /api/voices` existen desde el principio con
 * `requireAdmin` y ninguna pantalla los llamaba: el catálogo solo se podía
 * llenar a mano con curl, y el estudio mostraba «todavía no hay pistas» sin que
 * hubiera forma de publicar una. Esta pantalla cierra ese hueco; el servidor
 * sigue siendo quien valida y quien decide qué es catálogo.
 *
 * Editar y retirar viven aquí porque son la otra mitad de administrar: un
 * título mal escrito o una licencia equivocada no podía corregirse sin tocar la
 * base a mano. `PATCH` no sustituye el archivo —eso sería otro elemento— y
 * `DELETE` solo borra el archivo si nada más lo referencia.
 */

const IDIOMAS = ["es-MX", "es-ES", "en-US", "pt-BR"];
const GENEROS = ["", "femenina", "masculina", "neutra"];

async function leerCatalogos() {
  // Se piden los dos catálogos completos y se muestra lo que hay, sin inventar
  // recuentos: si una lectura falla, la pantalla lo dice por separado (las dos
  // funciones devuelven `motivo` en vez de lanzar).
  const [musica, voces] = await Promise.allSettled([obtenerCatalogoMusica(), obtenerVoces()]);

  return {
    pistas: musica.status === "fulfilled" ? musica.value.pistas : [],
    voces: voces.status === "fulfilled" ? voces.value.voces : [],
    motivoMusica: musica.status === "fulfilled" ? musica.value.motivo : "No se pudo leer el catálogo de música.",
    motivoVoces: voces.status === "fulfilled" ? voces.value.motivo : "No se pudo leer el catálogo de voces."
  };
}

export default function CatalogAdmin() {
  const queryClient = useQueryClient();
  const catalogo = useQuery({ queryKey: ["admin", "catalogos"], queryFn: leerCatalogos });
  const [mensaje, setMensaje] = useState("");
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState("");
  // Qué fila se está editando y con qué valores. Una sola a la vez: dos
  // formularios abiertos sobre el mismo catálogo solo invitan a pisarse.
  const [editando, setEditando] = useState(null);
  const [borrando, setBorrando] = useState("");

  async function enviarPista(event) {
    event.preventDefault();
    if (guardando) return;
    const form = event.currentTarget;
    const datos = new FormData(form);
    // El archivo se lee del propio input: `new FormData(form)` no siempre
    // materializa un `File` de un input de archivo (jsdom devuelve una entrada
    // vacía), y el servicio lo adjunta él mismo.
    const archivo = form.elements.audio?.files?.[0] || null;

    if (!archivo || !archivo.size) {
      setError("Elige un archivo de audio para publicar la pista.");
      return;
    }

    setGuardando("pista");
    setError("");
    setMensaje("");
    try {
      const pista = await publicarPista({
        archivo,
        titulo: datos.get("titulo"),
        autor: datos.get("autor"),
        duracion: Number(datos.get("duracion")) || 0,
        etiquetas: datos.get("etiquetas"),
        licencia: datos.get("licencia"),
        publicada: datos.get("publicada") === "on"
      });
      setMensaje(`Pista «${pista?.titulo || "sin título"}» publicada en el catálogo.`);
      form.reset();
      await queryClient.invalidateQueries({ queryKey: ["admin", "catalogos"] });
      await queryClient.invalidateQueries({ queryKey: ["studio", "music"] });
    } catch (requestError) {
      setError(requestError.response?.data?.error || requestError.message || "No se pudo publicar la pista.");
    } finally {
      setGuardando("");
    }
  }

  async function enviarVoz(event) {
    event.preventDefault();
    if (guardando) return;
    const form = event.currentTarget;
    const datos = new FormData(form);
    const archivo = form.elements.audio?.files?.[0] || null;
    const tipo = datos.get("tipo") === "propia" ? "propia" : "catalogo";

    if (tipo === "propia" && (!archivo || !archivo.size)) {
      setError("Una voz propia necesita su archivo de audio.");
      return;
    }
    if (tipo === "catalogo" && !String(datos.get("modelo") || "").trim()) {
      setError("Una voz de catálogo necesita el modelo del proveedor.");
      return;
    }

    setGuardando("voz");
    setError("");
    setMensaje("");
    try {
      const voz = await registrarVoz({
        archivo: archivo && archivo.size ? archivo : null,
        nombre: datos.get("nombre"),
        descripcion: datos.get("descripcion"),
        idioma: datos.get("idioma"),
        genero: datos.get("genero"),
        tipo,
        modelo: datos.get("modelo"),
        vozProveedor: datos.get("vozProveedor"),
        duracion: Number(datos.get("duracion")) || 0,
        licencia: datos.get("licencia"),
        lista: datos.get("lista") === "on"
      });
      setMensaje(`Voz «${voz?.nombre || "sin nombre"}» registrada en el catálogo.`);
      form.reset();
      await queryClient.invalidateQueries({ queryKey: ["admin", "catalogos"] });
      await queryClient.invalidateQueries({ queryKey: ["studio", "voices"] });
    } catch (requestError) {
      setError(requestError.response?.data?.error || requestError.message || "No se pudo registrar la voz.");
    } finally {
      setGuardando("");
    }
  }

  async function guardarEdicion(event) {
    event.preventDefault();
    if (guardando || !editando) return;
    const form = event.currentTarget;
    const valores = new FormData(form);
    setGuardando("edicion");
    setError("");
    setMensaje("");
    try {
      if (editando.clase === "pista") {
        const cambios = {
          titulo: String(valores.get("titulo") || "").trim(),
          autor: String(valores.get("autor") || "").trim(),
          licencia: String(valores.get("licencia") || "").trim(),
          etiquetas: String(valores.get("etiquetas") || ""),
          duracion: Number(valores.get("duracion")) || 0,
          publicada: valores.get("publicada") === "on"
        };
        await actualizarPista(editando.id, cambios);
        setMensaje(`Pista «${cambios.titulo}» actualizada.`);
        await queryClient.invalidateQueries({ queryKey: ["studio", "music"] });
      } else {
        const cambios = {
          nombre: String(valores.get("nombre") || "").trim(),
          descripcion: String(valores.get("descripcion") || "").trim(),
          licencia: String(valores.get("licencia") || "").trim(),
          lista: valores.get("lista") === "on"
        };
        const modelo = String(valores.get("modelo") || "").trim();
        if (modelo) cambios.modelo = modelo;
        await actualizarVoz(editando.id, cambios);
        setMensaje(`Voz «${cambios.nombre}» actualizada.`);
        await queryClient.invalidateQueries({ queryKey: ["studio", "voices"] });
      }
      setEditando(null);
      await queryClient.invalidateQueries({ queryKey: ["admin", "catalogos"] });
    } catch (requestError) {
      setError(requestError.response?.data?.error || requestError.message || "No se pudo guardar el cambio.");
    } finally {
      setGuardando("");
    }
  }

  async function retirar(clase, id, etiqueta) {
    if (borrando) return;
    // Confirmación explícita: retirar del catálogo no se deshace desde la
    // pantalla, y el archivo asociado puede desaparecer con él.
    if (typeof window !== "undefined" && !window.confirm(`¿Retirar «${etiqueta}» del catálogo? No se puede deshacer.`)) {
      return;
    }
    setBorrando(id);
    setError("");
    setMensaje("");
    try {
      const resultado = clase === "pista" ? await eliminarPista(id) : await eliminarVoz(id);
      setMensaje(
        resultado?.archivoBorrado
          ? `«${etiqueta}» retirada del catálogo y el archivo eliminado.`
          : `«${etiqueta}» retirada del catálogo. El archivo se conserva porque algo más lo usa.`
      );
      if (editando?.id === id) setEditando(null);
      await queryClient.invalidateQueries({ queryKey: ["admin", "catalogos"] });
      await queryClient.invalidateQueries({ queryKey: ["studio", clase === "pista" ? "music" : "voices"] });
    } catch (requestError) {
      setError(requestError.response?.data?.error || requestError.message || "No se pudo retirar.");
    } finally {
      setBorrando("");
    }
  }

  const datos = catalogo.data || { pistas: [], voces: [], motivoMusica: "", motivoVoces: "" };

  return (
    <section className="page" aria-label="Administración de catálogos">
      <header className="k-page-header">
        <div>
          <h1>Catálogos del estudio</h1>
          <p>Publica pistas y registra voces. Sin esto, el estudio solo muestra lo que ya exista en el servidor.</p>
        </div>
        <button
          className="k-button k-button-secondary"
          type="button"
          onClick={() => catalogo.refetch()}
          disabled={catalogo.isFetching}
        >
          {catalogo.isFetching ? "Actualizando..." : "Actualizar"}
        </button>
      </header>

      {mensaje && <p className="k-state" role="status">{mensaje}</p>}
      {error && (
        <div className="k-state k-state-error" role="alert">
          <p>{error}</p>
        </div>
      )}

      <div className="k-ai-workspace">
        <form className="k-ai-form k-surface" onSubmit={enviarPista} noValidate>
          <h2>Publicar pista de música</h2>
          <label>Archivo de audio (MP3, M4A, WAV, OGG, WebM; hasta 15 MB)
            <input type="file" name="audio" accept="audio/*" required />
          </label>
          <label>Título<input name="titulo" required maxLength={160} /></label>
          <label>Autor<input name="autor" maxLength={160} /></label>
          <label>Duración en segundos<input type="number" name="duracion" min="0" max="21600" defaultValue="0" /></label>
          <label>Etiquetas (separadas por comas)<input name="etiquetas" /></label>
          <label>Licencia<input name="licencia" maxLength={200} /></label>
          <label className="k-checkbox-label">
            <input type="checkbox" name="publicada" defaultChecked /> Publicada (visible en el estudio)
          </label>
          <button className="k-button k-button-primary" type="submit" disabled={Boolean(guardando)}>
            {guardando === "pista" ? "Publicando..." : "Publicar pista"}
          </button>
        </form>

        <form className="k-ai-form k-surface" onSubmit={enviarVoz} noValidate>
          <h2>Registrar voz</h2>
          <label>Nombre<input name="nombre" required maxLength={120} /></label>
          <label>Descripción<input name="descripcion" maxLength={300} /></label>
          <label>Tipo
            <select name="tipo" defaultValue="catalogo">
              <option value="catalogo">De catálogo (se genera por el proveedor)</option>
              <option value="propia">Propia (grabación)</option>
            </select>
          </label>
          <label>Idioma
            <select name="idioma" defaultValue="es-MX">
              {IDIOMAS.map((idioma) => <option key={idioma} value={idioma}>{idioma}</option>)}
            </select>
          </label>
          <label>Género
            <select name="genero" defaultValue="">
              {GENEROS.map((genero) => <option key={genero || "vacio"} value={genero}>{genero || "Sin especificar"}</option>)}
            </select>
          </label>
          <label>Modelo del proveedor (solo catálogo)<input name="modelo" maxLength={200} placeholder="google/gemini-2.5-flash-preview-tts" /></label>
          <label>Identificador de la voz en el proveedor<input name="vozProveedor" maxLength={120} placeholder="Kore" /></label>
          <label>Archivo de voz (solo propia)<input type="file" name="audio" accept="audio/*" /></label>
          <label>Licencia<input name="licencia" maxLength={200} /></label>
          <label className="k-checkbox-label">
            <input type="checkbox" name="lista" /> Listada para todo el mundo
          </label>
          <button className="k-button k-button-primary" type="submit" disabled={Boolean(guardando)}>
            {guardando === "voz" ? "Registrando..." : "Registrar voz"}
          </button>
        </form>
      </div>

      <section className="k-history" aria-label="Catálogo actual">
        <div className="k-section-heading">
          <div>
            <h2>En el catálogo</h2>
            <span className="k-muted">{datos.pistas.length} pistas · {datos.voces.length} voces</span>
          </div>
        </div>
        {editando && (
          <form className="k-ai-form k-surface" onSubmit={guardarEdicion} noValidate>
            <h3>{editando.clase === "pista" ? "Editar pista" : "Editar voz"}</h3>
            {editando.clase === "pista" ? (
              <>
                <label>Título<input name="titulo" defaultValue={editando.datos.titulo} required maxLength={160} /></label>
                <label>Autor<input name="autor" defaultValue={editando.datos.autor} maxLength={160} /></label>
                <label>Duración en segundos<input type="number" name="duracion" min="0" max="21600" defaultValue={editando.datos.duracion || 0} /></label>
                <label>Etiquetas (separadas por comas)<input name="etiquetas" defaultValue={(editando.datos.etiquetas || []).join(", ")} /></label>
                <label>Licencia<input name="licencia" defaultValue={editando.datos.licencia} maxLength={200} /></label>
                <label className="k-checkbox-label">
                  <input type="checkbox" name="publicada" defaultChecked={editando.datos.publicada} /> Publicada (visible en el estudio)
                </label>
              </>
            ) : (
              <>
                <label>Nombre<input name="nombre" defaultValue={editando.datos.nombre} required maxLength={120} /></label>
                <label>Descripción<input name="descripcion" defaultValue={editando.datos.descripcion} maxLength={300} /></label>
                {editando.datos.tipo === "catalogo" && (
                  <label>Modelo del proveedor<input name="modelo" defaultValue={editando.datos.modelo} maxLength={200} /></label>
                )}
                <label>Licencia<input name="licencia" defaultValue={editando.datos.licencia} maxLength={200} /></label>
                <label className="k-checkbox-label">
                  <input type="checkbox" name="lista" defaultChecked={editando.datos.lista} /> Listada para todo el mundo
                </label>
              </>
            )}
            <div className="k-form-actions">
              <button className="k-button k-button-primary" type="submit" disabled={Boolean(guardando)}>
                {guardando === "edicion" ? "Guardando..." : "Guardar cambios"}
              </button>
              <button className="k-button k-button-secondary" type="button" onClick={() => setEditando(null)}>
                Cancelar
              </button>
            </div>
          </form>
        )}
        {datos.motivoMusica && <p className="k-muted">{datos.motivoMusica}</p>}
        {datos.motivoVoces && <p className="k-muted">{datos.motivoVoces}</p>}
        {datos.pistas.length === 0 && datos.voces.length === 0 ? (
          <p className="k-muted">Los catálogos están vacíos. Publica la primera pista o registra la primera voz arriba.</p>
        ) : (
          <div className="k-history-list">
            {datos.pistas.map((pista) => (
              <article className="k-history-row k-surface" key={`pista-${pista._id}`}>
                <strong>{pista.titulo}</strong>
                <span>{pista.autor || "Sin autor"} · {pista.duracion || 0} s</span>
                {pista.url && <audio controls preload="none" src={mediaUrl(pista.url)} aria-label={`Escuchar ${pista.titulo}`} />}
                <div className="k-form-actions">
                  <button
                    className="k-button k-button-secondary"
                    type="button"
                    onClick={() => setEditando({ clase: "pista", id: pista._id, datos: pista })}
                  >
                    Editar
                  </button>
                  <button
                    className="k-button k-button-danger"
                    type="button"
                    disabled={borrando === pista._id}
                    onClick={() => retirar("pista", pista._id, pista.titulo)}
                  >
                    {borrando === pista._id ? "Retirando..." : "Retirar"}
                  </button>
                </div>
              </article>
            ))}
            {datos.voces.map((voz) => (
              <article className="k-history-row k-surface" key={`voz-${voz._id}`}>
                <strong>{voz.nombre}</strong>
                <span>
                  {voz.tipo === "catalogo" ? "Catálogo" : "Propia"} · {voz.idioma}
                  {voz.modelo ? ` · ${voz.modelo}` : ""}
                </span>
                {voz.url && <audio controls preload="none" src={mediaUrl(voz.url)} aria-label={`Escuchar ${voz.nombre}`} />}
                <div className="k-form-actions">
                  <button
                    className="k-button k-button-secondary"
                    type="button"
                    onClick={() => setEditando({ clase: "voz", id: voz._id, datos: voz })}
                  >
                    Editar
                  </button>
                  <button
                    className="k-button k-button-danger"
                    type="button"
                    disabled={borrando === voz._id}
                    onClick={() => retirar("voz", voz._id, voz.nombre)}
                  >
                    {borrando === voz._id ? "Retirando..." : "Retirar"}
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </section>
  );
}
