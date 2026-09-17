import { api } from "./apiClient";

/**
 * KRONOS-UI-014 — borradores del composer.
 * Los borradores siempre son del usuario autenticado: el cliente nunca
 * envía un `userId` para elegir dueño.
 */

export async function getDrafts({ page = 1, limit = 20 } = {}) {
  const { data } = await api.get("/drafts", { params: { page, limit } });

  return data;
}

export async function createDraft({ content, media } = {}) {
  const value = typeof content === "string" ? content.trim() : "";

  if (value.length > 5000) {
    throw new Error("El borrador no puede superar 5000 caracteres");
  }

  const payload = { content: value };

  if (media && media.url) {
    payload.media = {
      url: media.url,
      mimeType: media.mimeType || "",
      size: media.size || 0,
      alt: typeof media.alt === "string" ? media.alt.trim().slice(0, 500) : ""
    };
  }

  if (!payload.content && !payload.media) {
    throw new Error("Escribe algo antes de guardar el borrador");
  }

  const { data } = await api.post("/drafts", payload);

  return data.draft;
}

export async function updateDraft(draftId, { content, media } = {}) {
  const value = typeof content === "string" ? content.trim() : "";
  const payload = { content: value };

  if (media && media.url) {
    payload.media = {
      url: media.url,
      mimeType: media.mimeType || "",
      size: media.size || 0,
      alt: typeof media.alt === "string" ? media.alt.trim().slice(0, 500) : ""
    };
  }

  if (!payload.content && !payload.media) {
    throw new Error("El borrador no puede quedar vacío");
  }

  const { data } = await api.patch(`/drafts/${draftId}`, payload);

  return data.draft;
}

export async function deleteDraft(draftId) {
  const { data } = await api.delete(`/drafts/${draftId}`);

  return data;
}
