import { api } from "./apiClient";

function clean(value, max) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export async function getImageHistory() {
  const { data } = await api.get("/ai/images/history");
  return data;
}

export async function generateImage(payload = {}) {
  const prompt = clean(payload.prompt, 4000);
  if (!prompt) throw new Error("El prompt de imagen es obligatorio");
  const { data } = await api.post("/ai/images/generate", {
    prompt,
    negativePrompt: clean(payload.negativePrompt, 2000),
    style: payload.style || "cinematic"
  });
  return data;
}

export async function deleteImage(id) {
  const { data } = await api.delete(`/ai/images/${id}`);
  return data;
}

export const deleteImageGeneration = deleteImage;

export async function getVideoHistory() {
  const { data } = await api.get("/ai/videos/history");
  return data;
}

/** Status polling endpoint; it refreshes the real provider job when available. */
export async function getVideoJob(id) {
  const { data } = await api.get(`/ai/videos/${id}/status`);
  return data;
}

export const getVideoStatus = getVideoJob;

export async function generateVideo(payload = {}) {
  const prompt = clean(payload.prompt, 4000);
  if (!prompt) throw new Error("El prompt de video es obligatorio");
  const { data } = await api.post("/ai/videos/generate", {
    prompt,
    negativePrompt: clean(payload.negativePrompt, 2000),
    style: clean(payload.style, 80)
  });
  return data;
}

export async function deleteVideo(id) {
  const { data } = await api.delete(`/ai/videos/${id}`);
  return data;
}

export const deleteVideoGeneration = deleteVideo;

export async function getScriptHistory() {
  const { data } = await api.get("/ai/scripts/history");
  return data;
}

export async function generateScript(payload = {}) {
  const prompt = clean(payload.prompt, 10000);
  if (!prompt) throw new Error("El prompt del guion es obligatorio");
  const { data } = await api.post("/ai/scripts/generate", { ...payload, prompt });
  return data;
}

export async function deleteScript(id) {
  const { data } = await api.delete(`/ai/scripts/${id}`);
  return data;
}

export async function updateScript(id, structure) {
  const { data } = await api.put(`/ai/scripts/${id}`, { structure });
  return data.script;
}

export async function createScriptProject(payload) {
  const { data } = await api.post("/ai/scripts/projects", payload);
  return data.project;
}

export async function sendKairosMessage(payload) {
  const { data } = await api.post("/ai/chat", payload);
  return data;
}
