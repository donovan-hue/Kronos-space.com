import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Comments from "./Comments";
import { deletePost, getPost, likePost, reactToPost, repostPost, toggleSave, updatePost } from "../../services/postsService";
import { optimisticReaction, reactionFromResponse } from "./reactions";
import { queryKeys } from "../../services/queryKeys";
import { removePostEverywhere, updatePostEverywhere } from "./postLists";
import { getUser } from "../../services/authStorage";
import { blockUser, hidePost, muteUser } from "../../services/moderationService";
import ReportDialog from "../moderation/ReportDialog";
import PostActions from "./components/PostActions";
import PostMedia from "./components/PostMedia";
import { publicAppUrl } from "../../services/publicUrl";
import { useConfirm } from "../../components/feedback/ConfirmProvider";
import { useToast } from "../../components/feedback/ToastProvider";

function formatDate(date) {
  if (!date) return "";
  try {
    return new Date(date).toLocaleString("es-MX", { dateStyle: "medium", timeStyle: "short" });
  } catch {
    return "";
  }
}

export default function PostDetail() {
  const confirm = useConfirm();
  const { showToast } = useToast();
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // Detalle de la publicación como estado de servidor. La clave ["post", id]
  // es distinta de las listas, pero updatePostEverywhere sincroniza likes,
  // guardados y ediciones con TODAS las listas en caché (feed, perfil…).
  const postQuery = useQuery({
    queryKey: queryKeys.post(id),
    queryFn: async () => (await getPost(id))?.post ?? null,
    enabled: Boolean(id),
  });
  const post = postQuery.data;
  const loading = postQuery.isPending;

  /** Escribe en el caché del detalle y de todas las listas a la vez. */
  const setPost = useCallback(
    (updater) => {
      updatePostEverywhere(queryClient, id, (current) =>
        typeof updater === "function" ? updater(current) : updater
      );
    },
    [queryClient, id]
  );

  const [liking, setLiking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savingPost, setSavingPost] = useState(false);
  const [reposting, setReposting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState("");
  const [editAlt, setEditAlt] = useState("");
  const [reportTarget, setReportTarget] = useState(null);
  const [hiding, setHiding] = useState(false);
  const [actionError, setActionError] = useState("");
  const error =
    actionError ||
    (postQuery.error
      ? postQuery.error.response?.data?.error || "No se pudo cargar la publicación."
      : "");
  const commentsRef = useRef(null);

  const meId = useMemo(() => String(getUser()?._id || getUser()?.id || ""), []);
  const isOwn = useMemo(() => {
    const authorId = String(post?.author?._id || post?.author || "");
    return Boolean(authorId && meId && authorId === meId);
  }, [post, meId]);

  // Hidrata los campos de edición una vez por publicación (no en cada
  // actualización de caché: no debe pisar lo que el usuario escribe).
  const hydratedForRef = useRef("");
  useEffect(() => {
    const loaded = postQuery.data;
    if (!loaded || hydratedForRef.current === id) return;
    hydratedForRef.current = id;
    setEditValue(loaded.content || "");
    setEditAlt(loaded.media?.alt || "");
  }, [postQuery.data, id]);

  async function handleReaction(postId, type) {
    if (!post?._id || String(postId) !== String(post._id) || liking) return;
    const previous = post;
    setLiking(true);
    setActionError("");
    setPost((current) => optimisticReaction(current, type));
    try {
      const result = typeof reactToPost === "function"
        ? await reactToPost(post._id, type)
        : await likePost(post._id);
      setPost((current) => reactionFromResponse(current, result));
    } catch (requestError) {
      setPost(() => previous);
      setActionError(requestError.response?.data?.error || "No se pudo actualizar la reacción.");
    } finally {
      setLiking(false);
    }
  }

  async function handleSave() {
    if (!post?._id || savingPost) return;
    const prevSaved = post.saved;
    const prevCount = post.savedCount || 0;
    setSavingPost(true);
    setPost((c) => ({ ...c, saved: !prevSaved, savedCount: prevSaved ? Math.max(0, prevCount - 1) : prevCount + 1 }));
    try {
      const result = await toggleSave(post._id);
      setPost((c) => ({ ...c, saved: Boolean(result.saved), savedCount: typeof result.savedCount === "number" ? result.savedCount : c.savedCount }));
    } catch (e) {
      setPost((c) => ({ ...c, saved: prevSaved, savedCount: prevCount }));
      setActionError(e.response?.data?.error || "No se pudo guardar.");
    } finally {
      setSavingPost(false);
    }
  }

  async function handleRepost() {
    if (!post?._id || reposting) return;
    const ok = await confirm({
      title: "Republicar publicación",
      message: "¿Deseas republicar esta publicación en tu perfil?",
      confirmText: "Republicar"
    });
    if (!ok) return;
    setReposting(true);
    try {
      const newPost = await repostPost(post._id);
      if (newPost) navigate(`/post/${newPost._id}`);
    } catch (e) {
      if (e.response?.status === 409) setActionError("Ya has republicado esta publicación.");
      else setActionError(e.response?.data?.error || "No se pudo republicar.");
    } finally {
      setReposting(false);
    }
  }

  async function handleEdit() {
    const value = editValue.trim();
    const hasMedia = Boolean(post?.media?.url);
    if (!value && !hasMedia) {
      setActionError("La publicación está vacía");
      return;
    }
    if (value.length > 5000) {
      setActionError("La publicación no puede superar 5000 caracteres");
      return;
    }
    if (value === (post.content || "") && editAlt.trim() === (post.media?.alt || "")) {
      setEditing(false);
      return;
    }
    setSaving(true);
    setActionError("");
    try {
      const updated = await updatePost(post._id, value, { alt: editAlt.trim().slice(0, 500), allowEmptyContent: hasMedia });
      setPost(updated);
      setEditing(false);
    } catch (requestError) {
      const status = requestError.response?.status;
      if (status === 403) setActionError("No tienes permisos para editar esta publicación.");
      else if (status === 404) setActionError("Publicación no encontrada.");
      else setActionError(requestError.response?.data?.error || "No se pudo editar la publicación.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!post?._id || deleting) return;
    const ok = await confirm({
      title: "Eliminar publicación",
      message: "¿Eliminar esta publicación? Esta acción no se puede deshacer.",
      confirmText: "Eliminar",
      danger: true
    });
    if (!ok) return;
    setDeleting(true);
    setActionError("");
    try {
      await deletePost(post._id);
      removePostEverywhere(queryClient, post._id);
      navigate("/home");
    } catch (requestError) {
      const status = requestError.response?.status;
      if (status === 403) setActionError("No tienes permisos para eliminar esta publicación.");
      else if (status === 404) setActionError("Publicación no encontrada.");
      else setActionError(requestError.response?.data?.error || "No se pudo eliminar la publicación.");
    } finally {
      setDeleting(false);
    }
  }

  function handleFocusComments() {
    commentsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    commentsRef.current?.querySelector("textarea")?.focus();
  }

  async function handleShare(targetPost = post) {
    if (!targetPost?._id) return;
    const url = publicAppUrl(`/post/${targetPost._id}`);
    try {
      if (navigator.share) await navigator.share({ title: "Publicación en Kronos", text: targetPost.content || "Publicación en Kronos", url });
      else {
        await navigator.clipboard.writeText(url);
        showToast("Enlace copiado", { tone: "success" });
      }
    } catch (shareError) {
      if (shareError.name !== "AbortError") setActionError("No se pudo compartir la publicación.");
    }
  }

  async function handleHide() {
    if (!post?._id || hiding) return;
    setHiding(true);
    setActionError("");
    try {
      await hidePost(post._id);
      navigate("/home");
    } catch (requestError) {
      setActionError(requestError.response?.data?.error || "No se pudo ocultar la publicación.");
    } finally {
      setHiding(false);
    }
  }

  async function handleMute(author) {
    if (!author?._id) return;
    setActionError("");
    try {
      await muteUser(author._id);
      navigate("/home");
    } catch (requestError) {
      setActionError(requestError.response?.data?.error || "No se pudo silenciar al usuario.");
    }
  }

  async function handleBlock(author) {
    if (!author?._id) return;
    const ok = await confirm({
      title: `Bloquear a @${author.username || "usuario"}`,
      message: `¿Deseas bloquear a @${author.username || "usuario"}? Dejarán de verse y no podrán interactuar.`,
      confirmText: "Bloquear",
      danger: true
    });
    if (!ok) return;
    setActionError("");
    try {
      await blockUser(author._id);
      navigate("/home");
    } catch (requestError) {
      setActionError(requestError.response?.data?.error || "No se pudo bloquear al usuario.");
    }
  }

  if (loading) {
    return (
      <section className="page">
        <div className="k-surface k-feed-state">
          <span className="k-skeleton" />
          <span className="k-skeleton k-skeleton-wide" />
        </div>
      </section>
    );
  }

  if (!post) {
    return (
      <section className="page">
        <p role="alert" className="k-state k-state-error">
          {error || "Publicación no encontrada."}
        </p>
        <Link className="k-button k-button-secondary" to="/home">
          Volver al inicio
        </Link>
      </section>
    );
  }

  const comments = Array.isArray(post.comments) ? post.comments : [];

  return (
    <section className="page post-detail-page">
      {error && (
        <p role="alert" className="k-state k-state-error" style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
          <span>{error}</span>
          <button type="button" onClick={() => setActionError("")} style={{ background: "transparent", border: 0, color: "inherit" }}>
            ×
          </button>
        </p>
      )}

      <ReportDialog
        open={Boolean(reportTarget)}
        targetType="post"
        targetId={reportTarget?._id}
        targetLabel={reportTarget?.author?.username ? `la publicación de @${reportTarget.author.username}` : ""}
        onClose={() => setReportTarget(null)}
      />

      <article className="k-post k-post-detail">
        <header className="k-post-header">
          <Link className="k-avatar" to={post.author?.username ? `/profile/${post.author.username}` : "/profile"}>
            {post.author?.displayName?.slice(0, 1) || "K"}
          </Link>
          <div className="k-post-header-copy">
            <Link className="k-post-author" to={post.author?.username ? `/profile/${post.author.username}` : "/profile"}>
              {post.author?.displayName || post.author?.username || "Usuario"}
            </Link>
            <p className="k-muted">
              @{post.author?.username || "kronos"} · {formatDate(post.createdAt)}
            </p>
          </div>
        </header>

        {post.repostOf && (
          <div className="k-post-repost">
            <p className="k-muted">Republicado de @{post.repostOf.author?.username || "usuario"}</p>
            {post.repostOf.content && <p>{post.repostOf.content}</p>}
            <PostMedia media={post.repostOf.media} mediaItems={post.repostOf.mediaItems} content={post.repostOf.content} compact />
          </div>
        )}

        {editing ? (
          <div className="k-post-edit-panel">
            <textarea
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              maxLength={5000}
              aria-label="Editar publicación"
            />
            {post.media?.url && (
              <label className="k-post-alt-editor">
                Texto alternativo
                <input type="text" value={editAlt} onChange={(e) => setEditAlt(e.target.value)} maxLength={500} placeholder="Alt de la imagen" />
              </label>
            )}
            <div className="k-post-edit-footer">
              <span className="k-muted">{editValue.length}/5000</span>
              <button type="button" className="k-button k-button-primary" onClick={handleEdit} disabled={saving || (!editValue.trim() && !post.media?.url)}>
                {saving ? "Guardando..." : "Guardar cambios"}
              </button>
            </div>
          </div>
        ) : (
          <>
            {post.content ? (
              <div className="k-post-content">
                <p>{post.content}</p>
              </div>
            ) : (
              <div className="k-post-content k-post-content-empty">
                <p className="k-muted">Publicación con multimedia</p>
              </div>
            )}
            <PostMedia media={post.media} mediaItems={post.mediaItems} content={post.content} />
            {post.hashtags?.length > 0 && (
              <div className="k-hashtag-list k-post-hashtags" aria-label="Temas de la publicación">
                {post.hashtags.map((tag) => (
                  <Link key={tag} to={`/explore?q=${encodeURIComponent(`#${tag}`)}`}>#{tag}</Link>
                ))}
              </div>
            )}
          </>
        )}

        <PostActions
          post={post}
          commentsCount={comments.length}
          isOwn={isOwn}
          editing={editing}
          onReact={handleReaction}
          onToggleComments={handleFocusComments}
          onShare={handleShare}
          onSave={handleSave}
          onRepost={handleRepost}
          onToggleEdit={() => setEditing((value) => !value)}
          onDelete={handleDelete}
          onHide={handleHide}
          onReport={(item) => setReportTarget(item)}
          onMute={isOwn ? undefined : handleMute}
          onBlock={isOwn ? undefined : handleBlock}
          liking={liking ? post._id : ""}
          saving={savingPost ? post._id : ""}
          reposting={reposting ? post._id : ""}
          hiding={hiding ? post._id : ""}
        />
      </article>

      <div ref={commentsRef}>
        <Comments postId={post._id} comments={comments} commentThreads={post.commentThreads} onCommentCreated={setPost} postAuthorId={post.author?._id || post.author} />
      </div>
    </section>
  );
}
