import { api } from "./apiClient";

/**
 * Kronos Social — Posts Service
 * Arquitectura: Screen -> Component -> Hook -> Service -> API -> Backend -> DB
 * Centraliza todas las llamadas de publicaciones/comentarios/likes/media/save/repost — AUDIT-005
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

export async function getUserPosts(userId, { page = 1, limit = 20, tab = "all" } = {}) {
  const { data } = await api.get(`/posts/user/${userId}`, { params: { page, limit, tab } });
  return data;
}

export async function getSavedPosts({ page = 1, limit = 20 } = {}) {
  const { data } = await api.get("/posts/saved", { params: { page, limit } });
  return data;
}

// ---------- MEDIA ----------
/**
 * uploadMedia — sube imagen validada (jpg/png/webp, max 10MB) y retorna { url }
 * Valida en frontend: file exists, MIME, size — KRONOS-UI-009/013
 */
export async function uploadMedia(file) {
  if (!file) throw new Error("Selecciona una imagen");
  const allowed = new Set(["image/jpeg", "image/png", "image/webp"]);
  if (!allowed.has(file.type)) throw new Error("Formato no permitido. Usa JPG, PNG o WebP.");
  if (file.size > 10 * 1024 * 1024) throw new Error("La imagen no puede superar 10 MB");
  const form = new FormData();
  form.append("media", file);
  const { data } = await api.post("/posts/media/upload", form, {
    headers: { "Content-Type": "multipart/form-data" }
  });
  if (!data?.url) throw new Error("Respuesta de upload inválida");
  return data; // { url, mimeType, size }
}

export async function createPost(content, { media, alt } = {}) {
  const value = typeof content === "string" ? content.trim() : "";
  if (!value) throw new Error("La publicación está vacía");
  if (value.length > 5000) throw new Error("La publicación no puede superar 5000 caracteres");
  const payload = { content: value };
  if (media && typeof media.url === "string" && media.url) {
    payload.media = {
      url: media.url,
      mimeType: media.mimeType || "",
      size: media.size || 0,
      alt: typeof alt === "string" ? alt.trim().slice(0, 500) : typeof media.alt === "string" ? media.alt.trim().slice(0, 500) : ""
    };
  } else if (typeof media === "string" && media) {
    // compat string url
    payload.media = { url: media, alt: typeof alt === "string" ? alt.trim().slice(0, 500) : "" };
  }
  const { data } = await api.post("/posts", payload);
  return data?.post;
}

export async function updatePost(postId, content, { alt } = {}) {
  const value = typeof content === "string" ? content.trim() : "";
  if (!value) throw new Error("La publicación está vacía");
  const payload = { content: value };
  if (typeof alt === "string") payload.mediaAlt = alt.trim().slice(0, 500);
  const { data } = await api.patch(`/posts/${postId}`, payload);
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

export async function toggleSave(postId) {
  const { data } = await api.post(`/posts/${postId}/save`);
  return data; // { postId, saved, savedCount }
}

export async function repostPost(postId, content = "") {
  const payload = {};
  if (typeof content === "string" && content.trim()) payload.content = content.trim();
  const { data } = await api.post(`/posts/${postId}/repost`, payload);
  return data?.post;
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
