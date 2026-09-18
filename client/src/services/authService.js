import { api } from "./apiClient";

export async function getSessions() {
  const { data } = await api.get("/auth/sessions");
  return Array.isArray(data?.sessions) ? data.sessions : [];
}

export async function revokeSession(sessionId) {
  const { data } = await api.delete(`/auth/sessions/${sessionId}`);
  return data;
}

export async function revokeOtherSessions() {
  const { data } = await api.delete("/auth/sessions", { data: { exceptCurrent: true } });
  return data;
}
