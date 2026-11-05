import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { voteStoryPoll } from "../../../services/storiesService";
import { mediaUrl } from "../../../services/mediaUrl";

/**
 * Capa de stickers y música de una historia (bloque 1.3).
 *
 * Antes la historia solo tenía imagen, texto y audiencia. Aquí se pinta lo que
 * la historia trae guardado —sin recortar ni inventar nada— y se resuelve la
 * única parte interactiva: votar en una encuesta.
 *
 * Reglas que no se saltan:
 * - La posición es una de tres franjas, no coordenadas libres: nada se sale
 *   del marco en una pantalla pequeña.
 * - La música arranca desde `inicio` y se calla al cambiar de historia; suena
 *   solo si la persona pulsa el botón (los navegadores bloquean el audio
 *   automático y, además, sonar sin permiso es una grosería).
 * - La encuesta no deja votar al autor: se le muestra el resultado.
 */
const POSICIONES = {
  arriba: "is-top",
  centro: "is-middle",
  abajo: "is-bottom"
};

function Etiqueta({ sticker }) {
  if (sticker.type === "mention") {
    return (
      <Link className="k-story-sticker k-story-sticker-mention" to={`/profile/${sticker.text}`}>
        @{sticker.text}
      </Link>
    );
  }
  if (sticker.type === "hashtag") {
    return (
      <Link className="k-story-sticker k-story-sticker-hashtag" to={`/hashtag/${sticker.text}`}>
        #{sticker.text}
      </Link>
    );
  }
  if (sticker.type === "location") {
    return <span className="k-story-sticker k-story-sticker-location">⌖ {sticker.text}</span>;
  }
  return <span className="k-story-sticker k-story-sticker-question">{sticker.text}</span>;
}

function Encuesta({ story, sticker, indice, onActualizada }) {
  const [estado, setEstado] = useState({
    options: Array.isArray(sticker.options) ? sticker.options : [],
    totalVotes: Number(sticker.totalVotes) || 0,
    myVote: sticker.myVote ?? null
  });
  const [votando, setVotando] = useState(false);
  const [error, setError] = useState("");

  async function votar(opcion) {
    if (votando || story.mine) return;
    setVotando(true);
    setError("");
    try {
      const actualizada = await voteStoryPoll(story._id, indice, opcion);
      if (actualizada) {
        setEstado({
          options: actualizada.options || [],
          totalVotes: Number(actualizada.totalVotes) || 0,
          myVote: actualizada.myVote ?? opcion
        });
        onActualizada?.(indice, actualizada);
      }
    } catch (requestError) {
      setError(requestError?.response?.data?.error || "No se pudo registrar el voto.");
    } finally {
      setVotando(false);
    }
  }

  // Con votos ya emitidos (o si es tu encuesta) se muestra el resultado; antes
  // de votar, las opciones pulsables. Así no se destripa el resultado antes de
  // participar, pero tampoco se esconde cuando ya participaste.
  const mostrarResultado = story.mine || estado.myVote !== null;
  const porcentaje = (votos) => (estado.totalVotes > 0 ? Math.round((votos / estado.totalVotes) * 100) : 0);

  return (
    <div className="k-story-sticker k-story-sticker-poll">
      <p className="k-story-poll-question">{sticker.text}</p>
      {mostrarResultado ? (
        <ul className="k-story-poll-results">
          {estado.options.map((opcion, posicion) => (
            <li key={`${opcion.label}-${posicion}`} className={posicion === estado.myVote ? "is-mine" : ""}>
              <span className="k-story-poll-label">{opcion.label}</span>
              <span className="k-story-poll-bar" aria-hidden="true">
                <span style={{ width: `${porcentaje(opcion.votesCount || 0)}%` }} />
              </span>
              <span className="k-story-poll-percent">{porcentaje(opcion.votesCount || 0)}%</span>
            </li>
          ))}
        </ul>
      ) : (
        <div className="k-story-poll-options">
          {estado.options.map((opcion, posicion) => (
            <button
              key={`${opcion.label}-${posicion}`}
              type="button"
              className="k-button k-button-secondary"
              onClick={() => votar(posicion)}
              disabled={votando}
            >
              {opcion.label}
            </button>
          ))}
        </div>
      )}
      <small className="k-story-poll-total">
        {estado.totalVotes} {estado.totalVotes === 1 ? "voto" : "votos"}
        {story.mine ? " · es tu encuesta" : ""}
      </small>
      {error && <small className="k-story-error" role="alert">{error}</small>}
    </div>
  );
}

function Musica({ story, muted }) {
  const audioRef = useRef(null);
  const [sonando, setSonando] = useState(false);
  const [sinSonido, setSinSonido] = useState(false);

  // La pista se reinicia en cada historia: si no, la anterior seguiría sonando
  // sobre la siguiente.
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.currentTime = Number(story.music?.inicio) || 0;
      audioRef.current.pause();
      setSonando(false);
      setSinSonido(false);
    }
  }, [story._id, story.music?.inicio]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (muted) {
      audio.pause();
      setSonando(false);
    }
  }, [muted]);

  if (!story.music?.url) return null;

  async function alternar() {
    const audio = audioRef.current;
    if (!audio) return;
    if (sonando) {
      audio.pause();
      setSonando(false);
      return;
    }
    try {
      await audio.play();
      setSonando(true);
      setSinSonido(false);
    } catch {
      setSonando(false);
      setSinSonido(true);
    }
  }

  return (
    <div className="k-story-music-chip">
      <audio ref={audioRef} src={mediaUrl(story.music.url)} preload="none" loop />
      <button type="button" className="k-story-music-button" onClick={alternar} aria-pressed={sonando}>
        {sonando ? "⏸" : "▶"} {story.music.titulo}
        {story.music.autor ? <small> · {story.music.autor}</small> : null}
      </button>
      {sinSonido && <small className="k-muted">El navegador no dejó sonar la pista.</small>}
    </div>
  );
}

export default function StoryOverlays({ story, muted }) {
  const stickers = Array.isArray(story.stickers) ? story.stickers : [];

  if (stickers.length === 0 && !story.music?.url) return null;

  return (
    <>
      {stickers.map((sticker, indice) => {
        const clase = POSICIONES[sticker.position] || POSICIONES.centro;
        return (
          <div key={`${sticker.type}-${indice}`} className={`k-story-sticker-slot ${clase}`}>
            {sticker.type === "poll" ? (
              <Encuesta story={story} sticker={sticker} indice={indice} />
            ) : (
              <Etiqueta sticker={sticker} />
            )}
          </div>
        );
      })}
      <Musica story={story} muted={muted} />
    </>
  );
}
