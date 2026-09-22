const express = require("express");
const mongoose = require("mongoose");
const LiveRoom = require("./LiveRoom");
const auth = require("../../middleware/auth");
const { requireUser } = require("../../middleware/permissions");

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

    // Si el usuario ya tiene una sala activa, la cerramos automáticamente
    await LiveRoom.updateMany(
      { host: req.user.id, status: "active" },
      { $set: { status: "ended", endedAt: new Date() } }
    );

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
      io.emit("live:room-started", normalizeLiveRoom(populated));
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

    const isParticipant = (room.participants || []).some(
      (participant) => String(participant?.user?._id || participant?.user) === String(req.user.id)
    );
    const isHost = String(room.host?._id || room.host) === String(req.user.id);

    if (room.isPublic === false && !isParticipant && !isHost) {
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
    if (!room || room.status !== "active") {
      return res.status(404).json({ error: "La sala no existe o ya ha finalizado" });
    }

    const alreadyJoined = room.participants.some(
      (p) => String(p.user) === String(req.user.id)
    );

    if (!alreadyJoined) {
      room.participants.push({
        user: req.user.id,
        role: "listener",
        joinedAt: new Date()
      });
      room.viewersCount = room.participants.length;
      await room.save();
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
    if (!room) {
      return res.status(404).json({ error: "Sala no encontrada" });
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
      io.to(`live:${room._id}`).emit("live:room-ended", { roomId: room._id });
      io.emit("live:room-ended", { roomId: room._id });
    }

    return res.json({ ended: true, roomId: room._id });
  } catch (error) {
    console.error("END_LIVE_ROOM_ERROR:", error);
    return res.status(500).json({ error: "Error finalizando sala" });
  }
});

module.exports = router;
