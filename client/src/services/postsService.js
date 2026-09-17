import { api } from "./apiClient";

/**
 * Kronos Social — Posts Service
 * Arquitectura: Screen -> Component -> Hook -> Service -> API -> Backend -> DB
 * Centraliza todas las llamadas de publicaciones/comentarios/likes
 */

export async function getFeed({ page = 1, limit = 20 } = {}) {
  const { data } = await api.get("/posts", { params: { page, limit } });
  return data;
}

export async function getFeedByRoute({ page = 1, limit = 20 } = {}) {
  const { data } = await api.get("/posts/feed", { params: { page, limit } });
  return data;
}

export async function getPost(postId) {
  const { data } = await api.get(`/posts/${postId}`);
  return data;
}

export async function getUserPosts(userId, { page = 1, limit = 20 } = {}) {
  const { data } = await api.get(`/posts/user/${userId}`, { params: { page, limit } });
  return data;
}

export async function createPost(content) {
  const value = typeof content === "string" ? content.trim() : "";
  if (!value) throw new Error("La publicación está vacía");
  const { data } = await api.post("/posts", { content: value });
  return data?.post;
}

export async function updatePost(postId, content) {
  const value = typeof content === "string" ? content.trim() : "";
  if (!value) throw new Error("La publicación está vacía");
  const { data } = await api.patch(`/posts/${postId}`, { content: value });
  return data?.post;
}

export async function deletePost(postId) {
  const { data } = await api.delete(`/posts/${postId}`);
  return data;
}

export async function likePost(postId) {
  const { data } = await api.post(`/posts/${postId}/like`);
  return data; // { postId, liked, likesCount }
}

export async function createComment(postId, content) {
  const value = typeof content === "string" ? content.trim() : "";
  if (!value) throw new Error("El comentario está vacío");
  const { data } = await api.post(`/posts/${postId}/comments`, { content: value });
  return data?.post;
}

export async function deleteComment(postId, commentId) {
  const { data } = await api.delete(`/posts/${postId}/comments/${commentId}`);
  return data?.post;
}
