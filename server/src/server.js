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
const { resolveAutoIndex, isProductionEnv } = require("./config/db");
const { isKnownNonProductionEnvironment, normalizeEnvironment } = require("./config/environment");
const { getBuildInfo } = require("./config/buildInfo");
const { isProductionProcessEnv } = require("./config/environment");
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
const musicRoutes = require("./modules/music/music.routes");
const voiceRoutes = require("./modules/voices/voices.routes");
const kairosRoutes = require("./modules/ai-core/routes/kairos.routes");
const audioUploadRoutes = require("./modules/music/audio.routes");
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
const mcpRoutes = require("./modules/mcp/mcp.routes");
const { requestContext } = require("./middleware/requestContext");
const inputSanitizer = require("./middleware/inputSanitizer");
const {
  describeClientError,
  isStorageUnavailable
} = require("./middleware/httpErrors");
const { serveDurableUpload } = require("./config/durableUploads");
const { mediaAcl } = require("./middleware/mediaAcl");
const { socketJoinDecision } = require("./modules/live/live.access");
const app = express();
const server = http.createServer(app);

// Las cápsulas del tiempo se abren en startServer(), no aquí. Estar en el
// ámbito del módulo tenía dos efectos: el callback referencia `io`, que se
// declara 240 líneas más abajo (funcionaba solo porque el intervalo tarda 60 s
// en dispararse, no por ninguna garantía), y cualquier `require("./server")`
// arrancaba un temporizador que a los 60 s lanza trabajo contra la base — lo
// hacen ~90 archivos de pruebas. Ver `capsuleTimer` en startServer.

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

/**
 * Aviso de configuración del proxy inverso, como función pura para poder
 * comprobarla sin arrancar el proceso.
 *
 * `trust proxy` solo se activa con TRUST_PROXY=1|true. Detrás de Render o
 * Vercel, sin él, `req.ip` es la dirección del proxy y no la del visitante:
 * los tres limitadores (300 API / 60 acciones / 20 credenciales por 15 minutos)
 * pasan a repartirse entre TODOS los usuarios en un solo cubo, y la plataforma
 * entera cae en 429 en cuanto hay algo de tráfico. Es una mala configuración
 * silenciosa —no falla nada, simplemente deja de proteger y empieza a bloquear
 * a quien no debe—, así que se avisa al arrancar igual que CAPSULE_SECRET.
 *
 * Devuelve `null` cuando no hay nada que avisar.
 */
function trustProxyWarning(env = process.env) {
  const valor = String(env.TRUST_PROXY || "").trim().toLowerCase();
  const activo = valor === "1" || valor === "true";

  if (activo || !isProductionProcessEnv()) return null;

  return (
    "CONFIG_WARNING: TRUST_PROXY no activado en producción — req.ip es la IP del proxy y los " +
    "rate limits (300 API / 60 acciones / 20 credenciales por 15 min) se reparten entre todos " +
    "los usuarios en un solo cubo. Detrás de Render o Vercel debe valer TRUST_PROXY=1."
  );
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
app.use("/uploads", mediaAcl);
// `mediaAcl` decide la política de caché y la deja en
// `res.locals.mediaCacheControl`: pública (una semana) para lo que es público,
// `private, no-store` para adjuntos de mensajes, historias, borradores y media
// de audiencias restringidas. Sin `setHeaders` ese valor no lo leía nadie en
// el camino habitual —el archivo servido desde disco— y express.static
// respondía su `public, max-age=0`, que autoriza a cualquier caché compartida
// a guardar media privada. El defecto por omisión es el privado: si mediaAcl
// no llegó a decidir, no se publica nada.
app.use(
  "/uploads",
  express.static(uploadsRoot, {
    etag: true,
    setHeaders(res) {
      res.setHeader(
        "Cache-Control",
        res.locals.mediaCacheControl || "private, no-store"
      );
      res.vary("Cookie");
    }
  })
);
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

// El commit se resuelve UNA vez al arrancar: dentro del proceso no cambia, y
// recalcularlo en cada petición solo añadiría trabajo a un endpoint que los
// balanceadores consultan constantemente.
const BUILD_INFO = getBuildInfo();

const healthResponse = (req, res) => {
  const database = mongoose.connection.readyState === 1 ? "connected" : "disconnected";
  const healthy = database === "connected";
  res.status(healthy ? 200 : 503).json({
    // --- contrato existente, sin tocar ---
    ok: healthy,
    service: "kronos-space",
    database,
    // Derivado, no un literal. Era `realtime: true` a pelo: el endpoint
    // afirmaba que el tiempo real estaba sano sin comprobar nada, así que un
    // monitor nunca se enteraría de que Socket.IO no llegó a arrancar.
    //
    // El valor y el conjunto de claves del contrato NO cambian (health.test.js
    // los fija y docs/CHECKLIST-CIERRE-TOTAL-KRONOS.md documenta que producción
    // responde `realtime:true`): en cualquier despliegue real `io.engine`
    // existe y esto sigue dando true. Lo que cambia es que ahora significa
    // algo —el motor de Engine.IO está acoplado al servidor HTTP— en vez de
    // ser una constante. Una sonda más profunda (ida y vuelta real de
    // websocket) o publicar el número de clientes conectados sí alterarían el
    // contrato y quedan como decisión del propietario.
    realtime: Boolean(io?.engine),
    timestamp: new Date().toISOString(),
    // --- añadido: trazabilidad REPO -> COMMIT -> DEPLOY -> SERVICE -> HEALTH
    // Sin esto no hay forma auditable de saber qué código está ejecutándose
    // contra la base de producción. Son identificadores públicos de la
    // compilación; aquí no se expone ninguna credencial ni la URI.
    build: {
      commit: BUILD_INFO.commit,
      commitShort: BUILD_INFO.commitShort,
      branch: BUILD_INFO.branch,
      repo: BUILD_INFO.repo,
      serviceName: BUILD_INFO.service,
      startedAt: BUILD_INFO.startedAt,
      traceable: BUILD_INFO.traceable
    },
    // Dos banderas de configuración que la lista de pre-producción exige
    // comprobar y que hoy solo se pueden mirar en el panel del proveedor.
    // Ninguna es un secreto: una dice el entorno, la otra si Mongoose puede
    // crear índices por su cuenta.
    // Entorno EFECTIVO, el que las guardas aplican de verdad. Si NODE_ENV
    // faltara o fuese desconocido, el criterio fail-closed lo trata como
    // producción, y eso es lo que hay que ver aquí.
    environment: isProductionEnv() ? "production" : normalizeEnvironment(process.env.NODE_ENV),
    // Distingue «NODE_ENV=production declarado» de «NODE_ENV ausente y
    // tratado como producción por defecto». El punto 10 de la lista de
    // pre-producción exige exactamente esa diferencia, y sin este campo las
    // dos situaciones se ven idénticas desde fuera.
    environmentDeclared: isKnownNonProductionEnvironment(process.env.NODE_ENV)
      || normalizeEnvironment(process.env.NODE_ENV) === "production",
    autoIndex: resolveAutoIndex()
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
app.use("/api/mcp", mcpRoutes);
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
app.use("/api/music", musicRoutes);
app.use("/api/voices", voiceRoutes);
app.use("/api/kairos", kairosRoutes);
app.use("/api/uploads", abuseLimiter, audioUploadRoutes);
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

// El mismo contrato JSON para cualquier ruta que no sea de la API.
// Antes solo se cubría `/api`: pedir `/` o `/cualquier-cosa` devolvía la
// página HTML de Express (`Cannot GET /`, en inglés), que además es lo que
// recibe un monitor de disponibilidad o un crawler. Los archivos de
// `/uploads` que no existen también terminan aquí.
app.use((req, res) => {
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

  // Fallos de infraestructura reconocidos (cuerpo ilegible, demasiado
  // grande, codificación no soportada): se responden con un contrato
  // estable en español en lugar del mensaje en inglés del runtime.
  const described = describeClientError(err);

  if (described) {
    return res.status(described.status).json({
      error: described.message,
      code: described.code
    });
  }

  // Sin almacenamiento no se puede atender la petición ahora mismo: 503 es
  // la respuesta honesta y evita que un corte temporal se confunda con un
  // fallo del programa o, peor, con un 401 que cerraría la sesión.
  if (isStorageUnavailable(err)) {
    return res.status(503).json({
      error: "Servicio de autenticación no disponible",
      code: "STORAGE_UNAVAILABLE"
    });
  }

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
/** Handle del barrido de cápsulas; null hasta que startServer lo arranca. */
let capsuleTimer = null;
let shuttingDown = false;

/**
 * Apagado ordenado.
 *
 * No había ninguno: Render y cualquier orquestador envían SIGTERM y el proceso
 * moría en seco, con las peticiones en vuelo cortadas a mitad, los sockets sin
 * cerrar y la conexión de Mongoose sin liberar. El contenedor termina igual,
 * pero así termina después de dejar de aceptar trabajo nuevo y de cerrar lo que
 * ya estaba atendiendo.
 *
 * Se registra dentro de startServer() a propósito: quien importa este módulo
 * (las ~90 suites de pruebas) no instala manejadores de señales que no le
 * pertenecen.
 */
function registerShutdownHandlers() {
  const shutdown = (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;

    console.log(`SHUTDOWN: ${signal} recibido, cerrando`);

    if (capsuleTimer) {
      clearInterval(capsuleTimer);
      capsuleTimer = null;
    }

    // Fuerza la salida si algo se queda colgado: un apagado que no termina es
    // peor que uno brusco, porque el orquestador espera hasta su propio límite.
    const deadline = setTimeout(() => {
      console.error("SHUTDOWN_TIMEOUT: cerrando de todos modos");
      process.exit(1);
    }, 10_000);
    deadline.unref();

    // 1. Dejar de aceptar conexiones nuevas y terminar las existentes.
    io.close(() => {
      server.close(async () => {
        try {
          await mongoose.connection.close();
        } catch (error) {
          console.error("SHUTDOWN_DB_CLOSE_ERROR", { message: error?.message || "" });
        }
        clearTimeout(deadline);
        console.log("SHUTDOWN: cerrado en orden");
        process.exit(0);
      });
    });
  };

  process.once("SIGTERM", () => shutdown("SIGTERM"));
  process.once("SIGINT", () => shutdown("SIGINT"));
}

async function startServer() {
  // Las cápsulas del tiempo cifran su contenido con CAPSULE_SECRET y, si
  // falta, derivan la clave de JWT_SECRET. Funciona, pero la clave de
  // cifrado no debería depender del secreto de sesión: rotarlo dejaría las
  // cápsulas ilegibles. Un aviso explícito evita que pase inadvertido.
  if (!process.env.CAPSULE_SECRET?.trim()) {
    console.warn(
      "CONFIG_WARNING: CAPSULE_SECRET no configurado — las cápsulas se cifran con JWT_SECRET (ver docs/server/KRONOS-CAPSULES.md)"
    );
  }

  const avisoProxy = trustProxyWarning();

  if (avisoProxy) {
    console.warn(avisoProxy);
  }

  // En producción el origen del frontend no puede quedar implícito:
  // CORS debe usar los dominios reales (Vercel y Cloudflare Pages).
  // `NODE_ENV === "production"` exacto dejaba arrancar sin CLIENT_URL a
  // cualquier despliegue que escribiera el entorno de otra forma, o que no
  // lo escribiera: justo los casos en que esta comprobación hace falta.
  if (
    isProductionProcessEnv() &&
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

    // Cápsulas del tiempo (Fase 5): apertura idempotente cada minuto. Se
    // arranca aquí, con `io` ya construido y la base conectada, y se guarda el
    // identificador para limpiarlo en el apagado.
    capsuleTimer = setInterval(() => {
      capsuleRoutes.openDueCapsules(io).catch((error) => {
        // Antes era `.catch(() => {})`: si la apertura fallaba no quedaba ni
        // una línea en el log, y una cápsula sin abrir en su fecha es justo el
        // tipo de fallo que nadie nota hasta que un usuario pregunta.
        console.error("CAPSULE_SWEEP_ERROR", {
          name: error?.name || "Error",
          message: error?.message || ""
        });
      });
    }, 60_000);
    capsuleTimer.unref();

    registerShutdownHandlers();
  } catch (error) {
    console.error("STARTUP_ERROR:", error.message);
    process.exit(1);
  }
}

module.exports = { app, server, io, startServer, trustProxyWarning, registerShutdownHandlers };

// Solo arranca cuando el archivo es el punto de entrada
// (`npm start` / `node src/server.js`); al importarlo en pruebas
// no se abre ningún puerto.
if (require.main === module) {
  startServer();
}
