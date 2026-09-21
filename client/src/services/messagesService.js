import { api } from "./apiClient";
import { API_URL } from "./apiClient";

/**
 * Kronos Social — Mensajería service (bloque 008).
 *
 * Centraliza las llamadas de mensajería 1-a-1 (contrato AUDIT-004)
 * y de grupos (KRONOS-UI-022). No reintroduce llamadas directas a
 * axios: todo sale por `api` (Bearer, renovación de sesión, timeouts).
 *
 * KRONOS-UI-021 — reintentos: cada envío lleva un `clientMessageId`
 * generado aquí. Si el reenvío llega dos veces, el backend devuelve el
 * mensaje original sin duplicarlo (200 + deduplicated).
 */

const MESSAGE_MEDIA_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

/** Genera el id de reenvío idempotente de un mensaje (021). */
export function newClientMessageId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `msg-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

// ---------- 1-a-1 (contrato AUDIT-004) ----------

export async function getConversations() {
  const { data } = await api.get("/messages");
  return data; // { conversations }
}

export async function getMessages(userId) {
  const { data } = await api.get(`/messages/${userId}`);
  return data; // { messages, online, user }
}

/**
 * Envía un mensaje 1-a-1. `payload: { text, media?, clientMessageId? }`.
 * El composer genera el `clientMessageId` una vez por mensaje y lo
 * reutiliza en cada reintento: el backend deduplica por ese id (021).
 * Devuelve `{ message, deduplicated }` del backend.
 */
export async function sendMessage(userId, payload) {
  const body = {
    text: typeof payload.text === "string" ? payload.text.trim() : "",
    clientMessageId:
      typeof payload.clientMessageId === "string" && payload.clientMessageId
        ? payload.clientMessageId
        : newClientMessageId()
  };

  if (payload.media && typeof payload.media.url === "string" && payload.media.url) {
    body.media = {
      url: payload.media.url,
      mimeType: payload.media.mimeType,
      size: payload.media.size,
      alt: typeof payload.media.alt === "string" ? payload.media.alt : ""
    };
  }

  const { data } = await api.post(`/messages/${userId}`, body);
  return data;
}

export async function markMessagesRead(userId) {
  const { data } = await api.patch(`/messages/${userId}/read`);
  return data;
}

/** 021 — el cliente lo invoca al abrir la conversación. */
export async function markMessagesDelivered(userId) {
  const { data } = await api.patch(`/messages/${userId}/delivered`);
  return data;
}

/** 019 — upload de adjuntos (mismo contrato que el de posts, AUDIT-005). */
export async function uploadMessageMedia(file) {
  if (!file) throw new Error("Selecciona una imagen");
  if (!MESSAGE_MEDIA_TYPES.has(file.type)) {
    throw new Error("Formato no permitido. Usa JPG, PNG o WebP.");
  }
  if (file.size > 10 * 1024 * 1024) {
    throw new Error("La imagen no puede superar 10 MB");
  }
  const form = new FormData();
  form.append("media", file);
  const { data } = await api.post("/messages/media/upload", form, {
    headers: { "Content-Type": "multipart/form-data" }
  });
  if (!data?.url) throw new Error("Respuesta de upload inválida");
  return data; // { url, mimeType, size }
}

// ---------- Grupos (KRONOS-UI-022) ----------

export async function listGroups() {
  const { data } = await api.get("/conversations");
  return data; // { conversations }
}

export async function createGroup({ name = "", memberIds = [] } = {}) {
  const { data } = await api.post("/conversations", {
    name,
    memberIds
  });
  return data; // { conversation }
}

export async function getGroup(conversationId) {
  const { data } = await api.get(`/conversations/${conversationId}/messages`);
  return data; // { conversation, messages }
}

export async function sendGroupMessage(conversationId, payload) {
  const body = {
    text: typeof payload.text === "string" ? payload.text.trim() : "",
    clientMessageId:
      typeof payload.clientMessageId === "string" && payload.clientMessageId
        ? payload.clientMessageId
        : newClientMessageId()
  };

  if (payload.media && typeof payload.media.url === "string" && payload.media.url) {
    body.media = {
      url: payload.media.url,
      mimeType: payload.media.mimeType,
      size: payload.media.size,
      alt: typeof payload.media.alt === "string" ? payload.media.alt : ""
    };
  }

  const { data } = await api.post(`/conversations/${conversationId}/messages`, body);
  return data;
}

/** 022 — marca leídos los mensajes de los demás (readBy). */
export async function markGroupRead(conversationId) {
  const { data } = await api.patch(`/conversations/${conversationId}/read`);
  return data;
}

export async function updateGroupMembers(conversationId, { add = [], remove = [] } = {}) {
  const { data } = await api.patch(`/conversations/${conversationId}/members`, {
    add,
    remove
  });
  return data;
}

export async function deleteGroup(conversationId) {
  const { data } = await api.delete(`/conversations/${conversationId}`);
  return data;
}

/** Resuelve la URL pública de un upload relativo (/uploads/...). */
export function resolveMediaUrl(url) {
  if (typeof url !== "string" || !url) return "";
  if (/^https?:\/\//.test(url) || url.startsWith("data:")) return url;
  return `${API_URL.replace(/\/api$/, "")}${url}`;
}
