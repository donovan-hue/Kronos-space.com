import { cssFiltroVideo } from "../../lib/mediaStudio";
import { conectarLienzoTransiciones } from "../../lib/videoTransitionCanvas";
import { useLayoutEffect, useRef, useState } from "react";
import { conectarSecuencia, secuenciaDeVideo } from "../../lib/videoSequence";
import "../../styles/video-sequence.css";

export default function VideoSequence({ media, loop = false }) {
  const sequence = secuenciaDeVideo(media);
  const signature = JSON.stringify(sequence);
  const anchor = useRef(null);
  const controller = useRef(null);
  const videoRef = useRef(null);
  const transitionCanvas = useRef(null);
  const [state, setState] = useState(null);

  useLayoutEffect(() => {
    const video = anchor.current?.parentElement?.querySelector("video");
    videoRef.current = video;
    const parsed = JSON.parse(signature);
    if (!parsed || !video) return undefined;
    if (parsed.error) {
      video.pause();
      const stop = () => video.pause();
      video.addEventListener("play", stop);
      return () => video.removeEventListener("play", stop);
    }
    let visual;
    const connection = conectarSecuencia(video, parsed.clips, { loop, onChange: setState, onTransition: () => visual?.capture() });
    const hasTransitions = parsed.clips.some(clip => clip.transicion?.tipo && clip.transicion.tipo !== "corte" && clip.transicion.duracion > 0);
    if (hasTransitions) visual = conectarLienzoTransiciones(video, transitionCanvas.current, connection.clock,
      () => video.parentElement.querySelector(".k-video-sequence-image") || video);
    controller.current = connection;
    return () => { controller.current = null; visual?.dispose(); connection.dispose(); };
  }, [signature, loop]);

  if (!sequence) return null;
  const error = sequence.error || state?.error;
  return (
    <span ref={anchor} className="k-video-sequence">
      {!sequence.error && state?.image && <img
        key={`${state.generation}:${state.image}`}
        src={state.image}
        alt={`Imagen del clip ${state.index + 1}`}
        className={`${videoRef.current?.className || ""} k-video-sequence-image`}
        style={{ filter: videoRef.current?.style.filter }}
        onLoad={() => controller.current?.readyImage(state.generation)}
        onError={() => controller.current?.imageError(state.generation)}
      />}
      <canvas ref={transitionCanvas} className="k-video-transition-canvas" hidden aria-hidden="true" style={{ filter: cssFiltroVideo(media) }} />
      <span className="k-video-sequence-controls" role="group" aria-label="Secuencia de clips" onClick={event => event.stopPropagation()}>
        {error ? <span role="status">{error}</span> : <span aria-live="polite">Clip {(state?.index || 0) + 1} de {sequence.clips.length}</span>}
        {!sequence.error && <>
          <button type="button" className="k-button k-button-secondary" aria-label="Clip anterior" disabled={!state || state.index === 0} onClick={() => controller.current?.previous()}>‹</button>
          {error ? <button type="button" className="k-button k-button-secondary" onClick={() => { controller.current?.retry(); controller.current?.play(); }}>Reintentar clip</button>
            : <button type="button" className="k-button k-button-secondary" onClick={() => { if (state?.paused) controller.current?.play(); else controller.current?.pause(); }}>{state?.paused ? "Continuar secuencia" : "Pausar secuencia"}</button>}
          <button type="button" className="k-button k-button-secondary" aria-label="Clip siguiente" disabled={!state || state.index === sequence.clips.length - 1} onClick={() => controller.current?.next()}>›</button>
          <progress aria-label="Progreso de la secuencia" value={state?.currentTime || 0} max={state?.duration || 1} />
        </>}
      </span>
    </span>
  );
}
