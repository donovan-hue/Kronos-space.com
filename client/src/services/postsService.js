import { api } from "./apiClient";
import { commentSchema, postCreateSchema } from "../schemas";

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
 * uploadMedia — sube imagen/video validado y retorna { url, type }
 * Imágenes: jpg/png/webp hasta 10MB. Videos: mp4/webm/mov hasta 50MB.
 */
export async function uploadMedia(file) {
  if (!file) throw new Error("Selecciona una imagen o video");
  const imageTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
  const videoTypes = new Set(["video/mp4", "video/webm", "video/quicktime"]);
  const isImage = imageTypes.has(file.type);
  const isVideo = videoTypes.has(file.type);
  if (!isImage && !isVideo) throw new Error("Formato no permitido. Usa imagen JPG/PNG/WebP o video MP4/WebM/MOV.");
  if (isImage && file.size > 10 * 1024 * 1024) throw new Error("La imagen no puede superar 10 MB");
  if (isVideo && file.size > 50 * 1024 * 1024) throw new Error("El video no puede superar 50 MB");
  const form = new FormData();
  form.append("media", file);
  const { data } = await api.post("/posts/media/upload", form, {
    headers: { "Content-Type": "multipart/form-data" }
  });
  if (!data?.url) throw new Error("Respuesta de upload inválida");
  return data; // { url, type, mimeType, size }
}

export async function createPost(content, { media, mediaItems = [], alt } = {}) {
  const value = typeof content === "string" ? content.trim() : "";
  const payload = { content: value };
  const rawItems = Array.isArray(mediaItems) ? mediaItems.filter((item) => item?.url) : [];
  if (rawItems.length > 4) throw new Error("El carrusel no puede superar 4 imágenes");
  if (rawItems.some((item) => item.type === "video" || String(item.mimeType || "").startsWith("video/"))) {
    throw new Error("El carrusel solo acepta imágenes");
  }
  const normalizedItems = rawItems.map((item) => ({
    url: item.url,
    type: "image",
    mimeType: item.mimeType || "",
    size: item.size || 0,
    alt: typeof item.alt === "string" ? item.alt.trim().slice(0, 500) : ""
  }));
  if (normalizedItems.length) {
    payload.mediaItems = normalizedItems;
    payload.media = normalizedItems[0];
  } else if (media && typeof media.url === "string" && media.url) {
    payload.media = {
      url: media.url,
      type: media.type === "video" ? "video" : "image",
      mimeType: media.mimeType || "",
      size: media.size || 0,
      alt: typeof alt === "string" ? alt.trim().slice(0, 500) : typeof media.alt === "string" ? media.alt.trim().slice(0, 500) : ""
    };
  } else if (typeof media === "string" && media) {
    // compat string url
    payload.media = { url: media, alt: typeof alt === "string" ? alt.trim().slice(0, 500) : "" };
  }
  // Esquema compartido (schemas/index.js): contenido ≤5000 y la regla
  // del backend "contenido o media". Mismos mensajes que siempre.
  const validated = postCreateSchema.safeParse({
    content: value,
    hasMedia: Boolean(payload.media?.url || payload.mediaItems?.length),
  });
  if (!validated.success) {
    throw new Error(validated.error.issues[0]?.message || "La publicación es inválida");
  }
  const { data } = await api.post("/posts", payload);
  return data?.post;
}

export async function updatePost(postId, content, { alt, allowEmptyContent = false } = {}) {
  const value = typeof content === "string" ? content.trim() : "";
  if (!value && !allowEmptyContent) throw new Error("La publicación está vacía");
  if (value.length > 5000) throw new Error("La publicación no puede superar 5000 caracteres");
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
  // Esquema compartido: no vacío y ≤1000 (regla del backend).
  const value = commentSchema.parse(typeof content === "string" ? content : "");
  const { data } = await api.post(`/posts/${postId}/comments`, { content: value });
  return data?.post;
}

export async function deleteComment(postId, commentId) {
  const { data } = await api.delete(`/posts/${postId}/comments/${commentId}`);
  return data?.post;
}
