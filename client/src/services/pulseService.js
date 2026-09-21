import { api } from "./apiClient";

/** PULSO (Fase 6) — sesión finita y señales más/menos de esto. */

export async function getPulseSession({ limit = 8 } = {}) {
  const { data } = await api.get("/pulse", { params: { limit } });
  return data;
}

export async function markPostSeen(postId) {
  const { data } = await api.post(`/pulse/seen/${postId}`);
  return data;
}

export async function signalPost(postId, direction) {
  const { data } = await api.post("/pulse/signal", { postId, direction });
  return data;
}

export async function getMySignals() {
  const { data } = await api.get("/pulse/signals");
  return data?.signals || [];
}
