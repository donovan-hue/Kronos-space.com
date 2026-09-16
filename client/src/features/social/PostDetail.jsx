
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import axios from "axios";
import Comments from "./Comments";
import { API_URL } from "../../services/apiClient";
import { getToken } from "../../services/authStorage";

const API = API_URL;

function getAuthConfig() {
  const token = getToken();

  return token
    ? {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    : {};
}

function formatDate(date) {
  if (!date) {
    return "";
  }

  try {
    return new Date(date).toLocaleString("es-MX", {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return "";
  }
}

export default function PostDetail() {
  const { id } = useParams();

  const [post, setPost] = useState(null);
  const [loading, setLoading] = useState(true);
  const [liking, setLiking] = useState(false);
  const [error, setError] = useState("");

  async function loadPost() {
    setLoading(true);
    setError("");

    try {
      const response = await axios.get(
        `${API}/posts/${id}`,
        getAuthConfig()
      );

      setPost(response.data?.post || null);
    } catch (requestError) {
      console.error(
        "KRONOS_POST_DETAIL_LOAD_ERROR:",
        requestError
      );

      setError(
        requestError.response?.data?.error ||
          "No se pudo cargar la publicación."
      );
    } finally {
      setLoading(false);
    }
  }

  async function likePost() {
    if (!post?._id || liking) {
      return;
    }

    setLiking(true);
    setError("");

    try {
      const response = await axios.post(
        `${API}/posts/${post._id}/like`,
        {},
        getAuthConfig()
      );

      setPost((currentPost) => ({
        ...currentPost,
        likesCount:
          typeof response.data?.likesCount === "number"
            ? response.data.likesCount
            : currentPost.likesCount || 0,
        liked: Boolean(response.data?.liked),
      }));
    } catch (requestError) {
      console.error(
        "KRONOS_POST_DETAIL_LIKE_ERROR:",
        requestError
      );

      setError(
        requestError.response?.data?.error ||
          "No se pudo actualizar el like."
      );
    } finally {
      setLiking(false);
    }
  }

  useEffect(() => {
    loadPost();
  }, [id]);

  if (loading) {
    return (
      <section className="page">
        <p>Cargando publicación...</p>
      </section>
    );
  }

  if (!post) {
    return (
      <section className="page">
        <p role="alert">
          {error || "Publicación no encontrada."}
        </p>

        <Link to="/">
          Volver al inicio
        </Link>
      </section>
    );
  }

  const comments = Array.isArray(post.comments)
    ? post.comments
    : [];

  return (
    <section className="page post-detail-page">
      {error && (
        <p role="alert">
          {error}
        </p>
      )}

      <article className="post-detail">
        <header className="post-detail-header">
          <div>
            <strong>
              {post.author?.displayName ||
                post.author?.username ||
                "Usuario"}
            </strong>

            {post.author?.username && (
              <span>
                @{post.author.username}
              </span>
            )}
          </div>

          <small>
            {formatDate(post.createdAt)}
          </small>
        </header>

        <div className="post-detail-content">
          <p>{post.content}</p>
        </div>

        <div className="post-actions">
          <button
            type="button"
            onClick={likePost}
            disabled={liking}
          >
            {post.liked
              ? "Ya no me gusta"
              : "Me gusta"}{" "}
            {post.likesCount || 0}
          </button>

          <span>
            Comentarios {comments.length}
          </span>
        </div>
      </article>

      <Comments
        postId={post._id}
        comments={comments}
        onCommentCreated={setPost}
      />

      <Link to="/">
        Volver al inicio
      </Link>
    </section>
  );
}


