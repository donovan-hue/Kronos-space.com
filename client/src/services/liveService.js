import { api } from "./apiClient";

/**
 * Obtiene salas en vivo activas
 */
export async function getLiveRooms() {
  const { data } = await api.get("/live/rooms");
  return data;
}

/**
 * Obtiene detalles de una sala en vivo
 */
export async function getLiveRoomById(roomId) {
  const { data } = await api.get(`/live/rooms/${roomId}`);
  return data;
}

/**
 * Crea una nueva sala en vivo
 */
export async function createLiveRoom({ title, description, type = "audio", isPublic = true }) {
  const { data } = await api.post("/live/rooms", {
    title,
    description,
    type,
    isPublic
  });
  return data;
}

/**
 * Unirse a una sala en vivo
 */
export async function joinLiveRoom(roomId) {
  const { data } = await api.patch(`/live/rooms/${roomId}/join`);
  return data;
}

/**
 * Salir de una sala en vivo
 */
export async function leaveLiveRoom(roomId) {
  const { data } = await api.patch(`/live/rooms/${roomId}/leave`);
  return data;
}

/**
 * Finalizar una sala en vivo (anfitrión)
 */
export async function endLiveRoom(roomId) {
  const { data } = await api.patch(`/live/rooms/${roomId}/end`);
  return data;
}
