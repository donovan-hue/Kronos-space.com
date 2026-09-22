import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Bookmark, MessageCircle, RefreshCw, Volume2, VolumeX } from "lucide-react";
import { getUser } from "../../../services/authStorage";
import { likePost, toggleSave } from "../../../services/postsService";
import { mediaUrl } from "../../../services/mediaUrl";
import { loadVideoMuted, saveVideoMuted } from "../../../services/videoPrefs";
import { getReactionType, optimisticReaction, reactionFromResponse } from "../reactions";
import useVerticalFeed from "./useVerticalFeed";

/**
 * VERTICAL — feed opcional de video vertical (Fase 3 del plan).
 *
 * - Nunca sustituye a Inicio: es una superficie aparte (/vertical).
 * - Un solo video reproduce a la vez (IntersectionObserver) y arranca
 *   silenciado según la preferencia compartida de video (stories incluida).
 * - Controles de consumo: toque/espacio para pausar, ← → para navegar,
 *   M para silenciar, progreso visible y carga incremental al final.
 */
export default function VerticalFeed() {
  const meId = useMemo(() => {
    const user = getUser();
    return String(user?._id || user?.id || "");
  }, []);
  const { posts, updatePost, hasMore, loading, loadingMore, error, refresh, loadMore } = useVerticalFeed({ limit: 10 });
  const [muted, setMuted] = useState(loadVideoMuted);
  const [busy, setBusy] = useState({ like: "", save: "" });
  const containerRef = useRef(null);
  const videosRef = useRef(new Map());
  const sentinelRef = useRef(null);
  const lastTapRef = useRef({ time: 0, id: "" });

  // Reproducir solo el video visible; pausar el resto.
  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return undefined;
    const videos = [...videosRef.current.values()];
    if (!videos.length) return undefined;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const video = entry.target;
          if (entry.isIntersecting && entry.intersectionRatio >= 0.6) {
            video.play().catch(() => {
              // Autoplay bloqueado: se reintenta silenciado.
              video.muted = true;
              video.play().catch(() => {});
            });
          } else {
            video.pause();
          }
        }
      },
      { threshold: [0, 0.6, 1] }
    );
    for (const video of videos) observer.observe(video);
    return () => observer.disconnect();
  }, [posts]);

  // Cargar más al llegar al final.
  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return undefined;
    const sentinel = sentinelRef.current;
    if (!sentinel || !hasMore) return undefined;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) loadMore();
      },
      { root: containerRef.current, rootMargin: "200%" }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, loadMore]);

  const goToIndex = useCallback((index) => {
    const container = containerRef.current;
    if (!container) return;
    const items = container.querySelectorAll(".k-vertical-item");
    const target = items[Math.max(0, Math.min(index, items.length - 1))];
    if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  // Teclado: flechas navegan, M silencia, espacio pausa/reanuda.
  useEffect(() => {
    function onKey(event) {
      if (event.key === "ArrowDown" || event.key === "ArrowRight") {
        event.preventDefault();
        const current = currentIndexOf(containerRef.current, videosRef.current);
        goToIndex(current + 1);
      } else if (event.key === "ArrowUp" || event.key === "ArrowLeft") {
        event.preventDefault();
        const current = currentIndexOf(containerRef.current, videosRef.current);
        goToIndex(current - 1);
      } else if (event.key.toLowerCase() === "m") {
        setMuted((value) => {
          saveVideoMuted(!value);
          for (const video of videosRef.current.values()) video.muted = !value;
          return !value;
        });
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [goToIndex]);

  function togglePlay(video) {
    if (!video) return;
    if (video.paused) video.play().catch(() => {});
    else video.pause();
  }

  function handleStageTap(post, event) {
    const now = Date.now();
    if (lastTapRef.current.id === post._id && (now - lastTapRef.current.time) < 320) {
      react(post);
      lastTapRef.current = { time: 0, id: "" };
    } else {
      lastTapRef.current = { time: now, id: post._id };
      const video = event.currentTarget.querySelector("video");
      togglePlay(video);
    }
  }

  function toggleMute() {
    setMuted((value) => {
      saveVideoMuted(!value);
      for (const video of videosRef.current.values()) video.muted = !value;
      return !value;
    });
  }

  async function react(post) {
    if (busy.like === post._id) return;
    setBusy((state) => ({ ...state, like: post._id }));
    const snapshot = post;
    updatePost(post._id, (current) => optimisticReaction(current, "like"));
    try {
      const response = await likePost(post._id);
      updatePost(post._id, (current) => reactionFromResponse(current, response));
    } catch {
      updatePost(post._id, () => snapshot);
    } finally {
      setBusy((state) => ({ ...state, like: "" }));
    }
  }

  async function save(post) {
    if (busy.save === post._id) return;
    setBusy((state) => ({ ...state, save: post._id }));
    try {
      const response = await toggleSave(post._id);
      updatePost(post._id, { saved: Boolean(response?.saved) });
    } catch {
      refresh();
    } finally {
      setBusy((state) => ({ ...state, save: "" }));
    }
  }

  return (
    <section className="page k-vertical-page" aria-labelledby="k-vertical-title">
      <header className="k-page-header k-vertical-header">
        <div>
          <p className="k-eyebrow">VIDEO</p>
          <h1 id="k-vertical-title">Vertical</h1>
          <p className="k-muted">Videos verticales de tu red, uno a la vez. Inicio sigue siendo tu feed completo.</p>
        </div>
        <div className="k-inline-actions">
          <button type="button" className="k-feed-icon-button" onClick={() => refresh()} aria-label="Actualizar feed vertical" title="Actualizar">
            <RefreshCw size={17} />
          </button>
          <button
            type="button"
            className="k-feed-icon-button"
            onClick={toggleMute}
            aria-label={muted ? "Activar sonido" : "Silenciar videos"}
            title={muted ? "Silenciado" : "Con sonido"}
          >
            {muted ? <VolumeX size={17} /> : <Volume2 size={17} />}
          </button>
        </div>
      </header>

      {loading ? (
        <div className="k-vertical-list" aria-busy="true" aria-label="Cargando videos">
          <span className="k-vertical-skeleton" />
        </div>
      ) : error ? (
        <div className="k-surface k-feed-state" role="alert">
          <p>{error}</p>
          <button type="button" className="k-button k-button-primary" onClick={() => refresh()}>Reintentar</button>
        </div>
      ) : posts.length === 0 ? (
        <div className="k-surface k-feed-state">
          <p className="k-muted">Todavía no hay videos verticales en tu red. Publica uno desde Crear y aparecerá aquí.</p>
          <Link className="k-button k-button-primary" to="/create/post">Subir un video</Link>
        </div>
      ) : (
        <div className="k-vertical-list" ref={containerRef} role="feed" aria-label="Videos verticales">
          {posts.map((post, index) => {
            const reactionType = getReactionType(post);
            const reactionsCount = typeof post.reactionsCount === "number" ? post.reactionsCount : post.likesCount || 0;
            const author = post.author || {};
            const label = post.media?.alt || post.content || `Video de ${author.displayName || author.username || "tu red"}`;
            return (
              <article key={post._id} className="k-vertical-item">
                <div className="k-vertical-stage" onClick={(event) => handleStageTap(post, event)}>
                  <video
                    ref={(node) => {
                      if (node) videosRef.current.set(post._id, node);
                      else videosRef.current.delete(post._id);
                    }}
                    className="k-vertical-video"
                    src={mediaUrl(post.media?.url)}
                    poster={post.media?.posterUrl ? mediaUrl(post.media.posterUrl) : undefined}
                    loop
                    playsInline
                    preload="metadata"
                    muted={muted}
                    aria-label={label}
                    onTimeUpdate={(event) => {
                      const video = event.currentTarget;
                      const bar = video.parentElement?.querySelector(`progress[data-for="${post._id}"]`);
                      if (bar && video.duration) bar.value = (video.currentTime / video.duration) * 100;
                    }}
                  />
                  <div className="k-vertical-progress" aria-hidden="true">
                    <progress className="k-vertical-progress-bar" value={0} max={100} data-for={post._id} />
                  </div>
                </div>

                <aside className="k-vertical-actions">
                  <button
                    type="button"
                    className={`k-vertical-action ${reactionType ? "is-active" : ""}`}
                    onClick={() => react(post)}
                    disabled={busy.like === post._id}
                    aria-label={`${reactionType ? "Quitar reacción" : "Reaccionar"}. ${reactionsCount} reacciones`}
                  >
                    <span aria-hidden="true">❤️</span>
                    {reactionsCount > 0 && <small>{reactionsCount}</small>}
                  </button>
                  <Link className="k-vertical-action" to={`/post/${post._id}`} aria-label={`Comentarios. ${post.commentsCount || 0}`}>
                    <MessageCircle size={22} aria-hidden="true" />
                    {(post.commentsCount || 0) > 0 && <small>{post.commentsCount}</small>}
                  </Link>
                  <button
                    type="button"
                    className={`k-vertical-action ${post.saved ? "is-active" : ""}`}
                    onClick={() => save(post)}
                    disabled={busy.save === post._id}
                    aria-label={post.saved ? "Quitar de guardados" : "Guardar video"}
                  >
                    <Bookmark size={22} aria-hidden="true" />
                  </button>
                </aside>

                <footer className="k-vertical-meta">
                  <Link to={`/profile/${author.username}`} className="k-vertical-author">
                    {author.avatar ? <img src={mediaUrl(author.avatar)} alt="" /> : <span aria-hidden="true">{(author.displayName || author.username || "?").slice(0, 1).toUpperCase()}</span>}
                    <strong>{author.displayName || author.username || "Alguien de tu red"}</strong>
                  </Link>
                  {post.content && <p className="k-vertical-caption">{post.content}</p>}
                  <small className="k-muted">{index + 1} de {posts.length}</small>
                </footer>
              </article>
            );
          })}
          {hasMore && (
            <div ref={sentinelRef} className="k-vertical-more" aria-live="polite">
              {loadingMore ? <span className="k-vertical-skeleton" /> : <span className="k-muted">Desliza para más videos</span>}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function currentIndexOf(container, videos) {
  if (!container) return 0;
  const items = [...container.querySelectorAll(".k-vertical-item")];
  const top = container.getBoundingClientRect().top;
  let best = 0;
  let bestDistance = Number.POSITIVE_INFINITY;
  items.forEach((item, index) => {
    const distance = Math.abs(item.getBoundingClientRect().top - top);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = index;
    }
  });
  void videos;
  return best;
}
