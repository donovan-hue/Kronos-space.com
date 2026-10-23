import { useEffect, useRef, useState } from "react";
import { conectarVoz, vozDeVideo } from "../../lib/videoVoice";
import { mediaUrl } from "../../services/mediaUrl";
import "../../styles/video-voice.css";

export default function VideoVoice({ media }) {
  const voz = vozDeVideo(media);
  return voz ? <Toma key={`${media.url}:${voz.url || voz.voiceId}`} voz={voz} /> : null;
}

function Toma({ voz }) {
  const anchor = useRef(null);
  const audioRef = useRef(null);
  const conexion = useRef(null);
  const [status, setStatus] = useState("");
  const [clockVersion, setClockVersion] = useState(0);
  useEffect(() => {
    const video = anchor.current?.parentElement?.querySelector("video");
    const update = () => setClockVersion(value => value + 1);
    video?.addEventListener("kronos:clockchange", update);
    return () => video?.removeEventListener("kronos:clockchange", update);
  }, []);
  const { url, inicio, fin, volumen, fundidoEntrada, fundidoSalida } = voz;

  useEffect(() => {
    const audio = audioRef.current;
    const video = anchor.current?.parentElement?.querySelector("video");
    if (!url || !video || !audio) return undefined;
    const controller = conectarVoz(video, audio, { inicio, fin, volumen, fundidoEntrada, fundidoSalida }, {
      onBlocked: () => setStatus("blocked"),
      onError: () => setStatus("error"),
      onPlaying: () => setStatus("")
    });
    conexion.current = controller;
    return () => { conexion.current = null; controller.dispose(); };
  }, [url, inicio, fin, volumen, fundidoEntrada, fundidoSalida, clockVersion]);

  function retry() {
    setStatus("");
    if (status === "error") audioRef.current?.load();
    conexion.current?.retry();
  }

  return (
    <span ref={anchor} className="k-video-voice">
      {url && <audio ref={audioRef} src={mediaUrl(url)} preload="metadata" hidden aria-hidden="true" />}
      {(!url || status) && (
        <span className="k-video-voice-notice" role="status">
          {!url
            ? "Esta voz no tiene una grabación reproducible. Vuelve al estudio para generarla o grabarla."
            : status === "blocked" ? "El navegador bloqueó la voz en off." : "No se pudo reproducir la voz en off."}
          {url && <button type="button" className="k-button k-button-secondary" onClick={retry}>
            {status === "blocked" ? "Activar voz" : "Reintentar voz"}
          </button>}
        </span>
      )}
    </span>
  );
}
