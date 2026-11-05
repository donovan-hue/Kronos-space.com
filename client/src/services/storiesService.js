import { api } from "./apiClient";

/**
 * STORIES — capa de servicio sobre `/api/stories`.
 *
 * La subida de archivos reutiliza `/api/posts/media/upload`
 * (`uploadMedia` de postsService) para no duplicar validación de
 * firma/tamaño: una historia solo referencia media ya alojada en Kronos.
 */

export async function getStoryTray() {
  const { data } = await api.get("/stories");
  return data?.groups || [];
}

export async function getStory(storyId) {
  const { data } = await api.get(`/stories/${storyId}`);
  return data?.story;
}

export async function createStory(payload) {
  const { data } = await api.post("/stories", payload);
  return data?.story;
}

export async function deleteStory(storyId) {
  const { data } = await api.delete(`/stories/${storyId}`);
  return data;
}

export async function markStoryViewed(storyId) {
  const { data } = await api.post(`/stories/${storyId}/view`);
  return data;
}

export async function getStoryViewers(storyId) {
  const { data } = await api.get(`/stories/${storyId}/views`);
  return data?.viewers || [];
}

export async function replyToStory(storyId, text) {
  const { data } = await api.post(`/stories/${storyId}/reply`, { text });
  return data;
}

export async function getStoryReplies(storyId) {
  const { data } = await api.get(`/stories/${storyId}/replies`);
  return data?.replies || [];
}

/**
 * Archivo personal de historias, por páginas.
 *
 * Antes devolvía una lista recortada sin decirlo: quien publica a diario no
 * podía llegar a las de hace un mes y no sabía si faltaban o no existían.
 * `total` solo viene en la primera página (contarlo en cada desplazamiento es
 * un recorrido completo que no cambia mientras se pagina).
 */
export async function getMyStoryArchive({ page = 1 } = {}) {
  const { data } = await api.get("/stories/me/archive", { params: { page } });
  return {
    stories: Array.isArray(data?.stories) ? data.stories : [],
    page: Number(data?.page) || page,
    total: data?.total === null || data?.total === undefined ? null : Number(data.total),
    hayMas: Boolean(data?.hayMas)
  };
}

/* ---------- Destacados (bloque 1.3) ----------
   Un destacado sobrevive a la caducidad de la historia: se guarda en el
   usuario y solo apunta a historias propias. */

export async function getStoryHighlights() {
  const { data } = await api.get("/stories/highlights");
  return Array.isArray(data?.highlights) ? data.highlights : [];
}

export async function createStoryHighlight({ title = "", storyIds = [] } = {}) {
  const ids = (Array.isArray(storyIds) ? storyIds : []).map(String).filter(Boolean);
  if (!ids.length) throw new Error("Elige al menos una historia");
  const { data } = await api.post("/stories/highlights", { title: String(title).trim().slice(0, 60), storyIds: ids });
  return data?.highlight || null;
}

export async function deleteStoryHighlight(highlightId) {
  if (!highlightId) throw new Error("Destacado no válido");
  const { data } = await api.delete(`/stories/highlights/${highlightId}`);
  return data;
}
