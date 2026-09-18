import { Link } from "react-router-dom";

function copyPostLink(postId) {
  if (!postId || typeof window === "undefined") return;
  const url = `${window.location.origin}/post/${postId}`;
  navigator.clipboard?.writeText(url);
}

export default function PostMoreMenu({
  post,
  isOwn = false,
  editing = false,
  onToggleEdit,
  onDelete,
  onRepost,
  onHide,
  onReport,
  onMute,
  onBlock,
  hiding = "",
  reposting = ""
}) {
  const postId = post?._id;
  const author = post?.author;
  const authorId = author?._id || author;

  function closeMenu(event) {
    const details = event.currentTarget.closest("details");
    if (typeof window !== "undefined" && typeof window.requestAnimationFrame === "function") {
      window.requestAnimationFrame(() => details?.removeAttribute("open"));
      return;
    }
    details?.removeAttribute("open");
  }

  return (
    <details className="k-post-menu">
      <summary aria-label="Más opciones de la publicación">
        <span aria-hidden="true">⋯</span>
      </summary>
      <div role="menu" aria-label="Opciones secundarias de la publicación">
        {onRepost && (
          <button
            type="button"
            role="menuitem"
            onClick={(event) => {
              closeMenu(event);
              onRepost(postId);
            }}
            disabled={reposting === postId}
          >
            Repost
          </button>
        )}
        {postId && (
          <Link role="menuitem" to={`/post/${postId}`}>
            Ver detalle
          </Link>
        )}
        {postId && (
          <button
            type="button"
            role="menuitem"
            onClick={(event) => {
              closeMenu(event);
              copyPostLink(postId);
            }}
          >
            Copiar enlace
          </button>
        )}
        {isOwn && onToggleEdit && (
          <button
            type="button"
            role="menuitem"
            onClick={(event) => {
              closeMenu(event);
              onToggleEdit();
            }}
          >
            {editing ? "Cancelar edición" : "Editar"}
          </button>
        )}
        {isOwn && onDelete && (
          <button
            type="button"
            role="menuitem"
            onClick={(event) => {
              closeMenu(event);
              onDelete(postId);
            }}
          >
            Eliminar
          </button>
        )}
        {onHide && postId && (
          <button
            type="button"
            role="menuitem"
            onClick={(event) => {
              closeMenu(event);
              onHide(postId);
            }}
            disabled={hiding === postId}
          >
            {hiding === postId ? "Ocultando..." : "Ocultar para mí"}
          </button>
        )}
        {!isOwn && onReport && (
          <button
            type="button"
            role="menuitem"
            onClick={(event) => {
              closeMenu(event);
              onReport(post);
            }}
          >
            Reportar
          </button>
        )}
        {!isOwn && authorId && (
          <>
            {onMute && (
              <button
                type="button"
                role="menuitem"
                onClick={(event) => {
                  closeMenu(event);
                  onMute(author);
                }}
              >
                Silenciar a @{author?.username || "usuario"}
              </button>
            )}
            {onBlock && (
              <button
                type="button"
                role="menuitem"
                onClick={(event) => {
                  closeMenu(event);
                  onBlock(author);
                }}
              >
                Bloquear a @{author?.username || "usuario"}
              </button>
            )}
          </>
        )}
      </div>
    </details>
  );
}
