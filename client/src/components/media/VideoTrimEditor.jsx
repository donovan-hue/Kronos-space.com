import { useEffect, useState } from "react";
import { recorteInicial, validarRecorte } from "../../lib/videoTrimEditor";

/**
 * Recorte de un video ya publicado.
 *
 * `PATCH /api/posts/:postId/video-trim` existía desde hace tiempo y **nadie la
 * llamaba**: el recorte solo se podía fijar en el compositor, antes de
 * publicar. Esto cierra el círculo: el autor abre el video, mueve los dos
 * topes y guarda.
 *
 * El archivo no se reescribe: la ruta guarda `media.trim` y el reproductor del
 * feed ya lo obedece (`VideoTrim`). Por eso el máximo del segundo tope es la
 * duración real que el servidor guardó en `media.duration`; si falta, se
 * pregunta al propio `<video>`.
 */
export default function VideoTrimEditor({ media, onSave, onCancel, saving = false }) {
  const inicial = recorteInicial(media);
  const [inicio, setInicio] = useState(inicial.inicio);
  const [fin, setFin] = useState(inicial.fin);
  const [silenciar, setSilenciar] = useState(inicial.silenciar);
  const [duracion, setDuracion] = useState(Number(media?.duration) > 0 ? Number(media.duration) : 0);
  const [error, setError] = useState("");

  // Si el servidor no guardó la duración (publicaciones viejas), se toma del
  // propio elemento de video al cargar los metadatos.
  useEffect(() => {
    if (duracion > 0) return undefined;
    const video = document.querySelector(".k-post-media video, .k-media-viewer video");
    if (!video) return undefined;
    const alCargar = () => {
      if (Number.isFinite(video.duration) && video.duration > 0) {
        setDuracion(video.duration);
        setFin((actual) => (actual > 0 ? actual : video.duration));
      }
    };
    if (Number.isFinite(video.duration) && video.duration > 0) alCargar();
    video.addEventListener("loadedmetadata", alCargar);
    return () => video.removeEventListener("loadedmetadata", alCargar);
  }, [duracion]);

  const cambio = inicio !== inicial.inicio || fin !== inicial.fin || silenciar !== inicial.silenciar;

  function guardar(event) {
    event.preventDefault();
    const problema = validarRecorte({ inicio, fin, duracion });
    if (problema) { setError(problema); return; }
    setError("");
    onSave?.({ trim: { start: inicio, end: fin, muted: silenciar } });
  }

  return (
    <form className="k-video-trim-editor" onSubmit={guardar}>
      <p className="k-muted">
        Elige qué tramo se reproduce. El archivo original no se modifica.
      </p>
      <label>
        <span>Inicio: {inicio.toFixed(1)} s</span>
        <input
          type="range"
          min="0"
          max={Math.max(duracion, 0.1)}
          step="0.1"
          value={inicio}
          onChange={(event) => setInicio(Number(event.target.value))}
        />
      </label>
      <label>
        <span>Final: {fin.toFixed(1)} s</span>
        <input
          type="range"
          min="0"
          max={Math.max(duracion, 0.1)}
          step="0.1"
          value={fin}
          onChange={(event) => setFin(Number(event.target.value))}
        />
      </label>
      <label className="k-video-trim-mute">
        <input type="checkbox" checked={silenciar} onChange={(event) => setSilenciar(event.target.checked)} />
        <span>Silenciar el audio</span>
      </label>
      {error ? <p className="k-state k-state-error" role="alert">{error}</p> : null}
      <div className="k-video-trim-actions">
        <button type="button" className="k-button k-button-secondary" onClick={onCancel} disabled={saving}>
          Cancelar
        </button>
        <button type="submit" className="k-button k-button-primary" disabled={saving || !cambio}>
          {saving ? "Guardando…" : "Guardar recorte"}
        </button>
      </div>
    </form>
  );
}
