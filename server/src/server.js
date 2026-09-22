const path = require("path");

// El .env vive en server/.env sin importar desde dónde se arranque el proceso
// (raíz del monorepo, workspace o PM2): ruta explícita, no cwd.
require("dotenv").config({ path: path.join(__dirname, "../.env") });
require("dotenv").config({ path: path.join(__dirname, "../../.env") });

if (!process.env.JWT_SECRET) {
  console.error("STARTUP_ERROR: JWT_SECRET no configurado");
    process.exit(1);
}

const fs = require("fs");
const http = require("http");
const express = require("express");
const cookieParser = require("cookie-parser");
const cors = require("cors");
const helmet = require("helmet");
const compression = require("compression");
const rateLimit = require("express-rate-limit");
const { ipKeyGenerator } = require("express-rate-limit");
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
const supportRoutes = require("./modules/support/support.routes");
const { requestContext } = require("./middleware/requestContext");
const inputSanitizer = require("./middleware/inputSanitizer");
const app = express();
const server = http.createServer(app);

// NOTA: el scheduler de cápsulas vive dentro de startServer() (no como
// side-effect del require) para que importar { app } en tests no cree timers.

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

// uploads static — AUDIT-005 media posts. Respeta UPLOADS_DIR (volumen
// persistente); con S3 configurado los archivos nuevos ya no pasan por aquí.
const { getUploadsRoot } = require("./config/storage");
const uploadsRoot = getUploadsRoot();
if (!fs.existsSync(uploadsRoot)) fs.mkdirSync(uploadsRoot, { recursive: true });
app.use("/uploads", express.static(uploadsRoot, { maxAge: "7d", etag: true }));
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));
// A-1: el refresh token viaja en cookie httpOnly (ver auth/cookies.js).
app.use(cookieParser());
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

// Límite adicional POR CUENTA (no solo por IP): frena credential-stuffing
// distribuido y registro masivo contra un mismo email. Solo aplica a los
// endpoints de credenciales; el resto de /api/auth conserva su límite.
const emailAuthLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: rateLimitFromEnv("EMAIL_AUTH_RATE_LIMIT_MAX", 10),
  standardHeaders: "draft-8",
  legacyHeaders: false,
  keyGenerator: (req) => {
    const email =
      typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
    const ip = ipKeyGenerator(req.ip || "");
    return email ? `${ip}:${email}` : ip;
  },
  skip: (req) =>
    req.method !== "POST" ||
    !["/login", "/register", "/forgot-password", "/reset-password", "/google"].includes(req.path),
  message: {
    error: "Demasiados intentos para esta cuenta. Intenta nuevamente más tarde."
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
  emailAuthLimiter,
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

// Multi-instancia: con REDIS_URL los eventos y salas de socket.io se
// comparten entre nodos (sin esto, cada instancia solo ve sus sockets).
if ((process.env.REDIS_URL || "").trim()) {
  const { createClient } = require("redis");
  const { createAdapter } = require("@socket.io/redis-adapter");
  const pubClient = createClient({ url: process.env.REDIS_URL });
  const subClient = pubClient.duplicate();
  Promise.all([pubClient.connect(), subClient.connect()])
    .then(() => {
      io.adapter(createAdapter(pubClient, subClient));
      console.log("SOCKET: adapter Redis activo (multi-instancia)");
    })
    .catch((error) => {
      console.error(
        "REDIS_ADAPTER_ERROR: se continúa con adapter local.",
        error?.message || error
      );
    });
}

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

  presence.socketConnected(socket.userId, socket.id).then((first) => {
    if (first) io.emit("presence:changed", { userId: socket.userId, online: true });
  }).catch(() => {});

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

  socket.on("live:join", (payload) => {
    const roomId = payload && typeof payload.roomId === "string" ? payload.roomId.trim() : "";
    if (roomId) {
      socket.join(`live:${roomId}`);
      socket.to(`live:${roomId}`).emit("live:peer-joined", {
        peerId: socket.userId,
        socketId: socket.id
      });
    }
  });

  socket.on("live:leave", (payload) => {
    const roomId = payload && typeof payload.roomId === "string" ? payload.roomId.trim() : "";
    if (roomId) {
      socket.leave(`live:${roomId}`);
      socket.to(`live:${roomId}`).emit("live:peer-left", {
        peerId: socket.userId,
        socketId: socket.id
      });
    }
  });

  socket.on("live:signal", (payload) => {
    const targetPeerId = payload && typeof payload.targetPeerId === "string" ? payload.targetPeerId.trim() : "";
    if (targetPeerId) {
      io.to(`user:${targetPeerId}`).emit("live:signal", {
        fromPeerId: socket.userId,
        signal: payload?.signal,
        roomId: payload?.roomId
      });
    }
  });

  socket.on("disconnect", () => {
    presence.socketDisconnected(socket.userId, socket.id).then((last) => {
      if (last) io.emit("presence:changed", { userId: socket.userId, online: false });
    }).catch(() => {});
  });
});
async function startServer() {
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

  // Sin TRUST_PROXY tras un proxy (Render), req.ip es la IP del proxy y
  // TODOS los usuarios comparten el mismo bucket de rate-limit (además de
  // romper la identificación). En producción es obligatorio declararlo.
  if (
    process.env.NODE_ENV === "production" &&
    process.env.TRUST_PROXY !== "1" &&
    process.env.TRUST_PROXY !== "true"
  ) {
    console.error(
      "STARTUP_ERROR: TRUST_PROXY no configurado. Detrás de Render/proxy debe ser 1 para que req.ip y los rate limits funcionen."
    );

    process.exit(1);
  }

  // Los uploads en disco local son efímeros en Render (se pierden en cada
  // deploy). En producción debe apuntar a un volumen persistente o a S3.
  const { describeStorage } = require("./config/storage");
  console.log(`STORAGE: ${describeStorage()}`);
  if (process.env.NODE_ENV === "production" && !process.env.UPLOADS_DIR && !process.env.S3_BUCKET) {
    console.error(
      "STARTUP_ERROR: almacenamiento efímero. Define UPLOADS_DIR (volumen persistente) o S3_BUCKET para no perder uploads en cada deploy."
    );

    process.exit(1);
  }

  try {
    await connectDB();

    // Cápsulas del tiempo (Fase 5): apertura idempotente cada minuto. Vive
    // aquí (no en el require) para no crear timers al importar { app }.
    setInterval(() => {
      capsuleRoutes.openDueCapsules(io).catch(() => {});
    }, 60_000).unref();

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
