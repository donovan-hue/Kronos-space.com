import { api } from "./apiClient";

export async function getImageHistory() {
  const { data } = await api.get("/ai/images/history");
  return data;
}

export async function generateImage(payload) {
  const { data } = await api.post("/ai/images/generate", payload);
  return data;
}

export async function deleteImage(id) {
  const { data } = await api.delete(`/ai/images/${id}`);
  return data;
}

export async function getVideoHistory() {
  const { data } = await api.get("/ai/videos/history");
  return data;
}

export async function getVideoJob(id) {
  const { data } = await api.get(`/ai/videos/${id}`);
  return data;
}

export async function generateVideo(payload) {
  const { data } = await api.post("/ai/videos/generate", payload);
  return data;
}

export async function deleteVideo(id) {
  const { data } = await api.delete(`/ai/videos/${id}`);
  return data;
}

export async function getScriptHistory() {
  const { data } = await api.get("/ai/scripts/history");
  return data;
}

export async function generateScript(payload) {
  const { data } = await api.post("/ai/scripts/generate", payload);
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
