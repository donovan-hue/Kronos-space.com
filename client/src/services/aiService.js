import { api } from "./apiClient";

function clean(value, max) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export async function generateImage({ prompt, negativePrompt = "", style = "" }) {
  const value = clean(prompt, 4000);
  if (!value) throw new Error("El prompt de imagen es obligatorio");
  const { data } = await api.post("/ai/images/generate", {
    prompt: value,
    negativePrompt: clean(negativePrompt, 2000),
    style: clean(style, 80)
  });
  return data;
}

export async function getImageHistory() {
  const { data } = await api.get("/ai/images/history");
  return data;
}

export async function deleteImageGeneration(id) {
  const { data } = await api.delete(`/ai/images/${id}`);
  return data;
}

export async function generateVideo({ prompt, negativePrompt = "", style = "" }) {
  const value = clean(prompt, 4000);
  if (!value) throw new Error("El prompt de video es obligatorio");
  const { data } = await api.post("/ai/videos/generate", {
    prompt: value,
    negativePrompt: clean(negativePrompt, 2000),
    style: clean(style, 80)
  });
  return data;
}

export async function getVideoHistory() {
  const { data } = await api.get("/ai/videos/history");
  return data;
}

export async function getVideoStatus(id) {
  const { data } = await api.get(`/ai/videos/${id}/status`);
  return data;
}

export async function deleteVideoGeneration(id) {
  const { data } = await api.delete(`/ai/videos/${id}`);
  return data;
}

export async function generateScript(payload) {
  const value = clean(payload?.prompt, 10000);
  if (!value) throw new Error("El prompt del guion es obligatorio");
  const { data } = await api.post("/ai/scripts/generate", {
    ...payload,
    prompt: value
  });
  return data;
}

export async function getScriptHistory() {
  const { data } = await api.get("/ai/scripts/history");
  return data;
}

export async function updateScript(id, structure) {
  const { data } = await api.put(`/ai/scripts/${id}`, { structure });
  return data;
}

export async function deleteScript(id) {
  const { data } = await api.delete(`/ai/scripts/${id}`);
  return data;
}

export async function createScriptProject(payload) {
  const { data } = await api.post("/ai/scripts/projects", payload);
  return data;
}

export async function getScriptProjects() {
  const { data } = await api.get("/ai/scripts/projects");
  return data;
}

export async function updateScriptProject(id, payload) {
  const { data } = await api.put(`/ai/scripts/projects/${id}`, payload);
  return data;
}

export async function deleteScriptProject(id) {
  const { data } = await api.delete(`/ai/scripts/projects/${id}`);
  return data;
}
