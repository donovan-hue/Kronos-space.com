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

export async function getMyStoryArchive() {
  const { data } = await api.get("/stories/me/archive");
  return data?.stories || [];
}
