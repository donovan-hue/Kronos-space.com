import { motion } from "motion/react";
import { Bookmark, MessageCircle, Send } from "lucide-react";
import PostMoreMenu from "./PostMoreMenu";

export default function PostActions({
  post,
  commentsCount = 0,
  isOwn = false,
  editing = false,
  onLike,
  onToggleComments,
  onShare,
  onSave,
  onToggleEdit,
  onDelete,
  onHide,
  onReport,
  onMute,
  onBlock,
  liking = "",
  saving = "",
  hiding = ""
}) {
  const postId = post?._id;
  const liked = Boolean(post?.liked);
  const saved = Boolean(post?.saved);
  const likesCount = post?.likesCount || 0;

  return (
    <div className="k-post-actions k-post-actions-iconic">
      <motion.button
        type="button"
        className={`k-reaction-button ${liked ? "is-liked" : ""}`}
        onClick={() => onLike?.(postId)}
        disabled={liking === postId}
        whileTap={{ scale: 0.9 }}
        aria-label={`${liked ? "Quitar reacción" : "Reaccionar"}. ${likesCount} reacciones`}
        title="Reaccionar"
      >
        <span className="k-reaction-cycle" aria-hidden="true">
          <i>👋</i><i>❤️</i><i>😍</i><i>👏</i><i>🔥</i>
        </span>
        {likesCount > 0 && <small>{likesCount}</small>}
      </motion.button>
      <button type="button" onClick={() => onToggleComments?.(postId)} aria-label={`Comentar. ${commentsCount} comentarios`} title="Comentar">
        <MessageCircle size={19} strokeWidth={1.7} />
        {commentsCount > 0 && <small>{commentsCount}</small>}
      </button>
      <button type="button" onClick={() => onShare?.(post)} aria-label="Compartir publicación" title="Compartir">
        <Send size={19} strokeWidth={1.7} />
      </button>
      <motion.button
        type="button"
        className={saved ? "is-saved" : ""}
        onClick={() => onSave?.(postId)}
        disabled={saving === postId}
        whileTap={{ scale: 0.9 }}
        aria-label={saved ? "Quitar de guardados" : "Guardar publicación"}
        title={saved ? "Guardado" : "Guardar"}
      >
        <Bookmark size={19} strokeWidth={1.7} fill={saved ? "currentColor" : "none"} />
      </motion.button>
      <PostMoreMenu
        post={post}
        isOwn={isOwn}
        editing={editing}
        onToggleEdit={onToggleEdit}
        onDelete={onDelete}
        onHide={onHide}
        onReport={onReport}
        onMute={onMute}
        onBlock={onBlock}
        hiding={hiding}
      />
    </div>
  );
}
