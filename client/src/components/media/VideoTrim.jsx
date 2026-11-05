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
        // Se deja el reloj al final del tramo, no al del archivo: al reanudar
        // debe verse el último instante publicado, no lo que venía después.
        video.currentTime = Math.max(recorte.inicio, recorte.fin - 0.05);
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
