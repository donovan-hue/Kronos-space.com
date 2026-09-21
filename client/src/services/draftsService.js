import { api } from "./apiClient";

/**
 * KRONOS-UI-014 — borradores del composer.
 * Los borradores siempre son del usuario autenticado: el cliente nunca
 * envía un `userId` para elegir dueño.
 */

function normalizeMedia(media) {
  if (!media?.url) return null;
  return {
    url: media.url,
    type: media.type === "video" ? "video" : "image",
    mimeType: media.mimeType || "",
    size: media.size || 0,
    alt: typeof media.alt === "string" ? media.alt.trim().slice(0, 500) : "",
    posterUrl: media.type === "video" && typeof media.posterUrl === "string" ? media.posterUrl.trim().slice(0, 2000) : ""
  };
}

function normalizeMediaItems(mediaItems) {
  const rawItems = Array.isArray(mediaItems) ? mediaItems.filter((item) => item?.url) : [];
  if (rawItems.length > 4) throw new Error("El carrusel no puede superar 4 imágenes");
  if (rawItems.some((item) => item.type === "video" || String(item.mimeType || "").startsWith("video/"))) {
    throw new Error("El carrusel solo acepta imágenes");
  }
  return rawItems.map((item) => ({
    url: item.url,
    type: "image",
    mimeType: item.mimeType || "",
    size: item.size || 0,
    alt: typeof item.alt === "string" ? item.alt.trim().slice(0, 500) : ""
  }));
}

function buildPayload({ content, media, mediaItems }) {
  const value = typeof content === "string" ? content.trim() : "";

  if (value.length > 5000) {
    throw new Error("El borrador no puede superar 5000 caracteres");
  }

  const payload = { content: value };
  const normalizedItems = normalizeMediaItems(mediaItems);
  if (normalizedItems.length) {
    payload.mediaItems = normalizedItems;
    payload.media = normalizedItems[0];
  } else {
    const normalizedMedia = normalizeMedia(media);
    if (normalizedMedia) payload.media = normalizedMedia;
  }

  if (!payload.content && !payload.media && !payload.mediaItems?.length) {
    throw new Error("El borrador no puede quedar vacío");
  }

  return payload;
}

export async function getDrafts({ page = 1, limit = 20 } = {}) {
  const { data } = await api.get("/drafts", { params: { page, limit } });

  return data;
}

export async function createDraft({ content, media, mediaItems = [] } = {}) {
  const { data } = await api.post("/drafts", buildPayload({ content, media, mediaItems }));

  return data.draft;
}

export async function updateDraft(draftId, { content, media, mediaItems = [] } = {}) {
  const { data } = await api.patch(`/drafts/${draftId}`, buildPayload({ content, media, mediaItems }));

  return data.draft;
}

export async function deleteDraft(draftId) {
  const { data } = await api.delete(`/drafts/${draftId}`);

  return data;
}
