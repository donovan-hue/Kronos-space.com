import { useLayoutEffect, useRef } from "react";
import { ajustesTonoVideo, normalizarTexto } from "../../lib/mediaStudio";
import "../../styles/video-tone.css";

/** Efectos y texto guardados del estudio sobre la imagen del video. La capa
 * sigue el área visible, sin ocupar los márgenes negros ni interceptar controles. */
export default function VideoToneOverlays({ media }) {
  const ref = useRef(null);
  const { vineta, grano } = ajustesTonoVideo(media);
  const rawTexto = media?.type === "video" ? media.edit?.texto : null;
  const texto = normalizarTexto(rawTexto && typeof rawTexto.contenido === "string" ? rawTexto : null);
  const tieneTexto = Boolean(texto.contenido.trim());
  const activo = vineta > 0 || grano > 0 || tieneTexto;

  useLayoutEffect(() => {
    const capa = ref.current;
    const video = capa?.previousElementSibling;
    const padre = capa?.parentElement;
    if (!activo || video?.tagName !== "VIDEO" || !padre) return undefined;

    const medir = () => {
      const imagen = padre.querySelector(".k-video-sequence-image");
      const target = imagen || video;
      const caja = target.getBoundingClientRect();
      const contenedor = padre.getBoundingClientRect();
      let ancho = caja.width;
      let alto = caja.height;
      const sourceWidth = imagen?.naturalWidth || video.videoWidth;
      const sourceHeight = imagen?.naturalHeight || video.videoHeight;
      if (sourceWidth && sourceHeight && getComputedStyle(target).objectFit === "contain") {
        const escala = Math.min(ancho / sourceWidth, alto / sourceHeight);
        ancho = sourceWidth * escala;
        alto = sourceHeight * escala;
      }
      Object.assign(capa.style, {
        left: `${caja.left - contenedor.left - padre.clientLeft + padre.scrollLeft + (caja.width - ancho) / 2}px`,
        top: `${caja.top - contenedor.top - padre.clientTop + padre.scrollTop + (caja.height - alto) / 2}px`,
        width: `${ancho}px`,
        height: `${alto}px`
      });
    };
    medir();
    const observer = typeof ResizeObserver === "function" ? new ResizeObserver(medir) : null;
    observer?.observe(video);
    observer?.observe(padre);
    video.addEventListener("loadedmetadata", medir);
    video.addEventListener("emptied", medir);
    video.addEventListener("kronos:sequencechange", medir);
    padre.addEventListener("load", medir, true);
    window.addEventListener("resize", medir);
    return () => {
      observer?.disconnect();
      video.removeEventListener("loadedmetadata", medir);
      video.removeEventListener("emptied", medir);
      video.removeEventListener("kronos:sequencechange", medir);
      padre.removeEventListener("load", medir, true);
      window.removeEventListener("resize", medir);
    };
  }, [activo, media?.url]);

  if (!activo) return null;
  return (
    <span ref={ref} className="k-video-tone-overlays" aria-hidden={tieneTexto ? undefined : true}>
      {vineta > 0 && <span className="k-video-tone-vineta" aria-hidden="true" style={{ opacity: vineta }} />}
      {grano > 0 && <span className="k-video-tone-grano" aria-hidden="true" style={{ opacity: grano * 0.35 }} />}
      {tieneTexto && (
        <span
          className={`k-video-overlay-text es-${texto.posicion}`}
          style={{
            color: texto.color,
            fontSize: `${0.9 * texto.tamano}rem`,
            background: texto.fondo ? "rgba(0,0,0,0.55)" : "transparent"
          }}
        >
          {texto.contenido}
        </span>
      )}
    </span>
  );
}
