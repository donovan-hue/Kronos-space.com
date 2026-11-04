import { api } from "./apiClient";

/**
 * Servidores ICE (STUN y, si el despliegue lo configura, TURN). Se piden antes
 * de abrir cada conexión porque las credenciales de TURN pueden rotar.
 * Devuelve `{ servers, hasTurn }`.
 */
export async function getLiveIceServers() {
  const { data } = await api.get("/live/ice");
  return {
    servers: Array.isArray(data?.servers) ? data.servers : [],
    hasTurn: Boolean(data?.hasTurn)
  };
}

/**
 * Obtiene salas en vivo activas
 */
export async function getLiveRooms() {
  const { data } = await api.get("/live/rooms");
  return data;
}

/** Salas activas propias o a las que ya fuiste invitado, incluidas las privadas. */
export async function getMyLiveRooms() {
  const { data } = await api.get("/live/rooms/mine");
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
export async function createLiveRoom({
  title,
  description,
  type = "audio",
  isPublic = true,
  maxParticipants
}) {
  const body = { title, description, type, isPublic };
  // El servidor topa el valor en 500; solo se envía si es un entero positivo
  // para no mandar `null` y que el tope por defecto se aplique en el servidor.
  if (Number.isInteger(maxParticipants) && maxParticipants > 0) {
    body.maxParticipants = maxParticipants;
  }
  const { data } = await api.post("/live/rooms", body);
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

/** El anfitrión agrega a alguien. Sin esta invitación una sala privada no se abre. */
export async function inviteToLiveRoom(roomId, { username, userId } = {}) {
  const { data } = await api.post(`/live/rooms/${roomId}/invite`, {
    username,
    userId
  });
  return data;
}

