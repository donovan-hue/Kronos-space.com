const express = require("express");
const mongoose = require("mongoose");
const LiveRoom = require("./LiveRoom");
const User = require("../users/User");
const auth = require("../../middleware/auth");
const { requireUser } = require("../../middleware/permissions");
const moderation = require("../moderation/moderation.service");
const { notifySafely } = require("../notifications/notification.service");
const {
  joinDecision,
  canViewLiveRoom,
  leaveDecision,
  roomCapacity,
  estaExpulsado
} = require("./live.access");
const { resolveIceServers } = require("../../config/iceServers");

const router = express.Router();

function normalizeLiveRoom(room, viewerId = "") {
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
    // El tope lo aceptaba el servidor desde siempre, pero la UI no sabía
    // cuál era el de cada sala: no podía avisar de que estaba llena.
    maxParticipants: roomCapacity(room),
    isPublic: room.isPublic !== false,
    startedAt: room.startedAt,
    endedAt: room.endedAt,
    // Latido y expulsiones: la UI necesita saber cuándo se considera
    // abandonada la sala y si el visitante está fuera de ella por una
    // decisión del anfitrión (bloque 1.5).
    hostHeartbeatAt: room.hostHeartbeatAt || null,
    staleAfterMs: LiveRoom.LIVE_STALE_MS,
    chatsCount: Array.isArray(room.chat) ? room.chat.length : 0,
    banned: Array.isArray(room.bans)
      ? room.bans.some((ban) => String(ban.user?._id || ban.user) === String(viewerId || ""))
      : false
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
      const started = normalizeLiveRoom(populated, req.user.id);
      // Una sala privada no se anuncia a toda la plataforma: el id bastaba
      // para intentar entrar. Solo la oye el anfitrión.
      if (populated.isPublic === false) {
        io.to(`user:${req.user.id}`).emit("live:room-started", started);
      } else {
        io.emit("live:room-started", started);
      }
    }

    return res.status(201).json({ room: normalizeLiveRoom(populated, req.user.id) });
  } catch (error) {
    console.error("CREATE_LIVE_ROOM_ERROR:", error);
    return res.status(500).json({ error: "Error creando sala en vivo" });
  }
});

/**
 * GET /api/live/ice
 * Servidores ICE para WebRTC, con credenciales de TURN si el despliegue las
 * tiene configuradas. Requiere sesión: las credenciales de TURN son un
 * recurso de infraestructura y no se reparten a cualquiera.
 *
 * `hasTurn: false` es información, no un error: la interfaz lo usa para
 * avisar de que con NAT simétrico la conexión puede no establecerse, en vez
 * de prometer una cobertura que no existe.
 */
router.get("/ice", auth, requireUser, (req, res) => {
  res.json(resolveIceServers());
});

/**
 * GET /api/live/rooms
 * Salas en vivo activas, para quien tiene sesión.
 *
 * Antes era pública (sin `auth`) y sin filtro social: devolvía título,
 * descripción y anfitrión de las salas de **cualquiera**, incluidos los
 * usuarios que te bloquearon o a quienes bloqueaste, a quien no tiene cuenta
 * y a los rastreadores. Ahora exige sesión y excluye a esos usuarios, igual
 * que el feed. Las salas privadas nunca aparecen aquí (las propias y las que
 * te invitaron salen en `/rooms/mine`).
 */
router.get("/rooms", auth, requireUser, async (req, res) => {
  try {
    const excluded = await moderation.getExcludedUserIds(req.user.id);

    const filter = { status: "active", isPublic: true };
    if (excluded.length) filter.host = { $nin: excluded };

    const rooms = await LiveRoom.find(filter)
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

    // Un bloqueo cierra la puerta aunque la sala sea pública: sin esto, el
    // id de una sala saltaba el bloqueo que sí aplica en el feed.
    if (String(room.host?._id || room.host) !== String(req.user.id)
      && await moderation.isBlockedBetween(req.user.id, room.host?._id || room.host)) {
      return res.status(404).json({ error: "Sala en vivo no encontrada" });
    }

    return res.json({ room: normalizeLiveRoom(room, req.user.id), participants: room.participants || [] });
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
 * PATCH /api/live/rooms/:id/heartbeat
 * Latido del anfitrión (bloque 1.5).
 *
 * El cliente lo manda cada 30 s mientras la sala está abierta. Sin esto, una
 * pestaña cerrada de golpe dejaba la sala «activa» para siempre y el anfitrión
 * no podía abrir otra. El barrido (`db:live-sweep`) cierra las que llevan más
 * de `LIVE_STALE_MS` sin latido.
 */
router.patch("/rooms/:id/heartbeat", auth, requireUser, async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ error: "ID de sala inválido" });
    }
    const room = await LiveRoom.findById(req.params.id).select("host status").lean();
    if (!room) return res.status(404).json({ error: "Sala no encontrada" });
    if (String(room.host) !== String(req.user.id)) {
      return res.status(403).json({ error: "Solo el anfitrión mantiene viva la sala", code: "NOT_HOST" });
    }
    if (room.status !== "active") return res.status(409).json({ error: "La sala ya terminó" });

    await LiveRoom.updateOne({ _id: room._id }, { $set: { hostHeartbeatAt: new Date() } });
    return res.json({ ok: true, roomId: room._id });
  } catch (error) {
    console.error("LIVE_HEARTBEAT_ERROR:", error);
    return res.status(500).json({ error: "Error registrando el latido" });
  }
});

/**
 * GET /api/live/rooms/:id/chat — mensajes de la sala.
 *
 * Solo para quien puede verla (pública, o miembro de la privada) y no está
 * expulsado. Se limita a los últimos 100: un directo largo no debe devolver
 * todo el historial a cada entrada.
 */
router.get("/rooms/:id/chat", auth, requireUser, async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ error: "ID de sala inválido" });
    }
    const room = await LiveRoom.findById(req.params.id)
      .select("chat host participants.user isPublic status bans.user")
      .populate("chat.user", "username displayName avatar")
      .lean();
    if (!room) return res.status(404).json({ error: "Sala no encontrada" });
    if (!canViewLiveRoom(room, req.user.id)) {
      return res.status(404).json({ error: "Sala no encontrada" });
    }
    if (estaExpulsado(room, req.user.id)) {
      return res.status(403).json({ error: "El anfitrión te sacó de esta sala", code: "LIVE_BANNED" });
    }

    const chat = (room.chat || []).slice(-100).map((item) => ({
      user: item.user && typeof item.user === "object"
        ? { _id: item.user._id, username: item.user.username || "", displayName: item.user.displayName || "", avatar: item.user.avatar || "" }
        : null,
      text: item.text || "",
      system: Boolean(item.system),
      at: item.at
    }));

    return res.json({ chat });
  } catch (error) {
    console.error("LIVE_CHAT_LIST_ERROR:", error);
    return res.status(500).json({ error: "Error obteniendo el chat de la sala" });
  }
});

/**
 * POST /api/live/rooms/:id/chat — escribir en el chat de la sala.
 *
 * Cualquiera que pueda ver la sala participa; el anfitrión además puede
 * borrar y expulsar. Los mensajes son efímeros: se van con la sala.
 */
router.post("/rooms/:id/chat", auth, requireUser, async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ error: "ID de sala inválido" });
    }
    const text = typeof req.body?.text === "string" ? req.body.text.trim().slice(0, LiveRoom.MAX_CHAT_ITEM) : "";
    if (!text) return res.status(400).json({ error: "El mensaje está vacío" });

    const room = await LiveRoom.findById(req.params.id)
      .select("chat host participants.user isPublic status bans.user")
      .lean();
    if (!room) return res.status(404).json({ error: "Sala no encontrada" });
    if (room.status !== "active") return res.status(409).json({ error: "La sala ya terminó" });
    if (!canViewLiveRoom(room, req.user.id)) {
      return res.status(404).json({ error: "Sala no encontrada" });
    }
    if (estaExpulsado(room, req.user.id)) {
      return res.status(403).json({ error: "El anfitrión te sacó de esta sala", code: "LIVE_BANNED" });
    }

    const entrada = { user: req.user.id, text, system: false, at: new Date() };
    // Se recorta por el principio: el chat de una sala no crece sin límite y
    // lo viejo deja de importar cuando ya pasó la conversación.
    const recorte = (room.chat || []).length >= LiveRoom.MAX_CHAT_ITEMS ? -LiveRoom.MAX_CHAT_ITEMS : 0;
    const updated = await LiveRoom.findByIdAndUpdate(
      room._id,
      {
        $push: {
          chat: {
            $each: [entrada],
            ...(recorte ? { $slice: recorte } : {})
          }
        }
      },
      { new: true }
    )
      .populate("chat.user", "username displayName avatar")
      .lean();

    const ultimo = (updated.chat || []).slice(-1)[0];
    const io = req.app.get("io");
    if (io) {
      io.to(`live:${room._id}`).emit("live:chat", {
        roomId: String(room._id),
        message: {
          user: ultimo?.user && typeof ultimo.user === "object"
            ? { _id: ultimo.user._id, username: ultimo.user.username || "", displayName: ultimo.user.displayName || "", avatar: ultimo.user.avatar || "" }
            : null,
          text,
          system: false,
          at: ultimo?.at || entrada.at
        }
      });
    }

    return res.status(201).json({ message: { text, system: false, at: ultimo?.at || entrada.at } });
  } catch (error) {
    console.error("LIVE_CHAT_SEND_ERROR:", error);
    return res.status(500).json({ error: "Error enviando al chat de la sala" });
  }
});

/**
 * POST /api/live/rooms/:id/ban — el anfitrión saca a alguien.
 *
 * Antes no había forma de expulsar: si alguien interrumpía, el anfitrión solo
 * podía terminar la sala para todos. La expulsión queda guardada en la sala y
 * corta HTTP y socket.
 */
router.post("/rooms/:id/ban", auth, requireUser, async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ error: "ID de sala inválido" });
    }
    const userId = String(req.body?.userId || "");
    if (!mongoose.isValidObjectId(userId)) return res.status(400).json({ error: "ID de usuario inválido" });

    const room = await LiveRoom.findById(req.params.id);
    if (!room) return res.status(404).json({ error: "Sala no encontrada" });
    if (String(room.host) !== String(req.user.id)) {
      return res.status(403).json({ error: "Solo el anfitrión puede expulsar", code: "NOT_HOST" });
    }
    if (userId === String(req.user.id)) {
      return res.status(400).json({ error: "No puedes expulsarte a ti mismo; finaliza la sala" });
    }

    const yaEstaba = (room.bans || []).some((ban) => String(ban.user) === userId);
    if (!yaEstaba) {
      room.bans.push({ user: userId, by: req.user.id, reason: typeof req.body?.reason === "string" ? req.body.reason.trim().slice(0, 300) : "", at: new Date() });
    }
    // Expulsado y fuera de la lista de participantes: si se queda en la lista,
    // el aforo sigue contando a quien ya no está.
    room.participants = (room.participants || []).filter((p) => String(p.user) !== userId);
    await room.save();

    const io = req.app.get("io");
    if (io) {
      const payload = { roomId: String(room._id), userId, reason: req.body?.reason || "" };
      io.to(`user:${userId}`).emit("live:banned", payload);
      io.to(`live:${room._id}`).emit("live:participant-banned", payload);
      io.to(`live:${room._id}`).emit("live:viewer-count", {
        roomId: String(room._id),
        viewersCount: room.viewersCount,
        participantsCount: (room.participants || []).length
      });
    }

    return res.json({ banned: true, userId, roomId: room._id });
  } catch (error) {
    console.error("LIVE_BAN_ERROR:", error);
    return res.status(500).json({ error: "Error expulsando al participante" });
  }
});

/**
 * DELETE /api/live/rooms/:id/ban/:userId — levanta la expulsión.
 *
 * El anfitrión puede equivocarse; sin esta ruta, una expulsión sería
 * permanente y nadie podría revisarla.
 */
router.delete("/rooms/:id/ban/:userId", auth, requireUser, async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id) || !mongoose.isValidObjectId(req.params.userId)) {
      return res.status(400).json({ error: "ID inválido" });
    }
    const room = await LiveRoom.findById(req.params.id).select("host bans").lean();
    if (!room) return res.status(404).json({ error: "Sala no encontrada" });
    if (String(room.host) !== String(req.user.id)) {
      return res.status(403).json({ error: "Solo el anfitrión puede levantar la expulsión", code: "NOT_HOST" });
    }
    const resultado = await LiveRoom.updateOne(
      { _id: room._id },
      { $pull: { bans: { user: new mongoose.Types.ObjectId(req.params.userId) } } }
    );
    if (!resultado.modifiedCount) return res.status(404).json({ error: "Esa persona no estaba expulsada" });
    return res.json({ unbanned: true, userId: req.params.userId });
  } catch (error) {
    console.error("LIVE_UNBAN_ERROR:", error);
    return res.status(500).json({ error: "Error levantando la expulsión" });
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

    // El evento de socket solo llega si el invitado tiene la pestaña abierta y
    // conectada en ESTA instancia: si estaba fuera, la invitación se perdía.
    // El aviso persistente es el que sobrevive al cierre de la pestaña.
    await notifySafely({
      recipient: invitee._id,
      actor: req.user.id,
      type: "live",
      ref: { kind: "live", id: room._id },
      io: req.app.get("io")
    });

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
