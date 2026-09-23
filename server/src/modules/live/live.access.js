/**
 * Autorización de salas en vivo.
 *
 * Una sala privada no es "no listada": solo el anfitrión y quien ya fue
 * invitado (participante) pueden verla, unirse por HTTP o abrir el socket.
 * Conocer el id no basta. El anfitrión no puede abandonar una sala activa
 * sin finalizarla: si no, la transmisión queda viva sin quien la controla.
 */

function participantId(participant) {
  return String(participant?.user?._id || participant?.user || "");
}

function liveMembership(room, userId) {
  const id = String(userId || "");
  const hostId = String(room?.host?._id || room?.host || "");
  const isHost = Boolean(id) && hostId === id;
  const isParticipant = (room?.participants || []).some((item) => participantId(item) === id);

  return { isHost, isParticipant, hostId };
}

function roomCapacity(room) {
  return Number.isInteger(room?.maxParticipants) && room.maxParticipants > 0
    ? room.maxParticipants
    : 100;
}

function joinDecision(room, userId) {
  if (!room) {
    return {
      ok: false,
      status: 404,
      code: "LIVE_NOT_FOUND",
      error: "Sala en vivo no encontrada"
    };
  }

  if (room.status !== "active") {
    return {
      ok: false,
      status: 404,
      code: "LIVE_ENDED",
      error: "La sala no existe o ya ha finalizado"
    };
  }

  const membership = liveMembership(room, userId);

  if (room.isPublic === false && !membership.isHost && !membership.isParticipant) {
    return {
      ok: false,
      status: 403,
      code: "LIVE_FORBIDDEN",
      error: "Esta sala es privada. Solo entra quien fue invitado."
    };
  }

  if (!membership.isParticipant) {
    const count = Array.isArray(room.participants) ? room.participants.length : 0;

    if (count >= roomCapacity(room)) {
      return {
        ok: false,
        status: 409,
        code: "LIVE_FULL",
        error: "La sala alcanzó el máximo de participantes"
      };
    }
  }

  return { ok: true, status: 200, ...membership };
}

function canViewLiveRoom(room, userId) {
  if (!room) return false;
  if (room.isPublic !== false) return true;

  const { isHost, isParticipant } = liveMembership(room, userId);

  return isHost || isParticipant;
}

/**
 * Misma política que el handshake HTTP, con los códigos que el socket
 * ya promete a los clientes (LIVE_FORBIDDEN antes que LIVE_ENDED cuando
 * la sala privada no te pertenece).
 */
function socketJoinDecision(room, userId) {
  if (!room) return { ok: false, code: "LIVE_NOT_FOUND" };

  const membership = liveMembership(room, userId);

  if (room.isPublic === false && !membership.isHost && !membership.isParticipant) {
    return { ok: false, code: "LIVE_FORBIDDEN" };
  }

  if (room.status !== "active") return { ok: false, code: "LIVE_ENDED" };

  return { ok: true, ...membership };
}

function leaveDecision(room, userId) {
  if (!room) {
    return { ok: false, status: 404, code: "LIVE_NOT_FOUND", error: "Sala no encontrada" };
  }

  if (liveMembership(room, userId).isHost && room.status === "active") {
    return {
      ok: false,
      status: 400,
      code: "LIVE_HOST_MUST_END",
      error: "El anfitrión debe finalizar la transmisión para salir."
    };
  }

  return { ok: true, status: 200 };
}

module.exports = {
  participantId,
  liveMembership,
  roomCapacity,
  joinDecision,
  canViewLiveRoom,
  socketJoinDecision,
  leaveDecision
};
