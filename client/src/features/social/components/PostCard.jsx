import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import PostActions from "./PostActions";
import PostMedia from "./PostMedia";
import { rsvpEvent, votePoll } from "../../../services/postsService";

function date(value) {
  return value ? new Date(value).toLocaleString("es-MX", { dateStyle: "medium", timeStyle: "short" }) : "";
}

function authorProfileTo(author) {
  return author?.username ? `/profile/${author.username}` : "/profile";
}

function CommentThread({ comment, postId, depth = 0, currentUserId, postAuthorId, onReply, onDeleteComment }) {
  const [replying, setReplying] = useState(false);
  const [draft, setDraft] = useState("");
  const authorId = String(comment.user?._id || comment.user || "");
  const canDelete = authorId === String(currentUserId || "") || String(postAuthorId || "") === String(currentUserId || "");

  async function submitReply(event) {
    event.preventDefault();
    const value = draft.trim();
    if (!value || value.length > 1000) return;
    await onReply?.(postId, value, comment._id);
    setDraft("");
    setReplying(false);
  }

  return (
    <div className="k-comment-thread" style={{ marginLeft: Math.min(depth, 4) * 18 }}>
      <div className="k-comment">
        <span>
          <strong>{comment.user?.displayName || comment.user?.username || "Usuario"}</strong>{" "}
          <span>{comment.content}</span>
        </span>
        <span className="k-comment-actions">
          <button type="button" className="k-comment-reply" onClick={() => setReplying((open) => !open)}>
            {replying ? "Cancelar" : "Responder"}
          </button>
          {canDelete && comment._id && (
            <button type="button" aria-label="Eliminar comentario" className="k-comment-delete" onClick={() => onDeleteComment?.(postId, comment._id)}>
              ×
            </button>
          )}
        </span>
      </div>
      {replying && (
        <form className="k-comment-reply-form" onSubmit={submitReply}>
          <input value={draft} onChange={(event) => setDraft(event.target.value)} maxLength={1000} placeholder="Escribe una respuesta" aria-label={`Responder a ${comment.user?.displayName || "comentario"}`} />
          <button type="submit" className="k-button k-button-primary" disabled={!draft.trim()}>Enviar</button>
        </form>
      )}
      {(comment.replies || []).map((reply) => (
        <CommentThread key={reply._id || `${reply.user?._id}-${reply.content}`} comment={reply} postId={postId} depth={depth + 1} currentUserId={currentUserId} postAuthorId={postAuthorId} onReply={onReply} onDeleteComment={onDeleteComment} />
      ))}
    </div>
  );
}

function RepostBlock({ repostOf }) {
  if (!repostOf) return null;

  return (
    <div className="k-post-repost">
      <p className="k-muted">Republicado de @{repostOf.author?.username || "usuario"}</p>
      {repostOf.content && <p>{repostOf.content}</p>}
      <PostMedia media={repostOf.media} mediaItems={repostOf.mediaItems} content={repostOf.content} compact />
    </div>
  );
}

function EventBlock({ event, onRespond }) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  if (!event) return null;
  const now = Date.now();
  const ended = event.status === "ended" || Boolean(event.endsAt && new Date(event.endsAt).getTime() <= now);
  const upcoming = event.status === "upcoming" && (!event.startsAt || new Date(event.startsAt).getTime() > now);

  async function respond(status) {
    if (ended || saving) return;
    setSaving(true);
    setError("");
    try {
      await onRespond(status);
    } catch (requestError) {
      setError(requestError.response?.data?.error || "No se pudo actualizar tu respuesta.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="k-post-event" aria-label="Evento">
      <div className="k-post-event-heading">
        <span className="k-eyebrow">EVENTO · {upcoming ? "PRÓXIMO" : ended ? "TERMINADO" : "EN CURSO"}</span>
        <h3>{event.title}</h3>
      </div>
      {event.description && <p>{event.description}</p>}
      <div className="k-post-event-details">
        <span>Comienza: {date(event.startsAt)}{event.endsAt ? ` · termina ${date(event.endsAt)}` : ""}</span>
        <span>{event.locationType === "in_person" ? "Presencial" : "En línea"}{event.location ? ` · ${event.location}` : ""}</span>
      </div>
      <div className="k-post-event-actions">
        <button type="button" className={event.response === "going" ? "is-selected" : ""} onClick={() => respond("going")} disabled={ended || saving} aria-pressed={event.response === "going"}>Voy · {event.goingCount || 0}</button>
        <button type="button" className={event.response === "interested" ? "is-selected" : ""} onClick={() => respond("interested")} disabled={ended || saving} aria-pressed={event.response === "interested"}>Me interesa · {event.interestedCount || 0}</button>
        {event.response && <button type="button" className="k-button k-button-ghost" onClick={() => respond("none")} disabled={ended || saving}>Cancelar respuesta</button>}
      </div>
      {error && <p className="k-state k-state-error" role="alert">{error}</p>}
    </section>
  );
}

function PollBlock({ poll, onVote }) {
  const [voting, setVoting] = useState(false);
  const [error, setError] = useState("");
  if (!poll) return null;
  const closed = Boolean(poll.closed || (poll.closesAt && new Date(poll.closesAt).getTime() <= Date.now()));

  async function handleVote(optionId) {
    if (closed || voting) return;
    setVoting(true);
    setError("");
    try {
      await onVote(optionId);
    } catch (requestError) {
      setError(requestError.response?.data?.error || "No se pudo registrar el voto.");
    } finally {
      setVoting(false);
    }
  }

  return (
    <section className="k-post-poll" aria-label="Encuesta">
      <h3>{poll.question}</h3>
      <div className="k-post-poll-options">
        {(poll.options || []).map((option) => {
          const selected = String(poll.selectedOptionId || "") === String(option._id);
          return (
            <button
              key={option._id}
              type="button"
              className={`k-post-poll-option${selected ? " is-selected" : ""}`}
              onClick={() => handleVote(option._id)}
              disabled={closed || voting}
              aria-pressed={selected}
            >
              <span className="k-post-poll-option-copy">{option.text}</span>
              <span className="k-post-poll-option-result">{option.percentage}% · {option.votes}</span>
            </button>
          );
        })}
      </div>
      <p className="k-muted k-post-poll-meta">
        {poll.totalVotes || 0} {(poll.totalVotes || 0) === 1 ? "voto" : "votos"} · {closed ? "Encuesta cerrada" : "Encuesta abierta"}
        {poll.closesAt && !closed ? ` · cierra ${date(poll.closesAt)}` : ""}
      </p>
      {error && <p className="k-state k-state-error" role="alert">{error}</p>}
    </section>
  );
}

export default function PostCard({
  post,
  isOwn = false,
  currentUserId = "",
  onLike,
  onReact,
  onComment,
  onShare,
  onSave,
  onEdit,
  onDelete,
  onDeleteComment,
  onHide,
  onRemix,
  onReport,
  onMute,
  onBlock,
  onPollVote,
  onEventResponse,
  hiding = "",
  liking = "",
  saving = "",
  commenting = "",
  commentDraft = "",
  setCommentDraft,
  open = false,
  toggleOpen,
  editing = false,
  setEditing,
  editValue = "",
  setEditValue,
  savingEdit = false,
  collectionAction = null
}) {
  const comments = Array.isArray(post.comments) ? post.comments : [];
  const commentThreads = Array.isArray(post.commentThreads)
    ? post.commentThreads
    : comments.filter((comment) => !comment.parentCommentId);
  const commentsCount = typeof post.commentsCount === "number" ? post.commentsCount : comments.length;
  const me = String(currentUserId || "");
  const [poll, setPoll] = useState(post.poll || null);
  const [event, setEvent] = useState(post.event || null);
  useEffect(() => {
    setPoll(post.poll || null);
    setEvent(post.event || null);
  }, [post._id, post.poll, post.event]);

  async function handleEventResponse(status) {
    const updatedPost = await rsvpEvent(post._id, status);
    if (updatedPost?.event) setEvent(updatedPost.event);
    onEventResponse?.(updatedPost, post._id);
  }

  async function handlePollVote(optionId) {
    const updatedPost = await votePoll(post._id, optionId);
    if (updatedPost?.poll) setPoll(updatedPost.poll);
    onPollVote?.(updatedPost, post._id);
  }

  const canSaveEdit =
    !savingEdit &&
    (String(editValue || "").trim() || post.media?.url) &&
    String(editValue || "").trim() !== String(post.content || "");

  return (
    <article className="k-post">
      <header className="k-post-header">
        <Link className="k-avatar" to={authorProfileTo(post.author)}>
          {post.author?.displayName?.slice(0, 1) || "K"}
        </Link>
        <div className="k-post-header-copy">
          <Link className="k-post-author" to={authorProfileTo(post.author)}>
            {post.author?.displayName || post.author?.username || "Usuario"}
          </Link>
          <p>@{post.author?.username || "kronos"} · {date(post.createdAt)}</p>
          {post.recommendationReason && <span className="k-post-recommendation">{post.recommendationReason}</span>}
          {post.lineage?.tool === "remix" && (
            <span className="k-lineage-badge">
              Remix
              {post.lineage.derivedFrom && (
                <> · de{" "}
                  {post.lineage.derivedFromAuthor?.username
                    ? <Link to={`/profile/${post.lineage.derivedFromAuthor.username}`}>@{post.lineage.derivedFromAuthor.username}</Link>
                    : <Link to={`/post/${post.lineage.derivedFrom}`}>la original</Link>}
                </>
              )}
            </span>
          )}
          {post.lineage?.aiGenerated && <span className="k-lineage-badge k-lineage-badge-ai">Creado con IA</span>}
        </div>
      </header>

      {post.repostOf && <RepostBlock repostOf={post.repostOf} />}

      {editing ? (
        <div className="k-post-edit-panel">
          <textarea
            value={editValue}
            onChange={(event) => setEditValue?.(event.target.value)}
            maxLength={5000}
            aria-label="Editar contenido"
          />
          <div className="k-post-edit-footer">
            <span className="k-muted">{String(editValue || "").length}/5000</span>
            <button
              type="button"
              className="k-button k-button-primary"
              disabled={!canSaveEdit}
              onClick={() => onEdit?.(post._id, editValue)}
            >
              {savingEdit ? "Guardando..." : "Guardar"}
            </button>
          </div>
        </div>
      ) : (
        <>
          {post.content ? (
            <Link className="k-post-content" to={`/post/${post._id}`}>
              <p>{post.content}</p>
            </Link>
          ) : (
            <div className="k-post-content k-post-content-empty">
              <p className="k-muted">Publicación con multimedia</p>
            </div>
          )}
          {post.hashtags?.length > 0 && (
            <div className="k-hashtag-list k-post-hashtags" aria-label="Temas de la publicación">
              {post.hashtags.map((tag) => (
                <Link key={tag} to={`/explore?q=${encodeURIComponent(`#${tag}`)}`}>#{tag}</Link>
              ))}
            </div>
          )}
          <EventBlock event={event} onRespond={handleEventResponse} />
          <PollBlock poll={poll} onVote={handlePollVote} />
          <PostMedia media={post.media} mediaItems={post.mediaItems} content={post.content} />
        </>
      )}

      <PostActions
        post={post}
        commentsCount={commentsCount}
        isOwn={isOwn}
        editing={editing}
        onLike={onLike}
        onReact={onReact}
        onToggleComments={toggleOpen}
        onShare={onShare}
        onSave={onSave}
        onToggleEdit={setEditing}
        onDelete={onDelete}
        onHide={onHide}
        onRemix={onRemix}
        onReport={onReport}
        onMute={onMute}
        onBlock={onBlock}
        liking={liking}
        saving={saving}
        hiding={hiding}
      />
      {collectionAction}

      {open && (
        <div className="k-comments">
          <form
            onSubmit={(event) => {
              event.preventDefault();
              onComment?.(post._id, commentDraft);
            }}
          >
            <input
              value={commentDraft || ""}
              onChange={(event) => setCommentDraft?.(post._id, event.target.value)}
              placeholder="Escribe un comentario"
              maxLength={1000}
              aria-label={`Comentar ${post._id}`}
            />
            <button
              className="k-button k-button-primary"
              type="submit"
              disabled={commenting === post._id || !String(commentDraft || "").trim()}
            >
              {commenting === post._id ? "Enviando..." : "Enviar"}
            </button>
          </form>
          {comments.length === 0 ? (
            <p className="k-muted k-comment-empty">Sé el primero en comentar.</p>
          ) : (
            commentThreads.map((comment) => (
              <CommentThread
                key={comment._id || `${comment.user?._id}-${comment.content}`}
                comment={comment}
                postId={post._id}
                currentUserId={me}
                postAuthorId={post.author?._id || post.author}
                onReply={onComment}
                onDeleteComment={onDeleteComment}
              />
            ))
          )}
        </div>
      )}
    </article>
  );
}
