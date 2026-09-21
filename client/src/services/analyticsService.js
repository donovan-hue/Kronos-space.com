import { api } from "./apiClient";

/**
 * Fase 8 — analítica privada de creador.
 */
export async function getCreatorAnalytics(days = 30) {
  const { data } = await api.get("/analytics/creator", { params: { days } });
  return data;
}
