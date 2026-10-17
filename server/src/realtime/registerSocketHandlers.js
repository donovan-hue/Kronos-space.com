"use strict";

const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");
const { isSessionRevoked, isRefreshFamilyActive } = require("../modules/auth/session.service");
const presence = require("../modules/messages/presence");
const Conversation = require("../modules/conversations/Conversation");
const LiveRoom = require("../modules/live/LiveRoom");
const { socketJoinDecision } = require("../modules/live/live.access");

// Registra eventos sobre la instancia creada por el compositor; no escucha
// puertos ni crea temporizadores al importar este módulo.
function registerSocketHandlers(io) {
  // El handshake aplica las mismas garantías de revocación que HTTP. Así un
  // token de una familia de dispositivo revocada no puede abrir/reabrir socket.
  io.use(async (socket, next) => {
    const rawToken = socket.handshake.auth?.token || socket.handshake.headers.authorization;
    if (typeof rawToken !== "string" || !rawToken.trim()) return next(new Error("AUTH_REQUIRED"));

    try {
      const token = rawToken.replace(/^Bearer\s+/i, "").trim();
      const decoded = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ["HS256"] });
      if (typeof decoded.id !== "string" || !decoded.id.trim()) return next(new Error("AUTH_INVALID"));
      if (await isSessionRevoked(decoded, token)) return next(new Error("AUTH_REVOKED"));
      if (typeof decoded.sid === "string" && decoded.sid.trim() && !await isRefreshFamilyActive(decoded.id, decoded.sid)) {
        return next(new Error("AUTH_REVOKED"));
      }

      socket.userId = decoded.id;
      socket.data.tokenId = typeof decoded.jti === "string" ? decoded.jti : "";
      socket.data.sessionId = typeof decoded.sid === "string" ? decoded.sid : "";
      return next();
    } catch {
      return next(new Error("AUTH_INVALID"));
    }
  });

  /**
   * Eventos del socket (los originales `message:new` / `notification:new`
   * los emiten las rutas REST; aquí solo hay estado de conexión):
   *
   * - 020 presencia: `presence:changed { userId, online }` a todos cuando
   *   un usuario entra o sale de línea (memoria de esta instancia).
   * - 020 typing: `typing:start { peerId }` se retransmite SOLO al peer
   *   indicado (máx. 2 eventos/segundo por socket) como
   *   `typing:start { from }`.
   * - 022 grupos: `conversation:join { conversationId }` verifica la
   *   membresía en base antes de entrar a la sala `conversation:<id>`;
   *   `conversation:leave` sale de la sala. Sin membresía responde
   *   `conversation:error { code: "CONVERSATION_NOT_MEMBER" }`.
   */
  io.on("connection", (socket) => {
    socket.join(`user:${socket.userId}`);

    if (presence.socketConnected(socket.userId, socket.id)) {
      io.emit("presence:changed", { userId: socket.userId, online: true });
    }

    let lastTypingAt = 0;

    socket.on("typing:start", (payload) => {
      const peerId =
        payload && typeof payload.peerId === "string"
          ? payload.peerId.trim()
          : "";

      if (!mongoose.Types.ObjectId.isValid(peerId) || peerId === socket.userId) {
        return;
      }

      const now = Date.now();

      if (now - lastTypingAt < 500) {
        return;
      }

      lastTypingAt = now;
      io.to(`user:${peerId}`).emit("typing:start", { from: socket.userId });
    });

    socket.on("conversation:join", async (payload) => {
      const conversationId =
        payload && typeof payload.conversationId === "string"
          ? payload.conversationId.trim()
          : "";

      if (!mongoose.Types.ObjectId.isValid(conversationId)) {
        socket.emit("conversation:error", {
          conversationId:
            payload && typeof payload.conversationId === "string"
              ? payload.conversationId
              : null,
          code: "INVALID_CONVERSATION"
        });
        return;
      }

      try {
        const conversation = await Conversation.findOne({
          _id: conversationId,
          members: new mongoose.Types.ObjectId(socket.userId)
        })
          .select("_id")
          .lean();

        if (!conversation) {
          socket.emit("conversation:error", {
            conversationId,
            code: "CONVERSATION_NOT_MEMBER"
          });
          return;
        }

        await socket.join(`conversation:${conversationId}`);
        socket.emit("conversation:joined", { conversationId });
      } catch (error) {
        console.error("CONVERSATION_JOIN_ERROR:", error);
        socket.emit("conversation:error", {
          conversationId,
          code: "JOIN_FAILED"
        });
      }
    });

    socket.on("conversation:leave", (payload) => {
      const conversationId =
        payload && typeof payload.conversationId === "string"
          ? payload.conversationId.trim()
          : "";

      if (mongoose.Types.ObjectId.isValid(conversationId)) {
        socket.leave(`conversation:${conversationId}`);
      }
    });

    socket.on("live:join", async (payload) => {
      const roomId = payload && typeof payload.roomId === "string" ? payload.roomId.trim() : "";

      if (!mongoose.Types.ObjectId.isValid(roomId)) {
        socket.emit("live:error", { roomId: roomId || null, code: "INVALID_ROOM" });
        return;
      }

      // Sin base de datos no se puede comprobar la sala: se responde de
      // inmediato en lugar de dejar el comando en el buffer de Mongoose
      // (hasta 10 s) y devolver una sala que no se ha podido verificar.
      if (mongoose.connection.readyState !== 1) {
        socket.emit("live:error", { roomId, code: "LIVE_UNAVAILABLE" });
        return;
      }

      try {
        const room = await LiveRoom.findOne({ _id: roomId })
          .select("_id status isPublic host participants.user")
          .lean();

        if (!room) {
          socket.emit("live:error", { roomId, code: "LIVE_NOT_FOUND" });
          return;
        }

        const access = socketJoinDecision(room, socket.userId);

        if (!access.ok) {
          socket.emit("live:error", { roomId, code: access.code });
          return;
        }

        await socket.join(`live:${roomId}`);

        if (!(socket.data.liveRooms instanceof Set)) {
          socket.data.liveRooms = new Set();
        }

        socket.data.liveRooms.add(roomId);

        socket.emit("live:joined", { roomId });
        socket.to(`live:${roomId}`).emit("live:peer-joined", {
          peerId: socket.userId,
          socketId: socket.id
        });
      } catch (error) {
        console.error("LIVE_JOIN_ERROR:", error);
        socket.emit("live:error", { roomId, code: "LIVE_JOIN_FAILED" });
      }
    });

    socket.on("live:leave", (payload) => {
      const roomId = payload && typeof payload.roomId === "string" ? payload.roomId.trim() : "";
      if (roomId) {
        socket.leave(`live:${roomId}`);
        socket.data.liveRooms?.delete(roomId);
        socket.to(`live:${roomId}`).emit("live:peer-left", {
          peerId: socket.userId,
          socketId: socket.id
        });
      }
    });

    // Señalización WebRTC: solo se retransmite entre sockets que YA están
    // dentro de la misma sala (`live:<roomId>`, verificada por `live:join`).
    // Sin esta comprobación cualquier cuenta autenticada podía enviar
    // señales arbitrarias a cualquier usuario de la plataforma usando su id.
    const LIVE_SIGNAL_WINDOW_MS = 10_000;
    const LIVE_SIGNAL_MAX_PER_WINDOW = 120;

    socket.on("live:signal", async (payload) => {
      const targetPeerId = payload && typeof payload.targetPeerId === "string" ? payload.targetPeerId.trim() : "";
      const roomId = payload && typeof payload.roomId === "string" ? payload.roomId.trim() : "";

      if (!mongoose.Types.ObjectId.isValid(targetPeerId) || !mongoose.Types.ObjectId.isValid(roomId)) {
        return;
      }

      if (targetPeerId === socket.userId) {
        return;
      }

      if (!socket.data.liveRooms?.has(roomId)) {
        socket.emit("live:error", { roomId, code: "LIVE_NOT_IN_ROOM" });
        return;
      }

      const now = Date.now();

      if (!socket.data.liveSignalWindow) {
        socket.data.liveSignalWindow = { startedAt: now, count: 0 };
      }

      const window = socket.data.liveSignalWindow;

      if (now - window.startedAt > LIVE_SIGNAL_WINDOW_MS) {
        window.startedAt = now;
        window.count = 0;
      }

      if (window.count >= LIVE_SIGNAL_MAX_PER_WINDOW) {
        return;
      }

      window.count += 1;

      try {
        const peers = await io.in(`live:${roomId}`).fetchSockets();
        const targetIsPresent = peers.some((peer) => String(peer.userId) === targetPeerId);

        if (!targetIsPresent) {
          return;
        }

        io.to(`user:${targetPeerId}`).emit("live:signal", {
          fromPeerId: socket.userId,
          signal: payload?.signal,
          roomId
        });
      } catch (error) {
        console.error("LIVE_SIGNAL_ERROR:", error);
      }
    });

    socket.on("disconnect", () => {
      if (presence.socketDisconnected(socket.userId, socket.id)) {
        io.emit("presence:changed", { userId: socket.userId, online: false });
      }
    });
  });
}

module.exports = { registerSocketHandlers };
