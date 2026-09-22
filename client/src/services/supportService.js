import { api } from "./apiClient";

/**
 * Obtiene métricas y niveles de apoyo de un creador
 */
export async function getCreatorSupport(userId) {
  const { data } = await api.get(`/support/creator/${userId}`);
  return data;
}

/**
 * Envía apoyo/propina cósmica a un creador
 */
export async function sendCreatorTip({ creatorId, amount, tier, message, anonymous }) {
  const { data } = await api.post("/support/tip", {
    creatorId,
    amount,
    tier,
    message,
    anonymous
  });
  return data;
}

/**
 * Obtiene historial de apoyos recibidos o enviados
 */
export async function getSupportHistory(role = "received") {
  const { data } = await api.get(`/support/history?role=${role}`);
  return data;
}
