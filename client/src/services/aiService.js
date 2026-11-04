import { api } from "./apiClient";
import { getToken } from "./authStorage";

// Solo las operaciones que esperan al proveedor cambian el timeout.
// Imagen puede incluir catálogo (10s), generación (45s), descarga (45s)
// y persistencia. Guion/chat esperan hasta 45s; video hasta 30s.
// No añadir retries de generación: timeout no implica trabajo cancelado.
const AI_TIMEOUT_MS = Object.freeze({ image: 120_000, script: 60_000, video: 45_000, chat: 60_000 });

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
  }, { timeout: AI_TIMEOUT_MS.image });
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

// Solo peticiones GET en curso; no es caché de resultados ni de generaciones.
// El token evita compartir datos entre sesiones durante logout/login/refresh.
const videoStatusRequests = new Map();

/** Status polling endpoint; it refreshes the real provider job when available. */
export function getVideoJob(id) {
  const token = getToken();
  const current = videoStatusRequests.get(id);
  if (current?.token === token) return current.promise;

  const entry = { token, promise: null };
  entry.promise = api.get(`/ai/videos/${id}/status`, { timeout: AI_TIMEOUT_MS.video })
    .then(({ data }) => data)
    .finally(() => {
      // La respuesta vieja de otra sesión no puede retirar su petición nueva.
      if (videoStatusRequests.get(id) === entry) videoStatusRequests.delete(id);
    });
  videoStatusRequests.set(id, entry);
  return entry.promise;
}

export const getVideoStatus = getVideoJob;

export async function generateVideo(payload = {}) {
  const prompt = clean(payload.prompt, 4000);
  if (!prompt) throw new Error("El prompt de video es obligatorio");
  const { data } = await api.post("/ai/videos/generate", {
    prompt,
    negativePrompt: clean(payload.negativePrompt, 2000),
    style: clean(payload.style, 80)
  }, { timeout: AI_TIMEOUT_MS.video });
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
  const { data } = await api.post("/ai/scripts/generate", { ...payload, prompt }, { timeout: AI_TIMEOUT_MS.script });
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

/* ---------- Proyectos de guion ----------
   `POST /ai/scripts/projects` existía desde el principio y era la única
   llamada: se podía guardar un proyecto y nunca volver a abrirlo, porque
   listar, leer, editar, exportar y borrar no tenían cliente. */

export async function listScriptProjects() {
  const { data } = await api.get("/ai/scripts/projects");
  return Array.isArray(data?.projects) ? data.projects : [];
}

export async function getScriptProject(projectId) {
  const { data } = await api.get(`/ai/scripts/projects/${projectId}`);
  return data?.project;
}

export async function updateScriptProject(projectId, payload) {
  const { data } = await api.put(`/ai/scripts/projects/${projectId}`, payload);
  return data?.project;
}

export async function deleteScriptProject(projectId) {
  const { data } = await api.delete(`/ai/scripts/projects/${projectId}`);
  return data;
}

/**
 * Exporta el proyecto y devuelve el texto listo para descargar.
 *
 * Blob y no `transformResponse`: el servidor manda `Content-Disposition` y el
 * cuerpo en texto plano; con el parser por defecto de axios una cadena no JSON
 * se queda tal cual, pero un `.json` exportado se reinterpretaría y perdería
 * el formato original. La descarga usa el mismo camino que el resto de
 * exportaciones (`exportService.downloadDataExport`).
 */
export async function exportScriptProject(projectId, format = "txt") {
  const response = await api.get(`/ai/scripts/projects/${projectId}/export`, {
    params: { format },
    responseType: "blob"
  });
  if (format === "json") return response.data;
  return response.data.text();
}

export async function sendKairosMessage(payload) {
  const { data } = await api.post("/ai/chat", payload, { timeout: AI_TIMEOUT_MS.chat });
  return data;
}

/* ---------- Conversaciones con Kairos (chat persistente) ----------
   Sin conversación, el chat era una llamada sin memoria: al cerrar la
   pestaña se perdía todo. Estas cuatro llamadas son la única fuente del
   hilo; el cliente ya no reenvía el historial completo en cada mensaje. */

export async function listChatConversations() {
  const { data } = await api.get("/ai/chat/conversations");
  return Array.isArray(data?.conversations) ? data.conversations : [];
}

export async function createChatConversation(title = "") {
  const { data } = await api.post("/ai/chat/conversations", { title });
  return data?.conversation;
}

export async function getChatConversation(conversationId) {
  const { data } = await api.get(`/ai/chat/conversations/${conversationId}`);
  return { conversation: data?.conversation, messages: Array.isArray(data?.messages) ? data.messages : [] };
}

export async function renameChatConversation(conversationId, title) {
  const { data } = await api.patch(`/ai/chat/conversations/${conversationId}`, { title });
  return data?.conversation;
}

export async function deleteChatConversation(conversationId) {
  const { data } = await api.delete(`/ai/chat/conversations/${conversationId}`);
  return data;
}
