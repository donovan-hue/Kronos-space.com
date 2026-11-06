import { useEffect, useRef } from "react";
import { accionDeRecorte, recorteDeVideo } from "../../lib/videoTrim";

/**
 * Aplica el recorte publicado al `<video>` del feed.
 *
 * Se monta junto al reproductor y busca su `<video>` en el padre, igual que la
 * música o la voz: el elemento lo crea `PostMedia` y nadie más debe poseerlo.
 *
 * Sin recorte no monta nada y no añade oyentes: no cuesta nada en el caso
 * normal, que es la mayoría de las publicaciones.
 */
export default function VideoTrim({ media }) {
  const recorte = recorteDeVideo(media);
  return recorte ? <Recorte key={`${media.url}:${recorte.inicio}:${recorte.fin}`} recorte={recorte} /> : null;
}

function Recorte({ recorte }) {
  const anchor = useRef(null);

  useEffect(() => {
    const video = anchor.current?.parentElement?.querySelector("video");
    if (!video) return undefined;

    // Un video recortado no debe sonar si el usuario lo silenció, pero el
    // atributo tampoco debe imponerse si no lo pidió.
    if (recorte.silenciado) video.muted = true;

    const aplicar = () => {
      const accion = accionDeRecorte(recorte, video.currentTime);
      if (accion === "saltar" && video.currentTime < recorte.inicio) {
        video.currentTime = recorte.inicio;
      } else if (accion === "parar") {
        video.pause();
        // El reloj se deja **en** `fin`, no 50 ms antes: el tramo publicado
        // termina ahí y `accionDeRecorte` prohíbe por contrato recortar
        // contenido del usuario («de 12 a 30» se ve hasta 30). Restar una
        // tolerancia dejaba el último instante fuera y, además, la medición
        // real del CI lo cazó: 1.75 s donde el corte estaba en 1.8 s.
        // `min` con la duración evita pedir un tiempo que el archivo no tiene.
        const destino = Number.isFinite(video.duration)
          ? Math.min(recorte.fin, video.duration)
          : recorte.fin;
        if (Math.abs(video.currentTime - destino) > 0.001) video.currentTime = destino;
      }
    };

    // Al cargar los metadatos, el navegador empieza en 0 aunque el tramo
    // empiece más adelante: sin este salto se ve el trozo que se quiso cortar.
    const alCargar = () => {
      if (Number.isFinite(video.duration) && video.duration > recorte.inicio) {
        video.currentTime = recorte.inicio;
      }
    };

    video.addEventListener("loadedmetadata", alCargar);
    video.addEventListener("timeupdate", aplicar);
    video.addEventListener("seeking", aplicar);

    return () => {
      video.removeEventListener("loadedmetadata", alCargar);
      video.removeEventListener("timeupdate", aplicar);
      video.removeEventListener("seeking", aplicar);
    };
  }, [recorte]);

  return <span ref={anchor} hidden aria-hidden="true" />;
}
