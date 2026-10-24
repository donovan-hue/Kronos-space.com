import { useEffect, useRef, useState } from "react";
import { conectarMusica, esMusicaLocal, musicaDeVideo } from "../../lib/videoMusic";
import { obtenerPistaMusica } from "../../services/musicService";
import { mediaUrl } from "../../services/mediaUrl";

export default function VideoMusic({ media }) {
  const musica = musicaDeVideo(media);
  return musica ? <Pista key={`${media.url}:${musica.url || musica.trackId}`} musica={musica} /> : null;
}

function Pista({ musica }) {
  const anchor = useRef(null);
  const audioRef = useRef(null);
  const conexion = useRef(null);
  const [url, setUrl] = useState(musica.url);
  const [status, setStatus] = useState("");
  const [clockVersion, setClockVersion] = useState(0);
  useEffect(() => {
    const video = anchor.current?.parentElement?.querySelector("video");
    const update = () => setClockVersion(value => value + 1);
    video?.addEventListener("kronos:clockchange", update);
    return () => video?.removeEventListener("kronos:clockchange", update);
  }, []);
  const [attempt, setAttempt] = useState(0);
  const { trackId, inicio, fin, volumen, fundidoEntrada, fundidoSalida } = musica;

  // Las publicaciones antiguas solo guardaban trackId. Se resuelve esa pista
  // publicada, no la primera página del catálogo ni una URL de terceros.
  useEffect(() => {
    if (musica.url) return undefined;
    let active = true;
    obtenerPistaMusica(trackId).then((pista) => {
      if (!active) return;
      if (!esMusicaLocal(pista?.url)) { setStatus("error"); return; }
      setUrl(pista.url);
      setStatus("");
    }).catch(() => { if (active) setStatus("error"); });
    return () => { active = false; };
  }, [trackId, musica.url, attempt]);

  useEffect(() => {
    const audio = audioRef.current;
    const video = anchor.current?.parentElement?.querySelector("video");
    if (!url || !video || !audio) return undefined;
    const controller = conectarMusica(video, audio, { inicio, fin, volumen, fundidoEntrada, fundidoSalida }, {
      onBlocked: () => setStatus("blocked"),
      onError: () => setStatus("error"),
      onPlaying: () => setStatus("")
    });
    conexion.current = controller;
    return () => { conexion.current = null; controller.dispose(); };
  }, [url, inicio, fin, volumen, fundidoEntrada, fundidoSalida, attempt, clockVersion]);

  function retry() {
    setStatus("");
    if (!url) { setAttempt((value) => value + 1); return; }
    if (status === "error") audioRef.current?.load();
    conexion.current?.retry();
  }

  return (
    <span ref={anchor} className="k-video-music">
      {url && <audio ref={audioRef} src={mediaUrl(url)} preload="metadata" hidden aria-hidden="true" />}
      {status && (
        <span className="k-video-music-notice" role="status">
          {status === "blocked" ? "El navegador bloqueó la música." : "No se pudo reproducir la música."}
          <button type="button" className="k-button k-button-secondary" onClick={retry}>
            {status === "blocked" ? "Activar música" : "Reintentar música"}
          </button>
        </span>
      )}
    </span>
  );
}
