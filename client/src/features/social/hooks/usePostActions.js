import { useCallback, useState } from "react";
import { createComment, deleteComment, deletePost, likePost, updatePost } from "../../../services/postsService";

/**
 * usePostActions — acciones sociales con validación + rollback para likes
 */
export default function usePostActions({ onPostUpdated, onPostDeleted } = {}) {
  const [liking, setLiking] = useState("");
  const [saving, setSaving] = useState("");
  const [deleting, setDeleting] = useState("");

  const handleLike = useCallback(
    async (postId, currentPosts, setPostsOrUpdater) => {
      if (!postId || liking) return;
      // Optimistic prev value
      const prev = Array.isArray(currentPosts) ? currentPosts.find((p) => String(p._id) === String(postId)) : null;
      const prevLiked = prev?.liked;
      const prevCount = prev?.likesCount ?? 0;

      setLiking(postId);
      // optimistic
      const optimisticUpdater = (items) =>
        items.map((p) =>
          String(p._id) === String(postId)
            ? { ...p, liked: !prevLiked, likesCount: prevLiked ? Math.max(0, prevCount - 1) : prevCount + 1 }
            : p
        );
      if (typeof setPostsOrUpdater === "function") {
        // allow caller to pass setPosts directly
        setPostsOrUpdater(optimisticUpdater);
      }

      try {
        const result = await likePost(postId);
        const { liked, likesCount } = result;
        if (typeof setPostsOrUpdater === "function") {
          setPostsOrUpdater((items) =>
            items.map((p) => (String(p._id) === String(postId) ? { ...p, liked: Boolean(liked), likesCount: typeof likesCount === "number" ? likesCount : p.likesCount } : p))
          );
        }
        if (typeof onPostUpdated === "function") {
          onPostUpdated(postId, { liked: Boolean(liked), likesCount });
        }
        return result;
      } catch (error) {
        // rollback
        if (typeof setPostsOrUpdater === "function") {
          setPostsOrUpdater((items) =>
            items.map((p) => (String(p._id) === String(postId) ? { ...p, liked: prevLiked, likesCount: prevCount } : p))
          );
        }
        throw error;
      } finally {
        setLiking("");
      }
    },
    [liking, onPostUpdated]
  );

  const handleEdit = useCallback(
    async (postId, content) => {
      const value = typeof content === "string" ? content.trim() : "";
      if (!value) throw new Error("La publicación está vacía");
      if (value.length > 5000) throw new Error("La publicación no puede superar 5000 caracteres");
      setSaving(postId);
      try {
        const post = await updatePost(postId, value);
        if (typeof onPostUpdated === "function") onPostUpdated(postId, post);
        return post;
      } finally {
        setSaving("");
      }
    },
    [onPostUpdated]
  );

  const handleDelete = useCallback(
    async (postId) => {
      if (!postId || deleting) return;
      setDeleting(postId);
      try {
        await deletePost(postId);
        if (typeof onPostDeleted === "function") onPostDeleted(postId);
      } finally {
        setDeleting("");
      }
    },
    [deleting, onPostDeleted]
  );

  const handleCreateComment = useCallback(
    async (postId, content) => {
      const value = typeof content === "string" ? content.trim() : "";
      if (!value) throw new Error("El comentario está vacío");
      if (value.length > 1000) throw new Error("El comentario no puede superar 1000 caracteres");
      const post = await createComment(postId, value);
      if (typeof onPostUpdated === "function") onPostUpdated(postId, post);
      return post;
    },
    [onPostUpdated]
  );

  const handleDeleteComment = useCallback(
    async (postId, commentId) => {
      const post = await deleteComment(postId, commentId);
      if (typeof onPostUpdated === "function") onPostUpdated(postId, post);
      return post;
    },
    [onPostUpdated]
  );

  return {
    liking,
    saving,
    deleting,
    handleLike,
    handleEdit,
    handleDelete,
    handleCreateComment,
    handleDeleteComment
  };
}
