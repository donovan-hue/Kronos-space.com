const express = require("express");
const mongoose = require("mongoose");
const LiveRoom = require("./LiveRoom");
const User = require("../users/User");
const auth = require("../../middleware/auth");
const { requireUser } = require("../../middleware/permissions");
const moderation = require("../moderation/moderation.service");
const {
  joinDecision,
  canViewLiveRoom,
  leaveDecision,
  roomCapacity
} = require("./live.access");

const router = express.Router();

function normalizeLiveRoom(room) {
  if (!room) return null;
  return {
    _id: room._id,
    title: room.title,
    description: room.description || "",
    type: room.type || "audio",
    status: room.status,
    host: room.host && typeof room.host === "object" ? {
      _id: room.host._id,
      username: room.host.username,
      displayName: room.host.displayName,
      avatar: room.host.avatar
    } : room.host,
    participantsCount: Array.isArray(room.participants) ? room.participants.length : 0,
    viewersCount: room.viewersCount || 0,
    isPublic: room.isPublic !== false,
    startedAt: room.startedAt,
    endedAt: room.endedAt
  };
}

/**
 * POST /api/live/rooms
 * Crea una nueva sala de transmisión en vivo (audio/video/screen)
 */
router.post("/rooms", auth, requireUser, async (req, res) => {
  try {
    const { title, description, type, isPublic, maxParticipants } = req.body;

    if (!title || typeof title !== "string" || !title.trim()) {
      return res.status(400).json({ error: "El título de la sala en vivo es obligatorio" });
    }

    const cleanTitle = title.trim();
    if (cleanTitle.length > 120) {
      return res.status(400).json({ error: "El título no puede exceder 120 caracteres" });
    }

    const cleanType = ["audio", "video", "screen"].includes(type) ? type : "audio";

    // Si el usuario ya tiene una sala activa, la cerramos y avisamos a
    // quien estaba dentro. No se anuncia el id en el canal global.
    const previous = await LiveRoom.find({ host: req.user.id, status: "active" })
      .select("_id participants.user")
      .lean();
    await LiveRoom.updateMany(
      { host: req.user.id, status: "active" },
      { $set: { status: "ended", endedAt: new Date() } }
    );
    const ioBefore = req.app.get("io");
    if (ioBefore) {
      for (const previousRoom of previous) {
        const ended = { roomId: String(previousRoom._id) };
        ioBefore.to(`live:${previousRoom._id}`).emit("live:room-ended", ended);
        ioBefore.to(`user:${req.user.id}`).emit("live:room-ended", ended);
        for (const participant of previousRoom.participants || []) {
          const participantId = participant?.user?._id || participant?.user;
          if (participantId) ioBefore.to(`user:${participantId}`).emit("live:room-ended", ended);
        }
      }
    }

    const room = await LiveRoom.create({
      title: cleanTitle,
      description: typeof description === "string" ? description.trim().slice(0, 500) : "",
      type: cleanType,
      host: req.user.id,
      status: "active",
      isPublic: isPublic !== false,
      maxParticipants: Number.isInteger(maxParticipants) && maxParticipants > 0 ? Math.min(maxParticipants, 500) : 100,
      participants: [{ user: req.user.id, role: "host", joinedAt: new Date() }],
      viewersCount: 1,
      startedAt: new Date()
    });

    const populated = await LiveRoom.findById(room._id)
      .populate("host", "_id username displayName avatar")
      .lean();

    const io = req.app.get("io");
    if (io) {
      const started = normalizeLiveRoom(populated);
      // Una sala privada no se anuncia a toda la plataforma: el id bastaba
      // para intentar entrar. Solo la oye el anfitrión.
      if (populated.isPublic === false) {
        io.to(`user:${req.user.id}`).emit("live:room-started", started);
      } else {
        io.emit("live:room-started", started);
      }
    }

    return res.status(201).json({ room: normalizeLiveRoom(populated) });
  } catch (error) {
    console.error("CREATE_LIVE_ROOM_ERROR:", error);
    return res.status(500).json({ error: "Error creando sala en vivo" });
  }
});

/**
 * GET /api/live/rooms
 * Obtiene las salas en vivo activas
 */
router.get("/rooms", async (req, res) => {
  try {
    const rooms = await LiveRoom.find({ status: "active", isPublic: true })
      .sort({ startedAt: -1 })
      .limit(30)
      .populate("host", "_id username displayName avatar")
      .lean();

    return res.json({
      rooms: rooms.map(normalizeLiveRoom),
      total: rooms.length
    });
  } catch (error) {
    console.error("GET_LIVE_ROOMS_ERROR:", error);
    return res.status(500).json({ error: "Error obteniendo salas en vivo" });
  }
});

/**
 * GET /api/live/rooms/mine
 * Salas activas del usuario, incluidas las privadas a las que fue invitado.
 * Tiene que declararse antes de /rooms/:id.
 */
router.get("/rooms/mine", auth, requireUser, async (req, res) => {
  try {
    const rooms = await LiveRoom.find({
      status: "active",
      $or: [{ host: req.user.id }, { "participants.user": req.user.id }]
    })
      .sort({ startedAt: -1 })
      .limit(30)
      .populate("host", "_id username displayName avatar")
      .lean();

    return res.json({
      rooms: rooms.map(normalizeLiveRoom),
      total: rooms.length
    });
  } catch (error) {
    console.error("GET_MY_LIVE_ROOMS_ERROR:", error);
    return res.status(500).json({ error: "Error obteniendo tus salas en vivo" });
  }
});

/**
 * GET /api/live/rooms/:id
 * Obtiene detalles de una sala específica.
 *
 * Requiere sesión: una sala privada (`isPublic: false`) solo es visible
 * para su anfitrión y sus participantes. Antes era pública y devolvía
 * título, descripción, anfitrión y participantes de cualquier sala con
 * solo conocer su identificador.
 */
router.get("/rooms/:id", auth, requireUser, async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ error: "ID de sala inválido" });
    }

    const room = await LiveRoom.findById(req.params.id)
      .populate("host", "_id username displayName avatar")
      .populate("participants.user", "_id username displayName avatar")
      .lean();

    if (!room) {
      return res.status(404).json({ error: "Sala en vivo no encontrada" });
    }

    if (!canViewLiveRoom(room, req.user.id)) {
      return res.status(404).json({ error: "Sala en vivo no encontrada" });
    }

    return res.json({ room: normalizeLiveRoom(room), participants: room.participants || [] });
  } catch (error) {
    console.error("GET_LIVE_ROOM_ERROR:", error);
    return res.status(500).json({ error: "Error obteniendo detalles de la sala" });
  }
});

/**
 * PATCH /api/live/rooms/:id/join
 * Unirse a la sala en vivo
 */
router.patch("/rooms/:id/join", auth, requireUser, async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ error: "ID de sala inválido" });
    }

    const room = await LiveRoom.findById(req.params.id);
    const decision = joinDecision(room, req.user.id);

    if (!decision.ok) {
      return res.status(decision.status).json({ error: decision.error, code: decision.code });
    }

    const alreadyJoined = decision.isParticipant;

    if (!alreadyJoined) {
      const updated = await LiveRoom.findOneAndUpdate(
        {
          _id: room._id,
          status: "active",
          "participants.user": { $ne: req.user.id },
          $expr: {
            $lt: [
              { $size: "$participants" },
              { $ifNull: ["$maxParticipants", 100] }
            ]
          }
        },
        {
          $push: {
            participants: { user: req.user.id, role: "listener", joinedAt: new Date() }
          },
          $inc: { viewersCount: 1 }
        },
        { new: true }
      );

      if (!updated) {
        const fresh = await LiveRoom.findById(room._id);
        const retry = joinDecision(fresh, req.user.id);

        if (retry.ok && retry.isParticipant) {
          return res.json({ joined: true, roomId: room._id, viewersCount: fresh.viewersCount, already: true });
        }

        return res.status(retry.status || 409).json({
          error: retry.error || "La sala alcanzó el máximo de participantes",
          code: retry.code || "LIVE_FULL"
        });
      }

      room.participants = updated.participants;
      room.viewersCount = updated.viewersCount;
    }

    const io = req.app.get("io");
    if (io) {
      io.to(`live:${room._id}`).emit("live:viewer-count", {
        roomId: room._id,
        viewersCount: room.viewersCount
      });
    }

    return res.json({ joined: true, roomId: room._id, viewersCount: room.viewersCount });
  } catch (error) {
    console.error("JOIN_LIVE_ROOM_ERROR:", error);
    return res.status(500).json({ error: "Error uniéndose a la sala" });
  }
});

/**
 * PATCH /api/live/rooms/:id/leave
 * Salir de la sala en vivo
 */
router.patch("/rooms/:id/leave", auth, requireUser, async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ error: "ID de sala inválido" });
    }

    const room = await LiveRoom.findById(req.params.id);
    const decision = leaveDecision(room, req.user.id);

    if (!decision.ok) {
      return res.status(decision.status).json({ error: decision.error, code: decision.code });
    }

    room.participants = room.participants.filter(
      (p) => String(p.user) !== String(req.user.id)
    );
    room.viewersCount = Math.max(0, room.participants.length);
    await room.save();

    const io = req.app.get("io");
    if (io) {
      io.to(`live:${room._id}`).emit("live:viewer-count", {
        roomId: room._id,
        viewersCount: room.viewersCount
      });
    }

    return res.json({ left: true, roomId: room._id, viewersCount: room.viewersCount });
  } catch (error) {
    console.error("LEAVE_LIVE_ROOM_ERROR:", error);
    return res.status(500).json({ error: "Error saliendo de la sala" });
  }
});

/**
 * PATCH /api/live/rooms/:id/end
 * Finalizar la sala (solo el anfitrión)
 */
router.patch("/rooms/:id/end", auth, requireUser, async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ error: "ID de sala inválido" });
    }

    const room = await LiveRoom.findById(req.params.id);
    if (!room) {
      return res.status(404).json({ error: "Sala no encontrada" });
    }

    if (String(room.host) !== String(req.user.id)) {
      return res.status(403).json({ error: "Solo el anfitrión puede finalizar la transmisión" });
    }

    room.status = "ended";
    room.endedAt = new Date();
    await room.save();

    const io = req.app.get("io");
    if (io) {
      const ended = { roomId: String(room._id) };
      io.to(`live:${room._id}`).emit("live:room-ended", ended);
      io.to(`user:${req.user.id}`).emit("live:room-ended", ended);
      for (const participant of room.participants || []) {
        const participantId = participant?.user?._id || participant?.user;
        if (participantId) io.to(`user:${participantId}`).emit("live:room-ended", ended);
      }
      if (room.isPublic !== false) io.emit("live:room-ended", ended);
    }

    return res.json({ ended: true, roomId: room._id });
  } catch (error) {
    console.error("END_LIVE_ROOM_ERROR:", error);
    return res.status(500).json({ error: "Error finalizando sala" });
  }
});


/**
 * POST /api/live/rooms/:id/invite
 * El anfitrión agrega a alguien a la sala. Es la única forma de entrar
 * a una sala privada: el id por sí solo no abre la puerta.
 */
router.post("/rooms/:id/invite", auth, requireUser, async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ error: "ID de sala inválido" });
    }

    const room = await LiveRoom.findById(req.params.id);
    if (!room || room.status !== "active") {
      return res.status(404).json({ error: "La sala no existe o ya ha finalizado" });
    }

    if (String(room.host) !== String(req.user.id)) {
      return res.status(403).json({ error: "Solo el anfitrión puede invitar", code: "LIVE_FORBIDDEN" });
    }

    const username = typeof req.body?.username === "string"
      ? req.body.username.trim().replace(/^@/, "").toLowerCase()
      : "";
    const userId = typeof req.body?.userId === "string" ? req.body.userId.trim() : "";
    let invitee = null;

    if (username) {
      if (!/^[a-z0-9_]{3,30}$/.test(username)) {
        return res.status(400).json({ error: "Nombre de usuario inválido" });
      }
      invitee = await User.findOne({ username }).select("_id username displayName").lean();
    } else if (mongoose.isValidObjectId(userId)) {
      invitee = await User.findById(userId).select("_id username displayName").lean();
    } else {
      return res.status(400).json({ error: "Indica el usuario que quieres invitar" });
    }

    if (!invitee) return res.status(404).json({ error: "Usuario no encontrado" });
    if (String(invitee._id) === String(req.user.id)) {
      return res.status(400).json({ error: "Ya estás en tu sala" });
    }
    if (await moderation.isBlockedBetween(req.user.id, invitee._id)) {
      return res.status(403).json({ error: "No puedes invitar a este usuario por un bloqueo", code: "BLOCKED_RELATION" });
    }

    const already = room.participants.some((participant) => String(participant.user) === String(invitee._id));
    if (!already && room.participants.length >= roomCapacity(room)) {
      return res.status(409).json({ error: "La sala alcanzó el máximo de participantes", code: "LIVE_FULL" });
    }

    if (!already) {
      const updated = await LiveRoom.findOneAndUpdate(
        {
          _id: room._id,
          status: "active",
          host: req.user.id,
          "participants.user": { $ne: invitee._id },
          $expr: {
            $lt: [{ $size: "$participants" }, { $ifNull: ["$maxParticipants", 100] }]
          }
        },
        {
          $push: { participants: { user: invitee._id, role: "listener", joinedAt: new Date() } },
          $inc: { viewersCount: 1 }
        },
        { new: true }
      );

      if (!updated) {
        return res.status(409).json({ error: "No se pudo invitar. La sala está llena o ya no está activa.", code: "LIVE_FULL" });
      }

      room.participants = updated.participants;
      room.viewersCount = updated.viewersCount;
    }

    const io = req.app.get("io");
    if (io) {
      io.to(`user:${invitee._id}`).emit("live:invited", {
        roomId: String(room._id),
        title: room.title,
        hostId: String(req.user.id)
      });
    }

    return res.json({
      invited: true,
      already,
      user: { _id: invitee._id, username: invitee.username, displayName: invitee.displayName || "" },
      viewersCount: room.viewersCount
    });
  } catch (error) {
    console.error("INVITE_LIVE_ROOM_ERROR:", error);
    return res.status(500).json({ error: "Error invitando a la sala" });
  }
});

module.exports = router;
