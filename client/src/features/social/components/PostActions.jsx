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
      <button
        type="button"
        className={liked ? "is-liked" : ""}
        onClick={() => onLike?.(postId)}
        disabled={liking === postId}
      >
        {liked ? "Me gusta" : "Like"} · {likesCount}
      </button>
      <button type="button" onClick={() => onToggleComments?.(postId)}>
        Comentar · {commentsCount}
      </button>
      <button type="button" onClick={() => onShare?.(post)}>
        Compartir
      </button>
      <button
        type="button"
        className={saved ? "is-saved" : ""}
        onClick={() => onSave?.(postId)}
        disabled={saving === postId}
      >
        {saved ? "Guardado" : "Guardar"}{savedCount ? ` · ${savedCount}` : ""}
      </button>
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
