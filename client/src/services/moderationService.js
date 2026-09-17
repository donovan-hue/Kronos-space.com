import { api } from "./apiClient";

/**
 * KRONOS-UI-011 — moderación desde el cliente.
 * Screen -> Component -> Service -> API -> Backend -> DB
 */

export const REPORT_REASONS = [
  { value: "spam", label: "Spam o contenido repetido" },
  { value: "harassment", label: "Acoso o intimidación" },
  { value: "hate", label: "Discurso de odio" },
  { value: "sexual", label: "Contenido sexual" },
  { value: "violence", label: "Violencia" },
  { value: "self_harm", label: "Autolesión" },
  { value: "misinformation", label: "Información falsa" },
  { value: "other", label: "Otro motivo" }
];

export async function getModerationOverview() {
  const { data } = await api.get("/moderation/overview");

  return data; // { blocks, mutes, hidden, reports, isModerator }
}

export async function getBlockedUsers() {
  const { data } = await api.get("/moderation/blocks");

  return data;
}

export async function blockUser(userId) {
  const { data } = await api.post(`/moderation/blocks/${userId}`);

  return data;
}

export async function unblockUser(userId) {
  const { data } = await api.delete(`/moderation/blocks/${userId}`);

  return data;
}

export async function getMutedUsers() {
  const { data } = await api.get("/moderation/mutes");

  return data;
}

export async function muteUser(userId) {
  const { data } = await api.post(`/moderation/mutes/${userId}`);

  return data;
}

export async function unmuteUser(userId) {
  const { data } = await api.delete(`/moderation/mutes/${userId}`);

  return data;
}

export async function getHiddenPosts({ page = 1, limit = 20 } = {}) {
  const { data } = await api.get("/moderation/hidden", {
    params: { page, limit }
  });

  return data;
}

export async function hidePost(postId) {
  const { data } = await api.post(`/moderation/hidden/${postId}`);

  return data;
}

export async function unhidePost(postId) {
  const { data } = await api.delete(`/moderation/hidden/${postId}`);

  return data;
}

export async function createReport({ targetType, targetId, reason, details = "" }) {
  if (!["user", "post", "comment"].includes(targetType)) {
    throw new Error("Tipo de reporte no válido");
  }

  if (!REPORT_REASONS.some((item) => item.value === reason)) {
    throw new Error("Selecciona un motivo del reporte");
  }

  const { data } = await api.post("/moderation/reports", {
    targetType,
    targetId,
    reason,
    details: String(details || "").trim().slice(0, 1000)
  });

  return data.report;
}

export async function getMyReports({ page = 1, limit = 20 } = {}) {
  const { data } = await api.get("/moderation/reports", {
    params: { page, limit }
  });

  return data;
}

export async function getReportQueue({ status = "", page = 1, limit = 20 } = {}) {
  const { data } = await api.get("/moderation/reports/queue", {
    params: status ? { status, page, limit } : { page, limit }
  });

  return data;
}

export async function updateReport(reportId, { status, resolutionNote = "" }) {
  const { data } = await api.patch(`/moderation/reports/${reportId}`, {
    status,
    resolutionNote
  });

  return data.report;
}

export async function hidePostAsModerator(postId, reason = "") {
  const { data } = await api.post(`/moderation/posts/${postId}/hide`, {
    reason
  });

  return data;
}

export async function restorePostAsModerator(postId) {
  const { data } = await api.delete(`/moderation/posts/${postId}/hide`);

  return data;
}
