import VideoSequence from "./VideoSequence";
import VideoVoice from "./VideoVoice";
import VideoMusic from "./VideoMusic";
import VideoToneOverlays from "./VideoToneOverlays";
import { cssFiltroVideo } from "../../lib/mediaStudio";
import { createPortal } from "react-dom";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { mediaUrl } from "../../services/mediaUrl";

/* ============================================================
   Visor de medios a pantalla completa.

   Lo usan las publicaciones (PostMedia) y la rejilla del perfil.
   Abre la foto o el video ocupando la ventana completa, con
   contador, flechas, cierre con Escape y navegación con las
   flechas del teclado. Al cerrar devuelve el foco al elemento
   que lo abrio.
   ============================================================ */

function listaValida(items) {
  return (Array.isArray(items) ? items : []).filter((item) => item?.url);
}

function Pistas({ item, etiqueta }) {
  if (item.type !== "video") return null;
  const variantes = Array.isArray(item.variants) ? item.variants : [];
  const subtitulos = Array.isArray(item.subtitles) ? item.subtitles.filter((s) => s.approved && (s.url || s.vttContent)) : [];
  return (
    <>
      {variantes.length > 0 ? (
        variantes.map((variante, indice) => (
          <source
            key={`${variante.url}-${variante.resolution || indice}`}
            src={mediaUrl(variante.url)}
            type={variante.mimeType || "video/mp4"}
          />
        ))
      ) : (
        <source src={mediaUrl(item.url)} />
      )}
      {subtitulos.map((subtitulo, indice) => (
        <track
          key={`sub-${subtitulo.lang || indice}`}
          kind="subtitles"
          src={
            subtitulo.url
              ? mediaUrl(subtitulo.url)
              : `data:text/vtt;charset=utf-8,${encodeURIComponent(subtitulo.vttContent)}`
          }
          srcLang={subtitulo.lang || "es"}
          label={subtitulo.label || "Español"}
          default={indice === 0}
        />
      ))}
      <span className="k-sr-only">{etiqueta}</span>
    </>
  );
}

export default function MediaViewer({
  open,
  items = [],
  index = 0,
  onIndexChange,
  onClose,
  title = "Visor de medios"
}) {
  const cerrarRef = useRef(null);
  const lista = useMemo(() => listaValida(items), [items]);
  const total = lista.length;
  const actual = total ? Math.min(Math.max(index, 0), total - 1) : 0;
  const item = lista[actual];

  const mover = useCallback(
    (delta) => {
      if (total < 2) return;
      onIndexChange?.((actual + delta + total) % total);
    },
    [actual, onIndexChange, total]
  );

  useEffect(() => {
    if (!open) return undefined;
    const previo = document.activeElement;
    const overflowPrevio = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    cerrarRef.current?.focus();

    function onKeyDown(event) {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose?.();
        return;
      }
      if (event.key === "ArrowRight") {
        event.preventDefault();
        mover(1);
      }
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        mover(-1);
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = overflowPrevio;
      if (previo instanceof HTMLElement) previo.focus?.();
    };
  }, [mover, onClose, open]);

  if (!open || !item) return null;

  const etiqueta =
    item.alt ||
    (item.type === "video" ? "Video de la publicación" : `Foto ${actual + 1} de ${total}`);

  return createPortal(
    <div
      className="k-media-viewer"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose?.();
      }}
    >
      <div className="k-media-viewer-bar">
        <button
          ref={cerrarRef}
          type="button"
          className="k-media-viewer-btn k-media-viewer-close"
          onClick={() => onClose?.()}
          aria-label="Cerrar visor"
        >
          <span aria-hidden="true">×</span>
        </button>
        <span className="k-media-viewer-count" aria-live="polite">
          {total > 1 ? `${actual + 1} / ${total}` : ""}
        </span>
      </div>

      <div className="k-media-viewer-stage">
        {total > 1 && (
          <button
            type="button"
            className="k-media-viewer-btn k-media-viewer-nav"
            onClick={() => mover(-1)}
            aria-label="Anterior"
          >
            <span aria-hidden="true">‹</span>
          </button>
        )}

        <div className="k-media-viewer-canvas" style={{ position: "relative" }}>
          {item.type === "video" ? (
            <>
            <video
              className="k-media-viewer-media"
              style={{ filter: cssFiltroVideo(item) }}
              controls
              preload="metadata"
              playsInline
              poster={item.posterUrl ? mediaUrl(item.posterUrl) : undefined}
              aria-label={etiqueta}
            >
              <Pistas item={item} etiqueta={etiqueta} />
            </video>
            <VideoToneOverlays media={item} />
            <VideoMusic media={item} />
            <VideoVoice media={item} />
            <VideoSequence media={item} />
            </>
          ) : (
            <img
              className="k-media-viewer-media"
              src={mediaUrl(item.url)}
              alt={etiqueta}
              style={
                item.focalPoint
                  ? { objectPosition: `${item.focalPoint.x * 100}% ${item.focalPoint.y * 100}%` }
                  : undefined
              }
            />
          )}
        </div>

        {total > 1 && (
          <button
            type="button"
            className="k-media-viewer-btn k-media-viewer-nav"
            onClick={() => mover(1)}
            aria-label="Siguiente"
          >
            <span aria-hidden="true">›</span>
          </button>
        )}
      </div>

      {etiqueta && <p className="k-media-viewer-caption">{etiqueta}</p>}
    </div>,
    document.body
  );
}
