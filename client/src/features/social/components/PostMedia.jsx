import { useEffect, useMemo, useState } from "react";
import { mediaUrl } from "../../../services/mediaUrl";

function buildItems(media, mediaItems) {
  const items = Array.isArray(mediaItems)
    ? mediaItems.filter((item) => item?.url).slice(0, 4)
    : [];

  if (items.length) return items.map((item) => ({ ...item, type: item.type || "image" }));
  if (media?.url) return [{ ...media, type: media.type || "image" }];
  return [];
}

export default function PostMedia({ media, mediaItems, content = "", compact = false }) {
  const items = useMemo(() => buildItems(media, mediaItems), [media, mediaItems]);
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    setActiveIndex(0);
  }, [items.map((item) => item.url).join("|")]);

  if (!items.length) return null;

  const activeItem = items[Math.min(activeIndex, items.length - 1)] || items[0];
  const hasCarousel = items.length > 1;
  const label =
    activeItem.alt ||
    String(content || "").slice(0, 120) ||
    (activeItem.type === "video" ? "Video de la publicación" : `Imagen ${activeIndex + 1} de la publicación`);

  function previous() {
    setActiveIndex((index) => (index - 1 + items.length) % items.length);
  }

  function next() {
    setActiveIndex((index) => (index + 1) % items.length);
  }

  return (
    <div className={`k-post-media ${compact ? "k-post-media-compact" : ""} ${hasCarousel ? "k-post-carousel" : ""}`}>
      <div className="k-post-media-frame">
        {activeItem.type === "video" ? (
          <video
            controls
            preload="metadata"
            poster={activeItem.posterUrl ? mediaUrl(activeItem.posterUrl) : undefined}
            aria-label={label}
            className="k-post-media-item"
          >
            <source src={mediaUrl(activeItem.url)} />
          </video>
        ) : (
          <img
            src={mediaUrl(activeItem.url)}
            alt={label}
            loading="lazy"
            className="k-post-media-item"
          />
        )}
        {hasCarousel && (
          <div className="k-post-carousel-controls" aria-label="Controles del carrusel">
            <button type="button" onClick={previous} aria-label="Imagen anterior">‹</button>
            <span>{activeIndex + 1}/{items.length}</span>
            <button type="button" onClick={next} aria-label="Imagen siguiente">›</button>
          </div>
        )}
      </div>
      {hasCarousel && (
        <div className="k-post-carousel-dots" aria-label="Selector de imagen">
          {items.map((item, index) => (
            <button
              key={`${item.url}-${index}`}
              type="button"
              className={index === activeIndex ? "is-active" : ""}
              onClick={() => setActiveIndex(index)}
              aria-label={`Ver imagen ${index + 1}`}
              aria-pressed={index === activeIndex}
            />
          ))}
        </div>
      )}
      {activeItem.alt && <p className="k-post-media-alt k-muted">{activeItem.alt}</p>}
    </div>
  );
}
