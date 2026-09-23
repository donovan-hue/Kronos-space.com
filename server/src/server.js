require("dotenv").config();

if (!process.env.JWT_SECRET) {
  console.error("STARTUP_ERROR: JWT_SECRET no configurado");
  process.exit(1);
}

const path = require("path");
const fs = require("fs");
const http = require("http");
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const compression = require("compression");
const rateLimit = require("express-rate-limit");
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");
const { Server } = require("socket.io");
const {
  isSessionRevoked,
  isRefreshFamilyActive
} = require("./modules/auth/session.service");
const connectDB = require("./config/db");
const authRoutes = require("./modules/auth/auth.routes");
const sessionRoutes = require("./modules/auth/session.routes");
const userRoutes = require("./modules/users/users.routes");
const postRoutes = require("./modules/posts/posts.routes");
const messageRoutes = require("./modules/messages/messages.routes");
const conversationRoutes = require("./modules/conversations/conversations.routes");
const notificationRoutes = require("./modules/notifications/notifications.routes");
const presence = require("./modules/messages/presence");
const Conversation = require("./modules/conversations/Conversation");
const { ensureMessageIndexes } = require("./modules/messages/message-indexes");
const moderationRoutes = require("./modules/moderation/moderation.routes");
const draftRoutes = require("./modules/drafts/drafts.routes");
const collectionRoutes = require("./modules/collections/collections.routes");
const circleRoutes = require("./modules/circles/circles.routes");
const orbitRoutes = require("./modules/orbits/orbits.routes");
const channelRoutes = require("./modules/channels/channels.routes");
const storyRoutes = require("./modules/stories/stories.routes");
const capsuleRoutes = require("./modules/capsules/capsules.routes");
const pulseRoutes = require("./modules/pulse/pulse.routes");
const analyticsRoutes = require("./modules/analytics/analytics.routes");
const { getFeatureFlags } = require("./config/featureFlags");
const imageRoutes = require("./modules/image-ai/image.routes");
const videoRoutes = require("./modules/video-ai/video.routes");
const scriptRoutes = require("./modules/script-ai/script.routes");
const chatRoutes = require("./modules/ai-core/routes/chat.routes");
const { router: searchRoutes } = require("./modules/search/search.routes");
const adminRoutes = require("./modules/admin/admin.routes");
const observabilityRoutes = require("./modules/observability/observability.routes");
const exportRoutes = require("./modules/export/export.routes");
const federationRoutes = require("./modules/federation/federation.routes");
const liveRoutes = require("./modules/live/live.routes");
const LiveRoom = require("./modules/live/LiveRoom");
const supportRoutes = require("./modules/support/support.routes");
const { requestContext } = require("./middleware/requestContext");
const inputSanitizer = require("./middleware/inputSanitizer");
const { serveDurableUpload } = require("./config/durableUploads");
const { socketJoinDecision } = require("./modules/live/live.access");
const app = express();
const server = http.createServer(app);

// Cápsulas del tiempo (Fase 5): apertura idempotente cada minuto. `unref`
// mantiene el intervalo fuera del ciclo de vida del proceso (las pruebas
// y los scripts pueden terminar sin esperarlo).
setInterval(() => {
  capsuleRoutes.openDueCapsules(io).catch(() => {});
}, 60_000).unref();

const PORT = process.env.PORT || 5000;

// Render y otros proxies deben declararse explícitamente para que req.ip y
// rate limiting no confíen en cabeceras reenviadas sin autorización.
if (process.env.TRUST_PROXY === "1" || process.env.TRUST_PROXY === "true") {
  app.set("trust proxy", 1);
}

app.locals.requestMetrics = {
  total: 0,
  byStatus: {},
  startedAt: new Date().toISOString(),
  lastRequestAt: null
};

function normalizeOrigin(origin) {
  return String(origin || "").trim().replace(/\/$/, "");
}

const allowedOrigins = (process.env.CLIENT_URL || "http://localhost:3000")
  .split(",")
  .map(normalizeOrigin)
  .filter(Boolean);

app.disable("x-powered-by");
app.use(requestContext);
app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));
app.use(compression());
app.use(cors({ origin(origin, callback) { if (!origin) return callback(null, true); return callback(null, allowedOrigins.includes(normalizeOrigin(origin))); }, credentials: true }));

// uploads static — AUDIT-005 media posts
const uploadsRoot = path.join(__dirname, "../uploads");
if (!fs.existsSync(uploadsRoot)) fs.mkdirSync(uploadsRoot, { recursive: true });
app.use("/uploads", express.static(uploadsRoot, { maxAge: "7d", etag: true }));
// Si el disco del proceso ya no tiene el archivo (redespliegue), se sirve
// la copia de GridFS. express.static llama a next() cuando no lo encuentra.
app.use("/uploads", serveDurableUpload);
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));
app.use(inputSanitizer);
// Los límites son configurables por entorno (por ejemplo en pruebas E2E
// que hacen muchas peticiones reales) sin cambiar el valor por defecto.
function rateLimitFromEnv(name, fallback) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

const apiLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: rateLimitFromEnv("API_RATE_LIMIT_MAX", 300), standardHeaders: "draft-8", legacyHeaders: false, message: { error: "Demasiadas solicitudes. Intenta nuevamente más tarde." } });
app.use("/api", apiLimiter);
const abuseLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: rateLimitFromEnv("ABUSE_RATE_LIMIT_MAX", 60),
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: {
    error:
      "Vas muy rápido. Tómate un momento."
  }
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: rateLimitFromEnv("AUTH_RATE_LIMIT_MAX", 20),
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: {
    error:
      "Demasiados intentos. Intenta nuevamente más tarde."
  }
});

const healthResponse = (req, res) => {
  const database = mongoose.connection.readyState === 1 ? "connected" : "disconnected";
  const healthy = database === "connected";
  res.status(healthy ? 200 : 503).json({
    ok: healthy,
    service: "kronos-space",
    database,
    realtime: true,
    timestamp: new Date().toISOString()
  });
};

app.get("/health", healthResponse);
app.get("/api/health", healthResponse);

// FASE 0 — feature flags: el cliente pregunta una vez al arrancar.
// Pública por diseño: solo dice qué funciones están encendidas.
app.get("/api/flags", (req, res) => {
  return res.json({ flags: getFeatureFlags() });
});


// Ciclo de vida de la sesión (KRONOS-AUDIT-002). Se monta antes del
// limitador estricto de credenciales: hidratar la sesión o cerrarla no
// debe consumir el presupuesto de intentos de login.
app.use("/api/auth", sessionRoutes);

app.use(
  "/api/auth",
  authLimiter,
  authRoutes
);

app.use("/api/users", userRoutes);
app.use("/api/search", searchRoutes);
app.use("/api/admin", abuseLimiter, adminRoutes);
app.use("/api/observability", observabilityRoutes);
app.use("/api/export", abuseLimiter, exportRoutes);
app.use("/", federationRoutes);
app.use("/api/live", abuseLimiter, liveRoutes);
app.use("/api/support", abuseLimiter, supportRoutes);
app.use("/api/posts", abuseLimiter, postRoutes);
app.use("/api/messages", abuseLimiter, messageRoutes);
app.use("/api/conversations", abuseLimiter, conversationRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/moderation", abuseLimiter, moderationRoutes);
app.use("/api/drafts", draftRoutes);
app.use("/api/collections", abuseLimiter, collectionRoutes);
app.use("/api/circles", abuseLimiter, circleRoutes);
app.use("/api/orbits", abuseLimiter, orbitRoutes);
app.use("/api/channels", abuseLimiter, channelRoutes);
app.use("/api/stories", abuseLimiter, storyRoutes);
app.use("/api/capsules", abuseLimiter, capsuleRoutes);
app.use("/api/pulse", abuseLimiter, pulseRoutes);
app.use("/api/analytics", abuseLimiter, analyticsRoutes);
app.use("/api/ai/images", imageRoutes);
app.use("/api/ai/videos", videoRoutes);
app.use("/api/ai/scripts", scriptRoutes);
app.use("/api/ai", chatRoutes);
// 404 de la API en JSON. Sin esto, una ruta inexistente devolvía la página
// HTML de Express: el cliente y cualquier consumidor esperan JSON y reciben
// un cuerpo que no pueden interpretar.
app.use("/api", (req, res) => {
  return res.status(404).json({
    error: "Recurso no encontrado",
    code: "NOT_FOUND",
    path: req.originalUrl.split("?")[0]
  });
});

app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  const status = Number.isInteger(err.statusCode) ? err.statusCode : Number.isInteger(err.status) ? err.status : 500;
  console.error("API_ERROR", {
    requestId: req.requestId || "",
    method: req.method,
    path: req.originalUrl?.split("?")[0] || "",
    status,
    name: err?.name || "Error",
    code: err?.code || ""
  });
  return res.status(status).json({ error: status >= 500 ? "Error interno del servidor" : err.message || "Error de solicitud" });
});
const io = new Server(server, { cors: { origin: allowedOrigins, credentials: true } });

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
app.set("io", io);

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
async function startServer() {
  // Las cápsulas del tiempo cifran su contenido con CAPSULE_SECRET y, si
  // falta, derivan la clave de JWT_SECRET. Funciona, pero la clave de
  // cifrado no debería depender del secreto de sesión: rotarlo dejaría las
  // cápsulas ilegibles. Un aviso explícito evita que pase inadvertido.
  if (!process.env.CAPSULE_SECRET?.trim()) {
    console.warn(
      "CONFIG_WARNING: CAPSULE_SECRET no configurado — las cápsulas se cifran con JWT_SECRET (ver docs/KRONOS-CAPSULES.md)"
    );
  }

  // En producción el origen del frontend no puede quedar implícito:
  // CORS debe usar los dominios reales (Vercel y Cloudflare Pages).
  if (
    process.env.NODE_ENV === "production" &&
    !process.env.CLIENT_URL
  ) {
    console.error(
      "STARTUP_ERROR: CLIENT_URL no configurado. Define los orígenes reales del frontend separados por comas."
    );

    process.exit(1);
  }

  try {
    await connectDB();
    await ensureMessageIndexes();
    server.listen(PORT, () =>
      console.log(
        `KRONOS SPACE API: http://localhost:${PORT} (orígenes CORS: ${allowedOrigins.join(", ")})`
      )
    );
  } catch (error) {
    console.error("STARTUP_ERROR:", error.message);
    process.exit(1);
  }
}

module.exports = { app, server, io, startServer };

// Solo arranca cuando el archivo es el punto de entrada
// (`npm start` / `node src/server.js`); al importarlo en pruebas
// no se abre ningún puerto.
if (require.main === module) {
  startServer();
}
