import { motion } from "motion/react";
import PostMoreMenu from "./PostMoreMenu";

/**
 * Barra de acciones de una publicación.
 *
 * Microinteracciones Motion (discretas, KRONOS):
 * - whileTap: el botón cede ligeramente al presionarlo (gesto).
 * - El rótulo hace un "pop" cromado solo cuando CAMBIA el estado
 *   (me gusta / guardado), no cuando llega la respuesta del servidor
 *   con el mismo estado. Con prefers-reduced-motion el pop se omite.
 */
export default function PostActions({
  post,
  commentsCount = 0,
  isOwn = false,
  editing = false,
  onLike,
  onToggleComments,
  onShare,
  onSave,
  onRepost,
  onToggleEdit,
  onDelete,
  onHide,
  onReport,
  onMute,
  onBlock,
  liking = "",
  saving = "",
  reposting = "",
  hiding = ""
}) {
  const postId = post?._id;
  const liked = Boolean(post?.liked);
  const saved = Boolean(post?.saved);
  const likesCount = post?.likesCount || 0;
  const savedCount = post?.savedCount || 0;

  return (
    <div className="k-post-actions k-post-actions-clean">
      <motion.button
        type="button"
        className={liked ? "is-liked" : ""}
        onClick={() => onLike?.(postId)}
        disabled={liking === postId}
        whileTap={{ scale: 0.94 }}
      >
        <motion.span
          key={`like-${liked}`}
          className="k-action-pop"
          initial={{ scale: liked ? 1.35 : 1 }}
          animate={{ scale: 1 }}
          transition={{ type: "spring", stiffness: 480, damping: 20 }}
        >
          {liked ? "Me gusta" : "Like"} · {likesCount}
        </motion.span>
      </motion.button>
      <button type="button" onClick={() => onToggleComments?.(postId)}>
        Comentar · {commentsCount}
      </button>
      <button type="button" onClick={() => onShare?.(post)}>
        Compartir
      </button>
      <motion.button
        type="button"
        className={saved ? "is-saved" : ""}
        onClick={() => onSave?.(postId)}
        disabled={saving === postId}
        whileTap={{ scale: 0.94 }}
      >
        <motion.span
          key={`save-${saved}`}
          className="k-action-pop"
          initial={{ scale: saved ? 1.35 : 1 }}
          animate={{ scale: 1 }}
          transition={{ type: "spring", stiffness: 480, damping: 20 }}
        >
          {saved ? "Guardado" : "Guardar"}{savedCount ? ` · ${savedCount}` : ""}
        </motion.span>
      </motion.button>
      <PostMoreMenu
        post={post}
        isOwn={isOwn}
        editing={editing}
        onToggleEdit={onToggleEdit}
        onDelete={onDelete}
        onRepost={onRepost}
        onHide={onHide}
        onReport={onReport}
        onMute={onMute}
        onBlock={onBlock}
        hiding={hiding}
        reposting={reposting}
      />
    </div>
  );
}
