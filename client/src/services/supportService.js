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
/**
 * Identificador de intento para el apoyo: si la petición se reenvía (doble
 * clic o reintento de red), el servidor reconoce el mismo intento y no crea
 * dos apoyos. Uno por apertura del diálogo, no por clic.
 */
export function nuevoIdDeApoyo() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `apoyo-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export async function sendCreatorTip({ creatorId, amount, tier, message, anonymous, clientMessageId }) {
  const { data } = await api.post("/support/tip", {
    creatorId,
    amount,
    tier,
    message,
    anonymous,
    clientMessageId
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
