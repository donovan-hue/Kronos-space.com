import { useState } from "react";
import { motion } from "motion/react";
import { Bookmark, ChevronDown, MessageCircle, Send } from "lucide-react";
import PostMoreMenu from "./PostMoreMenu";
import { getReactionType, REACTION_OPTIONS } from "../reactions";

export default function PostActions({
  post,
  commentsCount = 0,
  isOwn = false,
  editing = false,
  onLike,
  onReact,
  onToggleComments,
  onShare,
  onSave,
  onToggleEdit,
  onDelete,
  onHide,
  onRemix,
  onReport,
  onMute,
  onBlock,
  liking = "",
  saving = "",
  hiding = ""
}) {
  const postId = post?._id;
  const [pickerOpen, setPickerOpen] = useState(false);
  const reactionType = getReactionType(post);
  const selected = REACTION_OPTIONS.find((item) => item.type === reactionType);
  const reactionsCount = typeof post?.reactionsCount === "number"
    ? post.reactionsCount
    : post?.likesCount || 0;

  function selectReaction(type) {
    setPickerOpen(false);
    if (onReact) onReact(postId, type);
    else if (type === "like") onLike?.(postId);
  }

  function toggleReaction() {
    selectReaction(reactionType || "like");
  }

  const reactionLabel = selected?.label || "Reaccionar";
  return (
    <div className="k-post-actions k-post-actions-iconic">
      <div className="k-reaction-control">
        <motion.button
          type="button"
          className={`k-reaction-button ${reactionType ? "is-liked" : ""}`}
          onClick={toggleReaction}
          disabled={liking === postId}
          whileTap={{ scale: 0.9 }}
          aria-label={`${reactionType ? "Quitar reacción" : "Reaccionar"}. ${reactionsCount} reacciones`}
          title={reactionType ? reactionLabel : "Reaccionar"}
        >
          <span className="k-reaction-current" aria-hidden="true">{selected?.emoji || "❤️"}</span>
          {reactionsCount > 0 && <small>{reactionsCount}</small>}
        </motion.button>
        <button
          type="button"
          className="k-reaction-picker-toggle"
          onClick={() => setPickerOpen((open) => !open)}
          aria-label="Elegir tipo de reacción"
          aria-expanded={pickerOpen}
          title="Elegir reacción"
        >
          <ChevronDown size={13} strokeWidth={2} />
        </button>
        {pickerOpen && (
          <div className="k-reaction-picker" role="menu" aria-label="Tipos de reacción">
            {REACTION_OPTIONS.map((option) => {
              const count = Number(post?.reactionCounts?.[option.type] || 0);
              return (
                <button
                  key={option.type}
                  type="button"
                  role="menuitem"
                  className={reactionType === option.type ? "is-selected" : ""}
                  onClick={() => selectReaction(option.type)}
                  disabled={liking === postId}
                  title={option.label}
                  aria-label={`${option.label}${count ? `. ${count}` : ""}`}
                >
                  <span aria-hidden="true">{option.emoji}</span>
                  {count > 0 && <small>{count}</small>}
                </button>
              );
            })}
          </div>
        )}
      </div>
      <button type="button" onClick={() => onToggleComments?.(postId)} aria-label={`Comentar. ${commentsCount} comentarios`} title="Comentar">
        <MessageCircle size={19} strokeWidth={1.7} />
        {commentsCount > 0 && <small>{commentsCount}</small>}
      </button>
      <button type="button" onClick={() => onShare?.(post)} aria-label="Compartir publicación" title="Compartir">
        <Send size={19} strokeWidth={1.7} />
      </button>
      <motion.button
        type="button"
        className={post?.saved ? "is-saved" : ""}
        onClick={() => onSave?.(postId)}
        disabled={saving === postId}
        whileTap={{ scale: 0.9 }}
        aria-label={post?.saved ? "Quitar de guardados" : "Guardar publicación"}
        title={post?.saved ? "Guardado" : "Guardar"}
      >
        <Bookmark size={19} strokeWidth={1.7} fill={post?.saved ? "currentColor" : "none"} />
      </motion.button>
      <PostMoreMenu
        post={post}
        isOwn={isOwn}
        editing={editing}
        onToggleEdit={onToggleEdit}
        onDelete={onDelete}
        onHide={onHide}
        onRemix={onRemix}
        onReport={onReport}
        onMute={onMute}
        onBlock={onBlock}
        hiding={hiding}
      />
    </div>
  );
}
