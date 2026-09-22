import { api } from "./apiClient";
import { commentSchema, postCreateSchema } from "../schemas";

/**
 * Kronos Social — Posts Service
 * Arquitectura: Screen -> Component -> Hook -> Service -> API -> Backend -> DB
 * Centraliza todas las llamadas de publicaciones/comentarios/reacciones/media/save/repost — AUDIT-005
 */

export async function getFeed({ page = 1, limit = 20, orbitId = "" } = {}) {
  const params = { page, limit };
  if (orbitId) params.orbitId = orbitId;
  const { data } = await api.get("/posts", { params });
  return data;
}

export async function getFeedByRoute({ page = 1, limit = 20 } = {}) {
  const { data } = await api.get("/posts/feed", { params: { page, limit } });
  return data;
}

/** VERTICAL — feed opcional de video vertical (Fase 3). */
export async function getVerticalFeed({ page = 1, limit = 10 } = {}) {
  const { data } = await api.get("/posts/vertical", { params: { page, limit } });
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

export async function getPostsByHashtag(tag, { page = 1, limit = 20 } = {}) {
  const value = String(tag || "").trim().replace(/^#/, "");
  if (!value) throw new Error("El hashtag es obligatorio");
  const { data } = await api.get(`/posts/topic/${encodeURIComponent(value)}`, { params: { page, limit } });
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
  // No fijar Content-Type: el navegador genera `multipart/form-data` con su
  // `boundary`. Fijarlo a mano rompe el parseo en multer ("Boundary not found").
  const { data } = await api.post("/posts/media/upload", form);
  if (!data?.url) throw new Error("Respuesta de upload inválida");
  return data; // { url, type, mimeType, size }
}

function normalizeAudiencePayload(audience) {
  if (audience && typeof audience === "object" && audience.type === "circle") {
    return { type: "circle", circleId: String(audience.circleId || "") };
  }
  if (audience && typeof audience === "object" && audience.type === "orbit") {
    return { type: "orbit", orbitId: String(audience.orbitId || "") };
  }
  if (typeof audience === "string" && audience.startsWith("circle:")) {
    return { type: "circle", circleId: audience.slice("circle:".length) };
  }
  if (typeof audience === "string" && audience.startsWith("orbit:")) {
    return { type: "orbit", orbitId: audience.slice("orbit:".length) };
  }
  return { type: typeof audience === "string" ? audience : "public" };
}

function normalizeEventPayload(event) {
  if (!event) return null;
  const title = typeof event.title === "string" ? event.title.trim() : "";
  const description = typeof event.description === "string" ? event.description.trim() : "";
  const locationType = event.locationType === "in_person" ? "in_person" : event.locationType === "online" ? "online" : "";
  const location = typeof event.location === "string" ? event.location.trim() : "";
  if (!title || title.length > 160 || description.length > 1000 || !event.startsAt || !locationType || location.length > 300 || (locationType === "in_person" && !location)) {
    throw new Error("El evento necesita título, fecha y datos válidos");
  }
  return {
    title,
    description,
    startsAt: event.startsAt,
    endsAt: event.endsAt || null,
    timezone: typeof event.timezone === "string" && event.timezone.trim() ? event.timezone.trim().slice(0, 64) : "UTC",
    locationType,
    location
  };
}

export async function createPost(content, { media, mediaItems = [], alt, audience = "public", posterUrl = "", poll = null, event = null, lineage = null } = {}) {
  const value = typeof content === "string" ? content.trim() : "";
  const payload = { content: value, audience: normalizeAudiencePayload(audience) };
  if (poll) {
    const question = typeof poll.question === "string" ? poll.question.trim() : "";
    const options = Array.isArray(poll.options) ? [...new Set(poll.options.map((option) => {
      if (typeof option === "string") return option.trim();
      return typeof option?.text === "string" ? option.text.trim() : "";
    }).filter(Boolean))] : [];
    if (!question || question.length > 200 || options.length < 2 || options.length > 6 || options.some((option) => option.length > 120)) {
      throw new Error("La encuesta necesita una pregunta y entre 2 y 6 opciones válidas");
    }
    payload.poll = { question, options };
    if (poll.closesAt) payload.poll.closesAt = poll.closesAt;
  }
  const normalizedEvent = normalizeEventPayload(event);
  if (normalizedEvent) payload.event = normalizedEvent;
  // Fase 7 — linaje: los flujos de Kairos declaran su herramienta. El
  // servidor solo acepta tool + aiGenerated (derivedFrom es del remix).
  if (lineage && typeof lineage === "object") {
    payload.lineage = { tool: lineage.tool || "", aiGenerated: lineage.aiGenerated === true };
  }
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
    alt: typeof item.alt === "string" ? item.alt.trim().slice(0, 500) : "",
    ...(item.focalPoint ? { focalPoint: { x: item.focalPoint.x, y: item.focalPoint.y } } : {})
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
      ...(media.focalPoint ? { focalPoint: { x: media.focalPoint.x, y: media.focalPoint.y } } : {}),
      alt: typeof alt === "string" ? alt.trim().slice(0, 500) : typeof media.alt === "string" ? media.alt.trim().slice(0, 500) : "",
      posterUrl: media.type === "video"
        ? (typeof posterUrl === "string" ? posterUrl.trim().slice(0, 2000) : typeof media.posterUrl === "string" ? media.posterUrl.trim().slice(0, 2000) : "")
        : ""
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
    hasPoll: Boolean(payload.poll),
    hasEvent: Boolean(payload.event),
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

export async function votePoll(postId, optionId) {
  const { data } = await api.post(`/posts/${postId}/poll/vote`, { optionId });
  return data?.post;
}

export async function rsvpEvent(postId, status) {
  const { data } = await api.post(`/posts/${postId}/event/rsvp`, { status });
  return data?.post;
}

export async function likePost(postId) {
  const { data } = await api.post(`/posts/${postId}/like`);
  return data; // compatibilidad: { postId, liked, likesCount }
}

/**
 * Persiste una reacción y la alterna si el usuario vuelve a elegir la misma.
 * `type` pertenece al catálogo público del backend.
 */
export async function reactToPost(postId, type) {
  const { data } = await api.post(`/posts/${postId}/reaction`, { type });
  return data; // { reaction, reactionCounts, reactionsCount, liked, likesCount }
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

export async function createComment(postId, content, parentCommentId = null) {
  // Esquema compartido: no vacío y ≤1000 (regla del backend).
  const value = commentSchema.parse(typeof content === "string" ? content : "");
  const payload = { content: value };
  if (parentCommentId) payload.parentCommentId = parentCommentId;
  const { data } = await api.post(`/posts/${postId}/comments`, payload);
  return data?.post;
}

export async function deleteComment(postId, commentId) {
  const { data } = await api.delete(`/posts/${postId}/comments/${commentId}`);
  return data?.post;
}

/**
 * Fase 7 — remix con atribución verificada por el servidor.
 * Devuelve la nueva publicación con lineage.derivedFrom apuntando a la
 * original y la media conservada.
 */
export async function remixPost(postId, content = "") {
  const { data } = await api.post(`/posts/${postId}/remix`, { content });
  return data?.post;
}
