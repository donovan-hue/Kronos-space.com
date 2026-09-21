import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Trash2, Volume2, VolumeX, X } from "lucide-react";
import { mediaUrl } from "../../../services/mediaUrl";
import {
  deleteStory,
  getStoryReplies,
  getStoryViewers,
  markStoryViewed,
  replyToStory
} from "../../../services/storiesService";
import { storyReplySchema } from "../../../schemas";

const IMAGE_DURATION_MS = 6000;
const MUTE_STORAGE_KEY = "kronos_story_muted";

function loadMuted() {
  try {
    return window.localStorage.getItem(MUTE_STORAGE_KEY) !== "0";
  } catch {
    return true;
  }
}

function saveMuted(value) {
  try {
    window.localStorage.setItem(MUTE_STORAGE_KEY, value ? "1" : "0");
  } catch {
    // Sin almacenamiento disponible se conserva el valor en memoria.
  }
}

function timeAgo(value) {
  if (!value) return "";
  const ms = Date.now() - new Date(value).getTime();
  const minutes = Math.floor(ms / 60000);
  if (minutes < 1) return "ahora";
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `hace ${hours} h`;
  return `hace ${Math.floor(hours / 24)} d`;
}

function hoursLeft(value) {
  if (!value) return "";
  const hours = Math.ceil((new Date(value).getTime() - Date.now()) / 3600000);
  if (hours <= 0) return "Expirada";
  return `Expira en ${hours} h`;
}

const AUDIENCE_LABELS = {
  public: "Pública",
  followers: "Seguidores",
  circle: "Círculo"
};

/**
 * STORIES — visor a pantalla completa.
 *
 * - Imágenes: avanzan solas tras 6 s; videos: avanzan al terminar.
 * - El mute de video se recuerda entre sesiones (plan, Fase 3).
 * - Marca la historia como vista (idempotente en servidor).
 * - Historia propia: vistas, respuestas privadas y borrado.
 * - Historia ajena: respuesta privada directa al autor.
 */
export default function StoryViewer({ groups, startGroupIndex = 0, onClose, onChanged }) {
  const safeGroups = useMemo(() => (Array.isArray(groups) ? groups.filter((group) => group?.stories?.length) : []), [groups]);
  const [groupIndex, setGroupIndex] = useState(Math.min(startGroupIndex, Math.max(safeGroups.length - 1, 0)));
  const [storyIndex, setStoryIndex] = useState(0);
  const [muted, setMuted] = useState(loadMuted);
  const [replyText, setReplyText] = useState("");
  const [replyState, setReplyState] = useState({ sending: false, error: "", sent: false });
  const [panel, setPanel] = useState({ open: false, loading: false, replies: [], viewers: [], error: "" });
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const videoRef = useRef(null);

  const group = safeGroups[groupIndex] || null;
  const story = group?.stories?.[storyIndex] || null;

  const close = useCallback(() => {
    onClose?.();
  }, [onClose]);

  const advance = useCallback(() => {
    setConfirmDelete(false);
    setReplyState((state) => ({ ...state, sent: false, error: "" }));
    setPanel({ open: false, loading: false, replies: [], viewers: [], error: "" });
    setStoryIndex((currentStory) => {
      if (group && currentStory + 1 < group.stories.length) return currentStory + 1;
      const nextGroup = groupIndex + 1;
      if (nextGroup < safeGroups.length) {
        setGroupIndex(nextGroup);
        return 0;
      }
      close();
      return currentStory;
    });
  }, [close, group, groupIndex, safeGroups.length]);

  const back = useCallback(() => {
    setConfirmDelete(false);
    setStoryIndex((currentStory) => {
      if (currentStory > 0) return currentStory - 1;
      const prevGroup = groupIndex - 1;
      if (prevGroup >= 0) {
        setGroupIndex(prevGroup);
        return Math.max((safeGroups[prevGroup]?.stories?.length || 1) - 1, 0);
      }
      return 0;
    });
  }, [groupIndex, safeGroups]);

  // Vistas: idempotente en el servidor; las propias no se marcan.
  useEffect(() => {
    if (!story || story.mine || story.viewed) return undefined;
    markStoryViewed(story._id).catch(() => {});
    return undefined;
  }, [story]);

  // Imágenes avanzan solas; los videos al terminar (onEnded).
  useEffect(() => {
    if (!story || story.media?.type === "video") return undefined;
    const timer = window.setTimeout(advance, IMAGE_DURATION_MS);
    return () => window.clearTimeout(timer);
  }, [story, advance]);

  // Teclado: Escape cierra, flechas navegan.
  useEffect(() => {
    function onKey(event) {
      if (event.key === "Escape") {
        event.preventDefault();
        close();
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        advance();
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        back();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [advance, back, close]);

  // Escape del foco al body mientras el visor está abierto.
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  function toggleMuted() {
    setMuted((current) => {
      saveMuted(!current);
      return !current;
    });
  }

  async function sendReply(event) {
    event.preventDefault();
    if (!story || replyState.sending) return;
    const parsed = storyReplySchema.safeParse(replyText);
    if (!parsed.success) {
      setReplyState({ sending: false, error: parsed.error.issues[0]?.message || "Respuesta no válida", sent: false });
      return;
    }
    setReplyState({ sending: true, error: "", sent: false });
    try {
      await replyToStory(story._id, parsed.data);
      setReplyText("");
      setReplyState({ sending: false, error: "", sent: true });
    } catch (error) {
      setReplyState({
        sending: false,
        error: error?.response?.data?.error || "No se pudo enviar la respuesta.",
        sent: false
      });
    }
  }

  async function openPanel() {
    if (!story) return;
    setPanel({ open: true, loading: true, replies: [], viewers: [], error: "" });
    const [replies, viewers] = await Promise.all([
      getStoryReplies(story._id).catch(() => null),
      getStoryViewers(story._id).catch(() => null)
    ]);
    if (replies === null && viewers === null) {
      setPanel({ open: true, loading: false, replies: [], viewers: [], error: "No se pudo cargar la actividad." });
      return;
    }
    setPanel({
      open: true,
      loading: false,
      replies: replies || [],
      viewers: viewers || [],
      error: ""
    });
  }

  async function removeStory() {
    if (!story || deleting) return;
    setDeleting(true);
    try {
      await deleteStory(story._id);
      onChanged?.();
      advance();
    } catch (error) {
      setPanel((current) => ({ ...current, error: error?.response?.data?.error || "No se pudo eliminar la historia." }));
    } finally {
      setDeleting(false);
      setConfirmDelete(false);
    }
  }

  if (!story) return null;

  const mediaLabel = story.media.alt || story.caption || (story.media.type === "video" ? "Video de la historia" : "Imagen de la historia");

  return (
    <div className="k-story-viewer" role="dialog" aria-modal="true" aria-label={`Historia de ${group.author.displayName || group.author.username}`}>
      <div className="k-story-frame">
        <div className="k-story-progress" aria-hidden="true">
          {group.stories.map((item, index) => (
            <span key={item._id} className="k-story-progress-segment">
              <span
                className={
                  index < storyIndex
                    ? "k-story-progress-fill is-done"
                    : index === storyIndex
                      ? "k-story-progress-fill is-active"
                      : "k-story-progress-fill"
                }
                style={
                  index === storyIndex && story.media.type !== "video"
                    ? { animationDuration: `${IMAGE_DURATION_MS}ms` }
                    : undefined
                }
              />
            </span>
          ))}
        </div>

        <header className="k-story-header">
          <Link to={`/profile/${group.author.username}`} className="k-story-author" onClick={close}>
            {group.author.avatar ? (
              <img src={mediaUrl(group.author.avatar)} alt="" className="k-story-author-avatar" />
            ) : (
              <span className="k-story-author-avatar k-story-author-fallback" aria-hidden="true">
                {(group.author.displayName || group.author.username || "?").slice(0, 1).toUpperCase()}
              </span>
            )}
            <span className="k-story-author-meta">
              <strong>{group.author.displayName || group.author.username}</strong>
              <small>
                @{group.author.username} · {timeAgo(story.createdAt)}
                {story.mine ? ` · ${AUDIENCE_LABELS[story.audience?.type] || "Pública"}` : ""}
              </small>
            </span>
          </Link>
          <div className="k-story-header-actions">
            {story.media.type === "video" && (
              <button type="button" className="k-story-icon-button" onClick={toggleMuted} aria-label={muted ? "Activar sonido" : "Silenciar video"}>
                {muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
              </button>
            )}
            <button type="button" className="k-story-icon-button" onClick={close} aria-label="Cerrar historias">
              <X size={20} />
            </button>
          </div>
        </header>

        <div className="k-story-stage">
          {story.media.type === "video" ? (
            <video
              ref={videoRef}
              key={story._id}
              className="k-story-media"
              autoPlay
              playsInline
              muted={muted}
              onEnded={advance}
              aria-label={mediaLabel}
            >
              <source src={mediaUrl(story.media.url)} />
            </video>
          ) : (
            <img key={story._id} className="k-story-media" src={mediaUrl(story.media.url)} alt={mediaLabel} />
          )}

          <button type="button" className="k-story-nav k-story-nav-prev" onClick={back} aria-label="Historia anterior" />
          <button type="button" className="k-story-nav k-story-nav-next" onClick={advance} aria-label="Siguiente historia" />

          {story.caption && <p className="k-story-caption">{story.caption}</p>}
        </div>

        <footer className="k-story-footer">
          {story.mine ? (
            <div className="k-story-own-actions">
              <button type="button" className="k-button k-button-ghost" onClick={openPanel}>
                {story.viewsCount} {story.viewsCount === 1 ? "vista" : "vistas"} · {story.repliesCount} {story.repliesCount === 1 ? "respuesta" : "respuestas"}
              </button>
              {confirmDelete ? (
                <span className="k-story-delete-confirm">
                  <button type="button" className="k-button k-button-primary" onClick={removeStory} disabled={deleting}>
                    {deleting ? "Eliminando..." : "Sí, eliminar"}
                  </button>
                  <button type="button" className="k-button k-button-ghost" onClick={() => setConfirmDelete(false)} disabled={deleting}>
                    Cancelar
                  </button>
                </span>
              ) : (
                <button type="button" className="k-story-icon-button" onClick={() => setConfirmDelete(true)} aria-label="Eliminar historia">
                  <Trash2 size={18} />
                </button>
              )}
              <small className="k-muted k-story-ttl">{hoursLeft(story.expiresAt)}</small>
            </div>
          ) : (
            <form className="k-story-reply" onSubmit={sendReply}>
              <label className="k-sr-only" htmlFor="k-story-reply-input">Responder a {group.author.username}</label>
              <input
                id="k-story-reply-input"
                value={replyText}
                onChange={(event) => setReplyText(event.target.value)}
                placeholder={`Responder a @${group.author.username} (privado)`}
                maxLength={1000}
                disabled={replyState.sending}
              />
              <button className="k-button k-button-primary" type="submit" disabled={replyState.sending || !replyText.trim()}>
                {replyState.sending ? "Enviando..." : "Responder"}
              </button>
            </form>
          )}
          {replyState.error && <p className="k-story-error" role="alert">{replyState.error}</p>}
          {replyState.sent && <p className="k-story-sent" role="status">Respuesta enviada.</p>}
        </footer>

        {panel.open && (
          <aside className="k-story-panel" aria-label="Actividad de la historia">
            <div className="k-story-panel-head">
              <h2>Actividad</h2>
              <button type="button" className="k-story-icon-button" onClick={() => setPanel((current) => ({ ...current, open: false }))} aria-label="Cerrar actividad">
                <X size={18} />
              </button>
            </div>
            {panel.loading ? (
              <p className="k-muted">Cargando...</p>
            ) : (
              <>
                <section aria-label="Respuestas privadas">
                  <h3>Respuestas ({panel.replies.length})</h3>
                  {panel.replies.length === 0 ? (
                    <p className="k-muted">Aún no hay respuestas.</p>
                  ) : (
                    <ul>
                      {panel.replies.map((reply, index) => (
                        <li key={`${reply.user?._id || index}`}>
                          <Link to={`/profile/${reply.user?.username}`} onClick={close}>
                            <strong>{reply.user?.displayName || reply.user?.username}</strong>
                          </Link>
                          <p>{reply.text}</p>
                          <small className="k-muted">{timeAgo(reply.createdAt)}</small>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
                <section aria-label="Vistas">
                  <h3>Vistas ({panel.viewers.length})</h3>
                  {panel.viewers.length === 0 ? (
                    <p className="k-muted">Nadie la ha visto todavía.</p>
                  ) : (
                    <ul className="k-story-viewers">
                      {panel.viewers.map((viewer, index) => (
                        <li key={viewer._id || index}>
                          <Link to={`/profile/${viewer.username}`} onClick={close}>
                            {viewer.avatar ? <img src={mediaUrl(viewer.avatar)} alt="" /> : <span aria-hidden="true">{(viewer.displayName || viewer.username || "?").slice(0, 1).toUpperCase()}</span>}
                            {viewer.displayName || viewer.username}
                          </Link>
                          <small className="k-muted">{timeAgo(viewer.viewedAt)}</small>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
                {panel.error && <p className="k-story-error" role="alert">{panel.error}</p>}
              </>
            )}
          </aside>
        )}
      </div>
    </div>
  );
}
